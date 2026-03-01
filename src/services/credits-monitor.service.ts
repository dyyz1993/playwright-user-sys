import { SessionModel, Session } from '../models/session.model.js';
import { UserModel } from '../models/user.model.js';
import { MachineModel } from '../models/machine.model.js';
import { SessionStatus, WebhookEventType } from '@shared/types/index.js';
import { createWebhookEvent } from '../utils/webhook.js';
import { logger } from '@shared/utils/logger.js';
import { connectionManager } from './machine-grpc.service.js';
import { memoryStore } from './memory-store.service.js';
import { db } from '../config/database.js';

/**
 * 检查所有活跃会话的点数情况
 * 如果用户点数不足，则关闭会话
 * 只对有活跃机器连接的会话进行计费
 */
export async function checkSessionCredits(): Promise<void> {
  try {
    // 获取所有活跃会话
    const activeSessions = await SessionModel.findActiveSessions();
    logger.info(`点数监控: 检查 ${activeSessions.length} 个活跃会话的点数情况`);

    // 获取所有在线的机器ID
    const connectedMachineIds = connectionManager.getActiveConnections();
    logger.info(`当前有 ${connectedMachineIds.length} 台已连接的机器`);

    // 过滤出在真正在线的机器上的会话
    const validSessions = activeSessions.filter(
      (session) => session.machine_id && connectedMachineIds.includes(session.machine_id)
    );

    logger.info(`其中 ${validSessions.length} 个会话在真正在线的机器上`);

    // 对于不在在线机器上的会话，标记为断开状态
    const invalidSessions = activeSessions.filter(
      (session) => !session.machine_id || !connectedMachineIds.includes(session.machine_id)
    );

    for (const session of invalidSessions) {
      try {
        // 计算会话持续时间（使用已记录的持续时间）
        const duration = session.duration || 0;

        // 标记会话为已断开
        await SessionModel.markDisconnected(session.id, duration);
        logger.info(
          `标记无效会话为已断开 (sessionId: ${session.id}, 机器: ${session.machine_id || '无'}, 持续时间: ${duration}s)`
        );
      } catch (error) {
        logger.error(`标记无效会话时出错 (${session.id}):`, error);
      }
    }

    // 按用户ID分组有效会话
    const sessionsByUser = new Map<number, Session[]>();
    for (const session of validSessions) {
      const userId = session.user_id;
      if (!sessionsByUser.has(userId)) {
        sessionsByUser.set(userId, []);
      }
      sessionsByUser.get(userId)!.push(session);
    }

    logger.info(`点数监控: 有 ${sessionsByUser.size} 个用户有活跃会话`);

    // 对每个用户进行一次处理
    for (const [userId, userSessions] of sessionsByUser.entries()) {
      try {
        // 获取用户信息（只查询一次）
        const user = await UserModel.findById(userId);
        if (!user) {
          logger.warn(`用户 ${userId} 不存在，跳过处理其会话`);
          continue;
        }

        // 计算该用户所有会话的总点数消耗和会话更新
        let totalNewCreditsToDeduct = 0;
        const sessionUpdates: { id: string; duration: number; credits_used: number }[] = [];
        const sessionDurations = new Map<string, number>();

        // 第一步：计算所有会话的持续时间和点数消耗
        for (const session of userSessions) {
          // 计算会话持续时间
          let duration = 0;

          if (session.start_time) {
            // 如果有开始时间，根据开始时间计算持续时间
            const now = new Date();
            const startTime = new Date(session.start_time);
            const calculatedDuration = Math.floor((now.getTime() - startTime.getTime()) / 1000);

            // 使用计算的持续时间和已记录的持续时间中的最大值
            duration = Math.max(calculatedDuration, session.duration || 0);
            logger.debug(
              `✅点数监控: 会话 ${session.id} 的持续时间计算 - 开始时间: ${startTime.toISOString()}, 当前时间: ${now.toISOString()}, 计算持续时间: ${calculatedDuration}秒, 已记录持续时间: ${session.duration || 0}秒, 最终持续时间: ${duration}秒`
            );
          } else {
            // 如果没有开始时间，使用已记录的持续时间
            duration = session.duration || 0;
            logger.debug(`点数监控: 会话 ${session.id} 没有开始时间，使用已记录的持续时间: ${duration}秒`);
          }

          // 保存会话持续时间，用于后续处理
          sessionDurations.set(session.id, duration);

          // 计算已使用的点数（每分钟1点）
          // 即使会话只运行了几秒钟，也至少消耗 1 点
          const minutes = duration > 0 ? Math.max(1, Math.ceil(duration / 60)) : 0;

          // 获取会话已记录的已使用点数
          const recordedCreditsUsed = session.credits_used || 0;

          // 计算本次需要新扣除的点数
          const newCreditsToDeduct = Math.max(0, minutes - recordedCreditsUsed);

          logger.info(
            `点数监控: 会话 ${session.id} 已运行 ${duration} 秒，总消耗 ${minutes} 点，已记录 ${recordedCreditsUsed} 点，本次需扣除 ${newCreditsToDeduct} 点`
          );

          // 累加需要扣除的点数
          totalNewCreditsToDeduct += newCreditsToDeduct;

          // 收集会话更新信息
          if (minutes > recordedCreditsUsed) {
            sessionUpdates.push({
              id: session.id,
              duration,
              credits_used: minutes,
            });
          }
        }

        logger.info(
          `用户 ${user.username} (ID: ${userId}) 共有 ${userSessions.length} 个会话，需要扣除 ${totalNewCreditsToDeduct} 点，当前剩余 ${user.credits} 点`
        );

        // 第二步：使用事务批量更新会话和扣除点数
        if (totalNewCreditsToDeduct > 0 && sessionUpdates.length > 0) {
          try {
            await db.transaction(async (trx) => {
              // 批量更新所有会话
              const updatedCount = await SessionModel.batchUpdate(sessionUpdates, trx);
              logger.debug(`事务中批量更新了 ${updatedCount} 个会话`);

              // 扣除用户点数
              await UserModel.deductCredits(userId, totalNewCreditsToDeduct, trx);
              logger.info(
                `事务中已扣除用户 ${userId} 的点数: ${totalNewCreditsToDeduct} 点，共 ${sessionUpdates.length} 个会话`
              );
            });
          } catch (error) {
            logger.error(`更新会话和扣除点数事务失败 (userId: ${userId}):`, error);
            // 事务失败，继续处理下一个用户
            continue;
          }
        }

        // 第三步：重新获取用户信息，检查点数是否足够
        const updatedUser = await UserModel.findById(userId);
        if (!updatedUser) {
          logger.warn(`扣除点数后无法获取用户 ${userId} 的信息`);
          continue;
        }

        // 第四步：检查用户点数是否足够继续运行
        if (updatedUser.credits <= 0) {
          logger.warn(
            `点数监控: 用户 ${updatedUser.username} (ID: ${userId}) 点数不足，剩余: ${updatedUser.credits}，正在关闭所有会话`
          );

          // 关闭该用户的所有会话
          for (const session of userSessions) {
            // 确保 machine_id 不为 null
            const machineId = session.machine_id as string;
            const duration = sessionDurations.get(session.id) || 0;

            try {
              // 尝试使用直接关闭方法
              logger.info(`尝试直接关闭浏览器 (machineId: ${machineId}, sessionId: ${session.id})`);
              const success = await connectionManager.closeBrowser(machineId, session.id);
              logger.info(
                `直接关闭浏览器${success ? '成功' : '失败'} (machineId: ${machineId}, sessionId: ${session.id})`
              );

              if (!success) {
                // 如果直接关闭失败，尝试发送关闭命令
                logger.info(`发送关闭浏览器命令 (machineId: ${machineId}, sessionId: ${session.id})`);
                connectionManager.sendCloseBrowserCommand(machineId, session.id);
              }
            } catch (error) {
              logger.error(`关闭浏览器失败 (machineId: ${machineId}, sessionId: ${session.id}):`, error);

              // 如果关闭失败，尝试发送关闭命令
              logger.info(`尝试发送关闭浏览器命令 (machineId: ${machineId}, sessionId: ${session.id})`);
              connectionManager.sendCloseBrowserCommand(machineId, session.id);
            }

            // 标记会话为已断开
            await SessionModel.markDisconnected(session.id, duration);
            logger.info(`已标记会话为已断开 (sessionId: ${session.id}, duration: ${duration}s)`);

            // 减少机器的实例计数
            await MachineModel.decrementInstanceCount(machineId);
            logger.info(`已减少机器 ${machineId} 的实例计数`);
          }

          // 触发点数不足事件（只触发一次）
          await createWebhookEvent(userId, WebhookEventType.CREDITS_DEPLETED, {
            user_id: userId,
            credits_remaining: 0,
            sessions_closed: userSessions.length,
            closed_at: new Date(),
          });
        } else if (updatedUser.credits < totalNewCreditsToDeduct + 2) {
          // 点数即将不足，发送警告（只发送一次）
          logger.info(
            `用户 ${updatedUser.username} (ID: ${userId}) 点数即将不足，剩余: ${updatedUser.credits}，已使用: ${totalNewCreditsToDeduct} 点`
          );

          await createWebhookEvent(userId, WebhookEventType.CREDITS_LOW, {
            user_id: userId,
            credits_remaining: updatedUser.credits,
            active_sessions: userSessions.length,
            warning_at: new Date(),
          });
        }
      } catch (error) {
        logger.error(`处理用户 ${userId} 的会话时出错:`, error);
      }
    }
  } catch (error) {
    logger.error('检查会话点数时出错:', error);
  }
}

/**
 * 启动点数监控服务
 */
export function startCreditsMonitor(intervalMs: number = 10000): NodeJS.Timeout {
  logger.info(`启动点数监控服务，检查间隔: ${intervalMs}ms`);

  // 立即执行一次检查
  checkSessionCredits().catch((error) => {
    logger.error('初始点数检查失败:', error);
  });

  // 设置定时器定期检查
  const timer = setInterval(() => {
    checkSessionCredits().catch((error) => {
      logger.error('定期点数检查失败:', error);
    });
  }, intervalMs);

  return timer;
}

/**
 * 停止点数监控服务
 */
export function stopCreditsMonitor(timerId: NodeJS.Timeout): void {
  if (timerId) {
    clearInterval(timerId);
    logger.info('点数监控服务已停止');
  }
}

export default {
  checkSessionCredits,
  startCreditsMonitor,
  stopCreditsMonitor,
};
