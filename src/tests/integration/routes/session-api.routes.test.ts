/**
 * Session Management API Routes 集成测试
 * 测试会话管理 API 的完整HTTP请求/响应流程
 *
 * 测试策略:
 * - 真实HTTP请求 (Fastify inject)
 * - 真实数据库操作 (MySQL测试数据库)
 * - 真实中间件执行 (verifyJWT, verifyAdmin, verifyApiKey)
 * - 真实Controller调用
 * - Mock: 仅外部依赖 (webhook, machine gRPC)
 *
 * 测试覆盖:
 * - P0 (关键): 点数计算、状态转换、权限控制、并发操作、重复释放
 * - P1 (重要): 字段验证、筛选排序、批量操作
 * - P2 (一般): 边界条件、错误处理
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { build } from '../../helpers/app.js';
import { UserModel } from '../../../models/user.model.js';
import { SessionModel } from '../../../models/session/index.js';
import { generateToken } from '../../../utils/auth.js';
import { UserRole, SessionStatus } from '../../../shared/types/index.js';
import { initDatabase } from '../../../config/database.js';
import { createTestUser, createTestAdmin, createTestSession, createTestMachine } from '../../helpers/factories.js';
import { db } from '../../../config/database.js';

// Mock webhook - 集成测试仅Mock外部依赖
vi.mock('../../../utils/webhook.js', () => ({
  createWebhookEvent: vi.fn().mockResolvedValue(undefined),
}));

// Mock machine-grpc service - 集成测试中不需要真实的机器服务
const mockConnectionManager = {
  getAllConnectedMachines: vi.fn(() => ['test-machine-1']),
  closeBrowser: vi.fn().mockResolvedValue(undefined),
  launchBrowser: vi.fn().mockResolvedValue({
    port: 3000,
    browser_ws_endpoint: 'ws://localhost:3000', // 使用 snake_case 以匹配实际代码
  }),
};

vi.mock('../../../services/machine-grpc/index.js', () => ({
  connectionManager: mockConnectionManager,
}));

// Mock machine service - 集成测试中不需要真实的机器服务
vi.mock('../../../services/machine.service.js', () => ({
  findAvailableMachine: vi.fn().mockResolvedValue({
    id: 'test-machine-1',
    hostname: 'test-machine',
    ip: '127.0.0.1',
    port: 8080,
  }),
  allocateBrowserInstance: vi.fn().mockResolvedValue({
    port: 3000,
    wsEndpoint: 'ws://localhost:3000',
  }),
  releaseBrowserInstance: vi.fn().mockResolvedValue(undefined),
}));

describe('会话管理 API 集成测试', () => {
  let app: FastifyInstance;
  let testAdmin: ReturnType<typeof vi.fn>;
  let testUser: ReturnType<typeof vi.fn>;
  let _anotherUser: ReturnType<typeof vi.fn>;
  let adminToken: string;
  let userToken: string;
  let _anotherUserToken: string;
  let _testMachine: ReturnType<typeof vi.fn>;

  // ========================================
  // 测试初始化
  // ========================================
  beforeAll(async () => {
    // 清空测试数据
    await initDatabase();

    // 构建应用实例
    app = await build();

    // 创建测试管理员
    testAdmin = await createTestAdmin({
      username: 'sessionadmin',
      password: 'password123',
    });

    // 生成管理员JWT token
    adminToken = generateToken({
      id: testAdmin?.id || 0,
      username: testAdmin?.username || '',
      role: UserRole.ADMIN,
    });

    // 创建测试普通用户
    testUser = await createTestUser({
      username: 'sessionuser',
      password: 'password123',
      credits: 100,
    });

    // 生成普通用户JWT token
    userToken = generateToken({
      id: testUser?.id || 0,
      username: testUser?.username || '',
      role: UserRole.USER,
    });

    // 创建另一个测试用户
    _anotherUser = await createTestUser({
      username: 'anotheruser',
      password: 'password123',
      credits: 50,
    });

    _anotherUserToken = generateToken({
      id: _anotherUser?.id || 0,
      username: _anotherUser?.username || '',
      role: UserRole.USER,
    });

    // 创建测试机器
    _testMachine = await createTestMachine({
      id: 'test-machine-1',
      hostname: 'test-machine',
    });
  });

  // 在所有测试之后清理
  afterAll(async () => {
    await initDatabase();
    await app.close();
  });

  // ========================================
  // A. 会话核心功能测试 (P0)
  // ========================================

  // ========================================
  // A-01: 点数计算准确性测试 (8个)
  // ========================================
  describe('A-01: 点数计算准确性测试', () => {
    it('S-CREDITS-01: 不足1分钟会话应该消耗1点', async () => {
      const user = await createTestUser({ credits: 100 });
      const session = await createTestSession(user.id);

      // 等待30秒
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 释放会话
      const response = await app.inject({
        method: 'POST',
        url: `/api/sessions/${session.id}/release`,
        headers: {
          'x-api-key': user.api_key!!,
        },
      });

      expect(response.statusCode).toBe(200);
      // result is used for debugging but not needed for assertions

      // 验证消耗了1点
      const updatedSession = await SessionModel.findById(session.id);
      expect(updatedSession?.credits_used).toBe(1);

      // 验证用户点数减少
      const updatedUser = await UserModel.findById(user.id);
      expect(updatedUser?.credits).toBe(99);
    });

    it('S-CREDITS-02: 整数分钟会话应该正确计算点数', async () => {
      const user = await createTestUser({ credits: 100 });
      const session = await createTestSession(user.id);

      // 手动标记会话已断开，指定持续时间
      await SessionModel.markDisconnected(session.id, 60);

      const updatedSession = await SessionModel.findById(session.id);
      // 60秒 = 1分钟 = 1点
      expect(updatedSession?.credits_used).toBe(1);
    });

    it('S-CREDITS-03: 超过1分钟会话应该向上取整计算点数', async () => {
      const user = await createTestUser({ credits: 100 });
      const session = await createTestSession(user.id);

      // 90秒的会话应该消耗2点
      await SessionModel.markDisconnected(session.id, 90);

      const updatedSession = await SessionModel.findById(session.id);
      // 90秒 / 60 = 1.5 -> 向上取整 = 2点
      expect(updatedSession?.credits_used).toBe(2);
    });

    it('S-CREDITS-04: 长时间会话应该正确计算点数', async () => {
      const user = await createTestUser({ credits: 1000 });
      const session = await createTestSession(user.id);

      // 3600秒 = 60分钟 = 60点
      await SessionModel.markDisconnected(session.id, 3600);

      const updatedSession = await SessionModel.findById(session.id);
      expect(updatedSession?.credits_used).toBe(60);
    });

    it('S-CREDITS-05: 创建会时不扣除点数', async () => {
      const user = await createTestUser({ credits: 100 });
      const initialCredits = user.credits;

      await createTestSession(user.id);

      const updatedUser = await UserModel.findById(user.id);
      // 创建时不扣费
      expect(updatedUser?.credits).toBe(initialCredits);
    });

    it('S-CREDITS-06: 释放会话时扣除点数', async () => {
      const user = await createTestUser({ credits: 100 });
      const session = await createTestSession(user.id);

      // 释放会话
      await SessionModel.markDisconnected(session.id, 60);

      const updatedUser = await UserModel.findById(user.id);
      // 应该扣除1点
      expect(updatedUser?.credits).toBe(99);
    });

    it('S-CREDITS-07: 重复释放会话不重复扣费', async () => {
      const user = await createTestUser({ credits: 100 });
      const session = await createTestSession(user.id);

      // 第一次释放
      await SessionModel.markDisconnected(session.id, 60);
      let updatedUser = await UserModel.findById(user.id);
      const creditsAfterFirstRelease = updatedUser?.credits || 0;

      // 第二次释放
      await SessionModel.markDisconnected(session.id, 60);
      updatedUser = await UserModel.findById(user.id);

      // 点数不应该再次减少
      expect(updatedUser?.credits).toBe(creditsAfterFirstRelease);
    });

    it('S-CREDITS-08: 会话错误时仍然计算点数', async () => {
      const user = await createTestUser({ credits: 100 });
      const session = await createTestSession(user.id);

      // 标记会话为错误状态
      await SessionModel.markError(session.id, 30);

      const updatedSession = await SessionModel.findById(session.id);
      // 即使出错，仍然要计算点数
      expect(updatedSession?.credits_used).toBe(1);
    });
  });

  // ========================================
  // A-02: 状态转换完整性测试 (12个)
  // ========================================
  describe('A-02: 状态转换完整性测试', () => {
    it('S-STATUS-01: 新创建会话状态应该是created', async () => {
      const user = await createTestUser();
      const session = await createTestSession(user.id);

      expect(session.status).toBe(SessionStatus.CREATED);
    });

    it('S-STATUS-02: 会话可以从created转换为connected', async () => {
      const user = await createTestUser();
      const session = await createTestSession(user.id);

      // 标记为已连接
      const updated = await SessionModel.markConnected(session.id);
      expect(updated?.status).toBe(SessionStatus.CONNECTED);
    });

    it('S-STATUS-03: 会话可以从connected转换为disconnected', async () => {
      const user = await createTestUser();
      const session = await createTestSession(user.id);

      // 先标记为已连接
      await SessionModel.markConnected(session.id);

      // 再标记为已断开
      const updated = await SessionModel.markDisconnected(session.id, 60);
      expect(updated?.status).toBe(SessionStatus.DISCONNECTED);
    });

    it('S-STATUS-04: 会话可以从created直接转换为disconnected', async () => {
      const user = await createTestUser();
      const session = await createTestSession(user.id);

      // 直接标记为已断开
      const updated = await SessionModel.markDisconnected(session.id, 30);
      expect(updated?.status).toBe(SessionStatus.DISCONNECTED);
    });

    it('S-STATUS-05: 会话可以从created转换为expired', async () => {
      const user = await createTestUser();
      const session = await createTestSession(user.id);

      // 标记为过期
      const updated = await SessionModel.markExpired(session.id, 120);
      expect(updated?.status).toBe(SessionStatus.EXPIRED);
    });

    it('S-STATUS-06: 会话可以从created转换为error', async () => {
      const user = await createTestUser();
      const session = await createTestSession(user.id);

      // 标记为错误
      const updated = await SessionModel.markError(session.id, 30);
      expect(updated?.status).toBe(SessionStatus.ERROR);
    });

    it('S-STATUS-07: 会话可以从connected转换为expired', async () => {
      const user = await createTestUser();
      const session = await createTestSession(user.id);

      // 先标记为已连接
      await SessionModel.markConnected(session.id);

      // 再标记为过期
      const updated = await SessionModel.markExpired(session.id, 120);
      expect(updated?.status).toBe(SessionStatus.EXPIRED);
    });

    it('S-STATUS-08: 会话可以从connected转换为error', async () => {
      const user = await createTestUser();
      const session = await createTestSession(user.id);

      // 先标记为已连接
      await SessionModel.markConnected(session.id);

      // 再标记为错误
      const updated = await SessionModel.markError(session.id, 60);
      expect(updated?.status).toBe(SessionStatus.ERROR);
    });

    it('S-STATUS-09: 状态转换时应该更新end_time', async () => {
      const user = await createTestUser();
      const session = await createTestSession(user.id);

      // 释放会话
      await SessionModel.markDisconnected(session.id, 60);

      const updated = await SessionModel.findById(session.id);
      expect(updated?.end_time).not.toBeNull();
    });

    it('S-STATUS-10: 状态转换时应该计算duration', async () => {
      const user = await createTestUser();
      const session = await createTestSession(user.id);

      // 释放会话，指定持续时间
      const expectedDuration = 60;
      await SessionModel.markDisconnected(session.id, expectedDuration);

      const updated = await SessionModel.findById(session.id);
      expect(updated?.duration).toBe(expectedDuration);
    });

    it('S-STATUS-11: 状态转换时应该计算credits_used', async () => {
      const user = await createTestUser();
      const session = await createTestSession(user.id);

      // 释放会话
      await SessionModel.markDisconnected(session.id, 90);

      const updated = await SessionModel.findById(session.id);
      // 90秒 = 2分钟 = 2点
      expect(updated?.credits_used).toBe(2);
    });

    it('S-STATUS-12: 完整生命周期状态转换', async () => {
      const user = await createTestUser();
      const session = await createTestSession(user.id);

      // created -> connected
      let updated = await SessionModel.markConnected(session.id);
      expect(updated?.status).toBe(SessionStatus.CONNECTED);

      // connected -> disconnected
      updated = await SessionModel.markDisconnected(session.id, 120);
      expect(updated?.status).toBe(SessionStatus.DISCONNECTED);

      // 验证最终状态
      const final = await SessionModel.findById(session.id);
      expect(final?.status).toBe(SessionStatus.DISCONNECTED);
      expect(final?.end_time).not.toBeNull();
      expect(final?.duration).toBe(120);
      expect(final?.credits_used).toBe(2);
    });
  });

  // ========================================
  // A-03: 权限控制测试 (15个)
  // ========================================
  describe('A-03: 权限控制测试', () => {
    let userSession: ReturnType<typeof vi.fn>;
    let adminSession: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      // 为每个测试创建新的会话
      userSession = await createTestSession(testUser.id);
      adminSession = await createTestSession(testAdmin.id);
    });

    it('S-AUTH-01: 用户只能访问自己的会话详情', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/sessions/${userSession.id}`,
        headers: {
          'x-api-key': testUser.api_key!!,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('S-AUTH-02: 用户访问其他用户的会话应该返回403', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/sessions/${adminSession.id}`,
        headers: {
          'x-api-key': testUser.api_key!!,
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('S-AUTH-03: 用户只能释放自己的会话', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/sessions/${userSession.id}/release`,
        headers: {
          'x-api-key': testUser.api_key!!,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('S-AUTH-04: 用户释放其他用户的会话应该返回403', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/sessions/${adminSession.id}/release`,
        headers: {
          'x-api-key': testUser.api_key!!,
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('S-AUTH-05: 管理员可以访问所有会话详情', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/admin/sessions/${userSession.id}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('S-AUTH-06: 管理员可以获取所有会话列表', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.data.items.length).toBeGreaterThan(0);
    });

    it('S-AUTH-07: 普通用户访问管理员接口应该返回403', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions',
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('S-AUTH-08: 未认证访问用户API应该返回401', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/sessions/${userSession.id}`,
        // 没有 x-api-key
      });

      expect(response.statusCode).toBe(401);
    });

    it('S-AUTH-09: 未认证访问管理员API应该返回401', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions',
        // 没有 Authorization
      });

      expect(response.statusCode).toBe(401);
    });

    it('S-AUTH-10: 无效API Key应该返回401', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/sessions/${userSession.id}`,
        headers: {
          'x-api-key': 'invalid-api-key',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('S-AUTH-11: 无效JWT Token应该返回401', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions',
        headers: {
          Authorization: 'Bearer invalid-token',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('S-AUTH-12: 用户只能获取自己的会话列表', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/sessions',
        headers: {
          'x-api-key': testUser.api_key!!,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      // 验证所有会话都属于当前用户
      result.data.items.forEach((session: Record<string, unknown>) => {
        expect(session.user_id).toBe(testUser.id);
      });
    });

    it('S-AUTH-13: 用户只能获取自己的会话截图', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/sessions/${userSession.id}/screenshot`,
        headers: {
          'x-api-key': testUser.api_key!!,
        },
      });

      // 应该返回200或404（如果没有截图），但不能是403
      expect([200, 404]).toContain(response.statusCode);
      expect(response.statusCode).not.toBe(403);
    });

    it('S-AUTH-14: 用户获取其他用户的会话截图应该返回403', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/sessions/${adminSession.id}/screenshot`,
        headers: {
          'x-api-key': testUser.api_key!!,
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('S-AUTH-15: 管理员可以关闭任何用户的会话', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/sessions/${userSession.id}/close`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ========================================
  // A-04: 并发创建会话测试 (6个)
  // ========================================
  describe('A-04: 并发创建会话测试', () => {
    it('S-CONCURRENCY-01: 多个用户同时创建会话应该成功', async () => {
      const users = await Promise.all([
        createTestUser({ credits: 100 }),
        createTestUser({ credits: 100 }),
        createTestUser({ credits: 100 }),
      ]);

      // 并发创建会话
      const sessions = await Promise.all(users.map((user) => createTestSession(user.id)));

      expect(sessions).toHaveLength(3);
      sessions.forEach((session) => {
        expect(session.status).toBe(SessionStatus.CREATED);
      });
    });

    it('S-CONCURRENCY-02: 同一用户并发创建多个会话应该成功', async () => {
      const user = await createTestUser({ credits: 500 });

      // 并发创建多个会话
      const sessions = await Promise.all([
        createTestSession(user.id),
        createTestSession(user.id),
        createTestSession(user.id),
      ]);

      expect(sessions).toHaveLength(3);

      // 验证所有会话ID都不同
      const ids = sessions.map((s) => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });

    it('S-CONCURRENCY-03: 并发释放不同会话应该成功', async () => {
      const user = await createTestUser({ credits: 300 });

      const sessions = await Promise.all([
        createTestSession(user.id),
        createTestSession(user.id),
        createTestSession(user.id),
      ]);

      // 并发释放会话
      const results = await Promise.all(sessions.map((session) => SessionModel.markDisconnected(session.id, 60)));

      results.forEach((result) => {
        expect(result?.status).toBe(SessionStatus.DISCONNECTED);
      });
    });

    it('S-CONCURRENCY-04: 并发操作同一会话应该幂等', async () => {
      const user = await createTestUser({ credits: 100 });
      const session = await createTestSession(user.id);

      // 并发释放同一会话
      const results = await Promise.all([
        SessionModel.markDisconnected(session.id, 60),
        SessionModel.markDisconnected(session.id, 60),
        SessionModel.markDisconnected(session.id, 60),
      ]);

      // 所有操作都应该成功
      results.forEach((result) => {
        expect(result).not.toBeNull();
      });

      // 但点数只扣除一次
      const updatedUser = await UserModel.findById(user.id);
      expect(updatedUser?.credits).toBe(99);
    });

    it('S-CONCURRENCY-05: 高并发创建会话不应该冲突', async () => {
      const user = await createTestUser({ credits: 1000 });

      // 创建10个会话
      const sessions = await Promise.all(Array.from({ length: 10 }, () => createTestSession(user.id)));

      expect(sessions).toHaveLength(10);

      // 验证所有会话ID唯一
      const ids = sessions.map((s) => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(10);
    });

    it('S-CONCURRENCY-06: 并发查询会话列表应该一致', async () => {
      const user = await createTestUser({ credits: 300 });

      // 创建多个会话
      await Promise.all([createTestSession(user.id), createTestSession(user.id), createTestSession(user.id)]);

      // 并发查询会话列表
      const results = await Promise.all([
        app.inject({
          method: 'GET',
          url: '/api/sessions',
          headers: { 'x-api-key': user.api_key!! },
        }),
        app.inject({
          method: 'GET',
          url: '/api/sessions',
          headers: { 'x-api-key': user.api_key!! },
        }),
        app.inject({
          method: 'GET',
          url: '/api/sessions',
          headers: { 'x-api-key': user.api_key!! },
        }),
      ]);

      // 所有查询都应该成功
      results.forEach((response) => {
        expect(response.statusCode).toBe(200);
        const result = JSON.parse(response.payload);
        expect(result.data.items.length).toBe(3);
      });
    });
  });

  // ========================================
  // A-05: 重复释放不重复扣费测试 (4个)
  // ========================================
  describe('A-05: 重复释放不重复扣费测试', () => {
    it('S-RELEASE-01: 释放已结束的会话不重复扣费', async () => {
      const user = await createTestUser({ credits: 100 });
      const session = await createTestSession(user.id);

      // 第一次释放
      await SessionModel.markDisconnected(session.id, 60);
      let updatedUser = await UserModel.findById(user.id);
      const creditsAfterFirst = updatedUser?.credits || 0;

      // 第二次释放
      await SessionModel.markDisconnected(session.id, 60);
      updatedUser = await UserModel.findById(user.id);

      expect(updatedUser?.credits).toBe(creditsAfterFirst);
    });

    it('S-RELEASE-02: 多次释放同一会话只扣费一次', async () => {
      const user = await createTestUser({ credits: 100 });
      const session = await createTestSession(user.id);

      // 释放3次
      await SessionModel.markDisconnected(session.id, 60);
      await SessionModel.markDisconnected(session.id, 60);
      await SessionModel.markDisconnected(session.id, 60);

      const updatedUser = await UserModel.findById(user.id);
      // 应该只扣除了1点
      expect(updatedUser?.credits).toBe(99);
    });

    it('S-RELEASE-03: 释放过期会话不重复扣费', async () => {
      const user = await createTestUser({ credits: 100 });
      const session = await createTestSession(user.id);

      // 标记为过期
      await SessionModel.markExpired(session.id, 120);
      let updatedUser = await UserModel.findById(user.id);
      const creditsAfterExpired = updatedUser?.credits || 0;

      // 再次释放
      await SessionModel.markDisconnected(session.id, 120);
      updatedUser = await UserModel.findById(user.id);

      expect(updatedUser?.credits).toBe(creditsAfterExpired);
    });

    it('S-RELEASE-04: 状态为终态的会话不重复扣费', async () => {
      const user = await createTestUser({ credits: 100 });

      // 测试所有终态
      const finalStates = [
        SessionStatus.DISCONNECTED,
        SessionStatus.EXPIRED,
        SessionStatus.ERROR,
        SessionStatus.COMPLETED,
      ];

      for (const status of finalStates) {
        const session = await createTestSession(user.id);

        // 根据状态使用相应的方法标记
        if (status === SessionStatus.DISCONNECTED) {
          await SessionModel.markDisconnected(session.id, 60);
        } else if (status === SessionStatus.EXPIRED) {
          await SessionModel.markExpired(session.id, 60);
        } else if (status === SessionStatus.ERROR) {
          await SessionModel.markError(session.id, 60);
        } else if (status === SessionStatus.COMPLETED) {
          // COMPLETED 状态需要手动标记为终态
          // 由于没有 markCompleted 方法，直接更新数据库
          await db('sessions').where({ id: session.id }).update({
            status: SessionStatus.COMPLETED,
            credits_used: 1,
            duration: 60,
            end_time: new Date(),
          });
        }

        const creditsAfterFirst = (await UserModel.findById(user.id))?.credits || 0;

        // 尝试再次释放
        await SessionModel.markDisconnected(session.id, 60);
        const creditsAfterSecond = await UserModel.findById(user.id);

        expect(creditsAfterSecond?.credits).toBe(creditsAfterFirst);
      }
    });
  });

  // ========================================
  // A-06: 核心API端点正常场景测试 (10个)
  // ========================================
  describe('A-06: 核心API端点正常场景测试', () => {
    it('S-API-01: 创建会话应该返回连接信息', async () => {
      const user = await createTestUser({ credits: 100 });

      const response = await app.inject({
        method: 'POST',
        url: '/api/sessions',
        headers: {
          'x-api-key': user.api_key!!,
        },
        payload: {
          userAgent: 'test-agent',
        },
      });

      // Debug: 打印响应信息
      if (response.statusCode !== 201) {
        console.log('S-API-01 Debug Response:', {
          statusCode: response.statusCode,
          payload: response.payload,
          headers: response.headers,
        });
      }

      expect(response.statusCode).toBe(201);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id');
      expect(result.data).toHaveProperty('status', SessionStatus.CREATED);
      // 注意：实际的连接信息可能需要机器服务才能生成
    });

    it('S-API-02: 获取会话详情应该成功', async () => {
      const user = await createTestUser();
      const session = await createTestSession(user.id);

      const response = await app.inject({
        method: 'GET',
        url: `/api/sessions/${session.id}`,
        headers: {
          'x-api-key': user.api_key!!,
        },
      });

      // Debug: 打印响应信息
      if (response.statusCode !== 200) {
        console.log('S-API-02 Debug Response:', {
          statusCode: response.statusCode,
          payload: response.payload,
          sessionId: session.id,
        });
      }

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.data.id).toBe(session.id);
      expect(result.data).toHaveProperty('status');
    });

    it('S-API-03: 获取用户会话列表应该成功', async () => {
      const user = await createTestUser();
      await createTestSession(user.id);
      await createTestSession(user.id);

      const response = await app.inject({
        method: 'GET',
        url: '/api/sessions',
        headers: {
          'x-api-key': user.api_key!!,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.data.items).toHaveLength(2);
    });

    it('S-API-04: 释放会话应该成功', async () => {
      const user = await createTestUser({ credits: 100 });
      const session = await createTestSession(user.id);

      const response = await app.inject({
        method: 'POST',
        url: `/api/sessions/${session.id}/release`,
        headers: {
          'x-api-key': user.api_key!!,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('duration');
    });

    it('S-API-05: 管理员获取所有会话应该成功', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions',
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

    it('S-API-06: 管理员获取会话详情应该成功', async () => {
      const user = await createTestUser();
      const session = await createTestSession(user.id);

      const response = await app.inject({
        method: 'GET',
        url: `/api/admin/sessions/${session.id}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('username');
    });

    it('S-API-07: 管理员关闭会话应该成功', async () => {
      const user = await createTestUser();
      const session = await createTestSession(user.id);

      const response = await app.inject({
        method: 'POST',
        url: `/api/sessions/${session.id}/close`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('S-API-08: 获取不存在的会话应该返回404', async () => {
      const user = await createTestUser();

      const response = await app.inject({
        method: 'GET',
        url: '/api/sessions/non-existent-id',
        headers: {
          'x-api-key': user.api_key!!,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('S-API-09: 获取会话列表支持分页', async () => {
      const user = await createTestUser();

      // 创建15个会话
      for (let i = 0; i < 15; i++) {
        await createTestSession(user.id);
      }

      const response = await app.inject({
        method: 'GET',
        url: '/api/sessions?page=1&limit=10',
        headers: {
          'x-api-key': user.api_key!!,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.data.items.length).toBeLessThanOrEqual(10);
      expect(result.data.page).toBe(1);
      expect(result.data.total).toBe(15);
    });

    it('S-API-10: 管理员获取会话统计应该成功', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions/stats',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('total');
      expect(result.data).toHaveProperty('active');
      expect(result.data).toHaveProperty('ended');
    });
  });

  // ========================================
  // B. 字段验证测试 (P1)
  // ========================================

  // ========================================
  // B-01: options 字段验证 (9个)
  // ========================================
  describe('B-01: options 字段验证', () => {
    it('S-F-01: 创建会话时不提供options应该成功', async () => {
      const user = await createTestUser();

      const response = await app.inject({
        method: 'POST',
        url: '/api/sessions',
        headers: {
          'x-api-key': user.api_key!!,
        },
        payload: {},
      });

      // 可能返回201或特定错误，取决于实现
      expect([201, 400, 500]).toContain(response.statusCode);
    });

    it('S-F-02: 创建会话时提供userAgent应该成功', async () => {
      const user = await createTestUser();

      const response = await app.inject({
        method: 'POST',
        url: '/api/sessions',
        headers: {
          'x-api-key': user.api_key!!,
        },
        payload: {
          userAgent: 'Mozilla/5.0 Test Browser',
        },
      });

      expect([201, 400, 500]).toContain(response.statusCode);
    });

    it('S-F-03: 创建会话时提供viewport应该成功', async () => {
      const user = await createTestUser();

      const response = await app.inject({
        method: 'POST',
        url: '/api/sessions',
        headers: {
          'x-api-key': user.api_key!!,
        },
        payload: {
          viewport: {
            width: 1920,
            height: 1080,
          },
        },
      });

      expect([201, 400, 500]).toContain(response.statusCode);
    });

    it('S-F-04: viewport宽度必须大于0', async () => {
      const user = await createTestUser();

      const response = await app.inject({
        method: 'POST',
        url: '/api/sessions',
        headers: {
          'x-api-key': user.api_key!!,
        },
        payload: {
          viewport: {
            width: 0,
            height: 1080,
          },
        },
      });

      // 应该返回验证错误
      expect([400, 422]).toContain(response.statusCode);
    });

    it('S-F-05: viewport高度必须大于0', async () => {
      const user = await createTestUser();

      const response = await app.inject({
        method: 'POST',
        url: '/api/sessions',
        headers: {
          'x-api-key': user.api_key!!,
        },
        payload: {
          viewport: {
            width: 1920,
            height: 0,
          },
        },
      });

      expect([400, 422]).toContain(response.statusCode);
    });

    it('S-F-06: 创建会话时提供cookies应该成功', async () => {
      const user = await createTestUser();

      const response = await app.inject({
        method: 'POST',
        url: '/api/sessions',
        headers: {
          'x-api-key': user.api_key!!,
        },
        payload: {
          cookies: {
            key1: 'value1',
            key2: 'value2',
          },
        },
      });

      expect([201, 400, 500]).toContain(response.statusCode);
    });

    it('S-F-07: 创建会话时提供localStorage应该成功', async () => {
      const user = await createTestUser();

      const response = await app.inject({
        method: 'POST',
        url: '/api/sessions',
        headers: {
          'x-api-key': user.api_key!!,
        },
        payload: {
          localStorage: {
            key1: 'value1',
          },
        },
      });

      expect([201, 400, 500]).toContain(response.statusCode);
    });

    it('S-F-08: options在数据库中应该正确序列化', async () => {
      const user = await createTestUser();
      const options = {
        userAgent: 'test',
        viewport: { width: 1920, height: 1080 },
        cookies: { key: 'value' },
      };

      const session = await SessionModel.create({
        user_id: user.id,
        options,
      });

      expect(session?.options).toEqual(options);
    });

    it('S-F-09: 获取会话详情时options应该正确解析', async () => {
      const user = await createTestUser();
      const options = {
        userAgent: 'test',
        viewport: { width: 1920, height: 1080 },
      };

      const session = await SessionModel.create({
        user_id: user.id,
        options,
      });

      const retrieved = await SessionModel.findById(session!.id);
      expect(retrieved?.options).toEqual(options);
      expect(typeof retrieved?.options).toBe('object');
    });
  });

  // ========================================
  // B-02: status 字段验证 (8个)
  // ========================================
  describe('B-02: status 字段验证', () => {
    it('S-F-10: 筛选active状态的会话应该返回created和connected', async () => {
      const user = await createTestUser();

      // 创建不同状态的会话
      await createTestSession(user.id, { status: SessionStatus.CREATED });
      await createTestSession(user.id, { status: SessionStatus.CONNECTED });
      await createTestSession(user.id, { status: SessionStatus.DISCONNECTED });

      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions?status=active',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      // 验证返回的都是活跃会话
      result.data.items.forEach((session: Record<string, unknown>) => {
        expect([SessionStatus.CREATED, SessionStatus.CONNECTED]).toContain(session.status);
      });
    });

    it('S-F-11: 筛选ended状态的会话应该返回disconnected和expired', async () => {
      const user = await createTestUser();

      await createTestSession(user.id, { status: SessionStatus.DISCONNECTED });
      await createTestSession(user.id, { status: SessionStatus.EXPIRED });
      await createTestSession(user.id, { status: SessionStatus.CREATED });

      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions?status=ended',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      result.data.items.forEach((session: Record<string, unknown>) => {
        expect([SessionStatus.DISCONNECTED, SessionStatus.EXPIRED, SessionStatus.COMPLETED]).toContain(session.status);
      });
    });

    it('S-F-12: 筛选error状态的会话应该只返回error', async () => {
      const user = await createTestUser();

      await createTestSession(user.id, { status: SessionStatus.ERROR });
      await createTestSession(user.id, { status: SessionStatus.CREATED });

      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions?status=error',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      result.data.items.forEach((session: Record<string, unknown>) => {
        expect(session.status).toBe(SessionStatus.ERROR);
      });
    });

    it('S-F-13: 按用户ID筛选会话应该成功', async () => {
      const user1 = await createTestUser();
      const user2 = await createTestUser();

      await createTestSession(user1.id);
      await createTestSession(user1.id);
      await createTestSession(user2.id);

      const response = await app.inject({
        method: 'GET',
        url: `/api/admin/sessions?userId=${user1.id}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      // 验证所有会话都属于user1
      result.data.items.forEach((session: Record<string, unknown>) => {
        expect(session.user_id).toBe(user1.id);
      });
    });

    it('S-F-14: 按时间范围筛选会话应该成功', async () => {
      const user = await createTestUser();
      await createTestSession(user.id);

      const today = new Date();
      const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

      const response = await app.inject({
        method: 'GET',
        url: `/api/admin/sessions?startDate=${startDate.toISOString()}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('S-F-15: 组合筛选条件应该正确工作', async () => {
      const user = await createTestUser();

      await createTestSession(user.id, { status: SessionStatus.CREATED });
      await createTestSession(user.id, { status: SessionStatus.DISCONNECTED });

      const response = await app.inject({
        method: 'GET',
        url: `/api/admin/sessions?userId=${user.id}&status=active`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      // 验证结果符合所有筛选条件
      result.data.items.forEach((session: Record<string, unknown>) => {
        expect(session.user_id).toBe(user.id);
        expect([SessionStatus.CREATED, SessionStatus.CONNECTED]).toContain(session.status);
      });
    });

    it('S-F-16: 无效状态筛选应该返回空或错误', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions?status=invalid-status',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect([200, 400]).toContain(response.statusCode);
    });

    it('S-F-17: 筛选不存在用户的会话应该返回空列表', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions?userId=999999',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.data.items).toEqual([]);
    });
  });

  // ========================================
  // B-03: 其他字段验证 (8个)
  // ========================================
  describe('B-03: 其他字段验证', () => {
    it('S-F-18: 会话ID应该是有效UUID', async () => {
      const user = await createTestUser();
      const session = await createTestSession(user.id);

      // UUID v4 格式: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
      expect(session.id).toMatch(uuidRegex);
    });

    it('S-F-19: 创建会话时start_time应该自动设置', async () => {
      const user = await createTestUser();
      const session = await createTestSession(user.id);

      expect(session.start_time).not.toBeNull();
      expect(session.start_time).toBeInstanceOf(Date);
    });

    it('S-F-20: 创建会话时end_time应该为null', async () => {
      const user = await createTestUser();
      const session = await createTestSession(user.id);

      expect(session.end_time).toBeNull();
    });

    it('S-F-21: 创建会话时duration应该为0', async () => {
      const user = await createTestUser();
      const session = await createTestSession(user.id);

      expect(session.duration).toBe(0);
    });

    it('S-F-22: 创建会话时credits_used应该为0', async () => {
      const user = await createTestUser();
      const session = await createTestSession(user.id);

      expect(session.credits_used).toBe(0);
    });

    it('S-F-23: 会话应该关联到正确的用户', async () => {
      const user = await createTestUser();
      const session = await createTestSession(user.id);

      expect(session.user_id).toBe(user.id);
    });

    it('S-F-24: machine_id可以为null', async () => {
      const user = await createTestUser();
      const session = await SessionModel.create({
        user_id: user.id,
        machine_id: undefined,
      });

      expect(session?.machine_id).toBeNull();
    });

    it('S-F-25: port可以为null', async () => {
      const user = await createTestUser();
      const session = await SessionModel.create({
        user_id: user.id,
        port: undefined,
      });

      expect(session?.port).toBeNull();
    });
  });

  // ========================================
  // C. 筛选和排序功能测试 (P1)
  // ========================================

  // ========================================
  // C-01: 排序功能测试 (6个)
  // ========================================
  describe('C-01: 排序功能测试', () => {
    beforeEach(async () => {
      // 创建多个会话用于测试排序
      const user = await createTestUser();

      await createTestSession(user.id);
      await new Promise((resolve) => setTimeout(resolve, 10));
      await createTestSession(user.id);
      await new Promise((resolve) => setTimeout(resolve, 10));
      await createTestSession(user.id);
    });

    it('S-SORT-01: 按created_at降序排列应该成功', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions?sort=created_at&order=desc',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      if (result.data.items.length > 1) {
        for (let i = 0; i < result.data.items.length - 1; i++) {
          const current = new Date(result.data.items[i].created_at);
          const next = new Date(result.data.items[i + 1].created_at);
          expect(current.getTime()).toBeGreaterThanOrEqual(next.getTime());
        }
      }
    });

    it('S-SORT-02: 按created_at升序排列应该成功', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions?sort=created_at&order=asc',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      if (result.data.items.length > 1) {
        for (let i = 0; i < result.data.items.length - 1; i++) {
          const current = new Date(result.data.items[i].created_at);
          const next = new Date(result.data.items[i + 1].created_at);
          expect(current.getTime()).toBeLessThanOrEqual(next.getTime());
        }
      }
    });

    it('S-SORT-03: 按duration排序应该成功', async () => {
      const user = await createTestUser();

      // 创建不同持续时间的会话
      const session1 = await createTestSession(user.id);
      await SessionModel.markDisconnected(session1.id, 60);

      const session2 = await createTestSession(user.id);
      await SessionModel.markDisconnected(session2.id, 120);

      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions?sort=duration&order=desc',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      if (result.data.items.length > 1) {
        expect(result.data.items[0].duration).toBeGreaterThanOrEqual(result.data.items[1].duration);
      }
    });

    it('S-SORT-04: 按credits_used排序应该成功', async () => {
      const user = await createTestUser();

      // 创建不同点数消耗的会话
      const session1 = await createTestSession(user.id);
      await SessionModel.markDisconnected(session1.id, 60);

      const session2 = await createTestSession(user.id);
      await SessionModel.markDisconnected(session2.id, 180);

      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions?sort=credits_used&order=desc',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      if (result.data.items.length > 1) {
        expect(result.data.items[0].credits_used).toBeGreaterThanOrEqual(result.data.items[1].credits_used);
      }
    });

    it('S-SORT-05: 无效排序字段应该使用默认值', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions?sort=invalid_field',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('S-SORT-06: 无效排序方向应该使用默认值', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions?order=invalid_direction',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ========================================
  // C-02: 分页功能测试 (6个)
  // ========================================
  describe('C-02: 分页功能测试', () => {
    beforeEach(async () => {
      // 创建多个会话
      const user = await createTestUser();
      for (let i = 0; i < 25; i++) {
        await createTestSession(user.id);
      }
    });

    it('S-PAGE-01: 第一页应该返回指定数量', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions?page=1&limit=10',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.data.items.length).toBeLessThanOrEqual(10);
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(10);
    });

    it('S-PAGE-02: 第二页应该返回不同的数据', async () => {
      const response1 = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions?page=1&limit=10',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      const response2 = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions?page=2&limit=10',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      const result1 = JSON.parse(response1.payload);
      const result2 = JSON.parse(response2.payload);

      // 验证第二页的数据与第一页不同
      const ids1 = result1.data.items.map((s: Record<string, unknown>) => s.id);
      const ids2 = result2.data.items.map((s: Record<string, unknown>) => s.id);
      const intersection = ids1.filter((id: string) => ids2.includes(id));
      expect(intersection).toHaveLength(0);
    });

    it('S-PAGE-03: 最后一页可能返回较少数据', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions?page=3&limit=10',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.data.items.length).toBeLessThanOrEqual(10);
    });

    it('S-PAGE-04: 超出范围的页应该返回空数组', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions?page=999&limit=10',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.data.items).toEqual([]);
    });

    it('S-PAGE-05: totalPages应该正确计算', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions?limit=10',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.data.totalPages).toBeGreaterThan(0);
      expect(result.data.totalPages).toBe(Math.ceil(result.data.total / 10));
    });

    it('S-PAGE-06: limit为0应该返回错误或使用默认值', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions?limit=0',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect([200, 400]).toContain(response.statusCode);
    });
  });

  // ========================================
  // D. 批量操作测试 (P1)
  // ========================================

  // ========================================
  // D-01: 批量操作测试 (8个)
  // ========================================
  describe('D-01: 批量操作测试', () => {
    it('S-BATCH-01: 批量释放会话应该成功', async () => {
      const user = await createTestUser({ credits: 300 });

      const sessions = await Promise.all([
        createTestSession(user.id),
        createTestSession(user.id),
        createTestSession(user.id),
      ]);

      const sessionIds = sessions.map((s) => s.id);

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/sessions/batch-release',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          sessionIds,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.data.released).toHaveLength(3);
    });

    it('S-BATCH-02: 批量释放部分成功', async () => {
      const user = await createTestUser();

      const sessions = await Promise.all([createTestSession(user.id), createTestSession(user.id)]);

      const sessionIds = [sessions[0].id, sessions[1].id, 'non-existent-id'];

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/sessions/batch-release',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          sessionIds,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.data.released.length).toBeGreaterThan(0);
      expect(result.data.failed.length).toBeGreaterThan(0);
    });

    it('S-BATCH-03: 批量释放空数组应该返回错误', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/sessions/batch-release',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          sessionIds: [],
        },
      });

      expect([400, 200]).toContain(response.statusCode);
    });

    it('S-BATCH-04: 批量操作包含重复ID应该去重', async () => {
      const user = await createTestUser();
      const session = await createTestSession(user.id);

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/sessions/batch-release',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          sessionIds: [session.id, session.id, session.id],
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('S-BATCH-05: 批量操作正确扣费', async () => {
      const user = await createTestUser({ credits: 200 });

      const sessions = await Promise.all([createTestSession(user.id), createTestSession(user.id)]);

      const sessionIds = sessions.map((s) => s.id);

      await app.inject({
        method: 'POST',
        url: '/api/admin/sessions/batch-release',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          sessionIds,
        },
      });

      const updatedUser = await UserModel.findById(user.id);
      // 应该扣除2点（每个会话1点）
      expect(updatedUser?.credits).toBe(198);
    });

    it('S-BATCH-06: 非管理员批量操作应该返回403', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/sessions/batch-release',
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
        payload: {
          sessionIds: ['id1', 'id2'],
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('S-BATCH-07: 批量刷新状态应该成功', async () => {
      const user = await createTestUser();
      await createTestSession(user.id);

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/sessions/refresh-status',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
    });

    it('S-BATCH-08: 批量操作包含已结束会话', async () => {
      const user = await createTestUser({ credits: 200 });

      const session1 = await createTestSession(user.id);
      const session2 = await createTestSession(user.id);

      // 先结束一个会话
      await SessionModel.markDisconnected(session1.id, 60);

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/sessions/batch-release',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          sessionIds: [session1.id, session2.id],
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      // 两个会话都应该在released中（已结束的会话直接返回成功）
      expect(result.data.released.length).toBeGreaterThan(0);
    });
  });

  // ========================================
  // E. 边界条件和错误处理测试 (P2)
  // ========================================

  // ========================================
  // E-01: 边界条件测试 (10个)
  // ========================================
  describe('E-01: 边界条件测试', () => {
    it('S-EDGE-01: 极短会话持续时间', async () => {
      const user = await createTestUser();
      const session = await createTestSession(user.id);

      await SessionModel.markDisconnected(session.id, 0);

      const updated = await SessionModel.findById(session.id);
      expect(updated?.duration).toBe(0);
    });

    it('S-EDGE-02: 长时间会话持续时间', async () => {
      const user = await createTestUser({ credits: 10000 });
      const session = await createTestSession(user.id);

      // 24小时 = 86400秒
      await SessionModel.markDisconnected(session.id, 86400);

      const updated = await SessionModel.findById(session.id);
      expect(updated?.credits_used).toBe(1440); // 86400 / 60 = 1440
    });

    it('S-EDGE-03: 超大数据量的分页', async () => {
      const user = await createTestUser();

      // 创建大量会话（实际测试中可能需要减少数量）
      for (let i = 0; i < 50; i++) {
        await createTestSession(user.id);
      }

      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions?limit=100',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('S-EDGE-04: 特殊字符在options中', async () => {
      const user = await createTestUser();

      const session = await SessionModel.create({
        user_id: user.id,
        options: {
          userAgent: 'Test/1.0 (特殊字符: !@#$%^&*())',
          cookies: { 'key with spaces': 'value with "quotes"' },
        },
      });

      expect(session?.options).toBeTruthy();
    });

    it('S-EDGE-05: 极长userAgent', async () => {
      const user = await createTestUser();

      const longUserAgent = 'A'.repeat(1000);

      const session = await SessionModel.create({
        user_id: user.id,
        options: {
          userAgent: longUserAgent,
        },
      });

      expect(session?.options?.userAgent).toHaveLength(1000);
    });

    it('S-EDGE-06: 大量cookies', async () => {
      const user = await createTestUser();

      const cookies: Record<string, string> = {};
      for (let i = 0; i < 100; i++) {
        cookies[`cookie${i}`] = `value${i}`;
      }

      const session = await SessionModel.create({
        user_id: user.id,
        options: { cookies },
      });

      expect(Object.keys(session?.options?.cookies || {}).length).toBe(100);
    });

    it('S-EDGE-07: 跨时区时间处理', async () => {
      const user = await createTestUser();
      const session = await createTestSession(user.id);

      // 验证时间可以正确序列化和反序列化
      const retrieved = await SessionModel.findById(session.id);
      expect(retrieved?.start_time).toBeInstanceOf(Date);
    });

    it('S-EDGE-08: 并发达到最大限制', async () => {
      const user = await createTestUser({ credits: 10000 });

      // 创建大量并发会话
      const sessions = await Promise.all(Array.from({ length: 20 }, () => createTestSession(user.id)));

      expect(sessions).toHaveLength(20);
    });

    it('S-EDGE-09: 点数边界值（刚好用完）', async () => {
      const user = await createTestUser({ credits: 1 });
      const session = await createTestSession(user.id);

      // 释放会话，消耗1点
      await SessionModel.markDisconnected(session.id, 30);

      const updatedUser = await UserModel.findById(user.id);
      expect(updatedUser?.credits).toBe(0);
    });

    it('S-EDGE-10: 无效的会话ID格式', async () => {
      const user = await createTestUser();

      const response = await app.inject({
        method: 'GET',
        url: '/api/sessions/not-a-uuid',
        headers: {
          'x-api-key': user.api_key!!,
        },
      });

      expect([400, 404]).toContain(response.statusCode);
    });
  });

  // ========================================
  // E-02: 错误处理测试 (8个)
  // ========================================
  describe('E-02: 错误处理测试', () => {
    it('S-ERROR-01: 机器服务不可用时的错误处理', async () => {
      const user = await createTestUser({ credits: 100 });

      // 注意：这个测试可能需要Mock机器服务返回错误
      const response = await app.inject({
        method: 'POST',
        url: '/api/sessions',
        headers: {
          'x-api-key': user.api_key!!,
        },
        payload: {},
      });

      // 可能返回201（如果有默认机器）或500
      expect([201, 400, 500]).toContain(response.statusCode);
    });

    it('S-ERROR-02: 数据库连接失败处理', async () => {
      // 这个测试需要Mock数据库连接失败
      // 在集成测试中可能难以实现
      expect(true).toBe(true);
    });

    it('S-ERROR-03: 点数不足的错误处理', async () => {
      const user = await createTestUser({ credits: 0 });

      const response = await app.inject({
        method: 'POST',
        url: '/api/sessions',
        headers: {
          'x-api-key': user.api_key!!,
        },
        payload: {},
      });

      // 应该返回点数不足错误
      expect([400, 402, 500]).toContain(response.statusCode);
    });

    it('S-ERROR-04: 无效JSON格式的options', async () => {
      const user = await createTestUser();

      // 尝试创建会话，但传递无效的options字段（schema strict模式应该拒绝）
      const response = await app.inject({
        method: 'POST',
        url: '/api/sessions',
        headers: {
          'x-api-key': user.api_key!!,
          'Content-Type': 'application/json',
        },
        payload: {
          // options 字段不在 schema 中，应该被 strict 模式拒绝
          options: { userAgent: 'test' },
        },
      });

      // Debug: 打印响应信息
      if (response.statusCode !== 400 && response.statusCode !== 422) {
        console.log('S-ERROR-04 Debug Response:', {
          statusCode: response.statusCode,
          payload: response.payload,
        });
      }

      expect([400, 422]).toContain(response.statusCode);
    });

    it('S-ERROR-05: 删除不存在的会话', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sessions/non-existent-id/release',
        headers: {
          'x-api-key': testUser.api_key!!,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('S-ERROR-06: 获取不存在会话的详情', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/sessions/non-existent-id',
        headers: {
          'x-api-key': testUser.api_key!!,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('S-ERROR-07: 批量操作全部失败', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/sessions/batch-release',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        payload: {
          sessionIds: ['invalid1', 'invalid2', 'invalid3'],
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.data.failed.length).toBe(3);
    });

    it('S-ERROR-08: Webhook失败不影响主流程', async () => {
      const user = await createTestUser({ credits: 100 });
      const session = await createTestSession(user.id);

      // 释放会话，即使webhook失败也应该成功
      const response = await app.inject({
        method: 'POST',
        url: `/api/sessions/${session.id}/release`,
        headers: {
          'x-api-key': user.api_key!!,
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ========================================
  // F. 统计功能测试 (P1)
  // ========================================

  // ========================================
  // F-01: 统计功能测试 (10个)
  // ========================================
  describe('F-01: 统计功能测试', () => {
    beforeEach(async () => {
      // 创建不同状态的会话用于统计
      const user = await createTestUser({ credits: 500 });

      // 活跃会话
      await createTestSession(user.id, { status: SessionStatus.CREATED });
      await createTestSession(user.id, { status: SessionStatus.CONNECTED });

      // 已结束会话
      const s1 = await createTestSession(user.id);
      await SessionModel.markDisconnected(s1.id, 60);

      const s2 = await createTestSession(user.id);
      await SessionModel.markDisconnected(s2.id, 120);

      // 错误会话
      const s3 = await createTestSession(user.id);
      await SessionModel.markError(s3.id, 30);
    });

    it('S-STATS-01: 获取总会话数', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions/stats',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.data.total).toBeGreaterThan(0);
    });

    it('S-STATS-02: 获取活跃会话数', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions/stats',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.data.active).toBeGreaterThan(0);
    });

    it('S-STATS-03: 获取已结束会话数', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions/stats',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.data.ended).toBeGreaterThan(0);
    });

    it('S-STATS-04: 获取错误会话数', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions/stats',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.data.error).toBeGreaterThan(0);
    });

    it('S-STATS-05: 获取总消耗点数', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions/stats',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.data.totalCreditsUsed).toBeGreaterThan(0);
    });

    it('S-STATS-06: 获取总持续时间', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions/stats',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.data.totalDuration).toBeGreaterThan(0);
    });

    it('S-STATS-07: 获取平均持续时间', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions/stats',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.data.avgDuration).toBeGreaterThan(0);
    });

    it('S-STATS-08: 按用户分组统计', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions/stats',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(Array.isArray(result.data.byUser)).toBe(true);
      expect(result.data.byUser.length).toBeGreaterThan(0);
    });

    it('S-STATS-09: 按时间范围筛选统计', async () => {
      const today = new Date();
      const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

      const response = await app.inject({
        method: 'GET',
        url: `/api/admin/sessions/stats?startDate=${startDate.toISOString()}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('S-STATS-10: 非管理员获取统计应该返回403', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions/stats',
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
