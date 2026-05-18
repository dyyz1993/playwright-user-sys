/**
 * File-Session API 集成测试
 * 测试 upload-session 和 batch-release 端点的完整HTTP请求/响应流程
 *
 * 测试策略:
 * - 真实HTTP请求 (Fastify inject)
 * - 真实数据库操作
 * - 真实中间件执行 (verifyJWTOrApiKey, authenticate)
 * - Mock: fileTransferService, connectionManager, webhook
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import FormData from 'form-data';
import { Readable } from 'stream';
import { build } from '../../helpers/app.js';
import { generateToken } from '../../../utils/auth.js';
import { UserRole } from '../../../shared/types/index.js';
import { initDatabase } from '../../../config/database.js';
import { createTestUser, createTestAdmin, createTestSession, createTestMachine } from '../../helpers/factories.js';

vi.mock('../../../utils/webhook.js', () => ({
  createWebhookEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../services/machine-grpc/index.js', () => ({
  connectionManager: {
    getAllConnectedMachines: vi.fn(() => []),
    closeBrowser: vi.fn().mockResolvedValue(undefined),
    launchBrowser: vi.fn().mockResolvedValue({
      port: 3000,
      browser_ws_endpoint: 'ws://localhost:3000',
    }),
  },
}));

vi.mock('../../../services/machine.service.js', () => ({
  findAvailableMachine: vi.fn().mockResolvedValue({
    id: 'test-machine-1',
    hostname: 'test-machine',
    ip: '127.0.0.1',
    port: 8080,
  }),
  allocateBrowserInstance: vi.fn().mockResolvedValue({
    port: 3000,
    wsEndpoint: 'ws://localhost:3000',
  }),
  releaseBrowserInstance: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../services/file-transfer.service.js', () => ({
  fileTransferService: {
    transferToMachine: vi.fn().mockResolvedValue({
      success: true,
      machineFilePath: '/data/temp/test.txt',
    }),
    injectFile: vi.fn().mockResolvedValue({ success: true, files: [] }),
    downloadAndInject: vi.fn().mockResolvedValue({ success: true, files: [] }),
  },
}));

function buildMultipartPayload(sessionId: string, filename: string, content: string) {
  const form = new FormData();
  form.append('sessionId', sessionId);
  form.append('file', Readable.from([Buffer.from(content)]), { filename, contentType: 'text/plain' });
  return form;
}

describe('File-Session API 集成测试', () => {
  let app: FastifyInstance;
  let testAdmin: any;
  let adminToken: string;

  beforeAll(async () => {
    await initDatabase();
    app = await build();

    testAdmin = await createTestAdmin({ credits: 1000 });
    adminToken = generateToken({
      id: testAdmin?.id || 0,
      username: testAdmin?.username || '',
      role: UserRole.ADMIN,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // ========================================
  // POST /api/files/upload-session
  // ========================================
  describe('POST /api/files/upload-session', () => {
    it('200: 成功上传文件到会话', async () => {
      const user = await createTestUser({ credits: 100 });
      const machine = await createTestMachine();
      const session = await createTestSession(user.id, { machine_id: machine.id });

      const form = buildMultipartPayload(session.id, 'test.txt', 'hello world');
      const token = generateToken({ id: user.id, username: user.username, role: UserRole.USER });

      const response = await app.inject({
        method: 'POST',
        url: '/api/files/upload-session',
        headers: {
          authorization: `Bearer ${token}`,
          ...form.getHeaders(),
        },
        payload: form,
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data.sessionId).toBe(session.id);
      expect(result.data.filename).toBe('test.txt');
      expect(result.data.size).toBeDefined();
    });

    it('400: 缺少 sessionId', async () => {
      const user = await createTestUser({ credits: 100 });

      const form = new FormData();
      form.append('file', Readable.from([Buffer.from('content')]), { filename: 'test.txt', contentType: 'text/plain' });
      const token = generateToken({ id: user.id, username: user.username, role: UserRole.USER });

      const response = await app.inject({
        method: 'POST',
        url: '/api/files/upload-session',
        headers: {
          authorization: `Bearer ${token}`,
          ...form.getHeaders(),
        },
        payload: form,
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('sessionId');
    });

    it('404: 会话不存在或不属于该用户', async () => {
      const user = await createTestUser({ credits: 100 });
      const fakeSessionId = '00000000-0000-0000-0000-000000000000';

      const form = buildMultipartPayload(fakeSessionId, 'test.txt', 'content');
      const token = generateToken({ id: user.id, username: user.username, role: UserRole.USER });

      const response = await app.inject({
        method: 'POST',
        url: '/api/files/upload-session',
        headers: {
          authorization: `Bearer ${token}`,
          ...form.getHeaders(),
        },
        payload: form,
      });

      expect(response.statusCode).toBe(404);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('不存在');
    });

    it('401: 未认证', async () => {
      const user = await createTestUser({ credits: 100 });
      const machine = await createTestMachine();
      const session = await createTestSession(user.id, { machine_id: machine.id });

      const form = buildMultipartPayload(session.id, 'test.txt', 'content');

      const response = await app.inject({
        method: 'POST',
        url: '/api/files/upload-session',
        headers: {
          ...form.getHeaders(),
        },
        payload: form,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ========================================
  // POST /api/admin/sessions/batch-release
  // ========================================
  describe('POST /api/admin/sessions/batch-release', () => {
    it('200: 成功批量释放会话', async () => {
      const user = await createTestUser({ credits: 100 });
      const machine = await createTestMachine();
      const session1 = await createTestSession(user.id, { machine_id: machine.id });
      const session2 = await createTestSession(user.id, { machine_id: machine.id });

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/sessions/batch-release',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'content-type': 'application/json',
        },
        payload: {
          sessionIds: [session1.id, session2.id],
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data.released).toContain(session1.id);
      expect(result.data.released).toContain(session2.id);
      expect(result.data.failed).toHaveLength(0);
    });

    it('400: 无效请求体（空数组）', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/sessions/batch-release',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'content-type': 'application/json',
        },
        payload: {
          sessionIds: [],
        },
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });

    it('400: 无效请求体（缺少 sessionIds）', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/sessions/batch-release',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'content-type': 'application/json',
        },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });

    it('401: 未认证', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/sessions/batch-release',
        headers: {
          'content-type': 'application/json',
        },
        payload: {
          sessionIds: ['some-id'],
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('403: 非管理员用户', async () => {
      const user = await createTestUser({ credits: 100 });
      const token = generateToken({ id: user.id, username: user.username, role: UserRole.USER });

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/sessions/batch-release',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          sessionIds: ['some-id'],
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('200: 部分成功（有些 session 不存在）', async () => {
      const user = await createTestUser({ credits: 100 });
      const machine = await createTestMachine();
      const session = await createTestSession(user.id, { machine_id: machine.id });
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/sessions/batch-release',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'content-type': 'application/json',
        },
        payload: {
          sessionIds: [session.id, nonExistentId],
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data.released).toContain(session.id);
      expect(result.data.failed.length).toBeGreaterThan(0);
      expect(result.data.failed.some((f: { sessionId: string }) => f.sessionId === nonExistentId)).toBe(true);
    });
  });
});
