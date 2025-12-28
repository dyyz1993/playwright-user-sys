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

// 分页查询会话的筛选选项接口
export interface SessionFilterOptions {
  status?: string; // 'active' | 'ended' | 'error' | SessionStatus 值
  userId?: number;
  startDate?: Date;
  endDate?: Date;
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
        // 将日期字符串转换为 Date 对象
        start_time: session.start_time ? new Date(session.start_time) : null,
        end_time: session.end_time ? new Date(session.end_time) : null,
        disconnected_at: session.disconnected_at ? new Date(session.disconnected_at) : null,
        last_activity: session.last_activity ? new Date(session.last_activity) : null,
        created_at: session.created_at ? new Date(session.created_at) : new Date(),
        updated_at: session.updated_at ? new Date(session.updated_at) : new Date(),
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

    // 先检查会话是否存在，并获取初始状态
    const session = await this.findById(id);
    if (!session) {
      logger.error(`标记会话已断开失败: 会话不存在 (${id})`);
      return null;
    }

    // 记录初始状态用于扣费判断
    const initialCreditsUsed = session.credits_used || 0;
    const userId = session.user_id;

    // 如果提供的持续时间为0且会话有开始时间，尝试计算持续时间
    let finalDuration = duration;
    if (finalDuration === 0 && session.start_time) {
      const now = new Date();
      const startTime = new Date(session.start_time);
      // 使用 Math.ceil 确保即使只有 1ms 也计算为 1 秒
      // 这解决了数据库 TIMESTAMP 精度丢失（毫秒被截断）导致计算为 0 的问题
      finalDuration = Math.ceil((now.getTime() - startTime.getTime()) / 1000);
      logger.info(`根据开始时间计算持续时间 (${id}): 开始时间=${startTime.toISOString()}, 当前时间=${now.toISOString()}, 持续时间=${finalDuration}秒`);
    }

    // 确保持续时间不为负数
    if (finalDuration < 0) {
      finalDuration = 0;
      logger.warn(`持续时间为负数，重置为0 (${id})`);
    }

    // 计算消耗的点数（每分钟1点）
    // 至少消耗 1 点（即使 duration = 0）
    const creditsUsed = finalDuration >= 0 ? Math.max(1, Math.ceil(finalDuration / 60)) : 0;

    logger.info(`标记会话已断开 (${id}): 持续时间=${finalDuration}秒, 消耗点数=${creditsUsed}点, 初始消耗=${initialCreditsUsed}点`);

