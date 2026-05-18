/**
 * 会话生命周期集成测试
 * 测试会话从创建到销毁的完整生命周期
 *
 * INT-LIFECYCLE-001: 创建会话
 * INT-LIFECYCLE-002: 会话连接
 * INT-LIFECYCLE-003: 会话断开
 * INT-LIFECYCLE-004: 会话过期
 * INT-LIFECYCLE-005: 会话错误处理
 * INT-LIFECYCLE-006: 会话完成
 * INT-LIFECYCLE-007: 会话活动时间更新
 * INT-LIFECYCLE-008: 会话选项持久化
 * INT-LIFECYCLE-009: 会话查询和过滤
 * INT-LIFECYCLE-010: 会话统计
 * INT-LIFECYCLE-011: 用户会话列表
 * INT-LIFECYCLE-012: 机器会话列表
 * INT-LIFECYCLE-013: 活跃会话监控
 * INT-LIFECYCLE-014: 会话详情
 * INT-LIFECYCLE-015: 会话清理
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

describe('会话生命周期集成测试', () => {
  let testUser: any;
  let testMachine: any;
  let SessionModel: any;
  let SessionStatus: any;
  let createTestUser: any;
  let createTestMachine: any;
  let clearTables: any;
  let getFreePort: any;
  let db: any;
  let initDatabase: any;
  let runMigrations: any;

  beforeAll(async () => {
    // Dynamic imports to avoid premature dependency loading
    const sessionModule = await import('../../src/models/session/index.js');
    SessionModel = sessionModule.SessionModel;

    const typesModule = await import('../../src/shared/types/index.js');
    SessionStatus = typesModule.SessionStatus;

    const factoriesModule = await import('../helpers/factories.js');
    createTestUser = factoriesModule.createTestUser;
    createTestMachine = factoriesModule.createTestMachine;

    const databaseHelperModule = await import('../helpers/database.js');
    clearTables = databaseHelperModule.clearTables;

    const portsModule = await import('../helpers/ports.js');
    getFreePort = portsModule.getFreePort;

    const configModule = await import('../../src/config/database.js');
    db = configModule.db;
    initDatabase = configModule.initDatabase;

    const migrationsModule = await import('../../src/models/migrations.js');
    runMigrations = migrationsModule.runMigrations;

    // 初始化数据库连接和迁移
    await initDatabase();
    await runMigrations();

    // 清理数据库
    await clearTables('sessions', 'users', 'machines');

    // 创建测试用户
    testUser = await createTestUser({ credits: 100 });

    // 创建测试机器
    testMachine = await createTestMachine();
  });

  afterAll(async () => {
    // 清理数据库
    await clearTables('sessions', 'users', 'machines');
  });

  beforeEach(async () => {
    // 每个测试前清理会话表
    await clearTables('sessions');
  });

  /**
   * INT-LIFECYCLE-001: 创建会话
   * 测试能够成功创建会话并设置正确的初始状态
   */
  it('INT-LIFECYCLE-001: 应该能成功创建会话', async () => {
    const session = await SessionModel.create({
      user_id: testUser.id,
      machine_id: testMachine.id,
      port: await getFreePort(),
    });

    expect(session).toHaveProperty('id');
    expect(session).toHaveProperty('user_id', testUser.id);
    expect(session).toHaveProperty('machine_id', testMachine.id);
    expect(session).toHaveProperty('status', SessionStatus.CREATED);
    expect(session).toHaveProperty('start_time');
    expect(session.start_time).toBeTruthy();
    expect(session.end_time).toBeNull();
  });

  /**
   * INT-LIFECYCLE-002: 会话连接
   * 测试能够将会话标记为已连接状态
   */
  it('INT-LIFECYCLE-002: 应该能将会话标记为已连接', async () => {
    const session = await SessionModel.create({
      user_id: testUser.id,
      machine_id: testMachine.id,
      port: await getFreePort(),
    });

    const connectedSession = await SessionModel.markConnected(session!.id);

    expect(connectedSession).toBeTruthy();
    expect(connectedSession).toHaveProperty('status', SessionStatus.CONNECTED);
  });

  /**
   * INT-LIFECYCLE-003: 会话断开
   * 测试能够将会话标记为已断开状态并计算时长和积分
   */
  it('INT-LIFECYCLE-003: 应该能将会话标记为已断开', async () => {
    const session = await SessionModel.create({
      user_id: testUser.id,
      machine_id: testMachine.id,
      port: await getFreePort(),
    });

    await SessionModel.markConnected(session!.id);

    // 等待一段时间
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const disconnectedSession = await SessionModel.markDisconnected(session!.id, 0);

    expect(disconnectedSession).toBeTruthy();
    expect(disconnectedSession).toHaveProperty('status', SessionStatus.DISCONNECTED);
    expect(disconnectedSession).toHaveProperty('end_time');
    expect(disconnectedSession.end_time).toBeTruthy();
    expect(disconnectedSession?.duration).toBeGreaterThanOrEqual(1);
    expect(disconnectedSession?.credits_used).toBeGreaterThanOrEqual(1);
  });

  /**
   * INT-LIFECYCLE-004: 会话过期
   * 测试能够将超时的会话标记为过期状态
   */
  it('INT-LIFECYCLE-004: 应该能将会话标记为过期', async () => {
    const session = await SessionModel.create({
      user_id: testUser.id,
      machine_id: testMachine.id,
      port: await getFreePort(),
    });

    await SessionModel.markConnected(session!.id);

    // 等待一段时间
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const expiredSession = await SessionModel.markExpired(session!.id, 120);

    expect(expiredSession).toBeTruthy();
    expect(expiredSession).toHaveProperty('status', SessionStatus.EXPIRED);
    expect(expiredSession).toHaveProperty('end_time');
    expect(expiredSession.end_time).toBeTruthy();
    expect(expiredSession?.duration).toBe(120);
    expect(expiredSession?.credits_used).toBe(2); // 120 秒 = 2 分钟
  });

  /**
   * INT-LIFECYCLE-005: 会话错误处理
   * 测试能够将出错的会话标记为错误状态
   */
  it('INT-LIFECYCLE-005: 应该能将会话标记为错误', async () => {
    const session = await SessionModel.create({
      user_id: testUser.id,
      machine_id: testMachine.id,
      port: await getFreePort(),
    });

    await SessionModel.markConnected(session!.id);

    // 等待一段时间
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const errorSession = await SessionModel.markError(session!.id, 60);

    expect(errorSession).toBeTruthy();
    expect(errorSession).toHaveProperty('status', SessionStatus.ERROR);
    expect(errorSession).toHaveProperty('end_time');
    expect(errorSession.end_time).toBeTruthy();
    expect(errorSession?.duration).toBe(60);
    expect(errorSession?.credits_used).toBe(1); // 60 秒 = 1 分钟
  });

  /**
   * INT-LIFECYCLE-006: 会话完成
   * 测试能够正常完成会话（相当于断开）
   */
  it('INT-LIFECYCLE-006: 应该能正常完成会话', async () => {
    const session = await SessionModel.create({
      user_id: testUser.id,
      machine_id: testMachine.id,
      port: await getFreePort(),
    });

    await SessionModel.markConnected(session!.id);

    // 等待一段时间
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 使用断开来表示完成
    const completedSession = await SessionModel.markDisconnected(session!.id, 0);

    expect(completedSession).toBeTruthy();
    expect(completedSession).toHaveProperty('status', SessionStatus.DISCONNECTED);
    expect(completedSession).toHaveProperty('end_time');
    expect(completedSession.end_time).toBeTruthy();
  });

  /**
   * INT-LIFECYCLE-007: 会话活动时间更新
   * 测试能够更新会话的最后活动时间
   */
  it('INT-LIFECYCLE-007: 应该能更新会话活动时间', async () => {
    const session = await SessionModel.create({
      user_id: testUser.id,
      machine_id: testMachine.id,
      port: await getFreePort(),
    });

    // 等待一段时间
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const updatedSession = await SessionModel.updateLastActivity(session!.id);

    expect(updatedSession).toBeTruthy();
    expect(updatedSession).toHaveProperty('last_activity');
    expect(updatedSession.last_activity).toBeTruthy();

    // 验证最后活动时间在会话创建之后
    const lastActivity = new Date(updatedSession!.last_activity!);
    const startTime = new Date(session!.start_time);
    expect(lastActivity.getTime()).toBeGreaterThanOrEqual(startTime.getTime());
  });

  /**
   * INT-LIFECYCLE-008: 会话选项持久化
   * 测试能够正确保存和恢复会话选项
   */
  it('INT-LIFECYCLE-008: 应该能正确保存和恢复会话选项', async () => {
    const options = {
      userAgent: 'test-agent',
      viewport: { width: 1920, height: 1080 },
      proxy: 'http://proxy.example.com:8080',
      cookies: { session: 'test-session' },
      localStorage: { theme: 'dark' },
    };

    const session = await SessionModel.create({
      user_id: testUser.id,
      machine_id: testMachine.id,
      port: await getFreePort(),
      options,
    });

    expect(session).toBeTruthy();
    expect(session).toHaveProperty('options');
    expect(session?.options).toEqual(options);

    // 从数据库读取并验证选项
    const retrievedSession = await SessionModel.findById(session!.id);
    expect(retrievedSession?.options).toEqual(options);
  });

  /**
   * INT-LIFECYCLE-009: 会话查询和过滤
   * 测试能够正确查询和过滤会话
   */
  it('INT-LIFECYCLE-009: 应该能正确查询和过滤会话', async () => {
    // 创建多个会话
    const sessions: any[] = [];
    for (let i = 0; i < 5; i++) {
      const session = await SessionModel.create({
        user_id: testUser.id,
        machine_id: testMachine.id,
        port: await getFreePort(),
      });
      sessions.push(session);

      // 标记前 2 个会话为已断开 (索引 0 和 1)
      if (i < 2) {
        await SessionModel.markDisconnected(session.id, 60);
      }
    }

    // 查询所有会话
    const allSessions = await SessionModel.findAll();
    expect(allSessions.items.length).toBe(5);

    // 查询活跃会话 (索引 2, 3, 4 未断开)
    const activeSessions = await SessionModel.findActiveSessions();
    expect(activeSessions.length).toBe(3);

    // 分页查询
    const paginatedSessions = await SessionModel.paginate(1, 2);
    expect(paginatedSessions.items.length).toBe(2);
    expect(paginatedSessions.total).toBe(5);
  });

  /**
   * INT-LIFECYCLE-010: 会话统计
   * 测试能够获取准确的会话统计数据
   */
  it('INT-LIFECYCLE-010: 应该能获取准确的会话统计', async () => {
    // 创建多个会话
    const sessions: any[] = [];
    for (let i = 0; i < 5; i++) {
      const session = await SessionModel.create({
        user_id: testUser.id,
        machine_id: testMachine.id,
        port: await getFreePort(),
      });
      sessions.push(session);

      if (i < 3) {
        await SessionModel.markConnected(session.id);
        await SessionModel.markDisconnected(session.id, 60 * (i + 1));
      }
    }

    // 获取用户会话统计
    const stats = await SessionModel.getUserSessionStats(testUser.id);

    expect(stats.total_sessions).toBe(5);
    expect(stats.total_duration).toBeGreaterThanOrEqual(60); // At least 60 seconds (1 minute * 1)
    expect(stats.total_credits_used).toBeGreaterThanOrEqual(1); // At least 1 credit
  });

  /**
   * INT-LIFECYCLE-011: 用户会话列表
   * 测试能够获取特定用户的所有会话
   */
  it('INT-LIFECYCLE-011: 应该能获取用户的所有会话', async () => {
    // 创建多个会话
    for (let i = 0; i < 3; i++) {
      await SessionModel.create({
        user_id: testUser.id,
        machine_id: testMachine.id,
        port: await getFreePort(),
      });
    }

    // 获取用户的所有会话
    const userSessions = await SessionModel.findByUserId(testUser.id);
    expect(userSessions.items.length).toBe(3);

    // 分页查询
    const page1 = await SessionModel.findByUserId(testUser.id, { page: 1, limit: 2 });
    expect(page1.items.length).toBe(2);
    expect(page1.total).toBe(3);
  });

  /**
   * INT-LIFECYCLE-012: 机器会话列表
   * 测试能够获取特定机器上的所有会话
   */
  it('INT-LIFECYCLE-012: 应该能获取机器上的所有会话', async () => {
    // 创建多个会话
    for (let i = 0; i < 3; i++) {
      const session = await SessionModel.create({
        user_id: testUser.id,
        machine_id: testMachine.id,
        port: await getFreePort(),
      });
      await SessionModel.markConnected(session.id);
    }

    // 获取机器上的活跃会话
    const machineSessions = await SessionModel.findActiveSessionsByMachineId(testMachine.id);
    expect(machineSessions.length).toBe(3);

    // 获取机器上的所有会话
    const allMachineSessions = await SessionModel.findByMachineId(testMachine.id);
    expect(allMachineSessions.length).toBe(3);
  });

  /**
   * INT-LIFECYCLE-013: 活跃会话监控
   * 测试能够监控和统计活跃会话
   */
  it('INT-LIFECYCLE-013: 应该能监控活跃会话', async () => {
    // 创建活跃会话
    const activeSessionIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const session = await SessionModel.create({
        user_id: testUser.id,
        machine_id: testMachine.id,
        port: await getFreePort(),
      });
      await SessionModel.markConnected(session.id);
      activeSessionIds.push(session.id);
    }

    // 创建已断开会话
    const disconnectedSession = await SessionModel.create({
      user_id: testUser.id,
      machine_id: testMachine.id,
      port: await getFreePort(),
    });
    await SessionModel.markDisconnected(disconnectedSession.id, 60);

    // 统计活跃会话
    const activeCount = await SessionModel.countActiveSessions();
    expect(activeCount).toBe(3);

    // 获取所有活跃会话
    const activeSessions = await SessionModel.findActiveSessions();
    expect(activeSessions.length).toBe(3);
  });

  /**
   * INT-LIFECYCLE-014: 会话详情
   * 测试能够获取包含用户和机器信息的会话详情
   */
  it('INT-LIFECYCLE-014: 应该能获取会话详情', async () => {
    const session = await SessionModel.create({
      user_id: testUser.id,
      machine_id: testMachine.id,
      port: await getFreePort(),
    });

    // 获取会话详情
    const detail = await SessionModel.getDetailById(session!.id);

    expect(detail).toBeTruthy();
    expect(detail).toHaveProperty('id', session!.id);
    expect(detail).toHaveProperty('username', testUser.username);
    // machine_name 实际是 machines.hostname，不是 machines.name
    expect(detail).toHaveProperty('machine_name', testMachine.hostname);
  });

  /**
   * INT-LIFECYCLE-015: 会话清理
   * 测试能够清理超时会话
   */
  it('INT-LIFECYCLE-015: 应该能清理超时会话', { timeout: 70000 }, async () => {
    // 创建会话
    const session = await SessionModel.create({
      user_id: testUser.id,
      machine_id: testMachine.id,
      port: await getFreePort(),
    });

    await SessionModel.markConnected(session!.id);

    // 手动设置会话开始时间为过去（模拟超时）
    const pastTime = new Date(Date.now() - 3600000); // 1 小时前
    await db('sessions').where({ id: session!.id }).update({ start_time: pastTime });

    // 检查并标记超时会话（超时时间设置为 30 分钟）
    const expiredCount = await SessionModel.checkExpiredSessions(1800000);

    expect(expiredCount).toBeGreaterThanOrEqual(1);

    // 验证会话已被标记为过期
    const expiredSession = await SessionModel.findById(session!.id);
    expect(expiredSession).toHaveProperty('status', SessionStatus.EXPIRED);
  });
});
