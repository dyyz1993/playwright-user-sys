import { MachineModel } from '../models/machine.model.js';
import { SessionModel, Session } from '../models/session/index.js';
import { UserModel } from '../models/user.model.js';
import { SessionStatus, WebhookEventType } from '@shared/types/index.js';
import { createWebhookEvent } from '../utils/webhook.js';
import { logger } from '@shared/utils/logger.js';
import { connectionManager } from './machine-grpc/index.js';
import { memoryStore } from './memory-store.service.js';

// 机器离线超时时间（毫秒）
const MACHINE_OFFLINE_TIMEOUT = 30000; // 30秒，减少超时时间以更快检测离线机器

/**
 * 检查机器状态
 */
export async function checkMachineStatus(): Promise<void> {
  try {
    // 优先使用内存中的机器数据
    const memoryMachines = memoryStore.getAllMachines();
    logger.debug(`从内存中获取到 ${memoryMachines.length} 台机器`);

    // 如果内存中没有数据，则从数据库加载
    if (memoryMachines.length === 0) {
      await memoryStore.loadInitialData();
    }

    // 再次获取内存中的机器数据
    const machines = memoryStore.getAllMachines();
    logger.debug(`检查 ${machines.length} 台机器的状态`);

    const now = new Date();

    // 检查每台机器的状态
    for (const machine of machines) {
      try {
        // 检查机器最后心跳时间
        const lastHeartbeat = machine.last_heartbeat;

        // 如果机器没有心跳或心跳超时，标记为离线
        if (now.getTime() - lastHeartbeat.getTime() > MACHINE_OFFLINE_TIMEOUT) {
          // 如果机器当前是在线状态，则标记为离线并处理其上的会话
          if (machine.online) {
            logger.warn(`机器 ${machine.machine_id} 心跳超时，标记为离线`);

            // 在内存中标记机器为离线
            memoryStore.markMachineOffline(machine.machine_id);

            // 同时在数据库中标记机器为离线（作为备份）
            await MachineModel.update(machine.machine_id, { status: 'offline' });

            // 处理该机器上的所有活跃会话
            await handleOfflineMachineSessions(machine.machine_id);
          }
        }
      } catch (error: unknown) {
        logger.error(`检查机器 ${machine.machine_id} 状态时出错:`, error);
      }
    }

    // 清理过期的会话数据
    memoryStore.cleanupOldSessions();
  } catch (error: unknown) {
    logger.error('检查机器状态时出错:', error);
  }
}

/**
 * 处理离线机器上的会话
 */
async function handleOfflineMachineSessions(machineId: string): Promise<void> {
  try {
    // 从内存中获取该机器上的活跃会话
    const allSessions = memoryStore.getAllSessions();
    const activeSessions = allSessions.filter(
      (s) => s.machine_id === machineId && (s.status === SessionStatus.CREATED || s.status === SessionStatus.CONNECTED)
    );

    // 如果内存中没有数据，则从数据库获取
    let dbSessions: Session[] = [];
    if (activeSessions.length === 0) {
      dbSessions = await SessionModel.findByMachineId(machineId, {
        status: [SessionStatus.CREATED, SessionStatus.CONNECTED],
      });
    }

    // 合并会话数据
    const sessions = activeSessions.length > 0 ? activeSessions : dbSessions;

    logger.debug(`处理机器 ${machineId} 上的 ${sessions.length} 个活跃会话`);

    for (const session of sessions) {
      try {
        const sessionId = session.id;

        // 计算会话持续时间
        const now = new Date();
        const startTime = new Date(session.start_time ?? 0);
        const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);

        // 在内存中更新会话状态
        memoryStore.updateSessionStatus({
          ...session,
          status: SessionStatus.ERROR,
          last_activity: now,
        } as Parameters<typeof memoryStore.updateSessionStatus>[0]);

        // 同时在数据库中标记会话为错误状态
        await SessionModel.markError(sessionId, duration);
        logger.debug(`标记会话为错误状态 (sessionId: ${sessionId}, machineId: ${machineId})`);

        // 扣除用户点数（每分钟1点）
        // 即使会话只运行了几秒钟，也至少消耗 1 点
        const minutes = duration > 0 ? Math.max(1, Math.ceil(duration / 60)) : 0;
        const userId = typeof session.user_id === 'number' ? session.user_id : parseInt(session.user_id as string, 10);

        try {
          await UserModel.deductCredits(userId, minutes);
          logger.debug(`已扣除用户 ${userId} 的点数: ${minutes} 点 (sessionId: ${sessionId})`);
        } catch (error: unknown) {
          logger.error(`扣除点数失败 (sessionId: ${sessionId}):`, error);
        }

        // 触发 Webhook 事件
        await createWebhookEvent(userId, WebhookEventType.SESSION_ERROR, {
          session_id: sessionId,
          error: '机器离线',
          error_at: now,
          duration,
        });

        // 减少机器的实例计数
        await MachineModel.decrementInstanceCount(machineId);
      } catch (error: unknown) {
        logger.error(`处理会话 ${session.id} 时出错:`, error);
      }
    }
  } catch (error: unknown) {
    logger.error(`处理机器 ${machineId} 上的会话时出错:`, error);
  }
}

/**
 * 使用新方法处理离线机器上的会话
 * 将离线机器上的所有活跃会话标记为错误状态
 */
