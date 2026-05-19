import { logger } from '@shared/utils/logger.js';
import { MachineModel } from '../../models/machine.model.js';
import { calculateCreditsUsed } from '@shared/utils/credits-calculator.js';
import type { ConnectionCommands } from './connection-commands.js';
import type { MachineMessage, Heartbeat, SessionScreenshot, SessionStatusUpdate } from '../../shared/types/grpc.js';

export class ConnectionMessageHandler {
  constructor(private commands: ConnectionCommands) {}

  async handle(machineId: string, message: MachineMessage): Promise<void> {
    try {
      logger.debug(`收到机器消息 (${machineId}): ${JSON.stringify(message)}`);

      if (message.heartbeat) {
        await this.handleHeartbeat(machineId, message.heartbeat);
      } else if (message.session_status) {
        await this.handleSessionStatus(machineId, message.session_status);
      } else if (message.session_screenshot) {
        await this.handleSessionScreenshot(machineId, message.session_screenshot);
      } else {
        logger.warn(`收到未知类型的消息 (${machineId}): ${JSON.stringify(message)}`);
      }
    } catch (error: unknown) {
      logger.error(`处理机器消息时出错 (${machineId}):`, error);
    }
  }

  private async handleHeartbeat(machineId: string, heartbeat: Heartbeat): Promise<void> {
    try {
      logger.debug(`收到心跳 (${machineId}): ${JSON.stringify(heartbeat)}`);

      const { memoryStore } = await import('../memory-store.service.js');
      const machine = await MachineModel.findById(machineId);

      logger.debug(`findById 返回: machine=${machine ? '存在' : 'null'}`);

      if (machine) {
        logger.debug(`machine.grpcPort=${machine.grpcPort}`);

        memoryStore.updateMachineStatus({
          machine_id: machineId,
          name: machine.hostname,
          ip: machine.ip,
          grpc_port: machine.grpcPort || 50052,
          proxy_port: machine.proxyPort || 8080,
          cpu_usage: heartbeat.cpu_usage,
          memory_usage: heartbeat.memory_usage,
          disk_space: heartbeat.disk_usage || 0,
          active_sessions: heartbeat.active_sessions,
          max_sessions: machine.maxInstances,
          last_heartbeat: new Date(),
        });
      } else {
        logger.warn(`机器 ${machineId} 在数据库中不存在，跳过内存更新`);
      }

      await MachineModel.update(machineId, {
        cpuUsage: heartbeat.cpu_usage,
        memoryUsage: heartbeat.memory_usage,
        instanceCount: heartbeat.active_sessions,
        status: 'online',
      });

      logger.debug(`机器状态已更新 (${machineId})`);
    } catch (error: unknown) {
      logger.error(`处理心跳时出错 (${machineId}):`, error);
    }
  }

  private async handleSessionScreenshot(machineId: string, screenshot: SessionScreenshot): Promise<void> {
    const { session_id, screenshot_url } = screenshot;
    try {
      logger.info(`收到会话截图更新 (${machineId}, ${session_id}): ${screenshot_url}`);

      const { SessionModel } = await import('../../models/session/index.js');
      const session = await SessionModel.findById(session_id);
      if (!session) {
        logger.warn(`会话不存在 (${session_id})`);
        return;
      }

      await SessionModel.update(session_id, { screenshot_url });
      logger.info(`会话截图已更新 (${session_id}): ${screenshot_url}`);
    } catch (error: unknown) {
      logger.error(`处理会话截图更新时出错 (${machineId}, ${session_id}):`, error);
    }
  }

