import { db } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';
import { SessionStatus, SessionCreateOptions, PaginationQuery, PaginatedResponse } from '@shared/types/index.js';
import { logger } from '@shared/utils/logger.js';

export interface Session {
  id: string;
  user_id: number;
  machine_id: string | null;
  port: number | null;
  status: SessionStatus;
  options: SessionCreateOptions | null;
  start_time: Date;
  end_time: Date | null;
  disconnected_at: Date | null;
  duration: number;
  credits_used: number;
  screenshot_url: string | null;
  last_activity: Date | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateSessionInput {
  user_id: number;
  machine_id?: string;
  port?: number;
  options?: SessionCreateOptions;
}

export interface UpdateSessionInput {
  machine_id?: string;
  port?: number;
  status?: SessionStatus;
  start_time?: Date;
  end_time?: Date;
  disconnected_at?: Date;
  duration?: number;
  credits_used?: number;
  screenshot_url?: string;
  last_activity?: Date;
  error_message?: string;
}

export class SessionModel {
  // 创建会话
  static async create(data: CreateSessionInput): Promise<Session | null> {
    const sessionId = uuidv4();

    let optionsJson = null;
    if (data.options) {
      // Validate that options can be serialized to JSON
      try {
        optionsJson = JSON.stringify(data.options);
        // Verify it can be parsed back
        JSON.parse(optionsJson);
      } catch (error) {
        throw new Error('Invalid options format: must be valid JSON');
      }
    }

    await db('sessions').insert({
      id: sessionId,
      user_id: data.user_id,
      machine_id: data.machine_id || null,
      port: data.port || null,
      status: SessionStatus.CREATED,
      options: optionsJson,
      start_time: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    });

    return this.findById(sessionId);
  }
  static async markMachineSessionsAsDisconnected(machineId: string): Promise<number> {
    logger.info(`数据库层面：标记机器 ${machineId} 的所有活跃会话为 DISCONNECTED`);
    try {
      const result = await db('sessions')
        .where('machine_id', machineId)
        .whereIn('status', [SessionStatus.CREATED, SessionStatus.CONNECTED])
        .update({
          status: SessionStatus.DISCONNECTED,
          updated_at: new Date() // 自动更新时间戳
        });
      logger.info(`数据库层面：机器 ${machineId} 有 ${result} 个会话被标记为 DISCONNECTED`);
      return result; // 返回更新的行数
    } catch (error) {
      logger.error(`数据库层面：标记机器 ${machineId} 会话为 DISCONNECTED 时出错:`, error);
      throw error; // 或者根据你的错误处理策略返回 0
    }
  }

  // 通过 ID 查找会话
  static async findById(id: string): Promise<Session | null> {
    try {
      const session = await db('sessions').where({ id }).first();
      if (!session) return null;

      let parsedOptions = null;
      if (session.options) {
        try {
          // 如果 options 是字符串，尝试解析它
          if (typeof session.options === 'string') {
            parsedOptions = JSON.parse(session.options);
          } else {
            // 如果已经是对象，直接使用
            parsedOptions = session.options;
          }
        } catch (error) {
          console.error(`解析会话选项失败 (ID: ${id}):`, error);
          parsedOptions = null;
        }
      }

      return {
        ...session,
        options: parsedOptions,
      };
    } catch (error) {
      console.error(`查找会话失败 (ID: ${id}):`, error);
      return null;
    }
  }

  // 更新会话
  static async update(id: string, data: UpdateSessionInput): Promise<Session | null> {
    const updateData: any = {
      ...data,
      updated_at: new Date(),
    };

    await db('sessions').where({ id }).update(updateData);
    return this.findById(id);
  }

