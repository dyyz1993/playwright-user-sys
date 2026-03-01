/**
 * User Routes 集成测试
 * 测试用户路由的完整HTTP请求/响应流程
 *
 * 参考: docs/tests/04-阶段4-Routes层集成测试.md
 *
 * 测试策略:
 * - 真实HTTP请求 (Fastify inject)
 * - 真实数据库操作 (MySQL测试数据库)
 * - 真实中间件执行 (verifyJWT, verifyApiKey)
 * - 真实Controller调用
 * - Mock: 仅外部依赖 (webhook)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { build } from '../../helpers/app.js';
import { UserModel } from '../../../models/user.model.js';
import { generateToken } from '../../../utils/auth.js';
import { UserRole } from '@shared/types/index.js';
import { initDatabase } from '../../../config/database.js';
import { createTestUser, createTestAdmin } from '../../helpers/factories.js';

// Mock webhook - 集成测试仅Mock外部依赖
vi.mock('../../../utils/webhook.js', () => ({
  createWebhookEvent: vi.fn().mockResolvedValue(undefined),
}));

describe('User Routes集成测试', () => {
  let app: FastifyInstance;
  let testUser: any;
  let testAdmin: any;
  let testApiKey: string;
  let adminToken: string;
  let userToken: string;

  // ========================================
  // 测试初始化
  // ========================================
  beforeAll(async () => {
    // 清空测试数据
    await initDatabase();

    // 构建应用实例
    app = await build();

    // 创建测试用户
    testUser = await createTestUser({
      username: 'userrouteuser',
      password: 'password123', // 明文密码，createTestUser会哈希
      credits: 100,
    });
    testApiKey = testUser?.api_key || '';

    // 生成用户JWT token
    userToken = generateToken({
      id: testUser?.id || 0,
      username: testUser?.username || '',
      role: UserRole.USER,
    });

    // 创建测试管理员
    testAdmin = await createTestAdmin({
      username: 'userrouteadmin',
      password: 'password123',
    });

    // 生成管理员JWT token
    adminToken = generateToken({
      id: testAdmin?.id || 0,
      username: testAdmin?.username || '',
      role: UserRole.ADMIN,
    });
  });

  // 在所有测试之后清理
  afterAll(async () => {
    await initDatabase();
    await app.close();
  });

  // ========================================
  // UR-01: API Key认证流程
  // ========================================
  describe('GET /api/users/me', () => {
    it('UR-01: API Key认证流程应该正确工作', async () => {
      // 使用API Key获取当前用户信息
      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me',
        headers: {
          'X-API-Key': testApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id', testUser?.id);
      expect(result.data).toHaveProperty('username', testUser?.username);
      expect(result.data).toHaveProperty('email');
      expect(result.data).toHaveProperty('role');
      expect(result.data).toHaveProperty('credits');
      expect(result.data).toHaveProperty('api_key');
      expect(result.data).toHaveProperty('webhook_url');

      // 敏感字段不应返回
      expect(result.data).not.toHaveProperty('password');
      expect(result.data).not.toHaveProperty('status');
    });

    it('API Key认证失败应该返回401', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me',
        headers: {
          'X-API-Key': 'invalid-api-key',
        },
      });

      expect(response.statusCode).toBe(401);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(false);
    });

    it('未认证应该返回401', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me',
        // 没有 X-API-Key header
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ========================================
  // UR-02: 创建用户流程 - 管理员
  // UR-03: 创建用户 - 非管理员
  // ========================================
  describe('POST /api/users', () => {
    it('UR-02: 创建用户流程 - 管理员应该成功', async () => {
      const newUser = {
        username: `newuser_${Date.now()}`,
        password: 'newpassword123',
        email: `newuser_${Date.now()}@example.com`,
        role: UserRole.USER,
        credits: 50,
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/users',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: newUser,
      });

      expect(response.statusCode).toBe(201);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id');
      expect(result.data).toHaveProperty('username', newUser.username);
      expect(result.data).toHaveProperty('email', newUser.email);
      expect(result.data).toHaveProperty('role', newUser.role);
      expect(result.data).toHaveProperty('credits', newUser.credits);
      expect(result.data).toHaveProperty('api_key');
      // Note: created_at is not returned in the response

      // 敏感字段不应返回
      expect(result.data).not.toHaveProperty('password');
    });

    it('UR-03: 创建用户 - 非管理员应该返回403', async () => {
      const newUser = {
        username: `unauthorizeduser_${Date.now()}`,
        password: 'password123',
        email: `unauthorized_${Date.now()}@example.com`,
        role: UserRole.USER,
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/users',
        headers: {
          Authorization: `Bearer ${userToken}`, // 普通用户token
        },
        payload: newUser,
      });

      expect(response.statusCode).toBe(403);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(false);
    });

    it('创建用户时用户名重复应该返回409', async () => {
      // 尝试创建已存在的用户名
      const duplicateUser = {
        username: testUser?.username,
        password: 'password123',
        email: `duplicate_${Date.now()}@example.com`,
        role: UserRole.USER,
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/users',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: duplicateUser,
      });

      expect(response.statusCode).toBe(409);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(false);
      expect(result.error).toContain('用户名已存在');
    });
  });

  // ========================================
  // UR-04: 用户列表 - 分页
  // ========================================
  describe('GET /api/users', () => {
    beforeAll(async () => {
      // 创建额外的用户用于测试分页
      for (let i = 0; i < 15; i++) {
        await createTestUser({
          username: `paginationuser_${i}`,
          credits: 50,
        });
      }
    });

    it('UR-04: 用户列表 - 分页应该正确工作', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/users?page=1&limit=5',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('items');
      expect(result.data).toHaveProperty('total');
      expect(result.data).toHaveProperty('page', 1);
      expect(result.data).toHaveProperty('limit', 5);
      expect(result.data).toHaveProperty('totalPages');

      // 验证返回的是数组
      expect(Array.isArray(result.data.items)).toBe(true);
      expect(result.data.items.length).toBeLessThanOrEqual(5);
      expect(result.data.totalPages).toBeGreaterThan(1);
    });

    it('获取所有用户 - 非管理员应该返回403', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/users',
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(false);
    });

    it('分页参数超出范围应该返回空数组', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/users?page=9999&limit=10',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.data.items).toEqual([]);
    });
  });

  // ========================================
  // UR-05: 更新用户流程
  // ========================================
  describe('PUT /api/users/:id', () => {
    let userToUpdate: any;

    beforeEach(async () => {
      // 创建一个要更新的用户
      userToUpdate = await createTestUser({
        username: `updatableuser_${Date.now()}`,
        email: `updatable_${Date.now()}@example.com`,
        credits: 50,
      });
    });

    it('UR-05: 更新用户流程应该成功', async () => {
      const updateData = {
        email: `updated_${Date.now()}@example.com`,
        webhook_url: 'https://example.com/webhook',
      };

      const response = await app.inject({
        method: 'PUT',
        url: `/api/users/${userToUpdate?.id}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: updateData,
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id', userToUpdate?.id);
      expect(result.data).toHaveProperty('email', updateData.email);
      expect(result.data).toHaveProperty('credits'); // credits should be present but unchanged
      expect(result.data).toHaveProperty('webhook_url', updateData.webhook_url);

      // 验证数据库中的值已更新
      const updatedUser = await UserModel.findById(userToUpdate?.id);
      expect(updatedUser?.email).toBe(updateData.email);
      expect(updatedUser?.webhook_url).toBe(updateData.webhook_url);
    });

    it('更新用户 - 非管理员应该返回403', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/users/${userToUpdate?.id}`,
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
        payload: {
          email: 'updated@example.com',
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('更新不存在的用户应该返回404', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/users/999999',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          email: 'updated@example.com',
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ========================================
  // UR-06: 删除用户流程
  // UR-07: 删除用户 - 管理员自己
  // ========================================
  describe('DELETE /api/users/:id', () => {
    let userToDelete: any;

    beforeEach(async () => {
      // 创建一个要删除的用户
      userToDelete = await createTestUser({
        username: `deletableuser_${Date.now()}`,
        credits: 50,
      });
    });

    it('UR-06: 删除用户流程应该成功', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/users/${userToDelete?.id}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(204);

      // 验证用户已被删除
      const deletedUser = await UserModel.findById(userToDelete?.id);
      expect(deletedUser).toBeUndefined();
    });

    it('UR-07: 删除用户 - 管理员角色应该返回403', async () => {
      // 尝试删除管理员用户
      // 代码逻辑: 不允许删除管理员账号 (任何管理员都不能被删除)
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/users/${testAdmin?.id}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(false);
      expect(result.error).toContain('不允许删除管理员');
    });

    it('删除用户 - 非管理员应该返回403', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/users/${userToDelete?.id}`,
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('删除不存在的用户应该返回404', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/users/999999',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ========================================
  // UR-08: 重置API Key流程
  // ========================================
  describe('POST /api/users/:id/reset-api-key', () => {
    let userToReset: any;

    beforeEach(async () => {
      // 创建一个要重置API Key的用户
      userToReset = await createTestUser({
        username: `resetuser_${Date.now()}`,
        credits: 50,
      });
    });

    it('UR-08: 重置API Key流程应该成功', async () => {
      const oldApiKey = userToReset?.api_key;

      const response = await app.inject({
        method: 'POST',
        url: `/api/users/${userToReset?.id}/reset-api-key`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('api_key');
      expect(result.data.api_key).not.toBe(oldApiKey);

      // 验证数据库中的API Key已更新
      const updatedUser = await UserModel.findById(userToReset?.id);
      expect(updatedUser?.api_key).toBe(result.data.api_key);
      expect(updatedUser?.api_key).not.toBe(oldApiKey);
    });

    it('重置API Key - 非管理员应该返回403', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/users/${userToReset?.id}/reset-api-key`,
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('重置不存在用户的API Key应该返回404', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/users/999999/reset-api-key',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ========================================
  // POST /api/users/me/apikey/regenerate - 重置当前用户的API Key
  // ========================================
  describe('POST /api/users/me/apikey/regenerate', () => {
    it('重置当前用户的API Key应该成功', async () => {
      const oldApiKey = testUser?.api_key;

      const response = await app.inject({
        method: 'POST',
        url: '/api/users/me/apikey/regenerate',
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('api_key');
      expect(result.data.api_key).not.toBe(oldApiKey);
    });

    it('重置当前用户的API Key - 未认证应该返回401', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/users/me/apikey/regenerate',
        // 没有 Authorization header
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ========================================
  // GET /api/users/:id - 获取单个用户
  // ========================================
  describe('GET /api/users/:id', () => {
    it('获取单个用户 - 管理员应该成功', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/users/${testUser?.id}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id', testUser?.id);
      expect(result.data).toHaveProperty('username');
      expect(result.data).toHaveProperty('email');
      expect(result.data).toHaveProperty('role');
      expect(result.data).toHaveProperty('credits');
      expect(result.data).toHaveProperty('status');
    });

    it('获取单个用户 - 非管理员应该返回403', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/users/${testUser?.id}`,
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });

      // JWT认证通过，但权限检查失败返回403
      expect(response.statusCode).toBe(403);
    });

    it('获取不存在的用户应该返回404', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/users/999999',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
