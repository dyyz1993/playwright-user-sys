/**
 * Auth Routes 集成测试
 * 测试认证路由的完整HTTP请求/响应流程
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
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { build } from '../../helpers/app.js';
import { UserModel } from '../../../models/user.model.js';
import { db } from '../../../config/database.js';
import { generateToken, verifyToken } from '../../../utils/auth.js';
import { UserRole, UserStatus } from '@shared/types/index.js';
import { clearAllTables } from '../../helpers/database.js';

// Mock webhook - 集成测试仅Mock外部依赖
vi.mock('../../../utils/webhook.js', () => ({
  createWebhookEvent: vi.fn().mockResolvedValue(undefined),
}));

describe('Auth Routes集成测试', () => {
  let app: FastifyInstance;
  let testToken: string;
  let testUserId: number;

  // ========================================
  // 测试初始化
  // ========================================
  beforeAll(async () => {
    // 清空测试数据
    await clearAllTables();

    // 构建应用实例
    app = await build();

    // 创建测试用户 (不需要预先哈希密码，UserModel.create会处理)
    const testUser = await UserModel.create({
      username: 'authuser',
      password: 'password123', // 明文密码，UserModel.create会哈希
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      credits: 100,
    });

    testUserId = testUser?.id || 0;

    // 生成JWT token
    testToken = generateToken({
      id: testUser?.id || 0,
      username: testUser?.username || '',
      role: UserRole.USER,
    });
  });

  // 在所有测试之后清理
  afterAll(async () => {
    await clearAllTables();
    await app.close();
  });

  // ========================================
  // AR-01: 完整登录流程 - 成功
  // ========================================
  describe('POST /api/auth/login', () => {
    it('AR-01: 完整登录流程应该成功', async () => {
      // Arrange: 已在beforeAll中创建用户
      // Act: 真实HTTP请求
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'authuser',
          password: 'password123',
        },
      });

      // Assert: 真实断言
      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('user');
      expect(result.data).toHaveProperty('token');

      expect(result.data.user.username).toBe('authuser');
      expect(result.data.user).toHaveProperty('id');
      expect(result.data.user).toHaveProperty('credits');
      expect(result.data.user).toHaveProperty('role');
      expect(result.data.user).not.toHaveProperty('password');

      // 验证token是有效的JWT
      const decoded = verifyToken(result.data.token);
      expect(decoded.username).toBe('authuser');
    });

    // ========================================
    // AR-02: 完整登录流程 - 失败
    // ========================================
    it('AR-02: 用户不存在应该返回401', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'nonexistent',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(401);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(false);
      expect(result.error).toContain('用户名或密码错误');
    });

    // ========================================
    // AR-06: 参数验证
    // ========================================
    it('AR-06: 缺少必填字段应该返回400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'testuser',
          // 缺少 password
        },
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);

      // 验证返回了错误信息
      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('error');
    });
  });

  // ========================================
  // AR-03: JWT认证流程 + AR-04: 获取当前用户
  // ========================================
  describe('GET /api/auth/me', () => {
    // AR-03: 验证JWT中间件正确工作
    it('AR-03: JWT认证流程应该正确工作', async () => {
      // 使用beforeAll中生成的token
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          Authorization: `Bearer ${testToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.data.username).toBe('authuser');
    });

    // AR-04: 已认证用户应该获取用户信息
    it('AR-04: 应该返回正确的用户信息', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          Authorization: `Bearer ${testToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      // 验证返回的用户信息完整
      expect(result.data).toHaveProperty('id', testUserId);
      expect(result.data).toHaveProperty('username', 'authuser');
      expect(result.data).toHaveProperty('credits');
      expect(result.data).toHaveProperty('api_key');
      expect(result.data).toHaveProperty('role');
      expect(result.data).toHaveProperty('email');

      // 敏感字段不应返回
      expect(result.data).not.toHaveProperty('password');
      expect(result.data).not.toHaveProperty('status');
    });

    // 未认证应该返回401
    it('未认证应该返回401', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        // 没有 Authorization header
      });

      expect(response.statusCode).toBe(401);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(false);
    });
  });
});
