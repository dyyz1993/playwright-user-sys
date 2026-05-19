/**
 * Machine Register API 集成测试
 * 测试 POST /api/machines/register 端点的完整HTTP请求/响应流程
 *
 * 测试策略:
 * - 真实HTTP请求 (Fastify inject)
 * - 真实数据库操作
 * - 真实中间件执行 (verifyApiKey, verifyAdmin)
 * - Mock: gRPC connection
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { build } from '../../helpers/app.js';
import { generateToken } from '../../../utils/auth.js';
import { UserRole } from '../../../shared/types/index.js';
import { initDatabase } from '../../../config/database.js';
import { createTestUser, createTestAdmin } from '../../helpers/factories.js';

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
  findAvailableMachine: vi.fn().mockResolvedValue(null),
  allocateBrowserInstance: vi.fn().mockResolvedValue(null),
  releaseBrowserInstance: vi.fn().mockResolvedValue(undefined),
}));

describe('Machine Register API 集成测试', () => {
  let app: FastifyInstance;
  let testAdmin: ReturnType<typeof vi.fn>;
  let testUser: ReturnType<typeof vi.fn>;
  let adminApiKey: string;
  let userApiKey: string;

  beforeAll(async () => {
    await initDatabase();
    app = await build();

    testAdmin = await createTestAdmin({
      username: 'regadmin',
      credits: 1000,
    });

    testUser = await createTestUser({
      username: 'reguser',
      credits: 100,
    });

    adminApiKey = testAdmin?.api_key || '';
    userApiKey = testUser?.api_key || '';
  });

  afterAll(async () => {
    await initDatabase();
    await app.close();
  });

  // ========================================
  // POST /api/machines/register
  // ========================================
  describe('POST /api/machines/register', () => {
    it('200: 成功注册新机器', async () => {
      const machineId = `machine-${Date.now()}`;
      const response = await app.inject({
        method: 'POST',
        url: '/api/machines/register',
        headers: { 'x-api-key': adminApiKey },
        payload: {
          id: machineId,
          hostname: 'test-register-machine',
          ip: `10.0.${Date.now() % 255}.1`,
          max_instances: 10,
        },
      });

      expect([200, 201]).toContain(response.statusCode);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id', machineId);
      expect(result.data).toHaveProperty('status', 'online');
    });

    it('200: 重复注册更新已存在的机器', async () => {
      const machineId = `repeat-${Date.now()}`;
      const ip1 = `10.1.${Date.now() % 255}.1`;

      await app.inject({
        method: 'POST',
        url: '/api/machines/register',
        headers: { 'x-api-key': adminApiKey },
        payload: {
          id: machineId,
          hostname: 'machine-v1',
          ip: ip1,
          max_instances: 5,
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/machines/register',
        headers: { 'x-api-key': adminApiKey },
        payload: {
          id: machineId,
          hostname: 'machine-v2',
          ip: ip1,
          max_instances: 10,
        },
      });

      expect([200, 201]).toContain(response.statusCode);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('online');
    });

    it('400: 缺少必填字段 id', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/machines/register',
        headers: { 'x-api-key': adminApiKey },
        payload: {
          hostname: 'test-machine',
          ip: '10.0.0.1',
        },
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });

    it('400: 缺少必填字段 hostname', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/machines/register',
        headers: { 'x-api-key': adminApiKey },
        payload: {
          id: `machine-${Date.now()}`,
          ip: '10.0.0.1',
        },
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });

    it('400: 缺少必填字段 ip', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/machines/register',
        headers: { 'x-api-key': adminApiKey },
        payload: {
          id: `machine-${Date.now()}`,
          hostname: 'test-machine',
        },
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });

    it('400: 无效 IP 地址格式', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/machines/register',
        headers: { 'x-api-key': adminApiKey },
        payload: {
          id: `machine-${Date.now()}`,
          hostname: 'test-machine',
          ip: 'not-an-ip',
        },
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });

    it('400: 空的 id 字段', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/machines/register',
        headers: { 'x-api-key': adminApiKey },
        payload: {
          id: '',
          hostname: 'test-machine',
          ip: '10.0.0.1',
        },
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });

    it('401: 未认证（无 API Key）', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/machines/register',
        payload: {
          id: `machine-${Date.now()}`,
          hostname: 'test-machine',
          ip: '10.0.0.1',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('401: 无效 API Key', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/machines/register',
        headers: { 'x-api-key': 'invalid-key-12345' },
        payload: {
          id: `machine-${Date.now()}`,
          hostname: 'test-machine',
          ip: '10.0.0.1',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('403: 非管理员用户（普通用户 API Key）', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/machines/register',
        headers: { 'x-api-key': userApiKey },
        payload: {
          id: `machine-${Date.now()}`,
          hostname: 'test-machine',
          ip: '10.0.0.1',
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('200: 不提供 max_instances 使用默认值', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/machines/register',
        headers: { 'x-api-key': adminApiKey },
        payload: {
          id: `machine-default-${Date.now()}`,
          hostname: 'default-machine',
          ip: `10.2.${Date.now() % 255}.1`,
        },
      });

      expect([200, 201]).toContain(response.statusCode);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
    });
  });
});
