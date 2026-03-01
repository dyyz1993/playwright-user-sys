/**
 * Web 登录集成测试
 * 测试修复后的 Web 管理后台登录功能
 *
 * Bug: 原本使用 bcrypt.compare() 验证 SHA256 哈希密码，导致永远无法登录
 * Fix: 改为使用 comparePassword() 函数验证 SHA256 哈希密码
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import pointOfView from '@fastify/view';
import ejs from 'ejs';
import flash from '@fastify/flash';
import authPlugin from '../../plugins/auth.plugin.js';
import adminRoutes from '../../routes/admin.routes.js';
import { UserModel } from '../../models/user.model.js';
import { clearAllTables } from '../helpers/database.js';
import { UserRole, UserStatus } from '@shared/types/index.js';

// Mock webhook
import { vi } from 'vitest';
vi.mock('../../utils/webhook.js', () => ({
  createWebhookEvent: vi.fn().mockResolvedValue(undefined),
}));

describe('Web 管理后台登录集成测试', () => {
  let app: FastifyInstance;
  let testAdmin: any;

  beforeAll(async () => {
    await clearAllTables();

    // 构建带视图引擎的应用（用于管理后台）
    app = Fastify({
      logger: false,
    });

    // 注册视图引擎
    await app.register(pointOfView, {
      engine: { ejs },
      root: 'src/views',
    });

    // 注册 flash 插件（用于错误消息）
    await app.register(flash);

    // 注册认证插件
    await app.register(authPlugin);

    // 注册管理后台路由
    await app.register(adminRoutes);

    // 创建测试管理员 (用户名: webtest, 密码: password123)
    const result = await UserModel.create({
      username: 'webtest',
      password: 'password123', // UserModel.create 会自动哈希
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      credits: 999999,
    });
    testAdmin = result;
  });

  afterAll(async () => {
    await clearAllTables();
    await app.close();
  });

  describe('POST /admin/login', () => {
    it('应该成功登录并设置 Cookie', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/login',
        payload: {
          username: 'webtest',
          password: 'password123',
        },
      });

      // 应该重定向到仪表盘
      expect(response.statusCode).toBe(302);
      expect(response.headers['location']).toBe('/admin');

      // 应该设置 Cookie
      const setCookieHeader = response.headers['set-cookie'];
      expect(setCookieHeader).toBeDefined();
      expect(setCookieHeader?.[0]).toContain('token=');
    });

    it('错误的用户名应该登录失败', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/login',
        payload: {
          username: 'wronguser',
          password: 'password123',
        },
      });

      // 应该重定向回登录页面
      expect(response.statusCode).toBe(302);
      expect(response.headers['location']).toBe('/admin/login');
    });

    it('错误的密码应该登录失败', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/login',
        payload: {
          username: 'webtest',
          password: 'wrongpassword',
        },
      });

      // 应该重定向回登录页面
      expect(response.statusCode).toBe(302);
      expect(response.headers['location']).toBe('/admin/login');
    });

    it('缺少用户名应该返回错误', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/login',
        payload: {
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers['location']).toBe('/admin/login');
    });

    it('缺少密码应该返回错误', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/login',
        payload: {
          username: 'webtest',
        },
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers['location']).toBe('/admin/login');
    });
  });

  describe('登录后的访问控制', () => {
    let authToken: string;

    beforeAll(async () => {
      // 先登录获取 token
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/admin/login',
        payload: {
          username: 'webtest',
          password: 'password123',
        },
      });

      // 从 Cookie 中提取 token
      const setCookieHeader = loginResponse.headers['set-cookie']?.[0] || '';
      const match = setCookieHeader.match(/token=([^;]+)/);
      authToken = match ? match[1] : '';
    });

    it('未登录时访问仪表盘应该重定向到登录页', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/admin',
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers['location']).toBe('/admin/login');
    });

    it('已登录时可以访问仪表盘', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/admin',
        headers: {
          cookie: `token=${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = response.payload;
      expect(payload).toContain('仪表盘');
    });
  });

  describe('POST /admin/logout', () => {
    it('应该成功登出并清除 Cookie', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/logout',
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers['location']).toBe('/admin/login');

      // 应该清除 Cookie
      const setCookieHeader = response.headers['set-cookie'];
      expect(setCookieHeader).toBeDefined();
      expect(setCookieHeader?.[0]).toContain('token=;');
      expect(setCookieHeader?.[0]).toContain('Max-Age=0');
    });
  });
});
