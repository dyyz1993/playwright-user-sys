import { db } from '../../config/database.js';
import { SessionStatus, PaginatedResponse } from '@shared/types/index.js';
import { logger } from '@shared/utils/logger.js';
import type { Session, SessionFilterOptions } from './types.js';
import { parseSessionOptions } from './types.js';

export const paginateMethods = {
  async paginate(
    page: number = 1,
    limit: number = 10,
    filters?: SessionFilterOptions
  ): Promise<PaginatedResponse<Session & { username?: string; machine_name?: string }>> {
    try {
      const offset = (page - 1) * limit;

      let query = db('sessions')
        .select(
          'sessions.*',
          'users.username',
          'machines.hostname as machine_name',
          'machines.ip as machine_ip',
          'machines.proxy_port as machine_proxy_port'
        )
        .leftJoin('users', 'sessions.user_id', 'users.id')
        .leftJoin('machines', 'sessions.machine_id', 'machines.id');

      if (filters?.status) {
        const status = filters.status;
        if (status === 'active') {
          query = query.whereIn('sessions.status', [SessionStatus.CREATED, SessionStatus.CONNECTED]);
        } else if (status === 'ended') {
          query = query.whereIn('sessions.status', [
            SessionStatus.DISCONNECTED,
            SessionStatus.EXPIRED,
            SessionStatus.COMPLETED,
          ]);
        } else if (status === 'error') {
          query = query.where('sessions.status', SessionStatus.ERROR);
        } else {
          query = query.where('sessions.status', status);
        }
      }

      if (filters?.userId) {
        query = query.where('sessions.user_id', filters.userId);
      }

      if (filters?.startDate) {
        query = query.where('sessions.created_at', '>=', filters.startDate);
      }
      if (filters?.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        query = query.where('sessions.created_at', '<=', endDate);
      }

      const countQuery = db('sessions').where((builder) => {
        if (filters?.status) {
          const status = filters.status;
          if (status === 'active') {
            builder.whereIn('sessions.status', [SessionStatus.CREATED, SessionStatus.CONNECTED]);
          } else if (status === 'ended') {
            builder.whereIn('sessions.status', [
              SessionStatus.DISCONNECTED,
              SessionStatus.EXPIRED,
              SessionStatus.COMPLETED,
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

      const sessions = await query.orderBy('sessions.created_at', 'desc').limit(limit).offset(offset);

      return {
        items: sessions.map(parseSessionOptions),
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
  },

  async paginateSorted(
    page: number = 1,
    limit: number = 10,
    options?: {
      sort?: string;
      order?: 'asc' | 'desc';
      filters?: SessionFilterOptions;
    }
  ): Promise<PaginatedResponse<Session & { username: string; machine_name?: string }>> {
    try {
      const offset = (page - 1) * limit;
      const sort = options?.sort || 'created_at';
      const order = options?.order || 'desc';

      let query = db('sessions')
        .select(
          'sessions.*',
          'users.username',
          'machines.hostname as machine_name',
          'machines.ip as machine_ip',
          'machines.proxy_port as machine_proxy_port'
        )
        .leftJoin('users', 'sessions.user_id', 'users.id')
        .leftJoin('machines', 'sessions.machine_id', 'machines.id');

      if (options?.filters?.status) {
        const status = options.filters.status;
        if (status === 'active') {
          query = query.whereIn('sessions.status', [SessionStatus.CREATED, SessionStatus.CONNECTED]);
        } else if (status === 'ended') {
          query = query.whereIn('sessions.status', [
            SessionStatus.DISCONNECTED,
            SessionStatus.EXPIRED,
            SessionStatus.COMPLETED,
          ]);
        } else if (status === 'error') {
          query = query.where('sessions.status', SessionStatus.ERROR);
        } else {
          query = query.where('sessions.status', status);
        }
      }

      if (options?.filters?.userId) {
        query = query.where('sessions.user_id', options.filters.userId);
      }

      if (options?.filters?.startDate) {
        query = query.where('sessions.created_at', '>=', options.filters.startDate);
      }
      if (options?.filters?.endDate) {
        const endDate = new Date(options.filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        query = query.where('sessions.created_at', '<=', endDate);
      }

      const validSortFields = ['created_at', 'duration', 'credits_used', 'updated_at', 'start_time'];
      const validSortField = validSortFields.includes(sort) ? sort : 'created_at';
      const validOrder = order === 'asc' || order === 'desc' ? order : 'desc';

      const countQuery = db('sessions').where((builder) => {
        if (options?.filters?.status) {
          const status = options.filters.status;
          if (status === 'active') {
            builder.whereIn('sessions.status', [SessionStatus.CREATED, SessionStatus.CONNECTED]);
          } else if (status === 'ended') {
            builder.whereIn('sessions.status', [
              SessionStatus.DISCONNECTED,
              SessionStatus.EXPIRED,
              SessionStatus.COMPLETED,
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

      const sessions = await query.orderBy(`sessions.${validSortField}`, validOrder).limit(limit).offset(offset);

      return {
        items: sessions.map(parseSessionOptions) as Array<Session & { username: string; machine_name?: string }>,
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
  },
};
