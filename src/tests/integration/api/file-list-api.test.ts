/**
 * File List API 集成测试
 * 测试 GET /api/files 端点
 *
 * 测试策略:
 * - 真实HTTP请求 (Fastify inject)
 * - 真实数据库操作
 * - 真实中间件执行 (verifyJWT, verifyAdmin)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { build } from '../../helpers/app.js';
import { generateToken } from '../../../utils/auth.js';
import { UserRole } from '../../../shared/types/index.js';
import { initDatabase } from '../../../config/database.js';
import { createTestAdmin, createTestUser } from '../../helpers/factories.js';

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

describe('File List API 集成测试', () => {
  let app: FastifyInstance;
  let testAdmin: any;
  let testUser: any;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    await initDatabase();
    app = await build();

    testAdmin = await createTestAdmin({
      username: 'fileadmin',
      credits: 1000,
    });

    testUser = await createTestUser({
      username: 'fileuser',
      credits: 100,
    });

    adminToken = generateToken({
      id: testAdmin.id,
      username: testAdmin.username,
      role: UserRole.ADMIN,
    });

    userToken = generateToken({
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
  // GET /api/files
  // ========================================
  describe('GET /api/files', () => {
    it('200: 返回文件列表（管理员）', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/files',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result).toHaveProperty('data');
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('401: 未认证（无 Token）', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/files',
      });

      expect(response.statusCode).toBe(401);
    });

    it('401: 无效 Token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/files',
        headers: {
          authorization: 'Bearer invalid-token-xxx',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('403: 非管理员用户', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/files',
        headers: {
          authorization: `Bearer ${userToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
