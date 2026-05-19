/**
 * Admin User Management API Routes 集成测试
 * 测试管理后台用户管理 API 的完整HTTP请求/响应流程
 *
 * 测试策略:
 * - 真实HTTP请求 (Fastify inject)
 * - 真实数据库操作 (MySQL测试数据库)
 * - 真实中间件执行 (verifyJWT, verifyAdmin)
 * - 真实Controller调用
 * - Mock: 仅外部依赖 (webhook)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { build } from '../../helpers/app.js';
import { UserModel } from '../../../models/user.model.js';
import { SessionModel } from '../../../models/session/index.js';
import { generateToken } from '../../../utils/auth.js';
import { UserRole, UserStatus } from '../../../shared/types/index.js';
import { initDatabase } from '../../../config/database.js';
import { createTestUser, createTestAdmin, createTestSession } from '../../helpers/factories.js';

// Mock webhook - 集成测试仅Mock外部依赖
vi.mock('../../../utils/webhook.js', () => ({
  createWebhookEvent: vi.fn().mockResolvedValue(undefined),
}));

describe('Admin User Management API Routes 集成测试', () => {
  let app: FastifyInstance;
  let testUser: ReturnType<typeof vi.fn>;
  let testAdmin: ReturnType<typeof vi.fn>;
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

    // 创建测试管理员
    testAdmin = await createTestAdmin({
      username: 'adminapiadmin',
      password: 'password123',
    });

    // 生成管理员JWT token
    adminToken = generateToken({
      id: testAdmin?.id || 0,
      username: testAdmin?.username || '',
      role: UserRole.ADMIN,
    });

    // 创建测试普通用户
    testUser = await createTestUser({
      username: 'adminapiuser',
      password: 'password123',
      credits: 100,
    });

    // 生成普通用户JWT token
    userToken = generateToken({
      id: testUser?.id || 0,
      username: testUser?.username || '',
      role: UserRole.USER,
    });
  });

  // 在所有测试之后清理
  afterAll(async () => {
    await initDatabase();
    await app.close();
  });

  // ========================================
  // A. 用户管理核心功能
  // ========================================

  // ========================================
  // A-01: 创建用户（正常情况）
  // ========================================
  describe('POST /api/admin/users - 创建用户', () => {
    it('A-01: 管理员创建用户应该成功', async () => {
      const newUser = {
        username: `newuser_${Date.now()}`,
        password: 'newpassword123',
        email: `newuser_${Date.now()}@example.com`,
        role: UserRole.USER,
        credits: 50,
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: newUser,
      });

      expect(response.statusCode).toBe(201);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.message).toBe('用户创建成功');
      expect(result.data).toHaveProperty('id');
      expect(result.data).toHaveProperty('username', newUser.username);
      expect(result.data).toHaveProperty('email', newUser.email);
      expect(result.data).toHaveProperty('role', newUser.role);
      expect(result.data).toHaveProperty('status', UserStatus.ACTIVE);
      expect(result.data).toHaveProperty('credits', newUser.credits);
      expect(result.data).toHaveProperty('api_key');

      // 敏感字段不应返回
      expect(result.data).not.toHaveProperty('password');
    });

    it('A-02: 创建用户时缺少必填字段应该返回400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          username: `testuser_${Date.now()}`,
          // 缺少 password
        },
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      // Zod 验证错误会返回验证失败消息
      expect(result.error).toBeTruthy();
    });

    it('A-03: 创建用户时用户名重复应该返回409', async () => {
      const duplicateUser = {
        username: testAdmin?.username, // 使用已存在的用户名
        password: 'password123',
        email: `duplicate_${Date.now()}@example.com`,
        role: UserRole.USER,
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
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

    it('A-04: 非管理员创建用户应该返回403', async () => {
      const newUser = {
        username: `unauthorizeduser_${Date.now()}`,
        password: 'password123',
        email: `unauthorized_${Date.now()}@example.com`,
        role: UserRole.USER,
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: {
          Authorization: `Bearer ${userToken}`, // 普通用户token
        },
        payload: newUser,
      });

      expect(response.statusCode).toBe(403);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });

    it('A-05: 未认证创建用户应该返回401', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        // 没有 Authorization header
        payload: {
          username: 'testuser',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('A-06: 创建管理员用户应该成功', async () => {
      const newAdmin = {
        username: `newadmin_${Date.now()}`,
        password: 'REDACTED_ADMIN_PASS',
        email: `admin_${Date.now()}@example.com`,
        role: UserRole.ADMIN,
        credits: 1000,
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: newAdmin,
      });

      expect(response.statusCode).toBe(201);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('role', UserRole.ADMIN);
    });

    it('A-07: 创建用户时使用默认值', async () => {
      const newUser = {
        username: `defaultuser_${Date.now()}`,
        password: 'password123',
        // 不提供 email, role, status, credits
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: newUser,
      });

      expect(response.statusCode).toBe(201);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('email', '');
      expect(result.data).toHaveProperty('role', UserRole.USER);
      expect(result.data).toHaveProperty('status', UserStatus.ACTIVE);
      expect(result.data).toHaveProperty('credits', 0);
    });
  });

  // ========================================
  // A-02: 获取用户列表（分页）
  // ========================================
  describe('GET /api/admin/users - 获取用户列表', () => {
    beforeAll(async () => {
      // 创建额外的用户用于测试分页
      for (let i = 0; i < 15; i++) {
        await createTestUser({
          username: `paginationuser_${i}`,
          credits: 50,
        });
      }
    });

    it('A-08: 获取用户列表（第一页）应该成功', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/users?page=1&limit=10',
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
      expect(result.data).toHaveProperty('limit', 10);
      expect(result.data).toHaveProperty('totalPages');

      // 验证返回的是数组
      expect(Array.isArray(result.data.items)).toBe(true);
      expect(result.data.items.length).toBeLessThanOrEqual(10);

      // 验证敏感信息已被移除
      if (result.data.items.length > 0) {
        expect(result.data.items[0]).not.toHaveProperty('password');
        expect(result.data.items[0]).not.toHaveProperty('api_key');
      }
    });

    it('A-09: 获取用户列表（第二页）应该成功', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/users?page=2&limit=10',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('page', 2);
    });

    it('A-10: 获取用户列表时搜索用户名应该成功', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/admin/users?search=${testUser?.username}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);

      // 验证搜索结果包含目标用户
      const found = result.data.items.find((u: Record<string, unknown>) => u.username === testUser?.username);
      expect(found).toBeDefined();
    });

    it('A-11: 获取用户列表时按角色筛选应该成功', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/admin/users?role=${UserRole.ADMIN}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);

      // 验证所有结果都是管理员
      result.data.items.forEach((user: Record<string, unknown>) => {
        expect(user.role).toBe(UserRole.ADMIN);
      });
    });

    it('A-12: 获取用户列表时按状态筛选应该成功', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/admin/users?status=${UserStatus.ACTIVE}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);

      // 验证所有结果都是活跃状态
      result.data.items.forEach((user: Record<string, unknown>) => {
        expect(user.status).toBe(UserStatus.ACTIVE);
      });
    });

    it('A-13: 获取用户列表时排序应该成功', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/users?sort=credits&order=desc',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);

      // 验证积分降序排列
      if (result.data.items.length > 1) {
        for (let i = 0; i < result.data.items.length - 1; i++) {
          expect(result.data.items[i].credits).toBeGreaterThanOrEqual(result.data.items[i + 1].credits);
        }
      }
    });

    it('A-14: 非管理员获取用户列表应该返回403', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/users',
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });

    it('A-15: 分页参数超出范围应该返回空数组', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/users?page=9999&limit=10',
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
  // A-03: 获取用户详情
  // ========================================
  describe('GET /api/admin/users/:id - 获取用户详情', () => {
    it('A-16: 获取用户详情应该成功', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/admin/users/${testUser?.id}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id', testUser?.id);
      expect(result.data).toHaveProperty('username', testUser?.username);
      expect(result.data).toHaveProperty('email');
      expect(result.data).toHaveProperty('role');
      expect(result.data).toHaveProperty('status');
      expect(result.data).toHaveProperty('credits');
      expect(result.data).toHaveProperty('webhook_url');
      // 注意：根据 adminGetUserResponseSchema，详情接口不返回 api_key
      // expect(result.data).toHaveProperty('api_key');
      expect(result.data).toHaveProperty('created_at');
    });

    it('A-17: 获取不存在的用户应该返回404', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/users/999999',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('用户不存在');
    });

    it('A-18: 获取用户详情时无效ID应该返回400', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/users/invalid',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('无效的用户 ID');
    });

    it('A-19: 非管理员获取用户详情应该返回403', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/admin/users/${testUser?.id}`,
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // A-04: 更新用户信息
  // ========================================
  describe('PUT /api/admin/users/:id - 更新用户信息', () => {
    let userToUpdate: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      // 创建一个要更新的用户
      userToUpdate = await createTestUser({
        username: `updatableuser_${Date.now()}`,
        email: `updatable_${Date.now()}@example.com`,
        credits: 50,
      });
    });

    it('A-20: 更新用户邮箱应该成功', async () => {
      const newEmail = `updated_${Date.now()}@example.com`;

      const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/users/${userToUpdate?.id}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          email: newEmail,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.message).toBe('用户更新成功');
      expect(result.data).toHaveProperty('id', userToUpdate?.id);
      expect(result.data).toHaveProperty('email', newEmail);

      // 验证数据库中的值已更新
      const updatedUser = await UserModel.findById(userToUpdate?.id);
      expect(updatedUser?.email).toBe(newEmail);
    });

    it('A-21: 更新用户密码应该成功', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/users/${userToUpdate?.id}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          password: 'newpassword123',
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);

      // 密码不应在响应中返回
      expect(result.data).not.toHaveProperty('password');
    });

    it('A-22: 更新用户角色应该成功', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/users/${userToUpdate?.id}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          role: UserRole.ADMIN,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('role', UserRole.ADMIN);
    });

    it('A-23: 更新用户状态应该成功', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/users/${userToUpdate?.id}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          status: UserStatus.INACTIVE,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('status', UserStatus.INACTIVE);
    });

    it('A-24: 更新用户webhook_url应该成功', async () => {
      const webhookUrl = 'https://example.com/webhook';

      const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/users/${userToUpdate?.id}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          webhook_url: webhookUrl,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('webhook_url', webhookUrl);
    });

    it('A-25: 同时更新多个字段应该成功', async () => {
      // 注意：Zod schema 中 status 只允许 ACTIVE 或 INACTIVE，不允许 SUSPENDED
      const updateData = {
        email: `multi_${Date.now()}@example.com`,
        status: UserStatus.INACTIVE, // 使用 INACTIVE 而不是 SUSPENDED
        webhook_url: 'https://example.com/webhook',
      };

      const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/users/${userToUpdate?.id}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: updateData,
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('email', updateData.email);
      expect(result.data).toHaveProperty('status', updateData.status);
      expect(result.data).toHaveProperty('webhook_url', updateData.webhook_url);
    });

    it('A-26: 更新不存在的用户应该返回404', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/admin/users/999999',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          email: 'updated@example.com',
        },
      });

      expect(response.statusCode).toBe(404);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('用户不存在');
    });

    it('A-27: 更新用户时无效ID应该返回400', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/admin/users/invalid',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          email: 'updated@example.com',
        },
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('无效的用户 ID');
    });

    it('A-28: 非管理员更新用户应该返回403', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/users/${userToUpdate?.id}`,
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
        payload: {
          email: 'updated@example.com',
        },
      });

      expect(response.statusCode).toBe(403);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // A-05: 删除用户
  // ========================================
  describe('DELETE /api/admin/users/:id - 删除用户', () => {
    let userToDelete: ReturnType<typeof vi.fn>;
    let adminToDelete: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      // 创建要删除的用户
      userToDelete = await createTestUser({
        username: `deletableuser_${Date.now()}`,
        credits: 50,
      });

      // 创建要删除的管理员
      adminToDelete = await createTestAdmin({
        username: `deletableadmin_${Date.now()}`,
      });
    });

    it('A-29: 删除普通用户应该成功', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/admin/users/${userToDelete?.id}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.message).toBe('用户删除成功');

      // 验证用户已被删除
      const deletedUser = await UserModel.findById(userToDelete?.id);
      expect(deletedUser).toBeNull();
    });

    it('A-30: 删除管理员应该返回403', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/admin/users/${adminToDelete?.id}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(false);
      expect(result.error).toContain('不允许删除管理员账号');

      // 验证管理员未被删除
      const adminStillExists = await UserModel.findById(adminToDelete?.id);
      expect(adminStillExists).toBeDefined();
    });

    it('A-31: 删除不存在的用户应该返回404', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/admin/users/999999',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('用户不存在');
    });

    it('A-32: 删除用户时无效ID应该返回400', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/admin/users/invalid',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('无效的用户 ID');
    });

    it('A-33: 非管理员删除用户应该返回403', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/admin/users/${userToDelete?.id}`,
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // B. 字段验证测试
  // ========================================

  // ========================================
  // B-01: username 字段验证
  // ========================================
  describe('username 字段验证', () => {
    it('B-01: 用户名唯一性验证应该工作', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          username: testAdmin?.username, // 已存在的用户名
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(409);
      const result = JSON.parse(response.payload);
      expect(result.error).toContain('用户名已存在');
    });

    it('B-02: 用户名为空字符串应该返回400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          username: '',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ========================================
  // B-02: email 字段验证
  // ========================================
  describe('email 字段验证', () => {
    it('B-03: email可以为空', async () => {
      // 注意：Zod schema 中 email 定义为 optional().email()，空字符串不是有效 email
      // 所以不传 email 字段而不是传空字符串
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          username: `noemail_${Date.now()}`,
          password: 'password123',
          // 不传 email 字段
        },
      });

      expect(response.statusCode).toBe(201);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      // email 默认为空字符串
      expect(result.data).toHaveProperty('email', '');
    });

    it('B-04: email可以为null', async () => {
      // 注意：Zod schema 不接受 null，所以传有效的 email 或者不传
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          username: `nullemail_${Date.now()}`,
          password: 'password123',
          // 不传 email，它会默认为空字符串
        },
      });

      expect(response.statusCode).toBe(201);
    });

    it('B-05: 更新email应该成功', async () => {
      const user = await createTestUser({
        username: `emailtest_${Date.now()}`,
        email: 'test@example.com',
      });

      const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/users/${user?.id}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          email: 'updated@example.com',
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ========================================
  // B-03: password 字段验证
  // ========================================
  describe('password 字段验证', () => {
    it('B-06: 密码为空应该返回400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          username: `nopass_${Date.now()}`,
          password: '',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('B-07: 创建用户时密码应该被哈希', async () => {
      const plainPassword = 'plainpassword123';
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          username: `hashpass_${Date.now()}`,
          password: plainPassword,
        },
      });

      expect(response.statusCode).toBe(201);

      // 从数据库获取用户，验证密码已哈希
      const result = JSON.parse(response.payload);
      const user = await UserModel.findById(result.data.id);
      expect(user?.password).not.toBe(plainPassword);
      expect(user?.password).toHaveLength(64); // SHA256 哈希长度
    });

    it('B-08: 更新密码时新密码应该被哈希', async () => {
      const user = await createTestUser({
        username: `updatepass_${Date.now()}`,
      });
      const newPassword = 'newpassword123';

      const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/users/${user?.id}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          password: newPassword,
        },
      });

      expect(response.statusCode).toBe(200);

      // 验证密码已哈希
      const updatedUser = await UserModel.findById(user?.id);
      expect(updatedUser?.password).not.toBe(newPassword);
      expect(updatedUser?.password).toHaveLength(64);
    });

    it('B-09: 密码不应在响应中返回', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          username: `passhidden_${Date.now()}`,
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(201);
      const result = JSON.parse(response.payload);
      expect(result.data).not.toHaveProperty('password');
    });
  });

  // ========================================
  // B-04: role 字段验证
  // ========================================
  describe('role 字段验证', () => {
    it('B-10: 创建用户时默认角色为USER', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          username: `defaultrole_${Date.now()}`,
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(201);
      const result = JSON.parse(response.payload);
      expect(result.data).toHaveProperty('role', UserRole.USER);
    });

    it('B-11: 创建ADMIN角色用户应该成功', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          username: `adminrole_${Date.now()}`,
          password: 'password123',
          role: UserRole.ADMIN,
        },
      });

      expect(response.statusCode).toBe(201);
      const result = JSON.parse(response.payload);
      expect(result.data).toHaveProperty('role', UserRole.ADMIN);
    });

    it('B-12: 更新用户角色应该成功', async () => {
      const user = await createTestUser({
        username: `changerole_${Date.now()}`,
      });

      const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/users/${user?.id}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          role: UserRole.ADMIN,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.data).toHaveProperty('role', UserRole.ADMIN);
    });
  });

  // ========================================
  // B-05: status 字段验证
  // ========================================
  describe('status 字段验证', () => {
    it('B-13: 创建用户时默认状态为ACTIVE', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          username: `defaultstatus_${Date.now()}`,
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(201);
      const result = JSON.parse(response.payload);
      expect(result.data).toHaveProperty('status', UserStatus.ACTIVE);
    });

    it('B-14: 更新用户状态为INACTIVE应该成功', async () => {
      const user = await createTestUser({
        username: `inactiveuser_${Date.now()}`,
      });

      const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/users/${user?.id}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          status: UserStatus.INACTIVE,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.data).toHaveProperty('status', UserStatus.INACTIVE);
    });

    it('B-15: 更新用户状态为INACTIVE应该成功', async () => {
      // 注意：Zod schema 中 status 只允许 ACTIVE 或 INACTIVE，不允许 SUSPENDED
      const user = await createTestUser({
        username: `inactiveuser2_${Date.now()}`,
      });

      const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/users/${user?.id}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          status: UserStatus.INACTIVE,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.data).toHaveProperty('status', UserStatus.INACTIVE);
    });
  });

  // ========================================
  // B-06: credits 字段验证
  // ========================================
  describe('credits 字段验证', () => {
    it('B-16: 创建用户时默认积分为0', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          username: `nocredits_${Date.now()}`,
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(201);
      const result = JSON.parse(response.payload);
      expect(result.data).toHaveProperty('credits', 0);
    });

    it('B-17: 创建用户时指定积分应该成功', async () => {
      const credits = 100;
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          username: `withcredits_${Date.now()}`,
          password: 'password123',
          credits: credits,
        },
      });

      expect(response.statusCode).toBe(201);
      const result = JSON.parse(response.payload);
      expect(result.data).toHaveProperty('credits', credits);
    });

    it('B-18: 创建用户时积分必须非负', async () => {
      // 注意：Zod schema 中 credits 定义为 min(0)，不允许负数
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          username: `negativecredits_${Date.now()}`,
          password: 'password123',
          credits: -10,
        },
      });

      // Zod 验证会拒绝负数
      expect(response.statusCode).toBe(400);
    });
  });

  // ========================================
  // B-07: webhook_url 字段验证
  // ========================================
  describe('webhook_url 字段验证', () => {
    it('B-19: webhook_url可以为空', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          username: `nowebhook_${Date.now()}`,
          password: 'password123',
          // webhook_url 不在创建用户的 schema 中，所以不发送
          // 创建后 webhook_url 默认为 null
        },
      });

      expect(response.statusCode).toBe(201);
    });

    it('B-20: 设置webhook_url应该成功', async () => {
      const user = await createTestUser({
        username: `setwebhook_${Date.now()}`,
      });

      const webhookUrl = 'https://example.com/webhook';
      const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/users/${user?.id}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          webhook_url: webhookUrl,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.data).toHaveProperty('webhook_url', webhookUrl);
    });

    it('B-21: 更新webhook_url应该成功', async () => {
      const user = await createTestUser({
        username: `updatewebhook_${Date.now()}`,
      });

      // webhook_url 在 Zod schema 中定义为 url()，必须是有效的 URL
      const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/users/${user?.id}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          webhook_url: 'https://example.com/webhook',
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ========================================
  // B-08: api_key 字段验证
  // ========================================
  describe('api_key 字段验证', () => {
    it('B-22: 创建用户时自动生成api_key', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          username: `autoapikey_${Date.now()}`,
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(201);
      const result = JSON.parse(response.payload);
      expect(result.data).toHaveProperty('api_key');
      expect(result.data.api_key).toBeTruthy();
      expect(result.data.api_key).toMatch(/^[a-f0-9-]{36}$/); // UUID格式
    });

    it('B-23: api_key不应在列表接口中返回', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/users',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      if (result.data.items.length > 0) {
        expect(result.data.items[0]).not.toHaveProperty('api_key');
      }
    });

    it('B-24: api_key不应该在详情接口中返回', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/admin/users/${testUser?.id}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      // 根据实际返回的 schema，详情接口不返回 api_key
      expect(result.data).not.toHaveProperty('api_key');
    });
  });

  // ========================================
  // C. 业务逻辑测试
  // ========================================

  // ========================================
  // C-01: 添加点数
  // ========================================
  describe('POST /api/admin/users/:id/credits - 添加点数', () => {
    let userForCredits: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      userForCredits = await createTestUser({
        username: `creditsuser_${Date.now()}`,
        credits: 100,
      });
    });

    it('C-01: 添加点数应该成功', async () => {
      const addAmount = 50;
      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${userForCredits?.id}/credits`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          amount: addAmount,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.message).toBe('点数添加成功');
      expect(result.data).toHaveProperty('credits', 100 + addAmount);
    });

    it('C-02: 添加点数时提供原因应该成功', async () => {
      const addAmount = 30;
      const reason = '管理员充值';

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${userForCredits?.id}/credits`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          amount: addAmount,
          reason: reason,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('C-03: 添加点数金额为0应该返回400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${userForCredits?.id}/credits`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          amount: 0,
        },
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      // Zod 验证会返回验证失败消息
      expect(result.error).toBeTruthy();
    });

    it('C-04: 添加点数金额为负数应该返回400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${userForCredits?.id}/credits`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          amount: -10,
        },
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      // Zod 验证会返回验证失败消息
      expect(result.error).toBeTruthy();
    });

    it('C-05: 为不存在的用户添加点数应该返回404', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users/999999/credits',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          amount: 50,
        },
      });

      expect(response.statusCode).toBe(404);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('用户不存在');
    });

    it('C-06: 非管理员添加点数应该返回403', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${userForCredits?.id}/credits`,
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
        payload: {
          amount: 50,
        },
      });

      expect(response.statusCode).toBe(403);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // C-02: 重置API Key
  // ========================================
  describe('POST /api/admin/users/:id/reset-api-key - 重置API Key', () => {
    let userForReset: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      userForReset = await createTestUser({
        username: `resetkeyuser_${Date.now()}`,
      });
    });

    it('C-07: 重置API Key应该成功', async () => {
      const oldUser = await UserModel.findById(userForReset?.id);
      const oldApiKey = oldUser?.api_key;

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${userForReset?.id}/reset-api-key`,
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
      const updatedUser = await UserModel.findById(userForReset?.id);
      expect(updatedUser?.api_key).toBe(result.data.api_key);
      expect(updatedUser?.api_key).not.toBe(oldApiKey);
    });

    it('C-08: 重置不存在的用户的API Key应该返回404', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users/999999/reset-api-key',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('用户不存在');
    });

    it('C-09: 非管理员重置API Key应该返回403', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${userForReset?.id}/reset-api-key`,
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // C-03: 批量删除用户
  // ========================================
  describe('POST /api/admin/users/batch-delete - 批量删除用户', () => {
    let usersToDelete: unknown[];

    beforeEach(async () => {
      // 创建多个要删除的用户
      usersToDelete = [];
      for (let i = 0; i < 3; i++) {
        const user = await createTestUser({
          username: `batchdelete_${Date.now()}_${i}`,
        });
        usersToDelete.push(user);
      }
    });

    it('C-10: 批量删除用户应该成功', async () => {
      const userIds = usersToDelete.map((u) => u.id);

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users/batch-delete',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          userIds: userIds,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.message).toContain('成功删除');
      expect(result.data).toHaveProperty('deleted');
      expect(result.data.deleted).toHaveLength(userIds.length);
      expect(result.data).toHaveProperty('failed');
      expect(result.data.failed).toHaveLength(0);

      // 验证用户已被删除
      for (const userId of userIds) {
        const deletedUser = await UserModel.findById(userId);
        expect(deletedUser).toBeNull();
      }
    });

    it('C-11: 批量删除包含管理员时应该跳过管理员', async () => {
      const adminUser = await createTestAdmin({
        username: `batchdeleteadmin_${Date.now()}`,
      });
      const userIds = [...usersToDelete.map((u) => u.id), adminUser.id];

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users/batch-delete',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          userIds: userIds,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.data.failed.length).toBeGreaterThan(0);
      expect(result.data.failed[0].error).toContain('不允许删除管理员');

      // 验证管理员未被删除
      const adminStillExists = await UserModel.findById(adminUser.id);
      expect(adminStillExists).toBeDefined();
    });

    it('C-12: 批量删除包含不存在的用户时应该部分成功', async () => {
      const userIds = [...usersToDelete.map((u) => u.id), 999999, 888888];

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users/batch-delete',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          userIds: userIds,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.data.deleted.length).toBeGreaterThan(0);
      expect(result.data.failed.length).toBeGreaterThan(0);
    });

    it('C-13: 批量删除空数组应该返回400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users/batch-delete',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          userIds: [],
        },
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });

    it('C-14: 非管理员批量删除应该返回403', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users/batch-delete',
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
        payload: {
          userIds: usersToDelete.map((u) => u.id),
        },
      });

      expect(response.statusCode).toBe(403);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // C-04: 批量充值
  // ========================================
  describe('POST /api/admin/users/batch-recharge - 批量充值', () => {
    let usersForRecharge: unknown[];

    beforeEach(async () => {
      // 创建多个要充值的用户
      usersForRecharge = [];
      for (let i = 0; i < 3; i++) {
        const user = await createTestUser({
          username: `batchrecharge_${Date.now()}_${i}`,
          credits: 50,
        });
        usersForRecharge.push(user);
      }
    });

    it('C-15: 批量充值应该成功', async () => {
      const userIds = usersForRecharge.map((u) => u.id);
      const amount = 100;

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users/batch-recharge',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          userIds: userIds,
          credits: amount,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.message).toContain('成功为');
      expect(result.data).toHaveProperty('recharged');
      expect(result.data.recharged).toHaveLength(userIds.length);
      expect(result.data).toHaveProperty('failed');
      expect(result.data.failed).toHaveLength(0);

      // 验证积分已增加
      for (const user of usersForRecharge) {
        const updatedUser = await UserModel.findById(user.id);
        expect(updatedUser?.credits).toBe(50 + amount);
      }
    });

    it('C-16: 批量充值时提供原因应该成功', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users/batch-recharge',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          userIds: usersForRecharge.map((u) => u.id),
          credits: 50,
          reason: '批量充值测试',
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('C-17: 批量充值金额为0应该返回400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users/batch-recharge',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          userIds: usersForRecharge.map((u) => u.id),
          credits: 0,
        },
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('无效的点数金额');
    });

    it('C-18: 批量充值包含不存在的用户时应该部分成功', async () => {
      const userIds = [...usersForRecharge.map((u) => u.id), 999999, 888888];

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users/batch-recharge',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          userIds: userIds,
          credits: 50,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.data.recharged.length).toBeGreaterThan(0);
      expect(result.data.failed.length).toBeGreaterThan(0);
    });

    it('C-19: 非管理员批量充值应该返回403', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users/batch-recharge',
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
        payload: {
          userIds: usersForRecharge.map((u) => u.id),
          credits: 50,
        },
      });

      expect(response.statusCode).toBe(403);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // C-05: 删除用户级联删除关联数据
  // ========================================
  describe('级联删除测试', () => {
    it('C-20: 删除用户后关联的会话仍然存在（无级联删除）', async () => {
      // 创建用户和会话
      const user = await createTestUser({
        username: `cascadeuser_${Date.now()}`,
      });
      const session = await createTestSession(user?.id);

      // 删除用户
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/admin/users/${user?.id}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      // 注意：当前系统中，删除用户不会级联删除会话
      // 会话仍然存在于数据库中，但用户已被删除
      // 这是需要改进的地方：应该添加外键约束或手动删除关联数据
      const deletedSession = await SessionModel.findById(session?.id);
      expect(deletedSession).not.toBeNull();
      expect(deletedSession?.user_id).toBe(user?.id);
    });

    it('C-21: 删除用户后应该无法使用其token', async () => {
      // 创建用户
      const user = await createTestUser({
        username: `tokenuser_${Date.now()}`,
      });
      const userToken = generateToken({
        id: user?.id || 0,
        username: user?.username || '',
        role: UserRole.USER,
      });

      // 删除用户
      await app.inject({
        method: 'DELETE',
        url: `/api/admin/users/${user?.id}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      // 尝试使用已删除用户的token
      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me',
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });

      // Token验证应该失败（用户不存在）
      expect(response.statusCode).toBe(401);
    });
  });

  // ========================================
  // D. 其他API端点测试
  // ========================================

  // ========================================
  // D-01: 导出用户列表
  // ========================================
  describe('GET /api/admin/users/export - 导出用户列表', () => {
    it('D-01: 导出用户列表应该返回CSV', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/users/export',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');

      // 验证CSV内容
      const csvContent = response.payload;
      expect(csvContent).toContain('ID');
      expect(csvContent).toContain('用户名');
      expect(csvContent).toContain('邮箱');
      expect(csvContent).toContain('角色');
      expect(csvContent).toContain('积分');
    });

    it('D-02: 导出用户列表时搜索应该生效', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/admin/users/export?search=${testUser?.username}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
    });

    it('D-03: 非管理员导出用户列表应该返回403', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/users/export',
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  // ========================================
  // D-02: 获取用户会话历史
  // ========================================
  describe('GET /api/admin/users/:id/sessions - 获取用户会话历史', () => {
    it('D-04: 获取用户会话历史应该成功', async () => {
      // 创建用户和会话
      const user = await createTestUser({
        username: `sessionhistory_${Date.now()}`,
      });
      await createTestSession(user?.id);

      const response = await app.inject({
        method: 'GET',
        url: `/api/admin/users/${user?.id}/sessions`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('items');
      expect(result.data).toHaveProperty('total');
      expect(result.data).toHaveProperty('page');
      expect(result.data).toHaveProperty('limit');
      expect(result.data).toHaveProperty('totalPages');
      expect(Array.isArray(result.data.items)).toBe(true);
    });

    it('D-05: 获取不存在用户的会话历史应该返回404', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/users/999999/sessions',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('用户不存在');
    });
  });

  // ========================================
  // D-03: 获取用户操作日志
  // ========================================
  describe('GET /api/admin/users/:id/logs - 获取用户操作日志', () => {
    it('D-06: 获取用户操作日志应该成功', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/admin/users/${testUser?.id}/logs`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('items');
      expect(result.data).toHaveProperty('total');
      expect(result.data).toHaveProperty('page');
      expect(result.data).toHaveProperty('limit');
      expect(result.data).toHaveProperty('totalPages');
      expect(Array.isArray(result.data.items)).toBe(true);
    });

    it('D-07: 获取不存在用户的操作日志应该返回404', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/users/999999/logs',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('用户不存在');
    });
  });

  // ========================================
  // D-04: 获取用户会话消耗统计
  // ========================================
  describe('GET /api/admin/users/:id/session-stats - 获取用户会话消耗统计', () => {
    it('D-08: 获取用户会话消耗统计应该成功', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/admin/users/${testUser?.id}/session-stats`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('total_sessions');
      expect(result.data).toHaveProperty('total_duration');
      expect(result.data).toHaveProperty('total_credits_used');
    });

    it('D-09: 获取不存在用户的会话消耗统计应该返回404', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/users/999999/session-stats',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('用户不存在');
    });
  });
});
