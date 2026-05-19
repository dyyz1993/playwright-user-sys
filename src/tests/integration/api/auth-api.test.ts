/**
 * Auth API 集成测试
 * 测试 GET /api/auth/me 和 GET /api/auth/verify 端点
 *
 * 测试策略:
 * - 真实HTTP请求 (Fastify inject)
 * - 真实数据库操作
 * - 真实中间件执行 (verifyJWT, verifyJWTOrApiKey)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { build } from '../../helpers/app.js';
import { generateToken } from '../../../utils/auth.js';
import { UserRole } from '../../../shared/types/index.js';
import { initDatabase } from '../../../config/database.js';
import { createTestUser } from '../../helpers/factories.js';

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

describe('Auth API 集成测试', () => {
  let app: FastifyInstance;
  let testUser: ReturnType<typeof vi.fn>;
  let validToken: string;

  beforeAll(async () => {
    await initDatabase();
    app = await build();

    testUser = await createTestUser({
      username: 'authmeuser',
      credits: 100,
    });

    validToken = generateToken({
      id: testUser.id,
      username: testUser.username,
      role: UserRole.USER,
    });
  });

  afterAll(async () => {
    await initDatabase();
    await app.close();
  });

  // ========================================
  // GET /api/auth/me
  // ========================================
  describe('GET /api/auth/me', () => {
    it('200: 返回当前用户信息', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('user');
      expect(result.data.user).toHaveProperty('id', testUser.id);
      expect(result.data.user).toHaveProperty('username', testUser.username);
    });

    it('401: 未认证（无 Token）', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
      });

      expect(response.statusCode).toBe(401);
    });

    it('401: 无效 Token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: 'Bearer invalid-token-xxx',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ========================================
  // GET /api/auth/verify
  // ========================================
  describe('GET /api/auth/verify', () => {
    it('200: token 有效', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/verify',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('user');
      expect(result.data.user).toHaveProperty('id', testUser.id);
    });

    it('200: API Key 有效', async () => {
      const apiKey = testUser?.api_key || '';
      if (!apiKey) return;

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/verify',
        headers: {
          'x-api-key': apiKey,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
    });

    it('401: 无效 Token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/verify',
        headers: {
          authorization: 'Bearer expired-or-invalid-token',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('401: 未认证（无 Token / API Key）', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/verify',
      });

      expect(response.statusCode).toBe(401);
    });

    it('401: 无效 API Key', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/verify',
        headers: {
          'x-api-key': 'invalid-api-key-12345',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
