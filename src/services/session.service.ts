import { SessionModel } from '../models/session.model.js';
import { MachineModel } from '../models/machine.model.js';
import { SessionStatus, SessionCreateOptions, WebhookEventType } from '@shared/types/index.js';
import { logger } from '@shared/utils/logger.js';
import { createWebhookEvent } from '../utils/webhook.js';
import { env } from '../config/env.js';
import { db } from '../config/database.js';
import { calculateCreditsUsed } from '@shared/utils/credits-calculator.js';
import { v4 as uuidv4 } from 'uuid';
// Dynamic import to avoid import-time side effects (gRPC/proto loading)
// machine-grpc/index.ts creates connectionManager and loads proto at import time

export interface ReleaseSessionOptions {
  sessionId: string;
  userId: number;
  machineId?: string;
  force?: boolean;
}

export interface ReleaseSessionResult {
  sessionId: string;
  duration: number;
  creditsUsed: number;
  alreadyDisconnected: boolean;
}

const TERMINAL_STATUSES: SessionStatus[] = [
  SessionStatus.DISCONNECTED,
  SessionStatus.ERROR,
  SessionStatus.EXPIRED,
  SessionStatus.COMPLETED,
];

export async function releaseSession(options: ReleaseSessionOptions): Promise<ReleaseSessionResult> {
  const { sessionId, userId, machineId } = options;

  return db.transaction(async (trx) => {
    const session = await trx('sessions').where({ id: sessionId }).first();
    if (!session) {
      throw new Error('会话不存在');
    }

    if (TERMINAL_STATUSES.includes(session.status as SessionStatus)) {
      return {
        sessionId,
        duration: session.duration || 0,
        creditsUsed: session.credits_used || 0,
        alreadyDisconnected: true,
      };
    }

    const now = new Date();
    const startTime = session.start_time ? new Date(session.start_time) : new Date(session.created_at);
    const duration = Math.max(0, Math.floor((now.getTime() - startTime.getTime()) / 1000));

    const creditsUsed = calculateCreditsUsed(duration);
    const initialCreditsUsed = session.credits_used || 0;
    const creditsDiff = creditsUsed - initialCreditsUsed;

    const updateResult = await trx('sessions').where({ id: sessionId }).whereNotIn('status', TERMINAL_STATUSES).update({
      status: SessionStatus.DISCONNECTED,
      end_time: now,
      duration,
      credits_used: creditsUsed,
      updated_at: now,
    });

    if (updateResult === 0) {
      const current = await trx('sessions').where({ id: sessionId }).first();
      return {
        sessionId,
        duration: current?.duration || duration,
        creditsUsed: current?.credits_used || creditsUsed,
        alreadyDisconnected: true,
      };
    }

    if (creditsDiff !== 0) {
      if (creditsDiff > 0) {
        const absDiff = creditsDiff;
        const affected = await trx('users')
          .where({ id: userId })
          .where('credits', '>=', absDiff)
          .decrement('credits', absDiff);
        if (affected === 0) {
          await trx('users').where({ id: userId }).update({ credits: 0, updated_at: now });
        }
      } else {
        await trx('users').where({ id: userId }).increment('credits', -creditsDiff);
      }

      const userAfterSettlement = await trx('users').where({ id: userId }).first();
      const balanceAfter = userAfterSettlement!.credits;

      await trx('credit_history').insert({
        user_id: userId,
        amount: Math.abs(creditsDiff),
        action: creditsDiff > 0 ? 'use' : 'refund',
        balance_after: balanceAfter,
        description: `Session settlement: ${sessionId.substring(0, 8)}... (${duration}s, pre-deducted: ${initialCreditsUsed}, actual: ${creditsUsed})`,
        metadata: JSON.stringify({
          session_id: sessionId,
          duration,
          pre_deducted: initialCreditsUsed,
          actual: creditsUsed,
          diff: creditsDiff,
        }),
        created_at: now,
        updated_at: now,
      });
    }

    if (machineId) {
      await trx('machines')
        .where({ id: machineId })
        .update({
          instance_count: trx.raw('CASE WHEN instance_count > 0 THEN instance_count - 1 ELSE 0 END'),
          updated_at: now,
        });
    }

    return { sessionId, duration, creditsUsed, alreadyDisconnected: false };
  });
}