async function handleOfflineMachineSessionsV2(machineId: string): Promise<void> {
  try {
    // 获取该机器上的所有活跃会话
    const activeSessions = await SessionModel.findActiveSessionsByMachineId(machineId);
    logger.debug(`机器 ${machineId} 上有 ${activeSessions.length} 个活跃会话需要处理`);

    // 将所有活跃会话标记为错误状态
    for (const session of activeSessions) {
      // 计算会话持续时间
      const now = new Date();
      const startTime = session.start_time ? new Date(session.start_time) : new Date(session.created_at);
      const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);

      // 计算消耗的点数（每分钟1点）
      // 即使会话只运行了几秒钟，也至少消耗 1 点
      const creditsUsed = duration > 0 ? Math.max(1, Math.ceil(duration / 60)) : 0;

      await SessionModel.update(session.id, {
        status: SessionStatus.ERROR,
        end_time: new Date(),
        duration,
        credits_used: creditsUsed,
        error_message: '机器意外离线',
      });

      logger.debug(`会话 ${session.id} 已标记为错误状态`);

      // 同时更新内存中的会话状态
      const memorySession = memoryStore.getSession(session.id);
      if (memorySession) {
        memorySession.status = SessionStatus.ERROR;
        memoryStore.updateSessionStatus(memorySession);
      }
    }

    logger.debug(`机器 ${machineId} 上的所有会话已处理完成`);
  } catch (error: unknown) {
    logger.error(`处理离线机器会话失败 (${machineId}):`, error);
  }
}

/**
 * 强制检查所有机器状态
 * 根据实际连接情况更新机器状态
 */
export async function forceCheckAllMachines(): Promise<void> {
  try {
    // 获取所有标记为在线的机器
    const onlineMachines = await MachineModel.findByStatus('online');
    logger.debug(`数据库中有 ${onlineMachines.items.length} 台标记为在线的机器`);

    // 获取实际连接的机器ID列表
    const connectedMachineIds = connectionManager.getAllConnectedMachines();
    logger.debug(`实际有 ${connectedMachineIds.length} 台已连接的机器`);

    // 将不在连接列表中的"在线"机器标记为离线
    let updatedCount = 0;
    for (const machine of onlineMachines.items) {
      if (!connectedMachineIds.includes(machine.id)) {
        logger.warn(`机器 ${machine.id} 标记为在线但实际未连接，正在更新状态`);
        await MachineModel.update(machine.id, { status: 'offline' });
        memoryStore.markMachineOffline(machine.id);

        // 处理该机器上的会话
        await handleOfflineMachineSessionsV2(machine.id);
        updatedCount++;
      }
    }

    logger.debug(`强制检查完成，共更新了 ${updatedCount} 台机器的状态`);
  } catch (error: unknown) {
    logger.error('强制检查机器状态失败:', error);
  }
}

/**
 * 清理长时间未活动的机器记录
 */
export async function cleanupOldMachines(daysThreshold: number = 30): Promise<void> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysThreshold);

    // 删除长时间未活动的离线机器
    const result = await MachineModel.deleteOldMachines(cutoffDate);

    logger.debug(`已清理 ${result} 台长时间未活动的机器记录`);
  } catch (error: unknown) {
    logger.error('清理旧机器记录失败:', error);
  }
}

/**
 * 启动机器监控服务
 */
export async function startMachineMonitor(intervalMs: number = 30000): Promise<NodeJS.Timeout> {
  logger.debug(`启动机器监控服务，检查间隔: ${intervalMs}ms`);

  // 首先从数据库加载初始数据到内存
  try {
    await memoryStore.loadInitialData();
    logger.debug('已从数据库加载初始数据到内存');
  } catch (error: unknown) {
    logger.error('从数据库加载初始数据失败:', error);
  }

  // 立即执行一次强制检查
  try {
    await forceCheckAllMachines();
    logger.debug('初始机器状态强制检查完成');
  } catch (error: unknown) {
    logger.error('初始机器状态强制检查失败:', error);
  }

  // 立即执行一次常规检查
  try {
    await checkMachineStatus();
    logger.debug('初始机器状态检查完成');
  } catch (error: unknown) {
    logger.error('初始机器状态检查失败:', error);
  }

  // 设置定时器定期检查
  const mainTimer = setInterval(() => {
    checkMachineStatus().catch((error) => {
      logger.error('定期机器状态检查失败:', error);
    });

    // 每5分钟执行一次强制检查
    const now = new Date();
    if (now.getMinutes() % 5 === 0 && now.getSeconds() < 10) {
      forceCheckAllMachines().catch((error) => {
        logger.error('强制机器状态检查失败:', error);
      });
    }

    // 每天凌晨执行一次清理
    if (now.getHours() === 0 && now.getMinutes() === 0 && now.getSeconds() < 10) {
      cleanupOldMachines().catch((error) => {
        logger.error('清理旧机器记录失败:', error);
      });
    }
  }, intervalMs);

  return mainTimer;
}

/**
 * 停止机器监控服务
 */
export function stopMachineMonitor(timerId: NodeJS.Timeout): void {
  if (timerId) {
    clearInterval(timerId);
    logger.debug('机器监控服务已停止');
  }
}

export default {
  checkMachineStatus,
  forceCheckAllMachines,
  cleanupOldMachines,
  startMachineMonitor,
  stopMachineMonitor,
};
