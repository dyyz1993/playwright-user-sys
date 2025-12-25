/**
 * 验证批量点数扣除功能
 *
 * 这个脚本会创建一个测试用户和多个会话，然后手动模拟优化后的点数扣除逻辑。
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
    console.log('开始验证批量点数扣除功能...');

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

    // 手动模拟优化后的点数扣除逻辑
    console.log('\n执行批量点数扣除...');

    // 计算每个会话的持续时间和点数消耗
    const sessionUpdates = [];
    let totalNewCreditsToDeduct = 0;

    // 重新获取会话信息，确保有正确的开始时间
    const refreshedSessions = [];
    for (const session of sessions) {
      const refreshedSession = await SessionModel.findById(session.id);
      if (refreshedSession) {
        refreshedSessions.push(refreshedSession);
      }
    }

    for (const session of refreshedSessions) {
      // 计算会话持续时间
      let duration = 0;
      if (session.start_time) {
        const now = new Date();
        const startTime = new Date(session.start_time);
        const calculatedDuration = Math.floor((now.getTime() - startTime.getTime()) / 1000);
        duration = Math.max(calculatedDuration, session.duration || 0);
        console.log(`会话 ${session.id} 的开始时间: ${startTime.toISOString()}, 当前时间: ${now.toISOString()}, 计算持续时间: ${calculatedDuration}秒`);
      } else {
        duration = session.duration || 0;
        console.log(`会话 ${session.id} 没有开始时间，使用已记录的持续时间: ${duration}秒`);
      }

      // 计算已使用的点数
      const minutes = duration > 0 ? Math.max(1, Math.ceil(duration / 60)) : 0;
      const recordedCreditsUsed = session.credits_used || 0;
      const newCreditsToDeduct = Math.max(0, minutes - recordedCreditsUsed);

      console.log(`会话 ${session.id} 已运行 ${duration} 秒，总消耗 ${minutes} 点，已记录 ${recordedCreditsUsed} 点，本次需扣除 ${newCreditsToDeduct} 点`);

      // 累加需要扣除的点数
      totalNewCreditsToDeduct += newCreditsToDeduct;

      // 收集会话更新信息
      if (minutes > recordedCreditsUsed) {
        sessionUpdates.push({
          id: session.id,
          duration,
          credits_used: minutes
        });
      }
    }

    console.log(`用户 ${testUser.username} 共有 ${sessions.length} 个会话，需要扣除 ${totalNewCreditsToDeduct} 点，当前剩余 ${testUser.credits} 点`);

    // 使用事务批量更新会话和扣除点数
    if (totalNewCreditsToDeduct > 0 && sessionUpdates.length > 0) {
      await db.transaction(async (trx) => {
        // 更新所有会话
        for (const update of sessionUpdates) {
          await trx('sessions')
            .where('id', update.id)
            .update({
              duration: update.duration,
              credits_used: update.credits_used,
              updated_at: new Date()
            });
          console.log(`事务中更新会话 ${update.id} 的持续时间为 ${update.duration} 秒，已使用点数为 ${update.credits_used} 点`);
        }

        // 扣除用户点数
        await trx('users')
          .where('id', testUser.id)
          .decrement('credits', totalNewCreditsToDeduct);

        console.log(`事务中已扣除用户 ${testUser.id} 的点数: ${totalNewCreditsToDeduct} 点，共 ${sessionUpdates.length} 个会话`);
      });
    }

    console.log(`批量点数扣除完成，共执行 ${queryCount} 次数据库操作`);

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

    // 关闭数据库连接
    await db.destroy();
    process.exit(1);
  } catch (error) {
    console.error('测试失败:', error);
    // 关闭数据库连接
    await db.destroy();
    process.exit(1);
  }
}

main();
