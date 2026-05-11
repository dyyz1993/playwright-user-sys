import { db } from '../../config/database.js';
import { SessionStatus, PaginationQuery, PaginatedResponse } from '@shared/types/index.js';
import { logger } from '@shared/utils/logger.js';
import type { Session } from './types.js';
import { parseSessionOptions, parseSessionRowWithDates } from './types.js';

export const queryMethods = {
  async findByUserId(userId: number, query: PaginationQuery = {}): Promise<PaginatedResponse<Session>> {
    try {
      const page = Math.max(1, Number(query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
      const offset = (page - 1) * limit;

      const validSortFields = [
        'id',
        'user_id',
        'machine_id',
        'status',
        'port',
        'duration',
        'credits_used',
        'start_time',
        'end_time',
        'created_at',
        'updated_at',
      ];
      const sort = validSortFields.includes(query.sort || '') ? query.sort || 'created_at' : 'created_at';

      const validOrders = ['asc', 'desc'];
      const order = validOrders.includes(query.order?.toLowerCase() || '')
        ? query.order?.toLowerCase() || 'desc'
        : 'desc';

      const [sessions, total] = await Promise.all([
        db('sessions').where({ user_id: userId }).orderBy(sort, order).limit(limit).offset(offset),
        db('sessions').where({ user_id: userId }).count('id as count').first(),
      ]);

      return {
        items: sessions.map(parseSessionRowWithDates),
        total: total ? Number(total.count) : 0,
        page,
        limit,
        totalPages: Math.ceil((total ? Number(total.count) : 0) / limit),
      };
    } catch (error) {
      logger.error(`获取用户会话失败 (userId: ${userId}):`, error);
      throw error;
    }
  },

  async findActiveSessions(): Promise<Session[]> {
    try {
      logger.info('开始查询活跃会话');
      const sessions = await db('sessions').whereIn('status', [SessionStatus.CREATED, SessionStatus.CONNECTED]);
      logger.info(`找到 ${sessions.length} 个活跃会话`);

      return sessions.map(parseSessionOptions);
    } catch (error) {
      logger.error('查询活跃会话失败:', error);
      return [];
    }
  },

  async getAllByUserId(userId: number): Promise<Session[]> {
    try {
      logger.info(`开始查询用户 ${userId} 的所有会话`);
      const sessions = await db('sessions').where({ user_id: userId });
      logger.info(`找到用户 ${userId} 的 ${sessions.length} 个会话`);

      return sessions.map(parseSessionOptions);
    } catch (error) {
      logger.error(`获取用户所有会话失败 (userId: ${userId}):`, error);
      return [];
    }
  },

  async findByMachineId(machineId: string, options: { status?: SessionStatus[] } = {}): Promise<Session[]> {
    try {
      logger.info(`开始查询机器 ${machineId} 上的会话`);

      let query = db('sessions').where({ machine_id: machineId });

      if (options.status && options.status.length > 0) {
        query = query.whereIn('status', options.status);
      }

      const sessions = await query;
      logger.info(`找到机器 ${machineId} 上的 ${sessions.length} 个会话`);

      return sessions.map(parseSessionOptions);
    } catch (error) {
      logger.error(`查询机器 ${machineId} 上的会话失败:`, error);
      return [];
    }
  },

  async findAll(query: PaginationQuery = {}): Promise<PaginatedResponse<Session>> {
    try {
      logger.info('开始查询会话数据');
      const page = Math.max(1, Number(query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
      const offset = (page - 1) * limit;

      const validSortFields = [
        'id',
        'user_id',
        'machine_id',
        'status',
        'port',
        'duration',
        'credits_used',
        'start_time',
        'end_time',
        'created_at',
        'updated_at',
      ];
      const sort = validSortFields.includes(query.sort || '') ? query.sort || 'created_at' : 'created_at';

      const validOrders = ['asc', 'desc'];
      const order = validOrders.includes(query.order?.toLowerCase() || '')
        ? query.order?.toLowerCase() || 'desc'
        : 'desc';

      const [sessions, total] = await Promise.all([
        db('sessions').orderBy(sort, order).limit(limit).offset(offset),
        db('sessions').count('id as count').first(),
      ]);

      logger.info(`找到 ${sessions.length} 个会话，总数 ${total ? total.count : 0}`);

      return {
        items: sessions.map(parseSessionRowWithDates),
        total: total ? Number(total.count) : 0,
        page,
        limit,
        totalPages: Math.ceil((total ? Number(total.count) : 0) / limit),
      };
    } catch (error) {
      logger.error('查询会话数据失败:', error);
      return {
        items: [],
        total: 0,
        page: Math.max(1, Number(query.page) || 1),
        limit: Math.min(100, Math.max(1, Number(query.limit) || 10)),
        totalPages: 0,
      };
    }
  },

  async findActiveSessionsByMachineId(machineId: string): Promise<Session[]> {
    try {
      logger.info(`开始查询机器 ${machineId} 上的活跃会话`);

      const sessions = await db('sessions')
        .where({ machine_id: machineId })
        .whereIn('status', [SessionStatus.CREATED, SessionStatus.CONNECTED]);

      logger.info(`找到机器 ${machineId} 上的 ${sessions.length} 个活跃会话`);

      return sessions.map(parseSessionOptions);
    } catch (error) {
      logger.error(`查询机器 ${machineId} 上的活跃会话失败:`, error);
      return [];
    }
  },

  async getRecentSessions(limit: number = 10): Promise<Array<Session & { username: string }>> {
    try {
      const sessions = await db('sessions')
        .select('sessions.*', 'users.username')
        .join('users', 'sessions.user_id', 'users.id')
        .orderBy('sessions.created_at', 'desc')
        .limit(limit);

      return sessions.map(parseSessionOptions) as Array<Session & { username: string }>;
    } catch (error) {
      logger.error('获取最近会话失败:', error);
      return [];
    }
  },
};