  /**
   * 批量更新会话
   * @param updates 会话更新数据数组
   * @param trx 事务对象（可选）
   * @returns 更新的会话数量
   */
  static async batchUpdate(
    updates: Array<{ id: string; duration: number; credits_used: number }>,
    trx?: any
  ): Promise<number> {
    try {
      let count = 0;
      const queryBuilder = trx || db;

      for (const update of updates) {
        await queryBuilder('sessions')
          .where('id', update.id)
          .update({
            duration: update.duration,
            credits_used: update.credits_used,
            updated_at: new Date()
          });
        count++;
      }

      return count;
    } catch (error) {
      console.error('批量更新会话失败:', error);
      throw error;
    }
  }




  // 标记会话已连接
  static async markConnected(id: string): Promise<Session | null> {
    await db('sessions').where({ id }).update({
      status: SessionStatus.CONNECTED,
      updated_at: new Date(),
    });

    return this.findById(id);
  }

  // 标记会话已断开
  static async markDisconnected(id: string, duration: number): Promise<Session | null> {
    // 使用 logger 而不是 console.log
    const { logger } = await import('@shared/utils/logger.js');

    // 如果提供的持续时间为0，尝试根据开始时间计算
    let finalDuration = duration;

    // 先检查会话是否存在
    const session = await this.findById(id);
    if (!session) {
      logger.error(`标记会话已断开失败: 会话不存在 (${id})`);
      return null;
    }

    // 如果提供的持续时间为0且会话有开始时间，尝试计算持续时间
    if (finalDuration === 0 && session.start_time) {
      const now = new Date();
      const startTime = new Date(session.start_time);
      finalDuration = Math.floor((now.getTime() - startTime.getTime()) / 1000);
      logger.info(`根据开始时间计算持续时间 (${id}): 开始时间=${startTime.toISOString()}, 当前时间=${now.toISOString()}, 持续时间=${finalDuration}秒`);
    }

    // 计算消耗的点数（每分钟1点）
    // 即使会话只运行了几秒钟，也至少消耗 1 点
    const creditsUsed = finalDuration > 0 ? Math.max(1, Math.ceil(finalDuration / 60)) : 0;

    logger.info(`标记会话已断开 (${id}): 持续时间=${finalDuration}秒, 消耗点数=${creditsUsed}点, 数据源: 会话模型`);

    try {

      // 打印会话当前状态
      logger.info(`会话当前状态 (${id}): 状态=${session.status}, 持续时间=${session.duration}秒, 消耗点数=${session.credits_used}点`);

      // 更新会话状态
      // 如果已有持续时间和消耗点数，取最大值
      if (session.duration > 0 || session.credits_used > 0) {
        // 取最大值，确保不会减少
        const newDuration = Math.max(session.duration, duration);
        const newCreditsUsed = Math.max(session.credits_used, creditsUsed);

        logger.info(`会话已有持续时间和消耗点数，取最大值 (${id}): 原持续时间=${session.duration}秒, 新持续时间=${newDuration}秒, 原消耗点数=${session.credits_used}点, 新消耗点数=${newCreditsUsed}点`);

        await db('sessions').where({ id }).update({
          status: SessionStatus.DISCONNECTED,
          end_time: new Date(),
          duration: newDuration,
          credits_used: newCreditsUsed,
          updated_at: new Date(),
        });

        logger.info(`更新会话状态，使用最大值 (${id}): 持续时间=${newDuration}秒, 消耗点数=${newCreditsUsed}点`);
      } else {
        // 如果没有持续时间和消耗点数，直接更新
        logger.info(`会话没有持续时间和消耗点数，直接更新 (${id}): 持续时间=${finalDuration}秒, 消耗点数=${creditsUsed}点`);

        await db('sessions').where({ id }).update({
          status: SessionStatus.DISCONNECTED,
          end_time: new Date(),
          duration: finalDuration,
          credits_used: creditsUsed,
          updated_at: new Date(),
        });

        logger.info(`更新会话状态，直接更新 (${id}): 持续时间=${finalDuration}秒, 消耗点数=${creditsUsed}点`);
      }

      // 更新会话状态结果日志
      logger.info(`更新会话状态完成 (${id})`);

      // 检查更新后的会话状态
      const updatedSession = await this.findById(id);
      if (updatedSession) {
        logger.info(`更新后的会话状态 (${id}): 状态=${updatedSession.status}, 持续时间=${updatedSession.duration}秒, 消耗点数=${updatedSession.credits_used}点`);
      } else {
        logger.error(`更新后无法获取会话 (${id})`);
      }

      return updatedSession;
    } catch (error) {
      logger.error(`标记会话已断开失败 (${id}):`, error);
      return null;
    }
  }

