/**
 * 验证优化后的点数扣除功能
 *
 * 这个脚本会创建一个测试用户和多个会话，然后模拟会话运行一段时间，
 * 并验证优化后的点数扣除逻辑是否正确工作。
 */

import { UserModel } from '../src/models/user.model.js';
import { SessionModel } from '../src/models/session.model.js';
import { SessionStatus } from '../src/types/index.js';
import { db } from '../src/config/database.js';
import { WebhookEventType } from '../src/types/index.js';

// 模拟模块
import * as machineGrpcService from '../src/services/machine-grpc.service.js';
import * as webhook from '../src/utils/webhook.js';
import * as machineModel from '../src/models/machine.model.js';

// 保存原始模块
const originalConnectionManager = machineGrpcService.connectionManager;
const originalCreateWebhookEvent = webhook.createWebhookEvent;
const originalMachineModel = machineModel.MachineModel;

// 模拟 connectionManager
(machineGrpcService as any).connectionManager = {
  getActiveConnections: () => ['test-machine-1'],
  closeBrowser: async () => true,
  sendCloseBrowserCommand: () => {},
};

// 模拟 createWebhookEvent
(webhook as any).createWebhookEvent = async () => {};

// 模拟 MachineModel.decrementInstanceCount
(machineModel.MachineModel as any).decrementInstanceCount = async () => {};

// 导入被测试的函数（必须在模拟之后导入）
import { checkSessionCredits } from '../src/services/credits-monitor.service.js';

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  try {
    console.log('开始验证优化后的点数扣除功能...');

    // 创建测试用户
    const username = `test_user_${Date.now()}`;
    console.log(`创建测试用户: ${username}`);

    const testUser = await UserModel.create({
      username,
      password: 'password123',
      email: `${username}@example.com`,
      credits: 10,
    });

    console.log(`测试用户创建成功，ID: ${testUser.id}, 初始点数: ${testUser.credits}`);

    // 创建多个会话
    console.log('创建多个测试会话...');
    const sessions = [];

    // 会话1：已运行2分钟，已记录0点消耗
    const session1 = await SessionModel.create({
      user_id: testUser.id,
      machine_id: 'test-machine-1',
    });
    if (session1) {
      const startTime1 = new Date(Date.now() - 120 * 1000); // 2分钟前
      await SessionModel.update(session1.id, {
        status: SessionStatus.CONNECTED,
        start_time: startTime1,
        credits_used: 0,
      });
      sessions.push(session1);
      console.log(`会话1创建成功，ID: ${session1.id}，模拟已运行2分钟，已记录0点消耗`);
    }

    // 会话2：已运行3分钟，已记录1点消耗
    const session2 = await SessionModel.create({
      user_id: testUser.id,
      machine_id: 'test-machine-1',
    });
    if (session2) {
      const startTime2 = new Date(Date.now() - 180 * 1000); // 3分钟前
      await SessionModel.update(session2.id, {
        status: SessionStatus.CONNECTED,
        start_time: startTime2,
        credits_used: 1,
      });
      sessions.push(session2);
      console.log(`会话2创建成功，ID: ${session2.id}，模拟已运行3分钟，已记录1点消耗`);
    }

    // 会话3：已运行1分钟，已记录1点消耗（不需要更新）
    const session3 = await SessionModel.create({
      user_id: testUser.id,
      machine_id: 'test-machine-1',
    });
    if (session3) {
      const startTime3 = new Date(Date.now() - 60 * 1000); // 1分钟前
      await SessionModel.update(session3.id, {
        status: SessionStatus.CONNECTED,
        start_time: startTime3,
        credits_used: 1,
      });
      sessions.push(session3);
      console.log(`会话3创建成功，ID: ${session3.id}，模拟已运行1分钟，已记录1点消耗`);
    }

    // 记录数据库操作次数
    console.log('\n开始监控数据库操作...');
    let queryCount = 0;
    const originalQueryFn = db.client.query;
    db.client.query = function(...args: any[]) {
      queryCount++;
      return originalQueryFn.apply(this, args);
    };

    // 运行点数监控
    console.log('\n运行点数监控...');
    await checkSessionCredits();
    console.log(`点数监控完成，共执行 ${queryCount} 次数据库操作`);

    // 恢复原始查询函数
    db.client.query = originalQueryFn;

    // 验证会话记录已更新
    console.log('\n验证会话记录更新...');
    const updatedSession1 = await SessionModel.findById(session1.id);
    console.log(`会话1更新后的点数消耗: ${updatedSession1?.credits_used}点 (预期: 2点)`);

    const updatedSession2 = await SessionModel.findById(session2.id);
    console.log(`会话2更新后的点数消耗: ${updatedSession2?.credits_used}点 (预期: 3点)`);

    const updatedSession3 = await SessionModel.findById(session3.id);
    console.log(`会话3更新后的点数消耗: ${updatedSession3?.credits_used}点 (预期: 1点，无变化)`);

    // 验证用户点数已扣除
    const updatedUser = await UserModel.findById(testUser.id);
    console.log(`\n用户更新后的点数: ${updatedUser?.credits}点`);
    console.log(`预期剩余点数: 6点 (10 - 2 - 2 = 6，会话1需扣2点，会话2需扣2点，会话3无需扣除)`);

    // 清理
    console.log('\n清理测试数据...');
    for (const session of sessions) {
      await SessionModel.markDisconnected(session.id, 0);
    }
    await UserModel.delete(testUser.id);

    console.log('测试完成');

    // 恢复原始模块
    (machineGrpcService as any).connectionManager = originalConnectionManager;
    (webhook as any).createWebhookEvent = originalCreateWebhookEvent;
    (machineModel.MachineModel as any) = originalMachineModel;

    // 关闭数据库连接
    await db.destroy();
  } catch (error) {
    console.error('测试失败:', error);

    // 恢复原始模块
    (machineGrpcService as any).connectionManager = originalConnectionManager;
    (webhook as any).createWebhookEvent = originalCreateWebhookEvent;
    (machineModel.MachineModel as any) = originalMachineModel;

    // 关闭数据库连接
    await db.destroy();
    process.exit(1);
  }
}

main();
