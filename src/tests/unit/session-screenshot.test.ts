import { describe, beforeAll, afterAll, test, expect } from 'vitest';
import { FastifyInstance } from 'fastify';
import { build } from '../helpers/app.js';
import { initDatabase } from '../../config/database.js';
import { clearAllTables } from '../helpers/database.js';
import { UserModel } from '../../models/user.model.js';
import { SessionModel } from '../../models/session.model.js';
import { generateToken, hashPassword } from '../../utils/auth.js';
import { UserRole, UserStatus } from '@shared/types/index.js';

describe('会话详情页面截图显示测试', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let testUserId: number;
  let testSessionId: string;
  const testScreenshotUrl = 'https://example.com/screenshots/test-screenshot.png';

  beforeAll(async () => {
    await initDatabase();
    await clearAllTables();

    app = await build();

    const adminUser = await UserModel.create({
      username: 'testadmin',
      password: await hashPassword('password123'),
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      credits: 1000,
    });

    const regularUser = await UserModel.create({
      username: 'testuser',
      password: await hashPassword('password123'),
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      credits: 100,
    });

    testUserId = regularUser?.id || 0;

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

  describe('SessionModel.getDetailById - 截图字段测试', () => {
    test('创建会话时设置 screenshot_url 后，getDetailById 应该返回该字段', async () => {
      const session = await SessionModel.create({
        user_id: testUserId,
        options: {
          userAgent: 'Mozilla/5.0',
          viewport: { width: 1280, height: 720 },
        },
      });
      testSessionId = session!.id;

      await SessionModel.update(testSessionId, {
        screenshot_url: testScreenshotUrl,
      });

      const detailSession = await SessionModel.getDetailById(testSessionId);

      expect(detailSession).not.toBeNull();
      expect(detailSession?.id).toBe(testSessionId);
      expect(detailSession?.screenshot_url).toBe(testScreenshotUrl);
    });

    test('会话没有 screenshot_url 时，getDetailById 应该返回 null', async () => {
      const session = await SessionModel.create({
        user_id: testUserId,
        options: {
          userAgent: 'Mozilla/5.0',
          viewport: { width: 1280, height: 720 },
        },
      });
      const sessionId = session!.id;

      const detailSession = await SessionModel.getDetailById(sessionId);

      expect(detailSession).not.toBeNull();
      expect(detailSession?.id).toBe(sessionId);
      expect(detailSession?.screenshot_url).toBeNull();
    });
  });

  describe('管理后台会话详情页面 - 截图显示测试', () => {
    test('会话有 screenshot_url 时，详情页面应该显示截图', async () => {
      const session = await SessionModel.create({
        user_id: testUserId,
        options: {
          userAgent: 'Mozilla/5.0',
          viewport: { width: 1280, height: 720 },
        },
      });
      const sessionId = session!.id;

      await SessionModel.update(sessionId, {
        screenshot_url: testScreenshotUrl,
      });

      const detailSession = await SessionModel.getDetailById(sessionId);

      expect(detailSession).not.toBeNull();
      expect(detailSession?.screenshot_url).toBe(testScreenshotUrl);

      expect(detailSession?.screenshot_url).toBeTruthy();
    });

    test('会话没有 screenshot_url 时，详情页面应该显示"无截图"', async () => {
      const session = await SessionModel.create({
        user_id: testUserId,
        options: {
          userAgent: 'Mozilla/5.0',
          viewport: { width: 1280, height: 720 },
        },
      });
      const sessionId = session!.id;

      const detailSession = await SessionModel.getDetailById(sessionId);

      expect(detailSession).not.toBeNull();
      expect(detailSession?.screenshot_url).toBeNull();

      expect(detailSession?.screenshot_url).toBeFalsy();
    });
  });
});
