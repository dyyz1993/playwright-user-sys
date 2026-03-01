import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { build } from '../helpers/app.js';
import { initDatabase } from '../../config/database.js';
import { clearAllTables } from '../helpers/database.js';
import { UserModel } from '../../models/user.model.js';
import { OperationLogModel } from '../../models/operation-log.model.js';
import { generateToken, hashPassword } from '../../utils/auth.js';
import { UserRole, UserStatus } from '@shared/types/index.js';

describe('管理员API路由测试', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let userToken: string;
  let testUserId: number;
  let adminId: number;

  beforeAll(async () => {
    await initDatabase();
    await clearAllTables();

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

  afterAll(async () => {
    await clearAllTables();
    await app.close();
  });

  // 测试添加点数API
  describe('POST /api/admin/users/:id/credits', () => {
    test('管理员可以成功为用户添加点数', async () => {
      const initialUser = await UserModel.findById(testUserId);
      const initialCredits = initialUser?.credits || 0;

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

      const result = JSON.parse(response.payload);

      // 验证响应状态码和结构
      expect(response.statusCode).toBe(200);
      expect(result.success).toBe(true);
      expect(result.message).toBe('点数添加成功');
      expect(result.data).toHaveProperty('id', testUserId);
      expect(result.data).toHaveProperty('username', 'testuser');
      expect(result.data).toHaveProperty('credits', initialCredits + 50);

      // 验证点数已增加
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
      const initialUser = await UserModel.findById(testUserId);
      const initialCredits = initialUser?.credits || 0;

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

      const result = JSON.parse(response.payload);

      // 验证响应状态码和错误信息
      expect(response.statusCode).toBe(403);
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();

      // 验证点数未增加
      const updatedUser = await UserModel.findById(testUserId);
      expect(updatedUser?.credits).toBe(initialCredits);
    });
  });

  // 注意: 已删除兼容路由的测试
});