  // 标记会话已过期
  static async markExpired(id: string, duration: number): Promise<Session | null> {
    // 计算消耗的点数（每分钟1点）
    // 即使会话只运行了几秒钟，也至少消耗 1 点
    const creditsUsed = duration > 0 ? Math.max(1, Math.ceil(duration / 60)) : 0;

    await db('sessions').where({ id }).update({
      status: SessionStatus.EXPIRED,
      end_time: new Date(),
      duration,
      credits_used: creditsUsed,
      updated_at: new Date(),
    });

    return this.findById(id);
  }

  // 标记会话错误
  static async markError(id: string, duration: number = 0): Promise<Session | null> {
    // 计算消耗的点数（每分钟1点）
    // 即使会话只运行了几秒钟，也至少消耗 1 点
    const creditsUsed = duration > 0 ? Math.max(1, Math.ceil(duration / 60)) : 0;

    await db('sessions').where({ id }).update({
      status: SessionStatus.ERROR,
      end_time: new Date(),
      duration,
      credits_used: creditsUsed,
      updated_at: new Date(),
    });

    return this.findById(id);
  }

  // 获取用户的所有会话（分页）
  static async findByUserId(userId: number, query: PaginationQuery = {}): Promise<PaginatedResponse<Session>> {
    try {
      const page = query.page || 1;
      const limit = query.limit || 10;
      const offset = (page - 1) * limit;
      const sort = query.sort || 'created_at';
      const order = query.order || 'desc';

      const [sessions, total] = await Promise.all([
        db('sessions')
          .where({ user_id: userId })
          .orderBy(sort, order)
          .limit(limit)
          .offset(offset),
        db('sessions').where({ user_id: userId }).count('id as count').first(),
      ]);

      return {
        items: sessions.map((session: any) => {
          try {
            return {
              ...session,
              options: session.options ? (typeof session.options === 'string' ? JSON.parse(session.options) : session.options) : null,
            };
          } catch (error) {
            console.error(`解析会话选项失败 (ID: ${session.id}):`, error);
            return {
              ...session,
              options: null,
            };
          }
        }),
        total: total ? Number(total.count) : 0,
        page,
        limit,
        totalPages: Math.ceil((total ? Number(total.count) : 0) / limit),
      };
    } catch (error) {
      console.error(`获取用户会话失败 (userId: ${userId}):`, error);
      const page = query.page || 1;
      return {
        items: [],
        total: 0,
        page,
        limit: query.limit || 10,
        totalPages: 0,
      };
    }
  }

  // 获取所有活跃会话
  static async findActiveSessions(): Promise<Session[]> {
    try {
      console.log('开始查询活跃会话');
      const sessions = await db('sessions').whereIn('status', [
        SessionStatus.CREATED,
        SessionStatus.CONNECTED,
      ]);
      console.log(`找到 ${sessions.length} 个活跃会话`);

      return sessions.map((session: any) => {
        try {
          return {
            ...session,
            options: session.options ? (typeof session.options === 'string' ? JSON.parse(session.options) : session.options) : null,
          };
        } catch (error) {
          console.error(`解析会话选项失败 (ID: ${session.id}):`, error);
          return {
            ...session,
            options: null,
          };
        }
      });
    } catch (error) {
      console.error('查询活跃会话失败:', error);
      return [];
    }
  }

