/**
 * Dashboard 页面集成测试
 * 测试 /admin 路由（HTML 页面）能正常加载并显示所有必需的数据
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { build } from '../helpers/app.js';
import { clearAllTables } from '../helpers/database.js';
import { UserModel } from '../../models/user.model.js';
import { SessionModel } from '../../models/session.model.js';
import { MachineModel } from '../../models/machine.model.js';
import { generateToken, hashPassword } from '../../utils/auth.js';
import { UserRole, UserStatus, SessionStatus } from '@shared/types/index.js';

describe('Dashboard 页面集成测试', () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeAll(async () => {
    await clearAllTables();

    app = await build();

    // 创建测试管理员用户
    const adminUser = await UserModel.create({
      username: 'testadmin_dashboard',
      password: await hashPassword('password123'),
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      credits: 1000,
    });

    // 生成JWT令牌
    adminToken = generateToken({
      id: adminUser?.id || 0,
      username: adminUser?.username || '',
      role: (adminUser?.role as UserRole) || UserRole.ADMIN,
    });
  });

  afterAll(async () => {
    await clearAllTables();
    await app.close();
  });

  // 测试仪表盘页面
  describe('GET /admin', () => {
    test('已登录管理员可以访问仪表盘页面', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/admin',
        cookies: {
          token: adminToken,
        },
      });

      // 验证响应状态
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');

      const body = response.payload;

      // 验证页面包含基本的仪表盘元素
      expect(body).toContain('仪表盘');

      // 验证 stats 数据存在
      expect(body).toContain('活跃会话');
      expect(body).toContain('在线机器');
      expect(body).toContain('总用户数');
      expect(body).toContain('剩余算力');

      // 验证最近会话部分存在
      expect(body).toContain('最近会话');

      // 验证系统状态部分存在
      expect(body).toContain('系统状态');
    });

    test('仪表盘页面不包含 "recentSessions is not defined" 错误', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/admin',
        cookies: {
          token: adminToken,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.payload;

      // 验证没有 "recentSessions is not defined" 错误
      expect(body).not.toContain('recentSessions is not defined');
      expect(body).not.toContain('TypeError');
      expect(body).not.toContain('ReferenceError');
    });

    test('未登录用户会被重定向到登录页面', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/admin',
      });

      // 应该重定向到登录页面
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('/admin/login');
    });

    test('仪表盘页面显示统计数据', async () => {
      // 创建一些测试数据
      const testUser = await UserModel.create({
        username: 'testuser_for_dashboard',
        password: await hashPassword('password123'),
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        credits: 100,
      });

      // 创建测试会话
      await SessionModel.create({
        user_id: testUser?.id || 0,
      });

      // 创建测试机器
      await MachineModel.register({
        id: 'test-machine-dashboard',
        hostname: 'test-host',
        ip: '127.0.0.1',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/admin',
        cookies: {
          token: adminToken,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.payload;

      // 验证统计数据显示
      expect(body).toMatch(/activeSessions|活跃会话/);
      expect(body).toMatch(/totalMachines|在线机器/);
      expect(body).toMatch(/totalUsers|总用户数/);
      expect(body).toMatch(/totalCredits|剩余算力/);
    });
  });
});
