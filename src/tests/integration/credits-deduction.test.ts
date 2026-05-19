import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from '../../app.js';
import { initDatabase } from '../../config/database.js';
import { UserModel } from '../../models/user.model.js';
import { SessionModel } from '../../models/session/index.js';
import { SessionStatus } from '@shared/types/index.js';

describe('点数扣除集成测试', () => {
  let app: ReturnType<typeof vi.fn>;
  let testUser: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    await initDatabase();

    app = await build();

    // 创建测试用户
    const username = `test_user_${Date.now()}`;

    testUser = await UserModel.create({
      username,
      password: 'password123',
      email: `${username}@example.com`,
      credits: 100,
    });

    expect(testUser).toBeTruthy();
    expect(testUser.credits).toBe(100);
  });

  afterAll(async () => {
    await app.close();
  });

  it('应该在会话结束时正确扣除点数', async () => {
    // 创建会话
    const session = await SessionModel.create({
      user_id: testUser.id,
    });

    expect(session).toBeTruthy();

    // 模拟会话开始
    await SessionModel.update(session!.id, {
      status: SessionStatus.CONNECTED,
      start_time: new Date(Date.now() - 180 * 1000), // 3分钟前
    });

    // 模拟会话结束
    const duration = 180; // 3分钟 = 180秒
    await SessionModel.markDisconnected(session!.id, duration);

    // 扣除点数 (3分钟 = 3点)
    const minutes = Math.ceil(duration / 60);
    await UserModel.deductCredits(testUser.id, minutes);

    // 验证点数扣除
    const updatedUser = await UserModel.findById(testUser.id);
    expect(updatedUser).toBeTruthy();
    expect(updatedUser!.credits).toBe(97); // 100 - 3 = 97
  });

  it('应该在多个会话结束时累计扣除点数', async () => {
    // 创建第一个会话
    const session1 = await SessionModel.create({
      user_id: testUser.id,
    });

    // 模拟第一个会话开始和结束 (2分钟)
    await SessionModel.update(session1!.id, {
      status: SessionStatus.CONNECTED,
      start_time: new Date(Date.now() - 120 * 1000),
    });

    const duration1 = 120; // 2分钟 = 120秒
    await SessionModel.markDisconnected(session1!.id, duration1);

    // 扣除点数 (2分钟 = 2点)
    const minutes1 = Math.ceil(duration1 / 60);
    await UserModel.deductCredits(testUser.id, minutes1);

    // 创建第二个会话
    const session2 = await SessionModel.create({
      user_id: testUser.id,
    });

    // 模拟第二个会话开始和结束 (1.5分钟)
    await SessionModel.update(session2!.id, {
      status: SessionStatus.CONNECTED,
      start_time: new Date(Date.now() - 90 * 1000),
    });

    const duration2 = 90; // 1.5分钟 = 90秒
    await SessionModel.markDisconnected(session2!.id, duration2);

    // 扣除点数 (1.5分钟 = 2点，向上取整)
    const minutes2 = Math.ceil(duration2 / 60);
    await UserModel.deductCredits(testUser.id, minutes2);

    // 验证点数扣除
    const updatedUser = await UserModel.findById(testUser.id);
    expect(updatedUser).toBeTruthy();
    expect(updatedUser!.credits).toBe(93); // 97 - 2 - 2 = 93
  });

  it('应该在点数不足时抛出错误', async () => {
    // 将用户点数设置为较低值
    await UserModel.update(testUser.id, { credits: 2 });

    // 创建会话
    const session = await SessionModel.create({
      user_id: testUser.id,
    });

    // 模拟会话开始和结束 (3分钟)
    await SessionModel.update(session!.id, {
      status: SessionStatus.CONNECTED,
      start_time: new Date(Date.now() - 180 * 1000),
    });

    const duration = 180; // 3分钟 = 180秒
    await SessionModel.markDisconnected(session!.id, duration);

    // 尝试扣除点数 (3分钟 = 3点)
    const minutes = Math.ceil(duration / 60);

    // 应该抛出错误，因为点数不足
    await expect(UserModel.deductCredits(testUser.id, minutes)).rejects.toThrow('点数不足');

    // 验证点数没有变化
    const updatedUser = await UserModel.findById(testUser.id);
    expect(updatedUser).toBeTruthy();
    expect(updatedUser!.credits).toBe(2);
  });
});
