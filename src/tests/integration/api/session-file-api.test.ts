/**
 * Session File API 集成测试
 * 测试 inject-file 和 upload-url 端点的完整HTTP请求/响应流程
 *
 * 测试策略:
 * - 真实HTTP请求 (Fastify inject)
 * - 真实数据库操作
 * - 真实中间件执行 (verifyJWTOrApiKey)
 * - Mock: fileTransferService 外部依赖
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { build } from '../../helpers/app.js';
import { generateToken } from '../../../utils/auth.js';
import { UserRole, SessionStatus } from '../../../shared/types/index.js';
import { initDatabase } from '../../../config/database.js';
import { createTestUser, createTestAdmin, createTestSession, createTestMachine } from '../../helpers/factories.js';

vi.mock('../../../utils/webhook.js', () => ({
  createWebhookEvent: vi.fn().mockResolvedValue(undefined),
}));

const mockConnectionManager = {
  getAllConnectedMachines: vi.fn(() => ['test-machine-1']),
  closeBrowser: vi.fn().mockResolvedValue(undefined),
  launchBrowser: vi.fn().mockResolvedValue({
    port: 3000,
    browser_ws_endpoint: 'ws://localhost:3000',
  }),
};

vi.mock('../../../services/machine-grpc/index.js', () => ({
  connectionManager: mockConnectionManager,
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

const mockInjectFile = vi.fn().mockResolvedValue({ success: true, files: ['test.txt'] });
const mockDownloadAndInject = vi.fn().mockResolvedValue({ success: true, files: ['downloaded.txt'] });

vi.mock('../../../services/file-transfer.service.js', () => ({
  fileTransferService: {
    injectFile: (...args: any[]) => mockInjectFile(...args),
    downloadAndInject: (...args: any[]) => mockDownloadAndInject(...args),
  },
}));

describe('Session File API 集成测试', () => {
  let app: FastifyInstance;
  let testUser: any;
  let testAdmin: any;
  let userToken: string;
  let adminToken: string;

  beforeAll(async () => {
    await initDatabase();
    app = await build();

    testUser = await createTestUser({ username: 'fileuser', credits: 100 });
    userToken = generateToken({
      id: testUser?.id || 0,
      username: testUser?.username || '',
      role: UserRole.USER,
    });

    testAdmin = await createTestAdmin({ username: 'fileadmin', credits: 1000 });
    adminToken = generateToken({
      id: testAdmin?.id || 0,
      username: testAdmin?.username || '',
      role: UserRole.ADMIN,
    });
  });

  afterAll(async () => {
    await initDatabase();
    await app.close();
  });

  // ========================================
  // POST /api/sessions/:id/inject-file
  // ========================================
  describe('POST /api/sessions/:id/inject-file', () => {
    it('200: 成功注入文件', async () => {
      const user = await createTestUser({ credits: 100 });
      const machine = await createTestMachine();
      const session = await createTestSession(user.id, { machine_id: machine.id });

      mockInjectFile.mockResolvedValueOnce({ success: true, files: ['test.txt'] });

      const response = await app.inject({
        method: 'POST',
        url: `/api/sessions/${session.id}/inject-file`,
        headers: { 'x-api-key': user.api_key!! },
        payload: {
          machineFilePath: 'data/temp/test.txt',
          selector: '#file-input',
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.message).toContain('成功');
    });

    it('404: session 不存在', async () => {
      const user = await createTestUser({ credits: 100 });

      const response = await app.inject({
        method: 'POST',
        url: '/api/sessions/non-existent-id/inject-file',
        headers: { 'x-api-key': user.api_key!! },
        payload: {
          machineFilePath: 'data/temp/test.txt',
          selector: '#file-input',
        },
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

      const response = await app.inject({
        method: 'POST',
        url: `/api/sessions/${session.id}/inject-file`,
        payload: {
          machineFilePath: 'data/temp/test.txt',
          selector: '#file-input',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('400: 非法文件路径（路径遍历）', async () => {
      const user = await createTestUser({ credits: 100 });
      const machine = await createTestMachine();
      const session = await createTestSession(user.id, { machine_id: machine.id });

      const response = await app.inject({
        method: 'POST',
        url: `/api/sessions/${session.id}/inject-file`,
        headers: { 'x-api-key': user.api_key!! },
        payload: {
          machineFilePath: '../../etc/passwd',
          selector: '#file-input',
        },
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('非法');
    });

    it('400: 会话没有关联的机器', async () => {
      const user = await createTestUser({ credits: 100 });
      const session = await createTestSession(user.id);

      const response = await app.inject({
        method: 'POST',
        url: `/api/sessions/${session.id}/inject-file`,
        headers: { 'x-api-key': user.api_key!! },
        payload: {
          machineFilePath: 'data/temp/test.txt',
          selector: '#file-input',
        },
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // POST /api/sessions/:id/upload-url
  // ========================================
  describe('POST /api/sessions/:id/upload-url', () => {
    it('200: 成功上传 URL', async () => {
      const user = await createTestUser({ credits: 100 });
      const machine = await createTestMachine();
      const session = await createTestSession(user.id, { machine_id: machine.id });

      mockDownloadAndInject.mockResolvedValueOnce({ success: true, files: ['downloaded.txt'] });

      const response = await app.inject({
        method: 'POST',
        url: `/api/sessions/${session.id}/upload-url`,
        headers: { 'x-api-key': user.api_key!! },
        payload: {
          url: 'https://example.com/file.pdf',
          selector: '#file-input',
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.message).toContain('成功');
    });

    it('400: 无效 URL（非 http/https）', async () => {
      const user = await createTestUser({ credits: 100 });
      const machine = await createTestMachine();
      const session = await createTestSession(user.id, { machine_id: machine.id });

      const response = await app.inject({
        method: 'POST',
        url: `/api/sessions/${session.id}/upload-url`,
        headers: { 'x-api-key': user.api_key!! },
        payload: {
          url: 'ftp://example.com/file.pdf',
          selector: '#file-input',
        },
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });

    it('400: 无效 URL（格式错误）', async () => {
      const user = await createTestUser({ credits: 100 });
      const machine = await createTestMachine();
      const session = await createTestSession(user.id, { machine_id: machine.id });

      const response = await app.inject({
        method: 'POST',
        url: `/api/sessions/${session.id}/upload-url`,
        headers: { 'x-api-key': user.api_key!! },
        payload: {
          url: 'not-a-valid-url',
          selector: '#file-input',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('400: 内网地址（localhost）', async () => {
      const user = await createTestUser({ credits: 100 });
      const machine = await createTestMachine();
      const session = await createTestSession(user.id, { machine_id: machine.id });

      const response = await app.inject({
        method: 'POST',
        url: `/api/sessions/${session.id}/upload-url`,
        headers: { 'x-api-key': user.api_key!! },
        payload: {
          url: 'http://localhost:3000/secret',
          selector: '#file-input',
        },
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('内网');
    });

    it('400: 内网地址（私有IP）', async () => {
      const user = await createTestUser({ credits: 100 });
      const machine = await createTestMachine();
      const session = await createTestSession(user.id, { machine_id: machine.id });

      const response = await app.inject({
        method: 'POST',
        url: `/api/sessions/${session.id}/upload-url`,
        headers: { 'x-api-key': user.api_key!! },
        payload: {
          url: 'http://192.168.1.1/admin',
          selector: '#file-input',
        },
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('内网');
    });

    it('404: session 不存在', async () => {
      const user = await createTestUser({ credits: 100 });

      const response = await app.inject({
        method: 'POST',
        url: '/api/sessions/non-existent-id/upload-url',
        headers: { 'x-api-key': user.api_key!! },
        payload: {
          url: 'https://example.com/file.pdf',
          selector: '#file-input',
        },
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

      const response = await app.inject({
        method: 'POST',
        url: `/api/sessions/${session.id}/upload-url`,
        payload: {
          url: 'https://example.com/file.pdf',
          selector: '#file-input',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('200: 带 frameSelector 和 filename 参数', async () => {
      const user = await createTestUser({ credits: 100 });
      const machine = await createTestMachine();
      const session = await createTestSession(user.id, { machine_id: machine.id });

      mockDownloadAndInject.mockResolvedValueOnce({ success: true, files: ['report.pdf'] });

      const response = await app.inject({
        method: 'POST',
        url: `/api/sessions/${session.id}/upload-url`,
        headers: { 'x-api-key': user.api_key!! },
        payload: {
          url: 'https://example.com/report.pdf',
          selector: '#file-input',
          frameSelector: 'iframe#doc-frame',
          filename: 'report.pdf',
          downloadTimeout: 30000,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
    });
  });
});