  // 获取用户的所有会话（不分页）
  static async getAllByUserId(userId: number): Promise<Session[]> {
    try {
      console.log(`开始查询用户 ${userId} 的所有会话`);
      const sessions = await db('sessions').where({ user_id: userId });
      console.log(`找到用户 ${userId} 的 ${sessions.length} 个会话`);

      return sessions.map((session: any) => {
        try {
          return {
            ...session,
            options: session.options ? (typeof session.options === 'string' ? JSON.parse(session.options) : session.options) : null,
          };
        } catch (error) {
          console.error(`解析会话选项失败 (ID: ${session.id}):`, error);
          return {
            ...session,
            options: null,
          };
        }
      });
    } catch (error) {
      console.error(`获取用户所有会话失败 (userId: ${userId}):`, error);
      return [];
    }
  }

  // 获取指定机器上的会话
  static async findByMachineId(machineId: string, options: { status?: SessionStatus[] } = {}): Promise<Session[]> {
    try {
      console.log(`开始查询机器 ${machineId} 上的会话`);

      let query = db('sessions').where({ machine_id: machineId });

      // 如果指定了状态过滤
      if (options.status && options.status.length > 0) {
        query = query.whereIn('status', options.status);
      }

      const sessions = await query;
      console.log(`找到机器 ${machineId} 上的 ${sessions.length} 个会话`);

      return sessions.map((session: any) => {
        try {
          return {
            ...session,
            options: session.options ? (typeof session.options === 'string' ? JSON.parse(session.options) : session.options) : null,
          };
        } catch (error) {
          console.error(`解析会话选项失败 (ID: ${session.id}):`, error);
          return {
            ...session,
            options: null,
          };
        }
      });
    } catch (error) {
      console.error(`查询机器 ${machineId} 上的会话失败:`, error);
      return [];
    }
  }

  // 获取所有会话（分页）
  static async findAll(query: PaginationQuery = {}): Promise<PaginatedResponse<Session>> {
    try {
      console.log('开始查询会话数据');
      const page = query.page || 1;
      const limit = query.limit || 10;
      const offset = (page - 1) * limit;
      const sort = query.sort || 'created_at';
      const order = query.order || 'desc';

      const [sessions, total] = await Promise.all([
        db('sessions')
          .orderBy(sort, order)
          .limit(limit)
          .offset(offset),
        db('sessions').count('id as count').first(),
      ]);

      console.log(`找到 ${sessions.length} 个会话，总数 ${total ? total.count : 0}`);

      return {
        items: sessions.map((session: any) => {
          try {
            return {
              ...session,
              options: session.options ? (typeof session.options === 'string' ? JSON.parse(session.options) : session.options) : null,
            };
          } catch (error) {
            console.error(`解析会话选项失败 (ID: ${session.id}):`, error);
            return {
              ...session,
              options: null,
            };
          }
        }),
        total: total ? Number(total.count) : 0,
        page,
        limit,
        totalPages: Math.ceil((total ? Number(total.count) : 0) / limit),
      };
    } catch (error) {
      console.error('查询会话数据失败:', error);
      // 返回空数据
      return {
        items: [],
        total: 0,
        page: query.page || 1,
        limit: query.limit || 10,
        totalPages: 0,
      };
    }
  }

  // 更新会话的最后活动时间
  static async updateLastActivity(id: string): Promise<Session | null> {
    await db('sessions').where({ id }).update({
      last_activity: new Date(),
      updated_at: new Date(),
    });

    return this.findById(id);
  }

