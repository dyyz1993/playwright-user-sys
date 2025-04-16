import { db } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';
import { SessionStatus, SessionCreateOptions, PaginationQuery, PaginatedResponse } from '../types/index.js';

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
  screenshot_url?: string;
  last_activity?: Date;
  error_message?: string;
}

export class SessionModel {
  // 创建会话
  static async create(data: CreateSessionInput): Promise<Session | null> {
    const sessionId = uuidv4();

    await db('sessions').insert({
      id: sessionId,
      user_id: data.user_id,
      machine_id: data.machine_id || null,
      port: data.port || null,
      status: SessionStatus.CREATED,
      options: data.options ? JSON.stringify(data.options) : null,
      start_time: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    });

    return this.findById(sessionId);
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
    await db('sessions').where({ id }).update({
      status: SessionStatus.DISCONNECTED,
      end_time: new Date(),
      duration,
      updated_at: new Date(),
    });

    return this.findById(id);
  }

  // 标记会话已过期
  static async markExpired(id: string, duration: number): Promise<Session | null> {
    await db('sessions').where({ id }).update({
      status: SessionStatus.EXPIRED,
      end_time: new Date(),
      duration,
      updated_at: new Date(),
    });

    return this.findById(id);
  }

  // 标记会话错误
  static async markError(id: string): Promise<Session | null> {
    await db('sessions').where({ id }).update({
      status: SessionStatus.ERROR,
      end_time: new Date(),
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
            const { WebhookEventType } = await import('../types/index.js');
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
