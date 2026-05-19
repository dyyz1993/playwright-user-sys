/**
 * Machine Management API 集成测试
 * 测试 status update, restart, cleanup 端点的完整HTTP请求/响应流程
 *
 * 测试策略:
 * - 真实HTTP请求 (Fastify inject)
 * - 真实数据库操作
 * - 真实中间件执行
 * - Mock: gRPC connection, machine-monitor.service
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { build } from '../../helpers/app.js';
import { initDatabase } from '../../../config/database.js';
import { createTestUser, createTestAdmin, createTestMachine } from '../../helpers/factories.js';
import { generateToken } from '../../../utils/auth.js';

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
    isConnected: vi.fn(() => true),
    sendRestartCommand: vi.fn(),
    sendShutdownCommand: vi.fn(),
    removeConnection: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../services/machine.service.js', () => ({
  findAvailableMachine: vi.fn().mockResolvedValue(null),
  allocateBrowserInstance: vi.fn().mockResolvedValue(null),
  releaseBrowserInstance: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../services/machine-monitor.service.js', () => ({
  forceCheckAllMachines: vi.fn().mockResolvedValue(undefined),
  cleanupOldMachines: vi.fn().mockResolvedValue(undefined),
}));

describe('Machine Management API 集成测试', () => {
  let app: FastifyInstance;
  let testAdmin: ReturnType<typeof vi.fn>;
  let testUser: ReturnType<typeof vi.fn>;
  let adminApiKey: string;
  let userApiKey: string;
  let adminToken: string;
  let userToken: string;
  let testMachine: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    await initDatabase();
    app = await build();

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    testAdmin = await createTestAdmin({
      username: `mgmtadmin-${suffix}`,
      credits: 1000,
    });

    testUser = await createTestUser({
      username: `mgmtuser-${suffix}`,
      credits: 100,
    });

    adminApiKey = testAdmin?.api_key || '';
    userApiKey = testUser?.api_key || '';
    adminToken = generateToken({
      id: testAdmin.id,
      username: testAdmin.username,
      role: testAdmin.role,
    });
    userToken = generateToken({
      id: testUser.id,
      username: testUser.username,
      role: testUser.role,
    });
  });

  afterAll(async () => {
    await initDatabase();
    await app.close();
  });

  // ========================================
  // PUT /api/machines/:id/status
  // ========================================
  describe('PUT /api/machines/:id/status', () => {
    it('200: 成功更新机器状态', async () => {
      const machine = await createTestMachine();
      const response = await app.inject({
        method: 'PUT',
        url: `/api/machines/${machine.id}/status`,
        headers: { 'x-api-key': adminApiKey },
        payload: {
          cpuUsage: 45.5,
          memoryUsage: 60.2,
          diskUsage: 30.1,
          status: 'online',
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
    });

    it('400: 无效状态值', async () => {
      const machine = await createTestMachine();
      const response = await app.inject({
        method: 'PUT',
        url: `/api/machines/${machine.id}/status`,
        headers: { 'x-api-key': adminApiKey },
        payload: {
          cpuUsage: 50,
          memoryUsage: 50,
          diskUsage: 50,
          status: 'invalid-status',
        },
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });

    it('400: cpuUsage 超出范围', async () => {
      const machine = await createTestMachine();
      const response = await app.inject({
        method: 'PUT',
        url: `/api/machines/${machine.id}/status`,
        headers: { 'x-api-key': adminApiKey },
        payload: {
          cpuUsage: 150,
          memoryUsage: 50,
          diskUsage: 50,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('400: 缺少必填字段 cpuUsage', async () => {
      const machine = await createTestMachine();
      const response = await app.inject({
        method: 'PUT',
        url: `/api/machines/${machine.id}/status`,
        headers: { 'x-api-key': adminApiKey },
        payload: {
          memoryUsage: 50,
          diskUsage: 50,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('404: 机器不存在', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/machines/nonexistent-machine-id/status',
        headers: { 'x-api-key': adminApiKey },
        payload: {
          cpuUsage: 50,
          memoryUsage: 50,
          diskUsage: 50,
        },
      });

      expect(response.statusCode).toBe(404);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });

    it('401: 未认证（无 API Key）', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/machines/some-id/status',
        payload: {
          cpuUsage: 50,
          memoryUsage: 50,
          diskUsage: 50,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('401: 无效 API Key', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/machines/some-id/status',
        headers: { 'x-api-key': 'invalid-key-99999' },
        payload: {
          cpuUsage: 50,
          memoryUsage: 50,
          diskUsage: 50,
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ========================================
  // POST /api/machines/:id/restart
  // ========================================
  describe('POST /api/machines/:id/restart', () => {
    it('200: 成功重启机器', async () => {
      const machine = await createTestMachine();
      const response = await app.inject({
        method: 'POST',
        url: `/api/machines/${machine.id}/restart`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
    });

    it('400: 机器未连接无法重启', async () => {
      const { connectionManager } = await import('../../../services/machine-grpc/index.js');
      (connectionManager.isConnected as unknown as Record<string, unknown>).mockReturnValueOnce(false);

      const machine = await createTestMachine();
      const response = await app.inject({
        method: 'POST',
        url: `/api/machines/${machine.id}/restart`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });

    it('404: 机器不存在', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/machines/nonexistent-machine-id/restart',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(404);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });

    it('401: 未认证（无 Token）', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/machines/some-id/restart',
      });

      expect(response.statusCode).toBe(401);
    });

    it('401: 无效 Token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/machines/some-id/restart',
        headers: { authorization: 'Bearer invalid-token' },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ========================================
  // POST /api/machines/cleanup
  // ========================================
  describe('POST /api/machines/cleanup', () => {
    it('200: 成功清理过期机器', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/machines/cleanup',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          daysThreshold: 30,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
    });

    it('200: 使用默认 daysThreshold', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/machines/cleanup',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
    });

    it('401: 未认证（无 Token）', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/machines/cleanup',
        payload: { daysThreshold: 30 },
      });

      expect(response.statusCode).toBe(401);
    });

    it('403: 非管理员用户', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/machines/cleanup',
        headers: { authorization: `Bearer ${userToken}` },
        payload: { daysThreshold: 30 },
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