const SESSION_COST = 1;

/**
 * 创建浏览器会话的核心服务
 * 从controller抽离出来，供API和WebSocket直连两种方式共同使用
 * @param userId 用户ID
 * @param options 会话选项
 * @param isWebSocketDirect 是否为WebSocket直连模式，默认为false
 */
export async function createBrowserSession(
  userId: number,
  options: SessionCreateOptions = {},
  isWebSocketDirect = false,
  isDemo = false
) {
  if (!options.viewport) {
    options.viewport = {
      width: 1280,
      height: 800,
    };
  }

  logger.info(`创建会话的选项: ${JSON.stringify(options)}`);

  logger.info('开始查找可用的实例机器');
  const machine = await MachineModel.findAvailable();
  if (!machine) {
    logger.error('没有找到可用的实例机器');
    throw new Error('当前没有可用的实例机器，请稍后再试');
  }

  const machineId = machine.id;
  logger.info(`找到可用的实例机器: ${machineId}`);

  const { sessionId, createdAt } = await db.transaction(async (trx) => {
    const user = await trx('users').where({ id: userId }).first();
    if (!user) {
      throw new Error('用户不存在');
    }

    if (!isDemo) {
      if (user.credits <= 0) {
        throw new Error('点数不足，请联系管理员充值');
      }

      if (user.credits < SESSION_COST) {
        throw new Error('点数不足，无法创建会话');
      }
    }

    const activeResult = await trx('sessions')
      .where({ user_id: userId })
      .whereIn('status', [SessionStatus.CREATED, SessionStatus.CONNECTED])
      .count('id as count')
      .first();
    const activeCount = activeResult ? Number(activeResult.count) : 0;

    if (activeCount >= env.MAX_SESSIONS_PER_USER) {
      throw new Error(
        `Session limit reached: user has ${activeCount} active sessions, max is ${env.MAX_SESSIONS_PER_USER}`
      );
    }

    const [machineInTx] = await trx('machines')
      .where({ id: machineId })
      .whereRaw('instance_count < max_instances')
      .select('*')
      .forUpdate()
      .limit(1);
    if (!machineInTx) {
      throw new Error('Machine no longer available');
    }

    const now = new Date();
    if (!isDemo) {
      const affectedRows = await trx('users')
        .where({ id: userId })
        .where('credits', '>=', SESSION_COST)
        .decrement('credits', SESSION_COST);

      if (affectedRows === 0) {
        throw new Error('积分不足，无法创建会话');
      }

      const userAfterDeduction = await trx('users').where({ id: userId }).first();
      const balanceAfter = userAfterDeduction!.credits;

      await trx('credit_history').insert({
        user_id: userId,
        amount: SESSION_COST,
        action: 'use',
        balance_after: balanceAfter,
        description: `Session pre-deduct: user ${userId}`,
        metadata: JSON.stringify({ type: 'pre_deduct' }),
        created_at: now,
        updated_at: now,
      });
    }

    const newSessionId = uuidv4();
    await trx('sessions').insert({
      id: newSessionId,
      user_id: userId,
      machine_id: machineId,
      status: SessionStatus.CREATED,
      options: JSON.stringify(options),
      credits_used: isDemo ? 0 : SESSION_COST,
      created_at: now,
      updated_at: now,
    });

    await trx('machines').where({ id: machineId }).increment('instance_count', 1);

    return { sessionId: newSessionId, createdAt: now };
  });

  logger.info(`创建会话成功: ${sessionId}`);

  try {
    logger.info(`向机器 ${machineId} 发送启动浏览器请求 (sessionId: ${sessionId})`);

    const { connectionManager } = await import('./machine-grpc/index.js');
    const launchOptions = { ...options, userId };
    const result = await connectionManager.launchBrowser(machineId, sessionId, launchOptions);
    logger.info(`启动浏览器结果: ${JSON.stringify(result)}`);

    const now = new Date();
    await SessionModel.update(sessionId, {
      port: result.port as number,
      status: isWebSocketDirect ? SessionStatus.CONNECTED : SessionStatus.CREATED,
      start_time: now,
    });

    logger.info(`会话已更新并设置开始时间 (${sessionId}): ${now.toISOString()}`);

    await createWebhookEvent(userId, WebhookEventType.SESSION_CREATED, {
      session_id: sessionId,
      created_at: createdAt,
    });

    logger.info(`原始 WebSocket 端点: ${result.browser_ws_endpoint}`);

    let directUrl;

    if (env.PUBLIC_MANAGER_URL) {
      directUrl = `ws://${env.PUBLIC_MANAGER_URL}/ws/connect?sessionId=${sessionId}`;
      logger.info(`使用 Manager 公共 URL 构建 WebSocket 端点: ${directUrl}`);
    } else if (env.PUBLIC_MACHINE_ENDPOINT) {
      directUrl = `ws://${env.PUBLIC_MACHINE_ENDPOINT}?sessionId=${sessionId}`;
      logger.info(`使用公共端点构建 WebSocket 端点: ${directUrl}`);
    } else {
      const machineIp = process.env.NODE_ENV === 'test' ? '127.0.0.1' : machine.ip || 'localhost';
      const proxyPort = machine.proxyPort || 8082;
      directUrl = `ws://${machineIp}:${proxyPort}?sessionId=${sessionId}`;
      logger.info(`使用机器IP构建 WebSocket 端点: ${directUrl}`);
    }

    const machineIp = process.env.NODE_ENV === 'test' ? '127.0.0.1' : machine.ip || 'localhost';
    const proxyPort = machine.proxyPort || 8082;
    const internalTargetUrl = `ws://${machineIp}:${proxyPort}?sessionId=${sessionId}`;

    logger.info(`构建的直接 WebSocket 端点: ${directUrl}`);

    return {
      sessionId,
      status: isWebSocketDirect ? SessionStatus.CONNECTED : SessionStatus.CREATED,
      browserWSEndpoint: result.browser_ws_endpoint,
      directUrl,
      internalTargetUrl,
      machineId,
      created_at: createdAt,
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errorCode = (error as { code?: string }).code;
    if (
      errorCode === 'SHARED_SESSION_EXISTS' ||
      errMsg.includes('活跃的共享数据会话') ||
      errMsg.includes('每个用户同时只能有 1 个共享数据会话')
    ) {
      logger.warn(`共享会话冲突: ${errMsg}`);
      await db('machines').where({ id: machineId }).decrement('instance_count', 1);
      await SessionModel.update(sessionId, { status: SessionStatus.ERROR });
      throw new Error(errMsg);
    }

    await SessionModel.update(sessionId, { status: SessionStatus.ERROR });
    await MachineModel.decrementInstanceCount(machineId);

    logger.error(`会话错误信息: ${errMsg}`);
    logger.error(`启动浏览器实例失败 (sessionId: ${sessionId}):`, error);

    throw new Error(`启动浏览器实例失败: ${errMsg}`);
  }
}

/**
 * 处理会话断开连接
 */
export async function handleSessionDisconnect(sessionId: string, userId: number, machineId: string) {
  try {
    logger.info(`处理会话断开连接 (sessionId: ${sessionId})`);

    const result = await releaseSession({ sessionId, userId, machineId });

    if (result.alreadyDisconnected) {
      logger.info(`会话已经处于断开状态: ${sessionId}`);
      return;
    }

    try {
      logger.info(`向机器 ${machineId} 发送关闭浏览器请求 (sessionId: ${sessionId})`);
      const { connectionManager } = await import('./machine-grpc/index.js');
      await connectionManager.closeBrowser(machineId, sessionId);
    } catch (error) {
      logger.error(`关闭浏览器失败 (sessionId: ${sessionId}):`, error);
    }

    await createWebhookEvent(userId, WebhookEventType.SESSION_DISCONNECTED, {
      session_id: sessionId,
      disconnected_at: new Date(),
    });

    logger.info(`会话断开处理完成 (${sessionId}): 持续时间=${result.duration}秒, 消耗点数=${result.creditsUsed}点`);
  } catch (error) {
    logger.error(`处理会话断开连接失败 (sessionId: ${sessionId}):`, error);
    // 重新抛出错误，避免会话释放失败被静默吞掉
    // 调用方可以根据需要进行重试或上报
    throw error;
  }
}
