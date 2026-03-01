import { FastifyInstance } from 'fastify';
import { build } from '../helpers/app.js';
import { UserModel } from '../../models/user.model.js';
import { OperationLogModel } from '../../models/operation-log.model.js';
import { generateToken, hashPassword } from '../../utils/auth.js';
import { UserRole, UserStatus } from '@shared/types/index.js';

describe('管理员添加点数功能测试', () => {
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

  // 测试添加点数功能
  describe('POST /api/admin/users/:id/credits', () => {
    test('管理员可以成功为用户添加点数', async () => {
      // 获取用户初始点数
      const initialUser = await UserModel.findById(testUserId);
      const initialCredits = initialUser?.credits || 0;

      // 发送添加点数请求
      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${testUserId}/credits`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          amount: 50,
          reason: '测试添加点数',
        },
      });

      // 验证响应
      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.message).toBe('点数添加成功');
      expect(result.data).toHaveProperty('id', testUserId);
      expect(result.data).toHaveProperty('username', 'testuser');
      expect(result.data).toHaveProperty('credits', initialCredits + 50);

      // 验证数据库中的点数已更新
      const updatedUser = await UserModel.findById(testUserId);
      expect(updatedUser?.credits).toBe(initialCredits + 50);

      // 验证操作日志已创建
      const logs = await OperationLogModel.findByAdminId(adminId);
      const log = logs.items.find((l: any) => l.action === '添加点数' && l.target_user_id === testUserId);

      expect(log).toBeTruthy();
      if (log) {
        expect(log.details).toHaveProperty('amount', 50);
        expect(log.details).toHaveProperty('reason', '测试添加点数');
      }
    });

    test('普通用户无法为其他用户添加点数', async () => {
      // 获取用户初始点数
      const initialUser = await UserModel.findById(testUserId);
      const initialCredits = initialUser?.credits || 0;

      // 发送添加点数请求（使用普通用户令牌）
      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${testUserId}/credits`,
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
        payload: {
          amount: 50,
          reason: '测试添加点数',
        },
      });

      // 验证响应（应该失败）
      expect(response.statusCode).toBe(403);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();

      // 验证数据库中的点数未更新
      const updatedUser = await UserModel.findById(testUserId);
      expect(updatedUser?.credits).toBe(initialCredits);
    });

    test('添加无效的点数金额应该失败', async () => {
      // 获取用户初始点数
      const initialUser = await UserModel.findById(testUserId);
      const initialCredits = initialUser?.credits || 0;

      // 发送添加点数请求（使用负数点数）
      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${testUserId}/credits`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          amount: -50,
          reason: '测试添加点数',
        },
      });

      // 验证响应（应该失败）
      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('无效的点数金额');

      // 验证数据库中的点数未更新
      const updatedUser = await UserModel.findById(testUserId);
      expect(updatedUser?.credits).toBe(initialCredits);
    });

    test('为不存在的用户添加点数应该失败', async () => {
      const nonExistentUserId = 99999;

      // 发送添加点数请求（使用不存在的用户ID）
      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${nonExistentUserId}/credits`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          amount: 50,
          reason: '测试添加点数',
        },
      });

      // 验证响应（应该失败）
      expect(response.statusCode).toBe(404);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('用户不存在');
    });

    test('未授权访问应该失败', async () => {
      // 获取用户初始点数
      const initialUser = await UserModel.findById(testUserId);
      const initialCredits = initialUser?.credits || 0;

      // 发送添加点数请求（不带令牌）
      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${testUserId}/credits`,
        payload: {
          amount: 50,
          reason: '测试添加点数',
        },
      });

      // 验证响应（应该失败）
      expect(response.statusCode).toBe(401);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);

      // 验证数据库中的点数未更新
      const updatedUser = await UserModel.findById(testUserId);
      expect(updatedUser?.credits).toBe(initialCredits);
    });
  });
});
