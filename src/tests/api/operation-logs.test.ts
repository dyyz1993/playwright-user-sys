import { describe, beforeAll, afterAll, test, expect, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { build } from '../helpers/app.js';
import { initDatabase } from '../../config/database.js';
import { clearAllTables } from '../helpers/database.js';
import { UserModel } from '../../models/user.model.js';
import { OperationLogModel } from '../../models/operation-log.model.js';
import { generateToken, hashPassword } from '../../utils/auth.js';
import { UserRole, UserStatus } from '@shared/types/index.js';

describe('操作日志功能测试', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let adminId: number;

  beforeAll(async () => {
    await initDatabase();
    await clearAllTables();
    app = await build();

    const adminUsername = `testadmin_logs_${Date.now()}`;
    const adminUser = await UserModel.create({
      username: adminUsername,
      password: await hashPassword('password123'),
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      credits: 1000,
    });

    adminId = adminUser?.id || 0;
    adminToken = generateToken({
      id: adminId,
      username: adminUser?.username || '',
      role: (adminUser?.role as UserRole) || UserRole.ADMIN,
    });
  });

  afterAll(async () => {
    await clearAllTables();
    await app.close();
  });

  describe('操作日志记录', () => {
    test('创建用户时应记录操作日志', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          username: `newuser_log_${Date.now()}`,
          password: 'password123',
          role: 'user',
          credits: 50,
        },
      });

      expect(response.statusCode).toBe(201);

      const logs = await OperationLogModel.findByAdminId(adminId, { limit: '10' });
      const createLog = logs.items.find((log) => log.action === '创建用户');
      expect(createLog).toBeDefined();
      expect(createLog?.details).toHaveProperty('username');
    });

    test('添加点数时应记录操作日志', async () => {
      const user = await UserModel.create({
        username: `user_credits_${Date.now()}`,
        password: await hashPassword('password123'),
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        credits: 100,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${user?.id}/credits`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          amount: 50,
          description: '测试充值',
        },
      });

      expect(response.statusCode).toBe(200);

      // 等待异步日志记录完成
      await new Promise((resolve) => setTimeout(resolve, 100));

      const logs = await OperationLogModel.findByAdminId(adminId, { limit: '20' });
      const creditLog = logs.items.find((log) => log.action === '添加点数');
      expect(creditLog).toBeDefined();
      expect(creditLog?.details).toHaveProperty('amount', 50);
    });

    test('删除用户时应记录操作日志', async () => {
      const user = await UserModel.create({
        username: `user_delete_${Date.now()}`,
        password: await hashPassword('password123'),
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        credits: 100,
      });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/admin/users/${user?.id}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      // 等待异步日志记录完成
      await new Promise((resolve) => setTimeout(resolve, 100));

      const logs = await OperationLogModel.findByAdminId(adminId, { limit: '30' });
      const deleteLog = logs.items.find((log) => log.action === '删除用户');
      expect(deleteLog).toBeDefined();
    });
  });

  describe('操作日志查询', () => {
    test('应能分页查询操作日志', async () => {
      const result = await OperationLogModel.paginate(1, 10);

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page', 1);
      expect(result).toHaveProperty('limit', 10);
      expect(Array.isArray(result.items)).toBe(true);
    });

    test('应能按操作类型筛选', async () => {
      const result = await OperationLogModel.paginate(1, 10, { action: '创建用户' });

      result.items.forEach((log) => {
        expect(log.action).toBe('创建用户');
      });
    });

    test('应能按日期范围筛选', async () => {
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      const result = await OperationLogModel.paginate(1, 10, {
        startDate: startOfMonth,
        endDate: today,
      });

      result.items.forEach((log) => {
        const logDate = new Date(log.created_at);
        expect(logDate >= startOfMonth).toBe(true);
        expect(logDate <= today).toBe(true);
      });
    });

    test('应能获取操作统计', async () => {
      const stats = await OperationLogModel.getStats();

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('byAction');
      expect(typeof stats.total).toBe('number');
      expect(typeof stats.byAction).toBe('object');
    });
  });

  describe('操作日志API', () => {
    test('管理员可以获取操作日志列表', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/operation-logs',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('items');
      expect(result.data).toHaveProperty('total');
    });

    test('管理员可以按操作类型筛选日志', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/operation-logs?action=创建用户',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);

      result.data.items.forEach((log: any) => {
        expect(log.action).toBe('创建用户');
      });
    });

    test('管理员可以获取操作统计', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/operation-logs/stats',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('total');
      expect(result.data).toHaveProperty('byAction');
    });

    test('未授权用户无法获取操作日志', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/operation-logs',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