  private async handleSessionStatus(machineId: string, status: SessionStatusUpdate): Promise<void> {
    const { SessionModel } = await import('../../models/session/index.js');
    const { UserModel } = await import('../../models/user.model.js');
    const { SessionStatus } = await import('@shared/types/index.js');
    const { createWebhookEvent } = await import('../../utils/webhook.js');
    const { WebhookEventType } = await import('@shared/types/index.js');

    const { session_id, status: sessionStatus, duration: reportedDuration } = status;
    try {
      let duration = reportedDuration;
      logger.info(
        `收到会话状态更新 (${machineId}, ${session_id}): ${sessionStatus}, 持续时间: ${duration}秒, 数据源: 机器端`
      );

      const session = await SessionModel.findById(session_id);
      if (!session) {
        logger.warn(`会话不存在 (${session_id})`);
        return;
      }

      if (duration === 0 && session.start_time) {
        const now = new Date();
        const startTime = new Date(session.start_time);
        const calculatedDuration = Math.floor((now.getTime() - startTime.getTime()) / 1000);

        if (calculatedDuration > 0) {
          duration = calculatedDuration;
          logger.info(
            `会话状态更新: 根据开始时间计算持续时间 (${session_id}): 开始时间=${startTime.toISOString()}, 当前时间=${now.toISOString()}, 持续时间=${duration}秒`
          );
        }
      }

      switch (sessionStatus) {
        case 'connected':
          const now = new Date();

          if (session.start_time) {
            await SessionModel.update(session_id, {
              status: SessionStatus.CONNECTED,
            });
            logger.info(`会话已有开始时间，不覆盖 (${session_id}): ${new Date(session.start_time).toISOString()}`);
          } else {
            await SessionModel.update(session_id, {
              status: SessionStatus.CONNECTED,
              start_time: now,
            });
            logger.info(`会话设置开始时间 (${session_id}): ${now.toISOString()}`);
          }

          await createWebhookEvent(session.user_id, WebhookEventType.SESSION_CONNECTED, {
            session_id,
            connected_at: new Date(),
          });

          logger.info(`用户已连接到会话，开始计费 (${session_id})`);
          break;

        case 'disconnected':
          await SessionModel.markDisconnected(session_id, duration);
          logger.info(`机器端报告用户已断开会话连接，已调用 markDisconnected 完成扣费 (${session_id})`);
          break;

        case 'active':
          const minutes = calculateCreditsUsed(duration);

          if (session.duration > 0 || session.credits_used > 0) {
            const newDuration = Math.max(session.duration, duration);
            const newCreditsUsed = Math.max(session.credits_used, minutes);

            await SessionModel.update(session_id, {
              duration: newDuration,
              credits_used: newCreditsUsed,
            });

            logger.info(
              `会话活动更新，保留最大值 (${session_id}): 持续时间=${newDuration}秒, 消耗点数=${newCreditsUsed}点`
            );
          } else {
            await SessionModel.update(session_id, {
              duration,
              credits_used: minutes,
            });

            logger.info(`会话活动更新 (${session_id}): 持续时间=${duration}秒, 消耗点数=${minutes}点`);
          }

          const user = await UserModel.findById(session.user_id);

          if (user && user.credits < minutes) {
            logger.warn(`用户点数不足 (${session.user_id}), 剩余: ${user.credits}, 已使用: ${minutes}点`);

            this.commands.sendCloseBrowserCommand(machineId, session_id);

            await createWebhookEvent(session.user_id, WebhookEventType.CREDITS_DEPLETED, {
              session_id,
              credits_remaining: user.credits,
              credits_used: minutes,
            });
          } else if (user && user.credits < minutes + 5) {
            await createWebhookEvent(session.user_id, WebhookEventType.CREDITS_LOW, {
              session_id,
              credits_remaining: user.credits,
              credits_used: minutes,
            });
          }

          logger.info(`会话活动更新 (${session_id}): 连接时长 ${duration}秒, 已使用 ${minutes}点`);
          break;

        case 'closed':
          if (session.status === SessionStatus.DISCONNECTED || session.status === SessionStatus.ERROR) {
            logger.info(`会话已断开，跳过重复处理 (${session_id}), 当前状态: ${session.status}`);
            break;
          }

          await SessionModel.markDisconnected(session_id, duration);
          await MachineModel.decrementInstanceCount(machineId);

          await createWebhookEvent(session.user_id, WebhookEventType.SESSION_DISCONNECTED, {
            session_id,
            duration,
            disconnected_at: new Date(),
          });

          logger.info(`浏览器实例已关闭，已调用 markDisconnected 完成扣费 (${session_id})`);
          break;

        case 'error':
          const errorMinutes = calculateCreditsUsed(duration);

          if (session.duration > 0 || session.credits_used > 0) {
            await SessionModel.update(session_id, {
              status: SessionStatus.ERROR,
              end_time: new Date(),
            });
            logger.info(
              `会话已有持续时间和消耗点数，只更新状态和结束时间 (${session_id}): 持续时间=${session.duration}秒, 消耗点数=${session.credits_used}点`
            );
          } else {
            await SessionModel.update(session_id, {
              status: SessionStatus.ERROR,
              end_time: new Date(),
              duration,
              credits_used: errorMinutes,
            });
            logger.info(
              `会话没有持续时间和消耗点数，更新所有字段 (${session_id}): 持续时间=${duration}秒, 消耗点数=${errorMinutes}点`
            );
          }

          await MachineModel.decrementInstanceCount(machineId);

          await createWebhookEvent(session.user_id, WebhookEventType.SESSION_ERROR, {
            session_id,
            duration,
            error_at: new Date(),
          });

          logger.info(`会话出错，计费完成 (${session_id}): ${duration}秒, ${errorMinutes}点`);
          break;
      }
    } catch (error: unknown) {
      logger.error(`处理会话状态更新时出错 (${machineId}, ${status.session_id}):`, error);
    }
  }
}