    try {
      // 使用数据库条件更新确保幂等性
      // 只更新非终态的会话，避免并发重复扣费
      const updateResult = await db('sessions')
        .where({ id })
        .whereNotIn('status', [SessionStatus.DISCONNECTED, SessionStatus.ERROR, SessionStatus.EXPIRED, SessionStatus.COMPLETED])
        .update({
          status: SessionStatus.DISCONNECTED,
          end_time: new Date(),
          duration: finalDuration,
          credits_used: creditsUsed,
          updated_at: new Date(),
        });

      // 检查是否有行被更新
      const rowsAffected = Array.isArray(updateResult) ? updateResult[0] : updateResult;

      if (rowsAffected === 0) {
        // 没有行被更新，说明会话已经是终态了
        logger.info(`会话已是终态或已被其他请求更新 (${id}), 直接返回当前状态`);
        return await this.findById(id);
      }

      logger.info(`数据库更新成功 (${id}), 影响行数: ${rowsAffected}`);

      // 只有当数据库更新成功时才扣费
      // 使用 GREATEST 确保不会减少 credits_used
      const creditsToDeduct = Math.max(0, creditsUsed - initialCreditsUsed);

      if (creditsToDeduct > 0) {
        try {
          const { UserModel } = await import('./user.model.js');
          const user = await UserModel.findById(userId);
          const balanceAfter = user ? user.credits - creditsToDeduct : 0;

          await UserModel.deductCredits(userId, creditsToDeduct);
          logger.info(`🔴 扣除点数: ${creditsToDeduct} 点, 用户 ${userId} (初始${initialCreditsUsed} -> ${creditsUsed})`);

          // 创建积分历史记录
          const { CreditHistoryModel } = await import('./credit-history.model.js');
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

      return await this.findById(id);
    } catch (error) {
      logger.error(`标记会话已断开失败 (${id}):`, error);
      return null;
    }
  }

  // 标记会话已过期
  static async markExpired(id: string, duration: number): Promise<Session | null> {
    // 使用 logger 而不是 console.log
    const { logger } = await import('@shared/utils/logger.js');

    // 先获取会话以检查之前的 credits_used
    const session = await this.findById(id);
    if (!session) return null;

    const previousCreditsUsed = session.credits_used || 0;

    // 如果提供的持续时间为0且会话有开始时间，尝试计算持续时间
    let finalDuration = duration;
    if (duration === 0 && session.start_time) {
      const now = new Date();
      const startTime = new Date(session.start_time);
      // 使用 Math.ceil 确保即使只有 1ms 也计算为 1 秒
      finalDuration = Math.ceil((now.getTime() - startTime.getTime()) / 1000);
      logger.info(`根据开始时间计算持续时间 (${id}): 开始时间=${startTime.toISOString()}, 当前时间=${now.toISOString()}, 持续时间=${finalDuration}秒`);
    }

    // 确保持续时间不为负数（时区问题可能导致负数）
    if (finalDuration < 0) {
      logger.warn(`持续时间为负数 (${finalDuration}秒)，重置为0`);
      finalDuration = 0;
    }

    // 计算消耗的点数（每分钟1点）
    const creditsUsed = finalDuration >= 0 ? Math.max(1, Math.ceil(finalDuration / 60)) : 0;

    logger.info(`标记会话已过期 (${id}): 持续时间=${finalDuration}秒, 消耗点数=${creditsUsed}点, 初始消耗=${previousCreditsUsed}点`);

    await db('sessions').where({ id }).update({
      status: SessionStatus.EXPIRED,
      end_time: new Date(),
      duration: finalDuration,
      credits_used: creditsUsed,
      updated_at: new Date(),
    });

    const updatedSession = await this.findById(id);

    // 如果有新的点数消耗，则扣除用户积分
    if (updatedSession && creditsUsed > previousCreditsUsed) {
      const creditsToDeduct = creditsUsed - previousCreditsUsed;
      try {
        const { UserModel } = await import('./user.model.js');
        await UserModel.deductCredits(session.user_id, creditsToDeduct);
      } catch (error) {
        logger.error(`扣除用户 ${session.user_id} 的点数失败:`, error);
      }
    }

    return updatedSession;
  }

  // 标记会话错误
  static async markError(id: string, duration: number = 0): Promise<Session | null> {
    // 使用 logger 而不是 console.log
    const { logger } = await import('@shared/utils/logger.js');

    // 先获取会话以检查之前的 credits_used
    const session = await this.findById(id);
    if (!session) return null;

    const previousCreditsUsed = session.credits_used || 0;

    // 如果提供的持续时间为0且会话有开始时间，尝试计算持续时间
    let finalDuration = duration;
    if (duration === 0 && session.start_time) {
      const now = new Date();
      const startTime = new Date(session.start_time);
      // 使用 Math.ceil 确保即使只有 1ms 也计算为 1 秒
      finalDuration = Math.ceil((now.getTime() - startTime.getTime()) / 1000);
      logger.info(`根据开始时间计算持续时间 (${id}): 开始时间=${startTime.toISOString()}, 当前时间=${now.toISOString()}, 持续时间=${finalDuration}秒`);
    }

    // 确保持续时间不为负数（时区问题可能导致负数）
    if (finalDuration < 0) {
      logger.warn(`持续时间为负数 (${finalDuration}秒)，重置为0`);
      finalDuration = 0;
    }

    // 计算消耗的点数（每分钟1点）
    const creditsUsed = finalDuration >= 0 ? Math.max(1, Math.ceil(finalDuration / 60)) : 0;

    logger.info(`标记会话错误 (${id}): 持续时间=${finalDuration}秒, 消耗点数=${creditsUsed}点, 初始消耗=${previousCreditsUsed}点`);

    await db('sessions').where({ id }).update({
      status: SessionStatus.ERROR,
      end_time: new Date(),
      duration: finalDuration,
      credits_used: creditsUsed,
      updated_at: new Date(),
    });

    const updatedSession = await this.findById(id);

    // 如果有新的点数消耗，则扣除用户积分
    if (updatedSession && creditsUsed > previousCreditsUsed) {
      const creditsToDeduct = creditsUsed - previousCreditsUsed;
      try {
        const { UserModel } = await import('./user.model.js');
        await UserModel.deductCredits(session.user_id, creditsToDeduct);
      } catch (error) {
        logger.error(`扣除用户 ${session.user_id} 的点数失败:`, error);
      }
    }

    return updatedSession;
  }

  // 获取用户的所有会话（分页）
  static async findByUserId(userId: number, query: PaginationQuery = {}): Promise<PaginatedResponse<Session>> {
    try {
      const page = Number(query.page) || 1;
      const limit = Number(query.limit) || 10;
      const offset = (page - 1) * limit;

      // 验证并过滤排序字段和方向，使用默认值代替无效值
      const validSortFields = ['id', 'user_id', 'machine_id', 'status', 'port', 'duration', 'credits_used', 'start_time', 'end_time', 'created_at', 'updated_at'];
      const sort = validSortFields.includes(query.sort || '') ? (query.sort || 'created_at') : 'created_at';

      const validOrders = ['asc', 'desc'];
      const order = validOrders.includes(query.order?.toLowerCase() || '') ? (query.order?.toLowerCase() || 'desc') : 'desc';

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
              // 将日期字符串转换为 Date 对象
              start_time: session.start_time ? new Date(session.start_time) : null,
              end_time: session.end_time ? new Date(session.end_time) : null,
              disconnected_at: session.disconnected_at ? new Date(session.disconnected_at) : null,
              last_activity: session.last_activity ? new Date(session.last_activity) : null,
              created_at: session.created_at ? new Date(session.created_at) : new Date(),
              updated_at: session.updated_at ? new Date(session.updated_at) : new Date(),
            };
          } catch (error) {
            console.error(`解析会话选项失败 (ID: ${session.id}):`, error);
            return {
              ...session,
              options: null,
              // 将日期字符串转换为 Date 对象
              start_time: session.start_time ? new Date(session.start_time) : null,
              end_time: session.end_time ? new Date(session.end_time) : null,
              disconnected_at: session.disconnected_at ? new Date(session.disconnected_at) : null,
              last_activity: session.last_activity ? new Date(session.last_activity) : null,
              created_at: session.created_at ? new Date(session.created_at) : new Date(),
              updated_at: session.updated_at ? new Date(session.updated_at) : new Date(),
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
      const page = Number(query.page) || 1;
      return {
        items: [],
        total: 0,
        page,
        limit: Number(query.limit) || 10,
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
      const page = Number(query.page) || 1;
      const limit = Number(query.limit) || 10;
      const offset = (page - 1) * limit;

      // 验证并过滤排序字段和方向，使用默认值代替无效值
      const validSortFields = ['id', 'user_id', 'machine_id', 'status', 'port', 'duration', 'credits_used', 'start_time', 'end_time', 'created_at', 'updated_at'];
      const sort = validSortFields.includes(query.sort || '') ? (query.sort || 'created_at') : 'created_at';

      const validOrders = ['asc', 'desc'];
      const order = validOrders.includes(query.order?.toLowerCase() || '') ? (query.order?.toLowerCase() || 'desc') : 'desc';

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
              // 将日期字符串转换为 Date 对象
              start_time: session.start_time ? new Date(session.start_time) : null,
              end_time: session.end_time ? new Date(session.end_time) : null,
              disconnected_at: session.disconnected_at ? new Date(session.disconnected_at) : null,
              last_activity: session.last_activity ? new Date(session.last_activity) : null,
              created_at: session.created_at ? new Date(session.created_at) : new Date(),
              updated_at: session.updated_at ? new Date(session.updated_at) : new Date(),
            };
          } catch (error) {
            console.error(`解析会话选项失败 (ID: ${session.id}):`, error);
            return {
              ...session,
              options: null,
              // 将日期字符串转换为 Date 对象
              start_time: session.start_time ? new Date(session.start_time) : null,
              end_time: session.end_time ? new Date(session.end_time) : null,
              disconnected_at: session.disconnected_at ? new Date(session.disconnected_at) : null,
              last_activity: session.last_activity ? new Date(session.last_activity) : null,
              created_at: session.created_at ? new Date(session.created_at) : new Date(),
              updated_at: session.updated_at ? new Date(session.updated_at) : new Date(),
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
        page: Number(query.page) || 1,
        limit: Number(query.limit) || 10,
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

  // 获取最近的会话（用于仪表盘显示）
  static async getRecentSessions(limit: number = 10): Promise<Array<Session & { username: string }>> {
    try {
      const sessions = await db('sessions')
        .select('sessions.*', 'users.username')
        .join('users', 'sessions.user_id', 'users.id')
        .orderBy('sessions.created_at', 'desc')
        .limit(limit);

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
      console.error('获取最近会话失败:', error);
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

  // 统计活跃会话数
  static async countActiveSessions(): Promise<number> {
    try {
      const result = await db('sessions')
        .whereIn('status', [SessionStatus.CREATED, SessionStatus.CONNECTED])
        .count('id as count')
        .first();
      return result ? Number(result.count) : 0;
    } catch (error) {
      console.error('统计活跃会话数失败:', error);
      return 0;
    }
  }

  // 计算已使用点数
  static async sumUsedCredits(): Promise<number> {
    try {
      const result = await db('sessions')
        .sum('credits_used as total')
        .first();
      return result && result.total ? Number(result.total) : 0;
    } catch (error) {
      console.error('计算已使用点数失败:', error);
      return 0;
    }
  }

  // 分页查询会话
  static async paginate(
    page: number = 1,
    limit: number = 10,
    filters?: SessionFilterOptions
  ): Promise<PaginatedResponse<Session & { username?: string }>> {
    try {
      const offset = (page - 1) * limit;

      // 构建查询
      let query = db('sessions')
        .select('sessions.*', 'users.username')
        .leftJoin('users', 'sessions.user_id', 'users.id');

      // 应用状态筛选
      if (filters?.status) {
        const status = filters.status;
        if (status === 'active') {
          // 活跃状态: created 或 connected
          query = query.whereIn('sessions.status', [SessionStatus.CREATED, SessionStatus.CONNECTED]);
        } else if (status === 'ended') {
          // 已结束状态: disconnected, expired, completed
          query = query.whereIn('sessions.status', [
            SessionStatus.DISCONNECTED,
            SessionStatus.EXPIRED,
            SessionStatus.COMPLETED
          ]);
        } else if (status === 'error') {
          query = query.where('sessions.status', SessionStatus.ERROR);
        } else {
          // 直接使用 SessionStatus 枚举值
          query = query.where('sessions.status', status);
        }
      }

      // 应用用户筛选
      if (filters?.userId) {
        query = query.where('sessions.user_id', filters.userId);
      }

      // 应用时间范围筛选
      if (filters?.startDate) {
        query = query.where('sessions.created_at', '>=', filters.startDate);
      }
      if (filters?.endDate) {
        // 如果 endDate 包含当天的数据，需要设置为当天结束时间
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        query = query.where('sessions.created_at', '<=', endDate);
      }

      // 先执行 COUNT 查询（需要在数据查询之前，避免修改原始查询）
      const countQuery = db('sessions').where((builder) => {
        // 复制筛选条件
        if (filters?.status) {
          const status = filters.status;
          if (status === 'active') {
            builder.whereIn('sessions.status', [SessionStatus.CREATED, SessionStatus.CONNECTED]);
          } else if (status === 'ended') {
            builder.whereIn('sessions.status', [
              SessionStatus.DISCONNECTED,
              SessionStatus.EXPIRED,
              SessionStatus.COMPLETED
            ]);
          } else if (status === 'error') {
            builder.where('sessions.status', SessionStatus.ERROR);
          } else {
            builder.where('sessions.status', status);
          }
        }

        if (filters?.userId) {
          builder.where('sessions.user_id', filters.userId);
        }

        if (filters?.startDate) {
          builder.where('sessions.created_at', '>=', filters.startDate);
        }
        if (filters?.endDate) {
          const endDate = new Date(filters.endDate);
          endDate.setHours(23, 59, 59, 999);
          builder.where('sessions.created_at', '<=', endDate);
        }
      });

      const totalResult = await countQuery.count('* as count').first();

      // 执行数据查询
      const sessions = await query
        .orderBy('sessions.created_at', 'desc')
        .limit(limit)
        .offset(offset);

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
        total: totalResult ? Number(totalResult.count) : 0,
        page,
        limit,
        totalPages: Math.ceil((totalResult ? Number(totalResult.count) : 0) / limit),
      };
    } catch (error) {
      console.error('分页查询会话失败:', error);
      return {
        items: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
      };
    }
  }

  // 获取会话统计
  static async getStats(filters?: {
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    total: number;
    active: number;
    ended: number;
    error: number;
    totalCreditsUsed: number;
    totalDuration: number;
    avgDuration: number;
    byUser: Array<{
      user_id: number;
      username: string;
      sessionCount: number;
      creditsUsed: number;
    }>;
  }> {
    try {
      let query = db('sessions').select('sessions.*', 'users.username')
        .leftJoin('users', 'sessions.user_id', 'users.id');

      if (filters?.startDate) {
        query = query.where('sessions.created_at', '>=', filters.startDate);
      }

      if (filters?.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        query = query.where('sessions.created_at', '<=', endDate);
      }

      const sessions = await query;

      // 统计数据
      const total = sessions.length;
      const active = sessions.filter((s: any) =>
        ['created', 'connected'].includes(s.status)
      ).length;
      const ended = sessions.filter((s: any) =>
        ['disconnected', 'expired', 'completed'].includes(s.status)
      ).length;
      const error = sessions.filter((s: any) => s.status === 'error').length;

      const totalCreditsUsed = sessions.reduce((sum, s: any) =>
        sum + (s.credits_used || 0), 0);
      const totalDuration = sessions.reduce((sum, s: any) =>
        sum + (s.duration || 0), 0);
      const avgDuration = total > 0 ? Math.round(totalDuration / total) : 0;

      // 按用户分组统计
      const byUserMap = new Map();
      sessions.forEach((s: any) => {
        const userId = s.user_id;
        if (!byUserMap.has(userId)) {
          byUserMap.set(userId, {
            user_id: userId,
            username: s.username,
            sessionCount: 0,
            creditsUsed: 0
          });
        }
        const user = byUserMap.get(userId);
        user.sessionCount++;
        user.creditsUsed += s.credits_used || 0;
      });

      return {
        total,
        active,
        ended,
        error,
        totalCreditsUsed,
        totalDuration,
        avgDuration,
        byUser: Array.from(byUserMap.values())
      };
    } catch (error) {
      logger.error('获取会话统计失败:', error);
      return {
        total: 0,
        active: 0,
        ended: 0,
        error: 0,
        totalCreditsUsed: 0,
        totalDuration: 0,
        avgDuration: 0,
        byUser: []
      };
    }
  }

  // 获取会话详情(包含用户和机器信息)
  static async getDetailById(id: string): Promise<(Session & {
    username: string;
    machine_name?: string;
  }) | null> {
    try {
      const session = await db('sessions')
        .select('sessions.*', 'users.username', 'machines.hostname as machine_name')
        .leftJoin('users', 'sessions.user_id', 'users.id')
        .leftJoin('machines', 'sessions.machine_id', 'machines.id')
        .where('sessions.id', id)
        .first();

      if (!session) return null;

      let parsedOptions = null;
      if (session.options) {
        try {
          if (typeof session.options === 'string') {
            parsedOptions = JSON.parse(session.options);
          } else {
            parsedOptions = session.options;
          }
        } catch (error) {
          logger.error(`解析会话选项失败 (ID: ${id}):`, error);
          parsedOptions = null;
        }
      }

      return {
        ...session,
        options: parsedOptions,
      };
    } catch (error) {
      logger.error('获取会话详情失败:', error);
      return null;
    }
  }

  // 排序分页查询(支持多种排序方式)
  static async paginateSorted(
    page: number = 1,
    limit: number = 10,
    options?: {
      sort?: string;
      order?: 'asc' | 'desc';
      filters?: SessionFilterOptions;
    }
  ): Promise<PaginatedResponse<Session & { username: string }>> {
    try {
      const offset = (page - 1) * limit;
      const sort = options?.sort || 'created_at';
      const order = options?.order || 'desc';

      // 构建查询
      let query = db('sessions')
        .select('sessions.*', 'users.username')
        .leftJoin('users', 'sessions.user_id', 'users.id');

      // 应用状态筛选
      if (options?.filters?.status) {
        const status = options.filters.status;
        if (status === 'active') {
          query = query.whereIn('sessions.status', [SessionStatus.CREATED, SessionStatus.CONNECTED]);
        } else if (status === 'ended') {
          query = query.whereIn('sessions.status', [
            SessionStatus.DISCONNECTED,
            SessionStatus.EXPIRED,
            SessionStatus.COMPLETED
          ]);
        } else if (status === 'error') {
          query = query.where('sessions.status', SessionStatus.ERROR);
        } else {
          query = query.where('sessions.status', status);
        }
      }

      // 应用用户筛选
      if (options?.filters?.userId) {
        query = query.where('sessions.user_id', options.filters.userId);
      }

      // 应用时间范围筛选
      if (options?.filters?.startDate) {
        query = query.where('sessions.created_at', '>=', options.filters.startDate);
      }
      if (options?.filters?.endDate) {
        const endDate = new Date(options.filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        query = query.where('sessions.created_at', '<=', endDate);
      }

      // 验证排序字段有效性
      const validSortFields = ['created_at', 'duration', 'credits_used', 'updated_at', 'start_time'];
      const validSortField = validSortFields.includes(sort) ? sort : 'created_at';
      const validOrder = order === 'asc' || order === 'desc' ? order : 'desc';

      // 先执行 COUNT 查询（需要在数据查询之前，避免修改原始查询）
      const countQuery = db('sessions').where((builder) => {
        // 复制筛选条件
        if (options?.filters?.status) {
          const status = options.filters.status;
          if (status === 'active') {
            builder.whereIn('sessions.status', [SessionStatus.CREATED, SessionStatus.CONNECTED]);
          } else if (status === 'ended') {
            builder.whereIn('sessions.status', [
              SessionStatus.DISCONNECTED,
              SessionStatus.EXPIRED,
              SessionStatus.COMPLETED
            ]);
          } else if (status === 'error') {
            builder.where('sessions.status', SessionStatus.ERROR);
          } else {
            builder.where('sessions.status', status);
          }
        }

        if (options?.filters?.userId) {
          builder.where('sessions.user_id', options.filters.userId);
        }

        if (options?.filters?.startDate) {
          builder.where('sessions.created_at', '>=', options.filters.startDate);
        }
        if (options?.filters?.endDate) {
          const endDate = new Date(options.filters.endDate);
          endDate.setHours(23, 59, 59, 999);
          builder.where('sessions.created_at', '<=', endDate);
        }
      });

      const totalResult = await countQuery.count('* as count').first();

      // 执行数据查询
      const sessions = await query
        .orderBy(`sessions.${validSortField}`, validOrder)
        .limit(limit)
        .offset(offset);

      return {
        items: sessions.map((session: any) => {
          try {
            return {
              ...session,
              options: session.options ? (typeof session.options === 'string' ? JSON.parse(session.options) : session.options) : null,
            };
          } catch (error) {
            logger.error(`解析会话选项失败 (ID: ${session.id}):`, error);
            return {
              ...session,
              options: null,
            };
          }
        }),
        total: totalResult ? Number(totalResult.count) : 0,
        page,
        limit,
        totalPages: Math.ceil((totalResult ? Number(totalResult.count) : 0) / limit),
      };
    } catch (error) {
      logger.error('分页查询会话失败:', error);
      return {
        items: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
      };
    }
  }
}

export default SessionModel;
