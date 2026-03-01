import { describe, beforeAll, afterAll, test, expect } from 'vitest';
import { FastifyInstance } from 'fastify';
import { build } from '../helpers/app.js';
import { clearAllTables } from '../helpers/database.js';
import { UserModel } from '../../models/user.model.js';
import { generateToken, hashPassword } from '../../utils/auth.js';
import { UserRole, UserStatus } from '@shared/types/index.js';

describe('管理员仪表盘统计功能测试', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
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

    // 创建测试普通用户
    const regularUser = await UserModel.create({
      username: 'testuser',
      password: await hashPassword('password123'),
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      credits: 100,
    });

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

  // 测试仪表盘统计功能
  describe('GET /api/admin/dashboard/stats', () => {
    test('管理员可以获取仪表盘统计数据', async () => {
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
      expect(result.data).toHaveProperty('totalUsers');
      expect(result.data).toHaveProperty('activeUsers');
      expect(result.data).toHaveProperty('totalMachines');
      expect(result.data).toHaveProperty('onlineMachines');
      expect(result.data).toHaveProperty('totalSessions');
      expect(result.data).toHaveProperty('activeSessions');
      expect(result.data).toHaveProperty('totalCredits');
      expect(result.data).toHaveProperty('usedCredits');

      // 验证数据类型
      expect(typeof result.data.totalUsers).toBe('number');
      expect(typeof result.data.activeUsers).toBe('number');
      expect(typeof result.data.totalMachines).toBe('number');
      expect(typeof result.data.onlineMachines).toBe('number');
      expect(typeof result.data.totalSessions).toBe('number');
      expect(typeof result.data.activeSessions).toBe('number');
      expect(typeof result.data.totalCredits).toBe('number');
      expect(typeof result.data.usedCredits).toBe('number');
    });

    test('普通用户无法获取仪表盘统计数据', async () => {
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

    test('未授权访问应该失败', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/dashboard/stats',
      });

      expect(response.statusCode).toBe(401);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });
  });
});
