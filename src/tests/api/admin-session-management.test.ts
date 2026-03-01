import { describe, beforeAll, afterAll, beforeEach, test, expect } from 'vitest';
import { FastifyInstance } from 'fastify';
import { build } from '../helpers/app.js';
import { initDatabase } from '../../config/database.js';
import { clearAllTables } from '../helpers/database.js';
import { UserModel } from '../../models/user.model.js';
import { SessionModel } from '../../models/session.model.js';
import { generateToken, hashPassword } from '../../utils/auth.js';
import { UserRole, UserStatus } from '@shared/types/index.js';
import { v4 as uuidv4 } from 'uuid';

describe('管理员会话管理功能测试', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let userToken: string;
  let testUserId: number;
  let adminId: number;
  let testSessionId: string;

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

    // 创建测试会话
    const session = await SessionModel.create({
      user_id: testUserId,
      options: {
        userAgent: 'Mozilla/5.0',
        viewport: { width: 1280, height: 720 },
      },
    });
    testSessionId = session!.id;
  });

  afterAll(async () => {
    await clearAllTables();
    await app.close();
  });

  // 测试获取所有会话功能
  describe('GET /api/sessions/admin/all', () => {
    test('管理员可以获取所有会话', async () => {
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
      expect(Array.isArray(result.data)).toBe(true);

      // 验证返回的会话中包含我们创建的测试会话
      const foundSession = result.data.find((session: any) => session.id === testSessionId);
      expect(foundSession).toBeTruthy();
      expect(foundSession?.user_id).toBe(testUserId);
    });

    test('普通用户无法获取所有会话', async () => {
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

    test('未授权访问应该失败', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/sessions/admin/all',
      });

      expect(response.statusCode).toBe(401);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });
  });

  // 测试关闭会话功能
  describe('POST /api/sessions/:id/close', () => {
    let sessionToCloseId: string;

    beforeEach(async () => {
      // 创建一个用于关闭的测试会话
      const session = await SessionModel.create({
        user_id: testUserId,
        options: {
          userAgent: 'Mozilla/5.0',
          viewport: { width: 1280, height: 720 },
        },
      });
      sessionToCloseId = session!.id;
    });

    test('管理员可以关闭会话', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/sessions/${sessionToCloseId}/close`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id', sessionToCloseId);
      expect(result.data).toHaveProperty('status', 'closed');

      // 验证会话状态已更新
      const closedSession = await SessionModel.findById(sessionToCloseId);
      expect(closedSession?.status).toBe('closed');
    });

    test('普通用户无法关闭其他用户的会话', async () => {
      // 创建另一个用户的会话
      const otherUserId = adminId; // 使用管理员ID作为"其他用户"
      const otherSession = await SessionModel.create({
        user_id: otherUserId,
        options: {
          userAgent: 'Mozilla/5.0',
          viewport: { width: 1280, height: 720 },
        },
      });
      const otherSessionId = otherSession!.id;

      const response = await app.inject({
        method: 'POST',
        url: `/api/sessions/${otherSessionId}/close`,
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);

      // 验证会话状态未更新
      const session = await SessionModel.findById(otherSessionId);
      expect(session?.status).toBe('created');
    });

    test('关闭不存在的会话应该失败', async () => {
      const nonExistentSessionId = 'non-existent-session-id';

      const response = await app.inject({
        method: 'POST',
        url: `/api/sessions/${nonExistentSessionId}/close`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });

    test('未授权访问应该失败', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/sessions/${sessionToCloseId}/close`,
      });

      expect(response.statusCode).toBe(401);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);

      // 验证会话状态未更新
      const session = await SessionModel.findById(sessionToCloseId);
      expect(session?.status).toBe('created');
    });
  });
});