  // 获取用户的会话消耗统计
  static async getUserSessionStats(userId: number): Promise<{ total_sessions: number; total_duration: number; total_credits_used: number }> {
    try {
      console.log(`开始查询用户 ${userId} 的会话消耗统计`);

      // 查询用户的所有会话数量
      const totalResult = await db('sessions').where({ user_id: userId }).count('id as count').first();
      const total_sessions = totalResult ? Number(totalResult.count) : 0;

      // 查询用户的总持续时间
      const durationResult = await db('sessions').where({ user_id: userId }).sum('duration as total').first();
      const total_duration = durationResult && durationResult.total ? Number(durationResult.total) : 0;

      // 查询用户的总消耗点数
      const creditsResult = await db('sessions').where({ user_id: userId }).sum('credits_used as total').first();
      const total_credits_used = creditsResult && creditsResult.total ? Number(creditsResult.total) : 0;

      console.log(`用户 ${userId} 的会话统计: 总会话数=${total_sessions}, 总时长=${total_duration}秒, 总消耗点数=${total_credits_used}点`);

      return {
        total_sessions,
        total_duration,
        total_credits_used
      };
    } catch (error) {
      console.error(`获取用户会话统计失败 (userId: ${userId}):`, error);
      return {
        total_sessions: 0,
        total_duration: 0,
        total_credits_used: 0
      };
    }
  }

  // 获取指定机器上的活跃会话
  static async findActiveSessionsByMachineId(machineId: string): Promise<Session[]> {
    try {
      console.log(`开始查询机器 ${machineId} 上的活跃会话`);

      // 查询指定机器上的活跃会话
      const sessions = await db('sessions')
        .where({ machine_id: machineId })
        .whereIn('status', [SessionStatus.CREATED, SessionStatus.CONNECTED]);

      console.log(`找到机器 ${machineId} 上的 ${sessions.length} 个活跃会话`);

      return sessions.map((session: any) => {
        try {
          return {
            ...session,
            options: session.options ? (typeof session.options === 'string' ? JSON.parse(session.options) : session.options) : null,
          };
        } catch (error) {
          console.error(`解析会话选项失败 (ID: ${session.id}):`, error);
          return {
            ...session,
            options: null,
          };
        }
      });
    } catch (error) {
      console.error(`查询机器 ${machineId} 上的活跃会话失败:`, error);
      return [];
    }
  }

  // 检查并标记超时的会话
  static async checkExpiredSessions(timeoutMs: number): Promise<number> {
    try {
      // 计算超时时间（分钟）
      // const timeoutMinutes = timeoutMs / 60000; // 不再使用
      const now = new Date();

      // 计算超时时间
      const timeoutDate = new Date(now.getTime() - timeoutMs);

      // 查找超时的会话
      const expiredSessions = await db('sessions')
        .whereIn('status', [SessionStatus.CREATED, SessionStatus.CONNECTED])
        .where('start_time', '<', timeoutDate);

      console.log(`找到 ${expiredSessions.length} 个超时会话`);

      // 标记为过期
      if (expiredSessions.length > 0) {
        for (const session of expiredSessions) {
          const startTime = new Date(session.start_time);
          const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);

          // 标记会话为过期
          await this.markExpired(session.id, duration);
          console.log(`标记会话过期: ${session.id}, 持续时间: ${duration} 秒`);

          // 扣除用户点数（每分钟1点）
          const minutes = Math.ceil(duration / 60);
          try {
            const { UserModel } = await import('./user.model.js');
            await UserModel.deductCredits(session.user_id, minutes);
            console.log(`已扣除用户 ${session.user_id} 的点数: ${minutes} 点 (超时会话 ${session.id})`);

            // 触发 Webhook 事件
            const { createWebhookEvent } = await import('../utils/webhook.js');
            const { WebhookEventType } = await import('@shared/types/index.js');
            await createWebhookEvent(session.user_id, WebhookEventType.SESSION_EXPIRED, {
              session_id: session.id,
              duration,
              expired_at: now,
            });
          } catch (error) {
            console.error(`扣除点数失败 (超时会话 ${session.id}):`, error);
          }
        }
      }

      return expiredSessions.length;
    } catch (error) {
      console.error('检查超时会话失败:', error);
      return 0;
    }
  }
}

export default SessionModel;
