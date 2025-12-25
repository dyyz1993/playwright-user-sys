import { FastifyInstance } from 'fastify';
import { build } from '../helpers/app.js';
import { UserModel } from '../../models/user.model.js';
import { generateToken, hashPassword } from '../../utils/auth.js';
import { UserRole, UserStatus } from '@shared/types/index.js';

describe('管理员权限验证测试', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let userToken: string;
  let testUserId: number;

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

  // 测试管理员API接口权限
  describe('管理员API接口权限测试', () => {
    // 测试用户管理接口
    describe('用户管理接口', () => {
      test('管理员可以访问创建用户接口', async () => {
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
      });

      test('普通用户无法访问创建用户接口', async () => {
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

      test('管理员可以访问获取用户接口', async () => {
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
      });

      test('普通用户无法访问获取用户接口', async () => {
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
    });

    // 测试会话管理接口
    describe('会话管理接口', () => {
      test('管理员可以访问获取所有会话接口', async () => {
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
      });

      test('普通用户无法访问获取所有会话接口', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/sessions/admin/all',
          headers: {
            Authorization: `Bearer ${userToken}`,
          },
        });

        expect(response.statusCode).toBe(403);
        const result = JSON.parse(response.payload);
        expect(result.success).toBe(false);
      });
    });

    // 测试机器管理接口
    describe('机器管理接口', () => {
      test('管理员可以访问获取所有机器接口', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/machines/',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const result = JSON.parse(response.payload);
        expect(result.success).toBe(true);
      });

      test('普通用户无法访问获取所有机器接口', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/machines/',
          headers: {
            Authorization: `Bearer ${userToken}`,
          },
        });

        expect(response.statusCode).toBe(403);
        const result = JSON.parse(response.payload);
        expect(result.success).toBe(false);
      });
    });

    // 测试仪表盘统计接口
    describe('仪表盘统计接口', () => {
      test('管理员可以访问仪表盘统计接口', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/admin/dashboard/stats',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const result = JSON.parse(response.payload);
        expect(result.success).toBe(true);
      });

      test('普通用户无法访问仪表盘统计接口', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/admin/dashboard/stats',
          headers: {
            Authorization: `Bearer ${userToken}`,
          },
        });

        expect(response.statusCode).toBe(403);
        const result = JSON.parse(response.payload);
        expect(result.success).toBe(false);
      });
    });
  });
});
