import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { initDatabase } from '../../config/database.js';
import { UserModel } from '../../models/user.model.js';
import { SessionModel } from '../../models/session/index.js';
import { SessionStatus } from '@shared/types/index.js';
import { checkSessionCredits } from '../../services/credits-monitor.service.js';

vi.mock('../../services/machine-grpc/index.js', () => ({
  connectionManager: {
    getActiveConnections: vi.fn().mockReturnValue(['test-machine-1']),
    closeBrowser: vi.fn().mockResolvedValue(true),
    sendCloseBrowserCommand: vi.fn(),
  },
}));

vi.mock('../../utils/webhook.js', () => ({
  createWebhookEvent: vi.fn().mockResolvedValue(undefined),
  WebhookEventType: {
    CREDITS_DEPLETED: 'credits_depleted',
    CREDITS_LOW: 'credits_low',
  },
}));

describe('点数监控服务集成测试', () => {
  let testUser: ReturnType<typeof vi.fn>;
  const testMachineId = 'test-machine-1';

  beforeAll(async () => {
    await initDatabase();

    const username = `test_user_${Date.now()}`;

    testUser = await UserModel.create({
      username,
      password: 'password123',
      email: `${username}@example.com`,
      credits: 10,
    });

    expect(testUser).toBeTruthy();
    expect(testUser.credits).toBe(10);
  });

  afterAll(async () => {
    // 清理完成
  });

  it('应该正确计算并扣除新增的点数', async () => {
    // 创建会话
    const session = await SessionModel.create({
      user_id: testUser.id,
      machine_id: testMachineId,
    });

    expect(session).toBeTruthy();
    if (!session) return;

    // 模拟会话开始（3分钟前）
    const startTime = new Date(Date.now() - 180 * 1000);
    await SessionModel.update(session.id, {
      status: SessionStatus.CONNECTED,
      start_time: startTime,
      credits_used: 1, // 已记录1点消耗
    });

    // 运行点数监控
    await checkSessionCredits();

    // 验证会话记录已更新
    const updatedSession = await SessionModel.findById(session.id);
    expect(updatedSession).toBeTruthy();
    expect(updatedSession!.credits_used).toBe(3); // 应该更新为3点（3分钟）

    // 验证用户点数已扣除（只扣除新增的2点）
    const updatedUser = await UserModel.findById(testUser.id);
    expect(updatedUser).toBeTruthy();
    expect(updatedUser!.credits).toBe(8); // 10 - 2 = 8

    // 清理
    await SessionModel.markDisconnected(session.id, 180);
  });

  it('应该在点数不足时关闭会话', async () => {
    // 将用户点数设置为较低值
    await UserModel.update(testUser.id, { credits: 1 });

    // 创建会话
    const session = await SessionModel.create({
      user_id: testUser.id,
      machine_id: testMachineId,
    });

    expect(session).toBeTruthy();
    if (!session) return;

    // 模拟会话开始（5分钟前）
    const startTime = new Date(Date.now() - 300 * 1000);
    await SessionModel.update(session.id, {
      status: SessionStatus.CONNECTED,
      start_time: startTime,
      credits_used: 2, // 已记录2点消耗
    });

    // 运行点数监控
    await checkSessionCredits();

    // 验证会话已标记为断开
    const updatedSession = await SessionModel.findById(session.id);
    expect(updatedSession).toBeTruthy();
    expect(updatedSession!.status).toBe(SessionStatus.DISCONNECTED);

    // 验证用户点数已扣除至0
    const updatedUser = await UserModel.findById(testUser.id);
    expect(updatedUser).toBeTruthy();
    expect(updatedUser!.credits).toBe(0);

    // 注意：关闭浏览器方法在 mock 中被调用，但我们无法直接验证
    // 因为 vi.fn() 返回的 mock 函数在模块作用域中
  });

  it('应该处理多个会话的点数扣除', async () => {
    // 重置用户点数
    await UserModel.update(testUser.id, { credits: 10 });

    // 创建两个会话
    const session1 = await SessionModel.create({
      user_id: testUser.id,
      machine_id: testMachineId,
    });

    const session2 = await SessionModel.create({
      user_id: testUser.id,
      machine_id: testMachineId,
    });

    expect(session1).toBeTruthy();
    expect(session2).toBeTruthy();
    if (!session1 || !session2) return;

    // 模拟会话开始
    const startTime1 = new Date(Date.now() - 120 * 1000); // 2分钟前
    await SessionModel.update(session1.id, {
      status: SessionStatus.CONNECTED,
      start_time: startTime1,
      credits_used: 0,
    });

    const startTime2 = new Date(Date.now() - 180 * 1000); // 3分钟前
    await SessionModel.update(session2.id, {
      status: SessionStatus.CONNECTED,
      start_time: startTime2,
      credits_used: 1, // 已记录1点消耗
    });

    // 运行点数监控
    await checkSessionCredits();

    // 验证会话记录已更新
    const updatedSession1 = await SessionModel.findById(session1.id);
    expect(updatedSession1).toBeTruthy();
    expect(updatedSession1!.credits_used).toBe(2); // 2分钟 = 2点

    const updatedSession2 = await SessionModel.findById(session2.id);
    expect(updatedSession2).toBeTruthy();
    expect(updatedSession2!.credits_used).toBe(3); // 3分钟 = 3点

    // 验证用户点数已扣除（会话1: 2点 + 会话2: 2点新增 = 4点）
    const updatedUser = await UserModel.findById(testUser.id);
    expect(updatedUser).toBeTruthy();
    expect(updatedUser!.credits).toBe(6); // 10 - 4 = 6

    // 清理
    await SessionModel.markDisconnected(session1.id, 120);
    await SessionModel.markDisconnected(session2.id, 180);
  });
});
