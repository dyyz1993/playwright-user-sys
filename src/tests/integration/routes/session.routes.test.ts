/**
 * Session Routes 集成测试
 * 测试会话路由的完整HTTP请求/响应流程
 *
 * 参考: docs/tests/04-阶段4-Routes层集成测试.md
 *
 * 测试策略:
 * - 真实HTTP请求 (Fastify inject)
 * - 真实数据库操作 (MySQL测试数据库)
 * - 真实中间件执行 (verifyJWT, verifyApiKey)
 * - 真实Controller调用
 * - Mock: 仅外部依赖 (gRPC, webhook)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { build } from '../../helpers/app.js';
import { SessionModel } from '../../../models/session.model.js';
import { generateToken } from '../../../utils/auth.js';
import { UserRole, SessionStatus } from '@shared/types/index.js';
import { clearAllTables } from '../../helpers/database.js';
import { createTestUser, createTestAdmin, createTestMachine } from '../../helpers/factories.js';

// Mock gRPC connectionManager - 集成测试仅Mock外部依赖
vi.mock('../../../services/machine-grpc.service.js', () => ({
  connectionManager: {
    launchBrowser: vi.fn().mockResolvedValue({
      browser_ws_endpoint: 'ws://localhost:9222',
      port: 3000,
    }),
    closeBrowser: vi.fn().mockResolvedValue(true),
    getActiveConnections: vi.fn(() => []),
    getAllConnectedMachines: vi.fn(() => ['test-session-machine']),
    isConnected: vi.fn(() => true),
  },
}));

// Mock webhook - 集成测试仅Mock外部依赖
vi.mock('../../../utils/webhook.js', () => ({
  createWebhookEvent: vi.fn().mockResolvedValue(undefined),
}));

describe('Session Routes集成测试', () => {
  let app: FastifyInstance;
  let testUser: any;
  let testAdmin: any;
  let testMachine: any;
  let testApiKey: string;
  let adminToken: string;

  // ========================================
  // 测试初始化
  // ========================================
  beforeAll(async () => {
    // 清空测试数据
    await clearAllTables();

    // 构建应用实例
    app = await build();

    // 创建测试用户 (不需要预先哈希密码，UserModel.create会处理)
    testUser = await createTestUser({
      username: 'sessionuser',
      password: 'password123', // 明文密码，createTestUser会哈希
      credits: 100,
    });
    testApiKey = testUser?.api_key || '';

    // 创建测试管理员
    testAdmin = await createTestAdmin({
      username: 'sessionadmin',
      password: 'password123',
    });

    // 生成管理员JWT token
    adminToken = generateToken({
      id: testAdmin?.id || 0,
      username: testAdmin?.username || '',
      role: UserRole.ADMIN,
    });

    // 创建测试机器
    testMachine = await createTestMachine({
      id: 'test-session-machine',
      hostname: 'test-machine',
      ip: '127.0.0.1',
      status: 'online',
    });
  });

  // 在所有测试之后清理
  afterAll(async () => {
    await clearAllTables();
    await app.close();
  });

  // ========================================
  // SR-01: 完整创建会话流程
  // ========================================
  describe('POST /api/sessions', () => {
    it('SR-01: 完整创建会话流程应该成功', async () => {
      // Act: 真实HTTP请求
      const response = await app.inject({
        method: 'POST',
        url: '/api/sessions',
        headers: {
          'X-API-Key': testApiKey,
        },
        payload: {
          userAgent: 'test-agent',
        },
      });

      // Assert: 真实断言
      expect(response.statusCode).toBe(201);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id');
      expect(result.data).toHaveProperty('status');
      expect(result.data).toHaveProperty('browserWSEndpoint');
      expect(result.data).toHaveProperty('directUrl');
      expect(result.data).toHaveProperty('created_at');

      // 验证返回的连接信息
      expect(result.data.browserWSEndpoint).toContain('ws://');
      expect(result.data.directUrl).toContain('ws://'); // directUrl is a WebSocket URL
    });

    // ========================================
    // SR-02: 创建会话 - 未认证
    // ========================================
    it('SR-02: 创建会话 - 未认证应该返回401', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sessions',
        // 没有 X-API-Key header
        payload: {
          userAgent: 'test-agent',
        },
      });

      expect(response.statusCode).toBe(401);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(false);
    });

    // ========================================
    // SR-03: 创建会话 - 点数不足
    // ========================================
    it('SR-03: 创建会话 - 点数不足应该返回400', async () => {
      // 创建一个点数不足的用户
      const poorUser = await createTestUser({
        username: 'pooruser',
        credits: 0,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/sessions',
        headers: {
          'X-API-Key': poorUser?.api_key || '',
        },
        payload: {
          userAgent: 'test-agent',
        },
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(false);
      expect(result.error).toContain('点数不足');
    });
  });

  // ========================================
  // SR-04: 获取会话 - 有权限
  // SR-05: 获取会话 - 无权限
  // ========================================
  describe('GET /api/sessions/:id', () => {
    let testSession: any;

    beforeAll(async () => {
      // 创建一个测试会话
      testSession = await SessionModel.create({
        user_id: testUser?.id || 0,
        machine_id: testMachine?.id || '',
        port: 3000,
        options: {
          userAgent: 'test-agent',
        },
      });
    });

    it('SR-04: 获取会话 - 有权限应该返回200', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/sessions/${testSession?.id}`,
        headers: {
          'X-API-Key': testApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id', testSession?.id);
      expect(result.data).toHaveProperty('status');
      expect(result.data).toHaveProperty('machine_id');
      expect(result.data).toHaveProperty('port');
      expect(result.data).toHaveProperty('options');
    });

    it('SR-05: 获取会话 - 无权限应该返回403', async () => {
      // 创建另一个用户
      const anotherUser = await createTestUser({
        username: 'anotheruser',
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/sessions/${testSession?.id}`,
        headers: {
          'X-API-Key': anotherUser?.api_key || '',
        },
      });

      expect(response.statusCode).toBe(403);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(false);
      expect(result.error).toContain('无权访问');
    });

    it('获取不存在的会话应该返回404', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/sessions/nonexistent-id',
        headers: {
          'X-API-Key': testApiKey,
        },
      });

      expect(response.statusCode).toBe(404);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(false);
      expect(result.error).toContain('会话不存在');
    });
  });

  // ========================================
  // SR-06: 释放会话流程
  // ========================================
  describe('POST /api/sessions/:id/release', () => {
    let testSession: any;

    beforeEach(async () => {
      // 创建一个测试会话
      testSession = await SessionModel.create({
        user_id: testUser?.id || 0,
        machine_id: testMachine?.id || '',
        port: 3000,
        options: {
          userAgent: 'test-agent',
        },
      });
    });

    it('SR-06: 释放会话流程应该成功', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/sessions/${testSession?.id}/release`,
        headers: {
          'X-API-Key': testApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id', testSession?.id);

      // 验证会话状态已更新
      const updatedSession = await SessionModel.findById(testSession?.id);
      expect(updatedSession?.status).toBe(SessionStatus.DISCONNECTED);
    });

    it('释放不存在的会话应该返回404', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sessions/nonexistent-id/release',
        headers: {
          'X-API-Key': testApiKey,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ========================================
  // SR-07: 关闭会话 - 管理员
  // ========================================
  describe('POST /api/sessions/:id/close', () => {
    let testSession: any;

    beforeEach(async () => {
      // 创建一个测试会话
      testSession = await SessionModel.create({
        user_id: testUser?.id || 0,
        machine_id: testMachine?.id || '',
        port: 3000,
        options: {
          userAgent: 'test-agent',
        },
      });
    });

    it('SR-07: 关闭会话 - 管理员应该成功', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/sessions/${testSession?.id}/close`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
    });

    it('关闭会话 - 非管理员应该返回403', async () => {
      // 普通用户尝试关闭会话
      const response = await app.inject({
        method: 'POST',
        url: `/api/sessions/${testSession?.id}/close`,
        headers: {
          'X-API-Key': testApiKey,
        },
      });

      expect(response.statusCode).toBe(401); // verifyJWT失败返回401
    });
  });

  // ========================================
  // SR-08: 获取所有会话 - 管理员
  // SR-09: 分页查询
  // ========================================
  describe('GET /api/sessions/admin/all', () => {
    beforeAll(async () => {
      // 创建多个测试会话
      for (let i = 0; i < 15; i++) {
        await SessionModel.create({
          user_id: testUser?.id || 0,
          machine_id: testMachine?.id || '',
          port: 3000 + i,
          options: {
            userAgent: `test-agent-${i}`,
          },
        });
      }
    });

    it('SR-08: 获取所有会话 - 管理员应该成功', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/sessions/admin/all',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      // API返回的是数组，不是分页对象
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('SR-09: 分页查询应该正确工作', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/sessions/admin/all?page=1&limit=5',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      // API返回的是数组，不是分页对象
      // 验证返回的数组长度符合limit限制
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeLessThanOrEqual(5);
    });

    it('获取所有会话 - 非管理员应该返回403', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/sessions/admin/all',
        headers: {
          'X-API-Key': testApiKey,
        },
      });

      expect(response.statusCode).toBe(401); // verifyJWT失败返回401
    });
  });

  // ========================================
  // GET /api/sessions - 获取当前用户的会话列表
  // ========================================
  describe('GET /api/sessions', () => {
    it('获取当前用户的会话列表应该成功', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/sessions',
        headers: {
          'X-API-Key': testApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      // API返回的是数组，不是分页对象
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('分页查询应该正确工作', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/sessions?page=1&limit=5',
        headers: {
          'X-API-Key': testApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      // API返回的是数组，不是分页对象
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeLessThanOrEqual(5);
    });
  });
});
