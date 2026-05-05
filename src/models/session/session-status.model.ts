import { db } from '../../config/database.js';
import { SessionStatus, WebhookEventType } from '@shared/types/index.js';
import { logger } from '@shared/utils/logger.js';
import type { Session } from './types.js';
import { crudMethods } from './session-crud.model.js';

export const statusMethods = {
  async markMachineSessionsAsDisconnected(machineId: string): Promise<number> {
    logger.info(`数据库层面：标记机器 ${machineId} 的所有活跃会话为 DISCONNECTED`);
    try {
      const result = await db('sessions')
        .where('machine_id', machineId)
        .whereIn('status', [SessionStatus.CREATED, SessionStatus.CONNECTED])
        .update({
          status: SessionStatus.DISCONNECTED,
          updated_at: new Date(),
        });
      logger.info(`数据库层面：机器 ${machineId} 有 ${result} 个会话被标记为 DISCONNECTED`);
      return result;
    } catch (error) {
      logger.error(`数据库层面：标记机器 ${machineId} 会话为 DISCONNECTED 时出错:`, error);
      throw error;
    }
  },

  async markConnected(id: string): Promise<Session | null> {
    await db('sessions').where({ id }).update({
      status: SessionStatus.CONNECTED,
      updated_at: new Date(),
    });

    return crudMethods.findById(id);
  },

  async markDisconnected(id: string, duration: number): Promise<Session | null> {
    const { logger } = await import('@shared/utils/logger.js');

    const session = await crudMethods.findById(id);
    if (!session) {
      logger.error(`标记会话已断开失败: 会话不存在 (${id})`);
      return null;
    }

    const initialCreditsUsed = session.credits_used || 0;
    const userId = session.user_id;

    let finalDuration = duration;
    if (finalDuration === 0 && session.start_time) {
      const now = new Date();
      const rawSession = await db('sessions').where({ id }).select('start_time').first();
      const rawStartTime = rawSession?.start_time;

      if (rawStartTime && typeof rawStartTime === 'string') {
        const startTime = new Date(rawStartTime.replace(' ', 'T') + '.000Z');
        finalDuration = Math.ceil((now.getTime() - startTime.getTime()) / 1000);
        logger.info(
          `根据开始时间计算持续时间 (${id}): 原始时间=${rawStartTime}, 当前时间=${now.toISOString()}, 持续时间=${finalDuration}秒`
        );
      } else {
        const startTime = new Date(session.start_time);
        finalDuration = Math.ceil((now.getTime() - startTime.getTime()) / 1000);
        logger.info(`降级处理：使用 Date 对象计算持续时间 (${id}): 持续时间=${finalDuration}秒`);
      }
    }

    if (finalDuration < 0) {
      finalDuration = 0;
      logger.warn(`持续时间为负数，重置为0 (${id})`);
    }

    const creditsUsed = finalDuration >= 0 ? Math.max(1, Math.ceil(finalDuration / 60)) : 0;

    logger.info(
      `标记会话已断开 (${id}): 持续时间=${finalDuration}秒, 消耗点数=${creditsUsed}点, 初始消耗=${initialCreditsUsed}点`
    );

    try {
      const updateResult = await db('sessions')
        .where({ id })
        .whereNotIn('status', [
          SessionStatus.DISCONNECTED,
          SessionStatus.ERROR,
          SessionStatus.EXPIRED,
          SessionStatus.COMPLETED,
        ])
        .update({
          status: SessionStatus.DISCONNECTED,
          end_time: new Date(),
          duration: finalDuration,
          credits_used: creditsUsed,
          updated_at: new Date(),
        });

      const rowsAffected = Array.isArray(updateResult) ? updateResult[0] : updateResult;

      if (rowsAffected === 0) {
        logger.info(`会话已是终态或已被其他请求更新 (${id}), 直接返回当前状态`);
        return await crudMethods.findById(id);
      }

      logger.info(`数据库更新成功 (${id}), 影响行数: ${rowsAffected}`);

      const creditsToDeduct = Math.max(0, creditsUsed - initialCreditsUsed);

      if (creditsToDeduct > 0) {
        try {
          const { UserModel } = await import('../user.model.js');
          const user = await UserModel.findById(userId);
          const balanceAfter = user ? user.credits - creditsToDeduct : 0;

          await UserModel.deductCredits(userId, creditsToDeduct);
          logger.info(
            `🔴 扣除点数: ${creditsToDeduct} 点, 用户 ${userId} (初始${initialCreditsUsed} -> ${creditsUsed})`
          );

          const { CreditHistoryModel } = await import('../credit-history.model.js');
          await CreditHistoryModel.create({
            user_id: userId,
            amount: creditsToDeduct,
            action: 'use',
            balance_after: balanceAfter,
            description: `Session usage: ${id.substring(0, 8)}... (${finalDuration}s)`,
            metadata: { session_id: id, duration: finalDuration },
          });
          logger.info(`✅ 创建积分历史记录: 用户 ${userId}, 扣除 ${creditsToDeduct} 点, 剩余 ${balanceAfter} 点`);
        } catch (error) {
          logger.error(`扣除用户 ${userId} 的点数失败:`, error);
        }
      } else {
        logger.info(`无需额外扣费 (${id}), credits_used 未增加`);
      }

      return await crudMethods.findById(id);
    } catch (error) {
      logger.error(`标记会话已断开失败 (${id}):`, error);
      return null;
    }
  },

  async markExpired(id: string, duration: number): Promise<Session | null> {
    const { logger } = await import('@shared/utils/logger.js');

    const session = await crudMethods.findById(id);
    if (!session) return null;

    const previousCreditsUsed = session.credits_used || 0;

    let finalDuration = duration;
    if (duration === 0 && session.start_time) {
      const now = new Date();
      let startTime: Date;
      const startTimeValue = session.start_time as Date | string;
      if (typeof startTimeValue === 'string') {
        startTime = new Date(startTimeValue.replace(' ', 'T') + '.000Z');
      } else {
        startTime = new Date(startTimeValue);
      }
      finalDuration = Math.ceil((now.getTime() - startTime.getTime()) / 1000);
      logger.info(
        `根据开始时间计算持续时间 (${id}): 开始时间=${session.start_time}, 当前时间=${now.toISOString()}, 持续时间=${finalDuration}秒`
      );
    }

    if (finalDuration < 0) {
      logger.warn(`持续时间为负数 (${finalDuration}秒)，重置为0`);
      finalDuration = 0;
    }

    const creditsUsed = finalDuration >= 0 ? Math.max(1, Math.ceil(finalDuration / 60)) : 0;

    logger.info(
      `标记会话已过期 (${id}): 持续时间=${finalDuration}秒, 消耗点数=${creditsUsed}点, 初始消耗=${previousCreditsUsed}点`
    );

    await db('sessions').where({ id }).update({
      status: SessionStatus.EXPIRED,
      end_time: new Date(),
      duration: finalDuration,
      credits_used: creditsUsed,
      updated_at: new Date(),
    });

    const updatedSession = await crudMethods.findById(id);

    if (updatedSession && creditsUsed > previousCreditsUsed) {
      const creditsToDeduct = creditsUsed - previousCreditsUsed;
      try {
        const { UserModel } = await import('../user.model.js');
        await UserModel.deductCredits(session.user_id, creditsToDeduct);
      } catch (error) {
        logger.error(`扣除用户 ${session.user_id} 的点数失败:`, error);
      }
    }

    return updatedSession;
  },

  async markError(id: string, duration: number = 0): Promise<Session | null> {
    const { logger } = await import('@shared/utils/logger.js');

    const session = await crudMethods.findById(id);
    if (!session) return null;

    const previousCreditsUsed = session.credits_used || 0;

    let finalDuration = duration;
    if (duration === 0 && session.start_time) {
      const now = new Date();
      let startTime: Date;
      const startTimeValue = session.start_time as Date | string;
      if (typeof startTimeValue === 'string') {
        startTime = new Date(startTimeValue.replace(' ', 'T') + '.000Z');
      } else {
        startTime = new Date(startTimeValue);
      }
      finalDuration = Math.ceil((now.getTime() - startTime.getTime()) / 1000);
      logger.info(
        `根据开始时间计算持续时间 (${id}): 开始时间=${session.start_time}, 当前时间=${now.toISOString()}, 持续时间=${finalDuration}秒`
      );
    }

    if (finalDuration < 0) {
      logger.warn(`持续时间为负数 (${finalDuration}秒)，重置为0`);
      finalDuration = 0;
    }

    const creditsUsed = finalDuration >= 0 ? Math.max(1, Math.ceil(finalDuration / 60)) : 0;

    logger.info(
      `标记会话错误 (${id}): 持续时间=${finalDuration}秒, 消耗点数=${creditsUsed}点, 初始消耗=${previousCreditsUsed}点`
    );

    await db('sessions').where({ id }).update({
      status: SessionStatus.ERROR,
      end_time: new Date(),
      duration: finalDuration,
      credits_used: creditsUsed,
      updated_at: new Date(),
    });

    const updatedSession = await crudMethods.findById(id);

    if (updatedSession && creditsUsed > previousCreditsUsed) {
      const creditsToDeduct = creditsUsed - previousCreditsUsed;
      try {
        const { UserModel } = await import('../user.model.js');
        await UserModel.deductCredits(session.user_id, creditsToDeduct);
      } catch (error) {
        logger.error(`扣除用户 ${session.user_id} 的点数失败:`, error);
      }
    }

    return updatedSession;
  },

  async checkExpiredSessions(timeoutMs: number): Promise<number> {
    try {
      const now = new Date();
      const timeoutDate = new Date(now.getTime() - timeoutMs);

      const expiredSessions = await db('sessions')
        .whereIn('status', [SessionStatus.CREATED, SessionStatus.CONNECTED])
        .where('start_time', '<', timeoutDate);

      logger.info(`找到 ${expiredSessions.length} 个超时会话`);

      if (expiredSessions.length > 0) {
        for (const session of expiredSessions) {
          let startTime: Date;
          if (typeof session.start_time === 'string') {
            startTime = new Date(session.start_time.replace(' ', 'T') + '.000Z');
          } else {
            startTime = new Date(session.start_time);
          }
          const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);

          await this.markExpired(session.id, duration);
          logger.info(`标记会话过期: ${session.id}, 持续时间: ${duration} 秒`);

          const minutes = Math.ceil(duration / 60);
          try {
            const { UserModel } = await import('../user.model.js');
            await UserModel.deductCredits(session.user_id, minutes);
            logger.info(`已扣除用户 ${session.user_id} 的点数: ${minutes} 点 (超时会话 ${session.id})`);

            const { createWebhookEvent } = await import('../../utils/webhook.js');
            await createWebhookEvent(session.user_id, WebhookEventType.SESSION_EXPIRED, {
              session_id: session.id,
              duration,
              expired_at: now,
            });
          } catch (error) {
            logger.error(`扣除点数失败 (超时会话 ${session.id}):`, error);
          }
        }
      }

      return expiredSessions.length;
    } catch (error) {
      logger.error('检查超时会话失败:', error);
      return 0;
    }
  },
};
