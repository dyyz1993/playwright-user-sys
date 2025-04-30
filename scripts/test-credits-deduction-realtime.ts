/**
 * 测试实时点数扣除功能
 *
 * 这个脚本会创建一个测试用户和会话，然后模拟会话运行一段时间，
 * 并检查点数是否正确扣除。
 */

import { UserModel } from '../src/models/user.model.js';
import { SessionModel } from '../src/models/session.model.js';
import { SessionStatus } from '../src/types/index.js';

// 模拟 machine-grpc.service.js 模块
jest.mock('../src/services/machine-grpc.service.js', () => ({
  connectionManager: {
    getActiveConnections: () => ['test-machine-1'],
    closeBrowser: async () => true,
    sendCloseBrowserCommand: () => {},
  }
}), { virtual: true });

// 模拟 webhook.js 模块
jest.mock('../src/utils/webhook.js', () => ({
  createWebhookEvent: async () => {},
  WebhookEventType: {
    CREDITS_DEPLETED: 'credits_depleted',
    CREDITS_LOW: 'credits_low'
  }
}), { virtual: true });

// 模拟 MachineModel
jest.mock('../src/models/machine.model.js', () => ({
  MachineModel: {
    decrementInstanceCount: async () => {},
  }
}), { virtual: true });

// 导入被测试的函数（必须在模拟之后导入）
import { checkSessionCredits } from '../src/services/credits-monitor.service.js';

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  try {
    console.log('开始测试实时点数扣除功能...');

    // 创建测试用户
    const username = `test_user_${Date.now()}`;
    console.log(`创建测试用户: ${username}`);

    const testUser = await UserModel.create({
      username,
      password: 'password123',
      email: `${username}@example.com`,
      credits: 10,
    });

    console.log(`测试用户创建成功，初始点数: ${testUser.credits}`);

    // 创建会话
    console.log('创建测试会话...');
    const session = await SessionModel.create({
      user_id: testUser.id,
      machine_id: 'test-machine-1',
    });

    if (!session) {
      throw new Error('创建会话失败');
    }

    console.log(`测试会话创建成功，ID: ${session.id}`);

    // 模拟会话开始（3分钟前）
    const startTime = new Date(Date.now() - 180 * 1000);
    await SessionModel.update(session.id, {
      status: SessionStatus.CONNECTED,
      start_time: startTime,
      credits_used: 1, // 已记录1点消耗
    });

    console.log('会话已更新，模拟已运行3分钟，已记录1点消耗');

    // 运行点数监控
    console.log('运行点数监控...');
    await checkSessionCredits();

    // 验证会话记录已更新
    const updatedSession = await SessionModel.findById(session.id);
    if (!updatedSession) {
      throw new Error('获取更新后的会话失败');
    }

    console.log(`会话更新后的点数消耗: ${updatedSession.credits_used}点`);
    console.log(`预期点数消耗: 3点 (3分钟)`);

    // 验证用户点数已扣除
    const updatedUser = await UserModel.findById(testUser.id);
    if (!updatedUser) {
      throw new Error('获取更新后的用户失败');
    }

    console.log(`用户更新后的点数: ${updatedUser.credits}点`);
    console.log(`预期剩余点数: 8点 (10 - 2 = 8，因为已记录1点，只扣除新增的2点)`);

    // 清理
    console.log('清理测试数据...');
    await SessionModel.markDisconnected(session.id, 180);
    await UserModel.delete(testUser.id);

    console.log('测试完成');
  } catch (error) {
    console.error('测试失败:', error);
  }
}

main();
