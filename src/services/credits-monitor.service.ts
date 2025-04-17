import { SessionModel } from '../models/session.model.js';
import { UserModel } from '../models/user.model.js';
import { MachineModel } from '../models/machine.model.js';
import { SessionStatus, WebhookEventType } from '../types/index.js';
import { createWebhookEvent } from '../utils/webhook.js';
import { logger } from '../utils/logger.js';
import { connectionManager } from './machine-grpc.service.js';
import { memoryStore } from './memory-store.service.js';

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
    const validSessions = activeSessions.filter(session =>
      session.machine_id && connectedMachineIds.includes(session.machine_id)
    );

    logger.info(`其中 ${validSessions.length} 个会话在真正在线的机器上`);

    // 对于不在在线机器上的会话，标记为断开状态
    const invalidSessions = activeSessions.filter(session =>
      !session.machine_id || !connectedMachineIds.includes(session.machine_id)
    );

    for (const session of invalidSessions) {
      try {
        // 计算会话持续时间（使用已记录的持续时间）
        const duration = session.duration || 0;

        // 标记会话为已断开
        await SessionModel.markDisconnected(session.id, duration);
        logger.info(`标记无效会话为已断开 (sessionId: ${session.id}, 机器: ${session.machine_id || '无'}, 持续时间: ${duration}s)`);
      } catch (error) {
        logger.error(`标记无效会话时出错 (${session.id}):`, error);
      }
    }

    // 只对有效会话进行点数检查
    for (const session of validSessions) {
      try {
        // 获取用户信息
        const user = await UserModel.findById(session.user_id);
        if (!user) {
          logger.warn(`会话 ${session.id} 的用户 ${session.user_id} 不存在`);
          continue;
        }

        // 计算当前持续时间
        let duration = 0;

        if (session.start_time) {
          // 如果有开始时间，根据开始时间计算持续时间
          const now = new Date();
          const startTime = new Date(session.start_time);
          const calculatedDuration = Math.floor((now.getTime() - startTime.getTime()) / 1000);

          // 使用计算的持续时间和已记录的持续时间中的最大值
          duration = Math.max(calculatedDuration, session.duration || 0);
          logger.debug(`点数监控: 会话 ${session.id} 的持续时间计算 - 开始时间: ${startTime.toISOString()}, 当前时间: ${now.toISOString()}, 计算持续时间: ${calculatedDuration}秒, 已记录持续时间: ${session.duration || 0}秒, 最终持续时间: ${duration}秒`);
        } else {
          // 如果没有开始时间，使用已记录的持续时间
          duration = session.duration || 0;
          logger.debug(`点数监控: 会话 ${session.id} 没有开始时间，使用已记录的持续时间: ${duration}秒`);
        }

        // 计算已使用的点数（每分钟1点）
        // 即使会话只运行了几秒钟，也至少消耗 1 点
        const minutes = duration > 0 ? Math.max(1, Math.ceil(duration / 60)) : 0;

        logger.info(`点数监控: 会话 ${session.id} 已运行 ${duration} 秒，消耗 ${minutes} 点，用户 ${user.username} 剩余 ${user.credits} 点`);

        // 检查用户点数是否足够
        if (user.credits < minutes) {
          logger.warn(`点数监控: 用户 ${user.username} (ID: ${user.id}) 点数不足，剩余: ${user.credits}，已使用: ${minutes} 点，正在关闭会话 ${session.id}`);

          // 直接关闭浏览器实例
          logger.info(`点数监控: 开始关闭浏览器实例 (sessionId: ${session.id})`);

          // 确保 machine_id 不为 null
          const machineId = session.machine_id as string;

          try {
            // 尝试使用直接关闭方法
            logger.info(`尝试直接关闭浏览器 (machineId: ${machineId}, sessionId: ${session.id})`);
            const success = await connectionManager.closeBrowser(machineId, session.id);
            logger.info(`直接关闭浏览器${success ? '成功' : '失败'} (machineId: ${machineId}, sessionId: ${session.id})`);

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

          // 扣除用户所有剩余点数
          if (user.credits > 0) {
            await UserModel.deductCredits(user.id, user.credits);
            logger.info(`已扣除用户 ${user.id} 的所有剩余点数: ${user.credits} 点`);
          }

          // 触发点数不足事件
          await createWebhookEvent(user.id, WebhookEventType.CREDITS_DEPLETED, {
            session_id: session.id,
            credits_remaining: 0,
            credits_used: minutes,
            closed_at: new Date()
          });

          // 减少机器的实例计数
          await MachineModel.decrementInstanceCount(machineId);
          logger.info(`已减少机器 ${machineId} 的实例计数`);
        } else if (user.credits < minutes + 2) {
          // 点数即将不足，发送警告
          logger.info(`用户 ${user.username} (ID: ${user.id}) 点数即将不足，剩余: ${user.credits}，已使用: ${minutes} 点`);

          await createWebhookEvent(user.id, WebhookEventType.CREDITS_LOW, {
            session_id: session.id,
            credits_remaining: user.credits,
            credits_used: minutes,
            warning_at: new Date()
          });
        }
      } catch (error) {
        logger.error(`检查会话 ${session.id} 的点数时出错:`, error);
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
  checkSessionCredits().catch(error => {
    logger.error('初始点数检查失败:', error);
  });

  // 设置定时器定期检查
  const timer = setInterval(() => {
    checkSessionCredits().catch(error => {
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
  stopCreditsMonitor
};
