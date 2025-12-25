/**
 * 手动验证点数扣除功能
 * 
 * 这个脚本会创建一个测试用户和会话，然后模拟会话运行一段时间，
 * 并手动调用相关函数来验证点数扣除逻辑。
 */

import { UserModel } from '../src/models/user.model.js';
import { SessionModel } from '../src/models/session.model.js';
import { SessionStatus } from '@shared/types/index.js';
import { db } from '../src/config/database.js';

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  try {
    console.log('开始手动验证点数扣除功能...');

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

    // 计算当前持续时间
    const now = new Date();
    const calculatedDuration = Math.floor((now.getTime() - startTime.getTime()) / 1000);
    console.log(`计算的持续时间: ${calculatedDuration}秒`);

    // 计算已使用的点数
    const minutes = calculatedDuration > 0 ? Math.max(1, Math.ceil(calculatedDuration / 60)) : 0;
    console.log(`计算的总点数消耗: ${minutes}点`);

    // 获取会话已记录的已使用点数
    const recordedCreditsUsed = session.credits_used || 0;
    console.log(`已记录的点数消耗: ${recordedCreditsUsed}点`);

    // 计算本次需要新扣除的点数
    const newCreditsToDeduct = Math.max(0, minutes - recordedCreditsUsed);
    console.log(`本次需要新扣除的点数: ${newCreditsToDeduct}点`);

    // 更新会话的已使用点数
    await SessionModel.update(session.id, {
      duration: calculatedDuration,
      credits_used: minutes
    });
    console.log(`已更新会话的持续时间为 ${calculatedDuration}秒，已使用点数为 ${minutes}点`);

    // 扣除用户点数
    await UserModel.deductCredits(testUser.id, newCreditsToDeduct);
    console.log(`已扣除用户的点数: ${newCreditsToDeduct}点`);

    // 验证会话记录已更新
    const updatedSession = await SessionModel.findById(session.id);
    if (!updatedSession) {
      throw new Error('获取更新后的会话失败');
    }

    console.log(`会话更新后的点数消耗: ${updatedSession.credits_used}点`);
    console.log(`预期点数消耗: ${minutes}点`);

    // 验证用户点数已扣除
    const updatedUser = await UserModel.findById(testUser.id);
    if (!updatedUser) {
      throw new Error('获取更新后的用户失败');
    }

    console.log(`用户更新后的点数: ${updatedUser.credits}点`);
    console.log(`预期剩余点数: ${testUser.credits - newCreditsToDeduct}点`);

    // 清理
    console.log('清理测试数据...');
    await SessionModel.markDisconnected(session.id, calculatedDuration);
    await UserModel.delete(testUser.id);

    console.log('测试完成');
    
    // 关闭数据库连接
    await db.destroy();
  } catch (error) {
    console.error('测试失败:', error);
    // 关闭数据库连接
    await db.destroy();
    process.exit(1);
  }
}

main();
