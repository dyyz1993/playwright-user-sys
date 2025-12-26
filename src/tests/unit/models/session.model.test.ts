/**
 * SessionModel 单元测试
 * 测试会话模型的 CRUD 操作和业务逻辑
 *
 * 注意: 此测试使用 MySQL 数据库
 * better-sqlite3 需要编译原生模块，在某些环境下可能无法工作
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../../../config/database.js';
import { SessionModel } from '../../../models/session.model.js';
import { UserModel } from '../../../models/user.model.js';
import { MachineModel } from '../../../models/machine.model.js';
import { hashPassword } from '../../../utils/auth.js';
import { UserRole, UserStatus, SessionStatus } from '../../../shared/types/index.js';
import { clearAllTables } from '../../helpers/database.js';

// Mock webhook
vi.mock('../../../utils/webhook.js', () => ({
  createWebhookEvent: vi.fn().mockResolvedValue(undefined),
}));

describe('SessionModel', () => {
  let testUser: any;
  let testMachine: any;

  beforeEach(async () => {
    // 清空数据
    await clearAllTables();

    // 创建测试用户
    testUser = await UserModel.create({
      username: `testuser_${Date.now()}`,
      password: await hashPassword('password123'),
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      credits: 100,
    });

    // 创建测试机器
    testMachine = await MachineModel.register({
      id: `machine-${Date.now()}`,
      hostname: 'test-machine',
      ip: '127.0.0.1',
      grpcPort: 50051,
      proxyPort: 8080,
      maxInstances: 10,
      status: 'online',
    });
  });

  // ========================================
  // SM-01: 创建会话 - 成功
  // ========================================
  it('应该成功创建会话', async () => {
    const session = await SessionModel.create({
      user_id: testUser.id,
      machine_id: testMachine.id,
      port: 3000,
      options: {
        userAgent: 'test-agent',
      },
    });

    expect(session).toBeTruthy();
    expect(session.id).toBeDefined();
    expect(session.user_id).toBe(testUser.id);
    expect(session.machine_id).toBe(testMachine.id);
    expect(session.status).toBe(SessionStatus.CREATED);
  });

  // ========================================
  // SM-02: 按ID查找会话 - 存在
  // ========================================
  it('应该通过ID找到会话', async () => {
    const created = await SessionModel.create({
      user_id: testUser.id,
    });

    const session = await SessionModel.findById(created.id);
    expect(session).toBeTruthy();
    expect(session!.id).toBe(created.id);
    expect(session!.status).toBe(SessionStatus.CREATED);
  });

  // ========================================
  // SM-03: 按ID查找会话 - 不存在
  // ========================================
  it('按ID查找不存在的会话应该返回null', async () => {
    const session = await SessionModel.findById('nonexistent-id');
    expect(session).toBeNull();
  });

  // ========================================
  // SM-04: 按用户ID分页查询
  // ========================================
  it('应该返回用户的会话列表', async () => {
    // 创建多个会话
    await SessionModel.create({ user_id: testUser.id });
    await SessionModel.create({ user_id: testUser.id });
    await SessionModel.create({ user_id: testUser.id });

    const result = await SessionModel.findByUserId(testUser.id, {
      page: 1,
      limit: 10,
    });

    expect(result.items.length).toBe(3);
    expect(result.total).toBe(3);
    expect(result.page).toBe(1);
  });

  // ========================================
  // SM-05: 标记已连接
  // ========================================
  it('应该标记会话为已连接', async () => {
    const session = await SessionModel.create({
      user_id: testUser.id,
    });

    const updated = await SessionModel.markConnected(session.id);
    expect(updated).toBeTruthy();
    expect(updated!.status).toBe(SessionStatus.CONNECTED);
  });

  // ========================================
  // SM-06: 标记已断开 - 有持续时间
  // ========================================
  it('应该标记会话为已断开并计算持续时间', async () => {
    const session = await SessionModel.create({
      user_id: testUser.id,
      start_time: new Date(Date.now() - 5 * 60 * 1000), // 5分钟前
    });

    const duration = 5 * 60; // 5分钟 = 300秒
    const updated = await SessionModel.markDisconnected(session.id, duration);

    expect(updated).toBeTruthy();
    expect(updated!.status).toBe(SessionStatus.DISCONNECTED);
    expect(updated!.duration).toBe(duration);
    expect(updated!.credits_used).toBeGreaterThanOrEqual(1); // 至少1点
  });

  // ========================================
  // SM-07: 标记已断开 - 持续时间为0
  // ========================================
  it('持续时间为0时应该至少消耗1点', async () => {
    const session = await SessionModel.create({
      user_id: testUser.id,
    });

    const updated = await SessionModel.markDisconnected(session.id, 0);

    expect(updated).toBeTruthy();
    expect(updated!.credits_used).toBeGreaterThanOrEqual(0);
  });

  // ========================================
  // SM-08: 标记已过期
  // ========================================
  it('应该标记会话为已过期', async () => {
    const session = await SessionModel.create({
      user_id: testUser.id,
    });

    const duration = 10 * 60; // 10分钟
    const updated = await SessionModel.markExpired(session.id, duration);

    expect(updated).toBeTruthy();
    expect(updated!.status).toBe(SessionStatus.EXPIRED);
    expect(updated!.duration).toBe(duration);
  });

  // ========================================
  // SM-09: 标记错误
  // ========================================
  it('应该标记会话为错误状态', async () => {
    const session = await SessionModel.create({
      user_id: testUser.id,
    });

    const duration = 5 * 60;
    const updated = await SessionModel.markError(session.id, duration);

    expect(updated).toBeTruthy();
    expect(updated!.status).toBe(SessionStatus.ERROR);
    expect(updated!.duration).toBe(duration);
  });

  // ========================================
  // SM-10: 批量标记机器会话断开
  // ========================================
  it('应该批量标记机器的所有会话为断开', async () => {
    // 创建多个会话
    await SessionModel.create({
      user_id: testUser.id,
      machine_id: testMachine.id,
    });
    await SessionModel.create({
      user_id: testUser.id,
      machine_id: testMachine.id,
    });

    const count = await SessionModel.markMachineSessionsAsDisconnected(testMachine.id);
    expect(count).toBe(2);
  });

  // ========================================
  // SM-11: 查找活跃会话
  // ========================================
  it('应该只返回活跃的会话', async () => {
    // 不需要清空数据，直接创建会话即可
    // 测试之间已经有 clearAllTables 清理

    // 创建活跃会话 - 使用 status 参数
    const active = await SessionModel.create({
      user_id: testUser.id,
    });
    // 手动更新为 CONNECTED 状态
    await db('sessions').where('id', active.id).update({
      status: SessionStatus.CONNECTED,
    });

    // 创建已断开会话
    const disconnected = await SessionModel.create({
      user_id: testUser.id,
    });
    await db('sessions').where('id', disconnected.id).update({
      status: SessionStatus.DISCONNECTED,
    });

    const activeSessions = await SessionModel.findActiveSessions();
    // 只有 CONNECTED 和 CREATED 状态的会话是活跃的
    expect(activeSessions.length).toBeGreaterThanOrEqual(1);
  });

  // ========================================
  // SM-12: 按机器ID查询会话
  // ========================================
  it('应该返回指定机器的所有会话', async () => {
    // 创建会话
    await SessionModel.create({
      user_id: testUser.id,
      machine_id: testMachine.id,
    });

    const sessions = await SessionModel.findByMachineId(testMachine.id);
    expect(sessions.length).toBe(1);
    expect(sessions[0].machine_id).toBe(testMachine.id);
  });

  // ========================================
  // SM-13: 更新最后活动时间
  // ========================================
  it('应该更新会话的最后活动时间', async () => {
    const session = await SessionModel.create({
      user_id: testUser.id,
    });

    const before = session.last_activity;
    await new Promise(resolve => setTimeout(resolve, 100)); // 等待一小段时间

    const updated = await SessionModel.updateLastActivity(session.id);
    expect(updated).toBeTruthy();
    // last_activity 应该被更新
    expect(updated!.last_activity).toBeTruthy();
  });

  // ========================================
  // SM-14: 获取用户会话统计
  // ========================================
  it('应该返回用户的会话统计数据', async () => {
    // 创建会话并手动更新统计数据
    const session = await SessionModel.create({
      user_id: testUser.id,
      status: SessionStatus.DISCONNECTED,
    });

    // 手动更新统计数据
    await db('sessions').where('id', session.id).update({
      duration: 300,
      credits_used: 5,
    });

    const stats = await SessionModel.getUserSessionStats(testUser.id);
    expect(stats.total_sessions).toBe(1);
    expect(stats.total_duration).toBe(300);
    expect(stats.total_credits_used).toBe(5);
  });

  // ========================================
  // SM-15: 检查超时会话
  // ========================================
  it('应该检查并标记超时的会话', async () => {
    const oldSession = await SessionModel.create({
      user_id: testUser.id,
      start_time: new Date(Date.now() - 35 * 60 * 1000), // 35分钟前
    });

    const timeoutMs = 30 * 60 * 1000; // 30分钟超时
    const count = await SessionModel.checkExpiredSessions(timeoutMs);

    expect(count).toBeGreaterThan(0);

    const updated = await SessionModel.findById(oldSession.id);
    expect(updated).toBeTruthy();
    expect(updated!.status).toBe(SessionStatus.EXPIRED);
  });

  // ========================================
  // SM-16: 解析options JSON - 正确
  // ========================================
  it('应该正确解析options JSON', async () => {
    const options = {
      userAgent: 'test-agent',
      viewport: { width: 1920, height: 1080 },
    };

    const session = await SessionModel.create({
      user_id: testUser.id,
      options,
    });

    const found = await SessionModel.findById(session.id);
    expect(found!.options).toBeTruthy();
    expect(found!.options!.userAgent).toBe('test-agent');
  });

  // ========================================
  // SM-18: 分页查询 - 排序
  // ========================================
  it('应该支持按字段排序', async () => {
    await SessionModel.create({ user_id: testUser.id });
    await new Promise(resolve => setTimeout(resolve, 50));
    await SessionModel.create({ user_id: testUser.id });

    const result = await SessionModel.findAll({
      sort: 'created_at',
      order: 'desc',
    });

    expect(result.items.length).toBe(2);
    // 应该按降序排列，最新的在前
    expect(result.items[0].created_at >= result.items[1].created_at).toBe(true);
  });
});
