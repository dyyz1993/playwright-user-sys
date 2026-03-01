import { FastifyInstance } from 'fastify';
import { build } from '../helpers/app.js';
import { UserModel } from '../../models/user.model.js';
import { OperationLogModel } from '../../models/operation-log.model.js';
import { generateToken, hashPassword } from '../../utils/auth.js';
import { UserRole, UserStatus } from '@shared/types/index.js';

describe('管理员用户管理功能测试', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let userToken: string;
  let testUserId: number;
  let adminId: number;

  // 在所有测试之前设置应用和创建测试用户
  beforeAll(async () => {
    // 构建应用实例
    app = await build();

    // 创建测试管理员用户
    const adminUser = await UserModel.create({
      username: 'testadmin',
      password: await hashPassword('password123'),
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      credits: 1000,
    });

    adminId = adminUser?.id || 0;

    // 创建测试普通用户
    const regularUser = await UserModel.create({
      username: 'testuser',
      password: await hashPassword('password123'),
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      credits: 100,
    });

    // 保存测试用户ID
    testUserId = regularUser?.id || 0;

    // 生成JWT令牌
    adminToken = generateToken({
      id: adminUser?.id || 0,
      username: adminUser?.username || '',
      role: (adminUser?.role as UserRole) || UserRole.ADMIN,
    });

    userToken = generateToken({
      id: regularUser?.id || 0,
      username: regularUser?.username || '',
      role: (regularUser?.role as UserRole) || UserRole.USER,
    });
  });

  // 在所有测试之后关闭应用
  afterAll(async () => {
    await app.close();
  });

  // 测试创建用户功能
  describe('POST /api/admin/users', () => {
    test('管理员可以成功创建新用户', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          username: 'newuser',
          password: 'password123',
          email: 'newuser@example.com',
          role: 'user',
          credits: 50,
        },
      });

      expect(response.statusCode).toBe(201);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.message).toBe('用户创建成功');
      expect(result.data).toHaveProperty('username', 'newuser');
      expect(result.data).toHaveProperty('email', 'newuser@example.com');
      expect(result.data).toHaveProperty('role', 'user');
      expect(result.data).toHaveProperty('credits', 50);
      expect(result.data).toHaveProperty('api_key');
    });

    test('普通用户无法创建新用户', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
        payload: {
          username: 'newuser2',
          password: 'password123',
          email: 'newuser2@example.com',
          role: 'user',
          credits: 50,
        },
      });

      expect(response.statusCode).toBe(403);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });

    test('创建用户时用户名已存在应该失败', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          username: 'testuser', // 已存在的用户名
          password: 'password123',
          email: 'testuser2@example.com',
          role: 'user',
          credits: 50,
        },
      });

      expect(response.statusCode).toBe(409);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.message).toBe('用户名已存在');
    });
  });

  // 测试获取用户功能
  describe('GET /api/admin/users/:id', () => {
    test('管理员可以获取用户信息', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/admin/users/${testUserId}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id', testUserId);
      expect(result.data).toHaveProperty('username', 'testuser');
      expect(result.data).toHaveProperty('role', 'user');
    });

    test('普通用户无法获取用户信息', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/admin/users/${testUserId}`,
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });

    test('获取不存在的用户应该失败', async () => {
      const nonExistentUserId = 99999;

      const response = await app.inject({
        method: 'GET',
        url: `/api/admin/users/${nonExistentUserId}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.message).toBe('用户不存在');
    });
  });

  // 测试更新用户功能
  describe('PUT /api/admin/users/:id', () => {
    test('管理员可以更新用户信息', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/users/${testUserId}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          email: 'updated@example.com',
          status: 'active',
          webhook_url: 'https://webhook.example.com/callback',
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.message).toBe('用户更新成功');
      expect(result.data).toHaveProperty('id', testUserId);
      expect(result.data).toHaveProperty('email', 'updated@example.com');
      expect(result.data).toHaveProperty('webhook_url', 'https://webhook.example.com/callback');
    });

    test('普通用户无法更新用户信息', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/users/${testUserId}`,
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
        payload: {
          email: 'hacked@example.com',
        },
      });

      expect(response.statusCode).toBe(403);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });

    test('更新不存在的用户应该失败', async () => {
      const nonExistentUserId = 99999;

      const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/users/${nonExistentUserId}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          email: 'nonexistent@example.com',
        },
      });

      expect(response.statusCode).toBe(404);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.message).toBe('用户不存在');
    });
  });

  // 测试删除用户功能
  describe('DELETE /api/admin/users/:id', () => {
    let userToDeleteId: number;

    beforeAll(async () => {
      // 创建一个用于删除的测试用户
      const userToDelete = await UserModel.create({
        username: 'userToDelete',
        password: await hashPassword('password123'),
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        credits: 100,
      });

      userToDeleteId = userToDelete?.id || 0;
    });

    test('管理员可以删除用户', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/admin/users/${userToDeleteId}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.message).toBe('用户删除成功');

      // 验证用户已被删除
      const deletedUser = await UserModel.findById(userToDeleteId);
      expect(deletedUser).toBeNull();
    });

    test('普通用户无法删除用户', async () => {
      // 创建另一个用于测试的用户
      const anotherUser = await UserModel.create({
        username: 'anotherUser',
        password: await hashPassword('password123'),
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        credits: 100,
      });

      const anotherUserId = anotherUser?.id || 0;

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/admin/users/${anotherUserId}`,
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);

      // 验证用户未被删除
      const notDeletedUser = await UserModel.findById(anotherUserId);
      expect(notDeletedUser).not.toBeNull();
    });

    test('删除不存在的用户应该失败', async () => {
      const nonExistentUserId = 99999;

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/admin/users/${nonExistentUserId}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.message).toBe('用户不存在');
    });

    test('不允许删除管理员账号', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/admin/users/${adminId}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.message).toBe('不允许删除管理员账号');

      // 验证管理员用户未被删除
      const adminUser = await UserModel.findById(adminId);
      expect(adminUser).not.toBeNull();
    });
  });
});
