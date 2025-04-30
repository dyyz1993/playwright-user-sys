/**
 * 验证多用户批量点数扣除功能
 * 
 * 这个脚本会创建多个测试用户和多个会话，模拟不同的持续时间，
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
  getActiveConnections: () => ['test-machine-1', 'test-machine-2'],
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

// 创建测试用户
async function createTestUser(username: string, credits: number) {
  return UserModel.create({
    username,
    password: 'password123',
    email: `${username}@example.com`,
    credits,
  });
}

// 创建测试会话
async function createTestSession(userId: number, machineId: string, startTimeOffset: number, creditsUsed: number) {
  const session = await SessionModel.create({
    user_id: userId,
    machine_id: machineId,
  });
  
  if (!session) {
    throw new Error('创建会话失败');
  }
  
  const startTime = new Date(Date.now() - startTimeOffset * 1000);
  await SessionModel.update(session.id, {
    status: SessionStatus.CONNECTED,
    start_time: startTime,
    credits_used: creditsUsed,
  });
  
  return session;
}

async function main() {
  try {
    console.log('开始验证多用户批量点数扣除功能...');
    
    // 创建测试用户
    console.log('创建测试用户...');
    const user1 = await createTestUser('test_user_1_' + Date.now(), 20);
    const user2 = await createTestUser('test_user_2_' + Date.now(), 5);
    const user3 = await createTestUser('test_user_3_' + Date.now(), 10);
    
    console.log(`用户1创建成功，ID: ${user1.id}, 初始点数: ${user1.credits}`);
    console.log(`用户2创建成功，ID: ${user2.id}, 初始点数: ${user2.credits}`);
    console.log(`用户3创建成功，ID: ${user3.id}, 初始点数: ${user3.credits}`);
    
    // 创建测试会话
    console.log('\n创建测试会话...');
    
    // 用户1的会话（多个会话，长时间运行）
    const user1Sessions = [];
    // 会话1：已运行10分钟，已记录5点消耗
    const session1_1 = await createTestSession(user1.id, 'test-machine-1', 600, 5);
    user1Sessions.push(session1_1);
    console.log(`用户1会话1创建成功，ID: ${session1_1.id}，模拟已运行10分钟，已记录5点消耗`);
    
    // 会话2：已运行15分钟，已记录10点消耗
    const session1_2 = await createTestSession(user1.id, 'test-machine-2', 900, 10);
    user1Sessions.push(session1_2);
    console.log(`用户1会话2创建成功，ID: ${session1_2.id}，模拟已运行15分钟，已记录10点消耗`);
    
    // 用户2的会话（单个会话，点数不足）
    const user2Sessions = [];
    // 会话1：已运行8分钟，已记录3点消耗
    const session2_1 = await createTestSession(user2.id, 'test-machine-1', 480, 3);
    user2Sessions.push(session2_1);
    console.log(`用户2会话1创建成功，ID: ${session2_1.id}，模拟已运行8分钟，已记录3点消耗`);
    
    // 用户3的会话（多个会话，不同机器）
    const user3Sessions = [];
    // 会话1：已运行3分钟，已记录2点消耗
    const session3_1 = await createTestSession(user3.id, 'test-machine-1', 180, 2);
    user3Sessions.push(session3_1);
    console.log(`用户3会话1创建成功，ID: ${session3_1.id}，模拟已运行3分钟，已记录2点消耗`);
    
    // 会话2：已运行5分钟，已记录4点消耗
    const session3_2 = await createTestSession(user3.id, 'test-machine-2', 300, 4);
    user3Sessions.push(session3_2);
    console.log(`用户3会话2创建成功，ID: ${session3_2.id}，模拟已运行5分钟，已记录4点消耗`);
    
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
    
    // 验证会话记录和用户点数
    console.log('\n验证会话记录和用户点数...');
    
    // 验证用户1
    const updatedUser1 = await UserModel.findById(user1.id);
    console.log(`\n用户1更新后的点数: ${updatedUser1?.credits}点`);
    console.log(`预期剩余点数: 10点 (20 - 5 - 5 = 10，会话1需扣5点，会话2需扣5点)`);
    
    const updatedSession1_1 = await SessionModel.findById(session1_1.id);
    console.log(`用户1会话1更新后的点数消耗: ${updatedSession1_1?.credits_used}点 (预期: 10点)`);
    
    const updatedSession1_2 = await SessionModel.findById(session1_2.id);
    console.log(`用户1会话2更新后的点数消耗: ${updatedSession1_2?.credits_used}点 (预期: 15点)`);
    
    // 验证用户2
    const updatedUser2 = await UserModel.findById(user2.id);
    console.log(`\n用户2更新后的点数: ${updatedUser2?.credits}点`);
    console.log(`预期剩余点数: 0点 (5 - 5 = 0，会话1需扣5点)`);
    
    const updatedSession2_1 = await SessionModel.findById(session2_1.id);
    console.log(`用户2会话1更新后的点数消耗: ${updatedSession2_1?.credits_used}点 (预期: 8点)`);
    console.log(`用户2会话1状态: ${updatedSession2_1?.status} (预期: disconnected，因为点数不足)`);
    
    // 验证用户3
    const updatedUser3 = await UserModel.findById(user3.id);
    console.log(`\n用户3更新后的点数: ${updatedUser3?.credits}点`);
    console.log(`预期剩余点数: 8点 (10 - 1 - 1 = 8，会话1需扣1点，会话2需扣1点)`);
    
    const updatedSession3_1 = await SessionModel.findById(session3_1.id);
    console.log(`用户3会话1更新后的点数消耗: ${updatedSession3_1?.credits_used}点 (预期: 3点)`);
    
    const updatedSession3_2 = await SessionModel.findById(session3_2.id);
    console.log(`用户3会话2更新后的点数消耗: ${updatedSession3_2?.credits_used}点 (预期: 5点)`);
    
    // 清理
    console.log('\n清理测试数据...');
    
    // 清理用户1的会话
    for (const session of user1Sessions) {
      await SessionModel.markDisconnected(session.id, 0);
    }
    await UserModel.delete(user1.id);
    
    // 清理用户2的会话
    for (const session of user2Sessions) {
      await SessionModel.markDisconnected(session.id, 0);
    }
    await UserModel.delete(user2.id);
    
    // 清理用户3的会话
    for (const session of user3Sessions) {
      await SessionModel.markDisconnected(session.id, 0);
    }
    await UserModel.delete(user3.id);
    
    console.log('测试完成');
    
    // 恢复原始模块
    (machineGrpcService as any).connectionManager = originalConnectionManager;
    (webhook as any).createWebhookEvent = originalCreateWebhookEvent;
    (machineModel.MachineModel as any) = originalMachineModel;
    
    // 关闭数据库连接
    await db.destroy();
    process.exit(1);
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
