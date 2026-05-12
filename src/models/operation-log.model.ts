import { logger } from '@shared/utils/logger.js';
import { db } from '../config/database.js';
import { PaginationQuery, PaginatedResponse } from '@shared/types/index.js';
import { OperationLogRow } from '@shared/types/tables.js';

export interface OperationLog extends Omit<OperationLogRow, 'details' | 'created_at' | 'updated_at'> {
  details: Record<string, unknown> | string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateOperationLogInput {
  admin_id: number;
  action: string;
  details?: Record<string, unknown> | string | null;
  target_user_id?: number;
}

function parseLogDetails(raw: OperationLogRow): OperationLog {
  try {
    return {
      ...raw,
      details: raw.details
        ? typeof raw.details === 'string'
          ? (JSON.parse(raw.details) as Record<string, unknown>)
          : (raw.details as Record<string, unknown>)
        : null,
      created_at: new Date(raw.created_at),
      updated_at: new Date(raw.updated_at),
    };
  } catch {
    return {
      ...raw,
      details: { error: '无法解析的数据', raw: raw.details },
      created_at: new Date(raw.created_at),
      updated_at: new Date(raw.updated_at),
    };
  }
}

export class OperationLogModel {
  // 创建操作日志
  static async create(data: CreateOperationLogInput): Promise<OperationLog> {
    const [id] = await db('operation_logs').insert({
      admin_id: data.admin_id,
      action: data.action,
      details: data.details ? (typeof data.details === 'string' ? data.details : JSON.stringify(data.details)) : null,
      target_user_id: data.target_user_id || null,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const log = await this.findById(id);
    if (!log) {
      throw new Error(`Failed to create operation log with id ${id}`);
    }
    return log;
  }

  // 通过 ID 查找操作日志
  static async findById(id: number): Promise<OperationLog | null> {
    try {
      const log = await db('operation_logs').where({ id }).first();
      if (!log) return null;

      try {
        // 如果 details 是字符串，尝试解析为 JSON 对象
        // 如果已经是对象，直接使用
        return {
          ...log,
          details: log.details ? (typeof log.details === 'string' ? JSON.parse(log.details) : log.details) : null,
        };
      } catch (parseError) {
        logger.error(`解析日志详情失败 (ID: ${id}):`, parseError);
        return {
          ...log,
          details: { error: '无法解析的数据', raw: log.details },
        };
      }
    } catch (error) {
      logger.error(`查找日志失败 (ID: ${id}):`, error);
      return null;
    }
  }

  // 获取管理员的所有操作日志（分页）
  static async findByAdminId(adminId: number, query: PaginationQuery = {}): Promise<PaginatedResponse<OperationLog>> {
    try {
      const page = parseInt(query.page || '1', 10);
      const limit = parseInt(query.limit || '10', 10);
      const offset = (page - 1) * limit;
      const OPLOG_SORT_COLUMNS = ['id', 'action', 'created_at', 'updated_at'];
      const ALLOWED_ORDER = ['asc', 'desc'];
      const sort = query.sort && OPLOG_SORT_COLUMNS.includes(query.sort) ? query.sort : 'created_at';
      const order =
        query.order && ALLOWED_ORDER.includes(query.order.toLowerCase())
          ? (query.order.toLowerCase() as 'asc' | 'desc')
          : 'desc';

      const [logs, total] = await Promise.all([
        db('operation_logs').where({ admin_id: adminId }).orderBy(sort, order).limit(limit).offset(offset),
        db('operation_logs').where({ admin_id: adminId }).count('id as count').first(),
      ]);

      return {
        items: logs.map(parseLogDetails),
        total: total ? Number(total.count) : 0,
        page,
        limit,
        totalPages: Math.ceil((total ? Number(total.count) : 0) / limit),
      };
    } catch (error) {
      logger.error(`获取管理员 ${adminId} 的操作日志失败:`, error);
      return {
        items: [],
        total: 0,
        page: parseInt(query.page || '1', 10),
        limit: parseInt(query.limit || '10', 10),
        totalPages: 0,
      };
    }
  }

  // 获取针对特定用户的所有操作日志（分页）
  static async findByTargetUserId(
    userId: number,
    query: PaginationQuery = {}
  ): Promise<PaginatedResponse<OperationLog>> {
    try {
      const page = parseInt(query.page || '1', 10);
      const limit = parseInt(query.limit || '10', 10);
      const offset = (page - 1) * limit;
      const OPLOG_SORT_COLUMNS = ['id', 'action', 'created_at', 'updated_at'];
      const ALLOWED_ORDER = ['asc', 'desc'];
      const sort = query.sort && OPLOG_SORT_COLUMNS.includes(query.sort) ? query.sort : 'created_at';
      const order =
        query.order && ALLOWED_ORDER.includes(query.order.toLowerCase())
          ? (query.order.toLowerCase() as 'asc' | 'desc')
          : 'desc';

      const [logs, total] = await Promise.all([
        db('operation_logs').where({ target_user_id: userId }).orderBy(sort, order).limit(limit).offset(offset),
        db('operation_logs').where({ target_user_id: userId }).count('id as count').first(),
      ]);

      return {
        items: logs.map(parseLogDetails),
        total: total ? Number(total.count) : 0,
        page,
        limit,
        totalPages: Math.ceil((total ? Number(total.count) : 0) / limit),
      };
    } catch (error) {
      logger.error(`获取用户 ${userId} 的操作日志失败:`, error);
      return {
        items: [],
        total: 0,
        page: parseInt(query.page || '1', 10),
        limit: parseInt(query.limit || '10', 10),
        totalPages: 0,
      };
    }
  }

  // 获取所有操作日志（分页）
  static async findAll(query: PaginationQuery = {}): Promise<PaginatedResponse<OperationLog>> {
    try {
      const page = parseInt(query.page || '1', 10);
      const limit = parseInt(query.limit || '10', 10);
      const offset = (page - 1) * limit;
      const OPLOG_SORT_COLUMNS = ['id', 'action', 'created_at', 'updated_at'];
      const ALLOWED_ORDER = ['asc', 'desc'];
      const sort = query.sort && OPLOG_SORT_COLUMNS.includes(query.sort) ? query.sort : 'created_at';
      const order =
        query.order && ALLOWED_ORDER.includes(query.order.toLowerCase())
          ? (query.order.toLowerCase() as 'asc' | 'desc')
          : 'desc';

      const [logs, total] = await Promise.all([
        db('operation_logs').orderBy(sort, order).limit(limit).offset(offset),
        db('operation_logs').count('id as count').first(),
      ]);

      return {
        items: logs.map(parseLogDetails),
        total: total ? Number(total.count) : 0,
        page,
        limit,
        totalPages: Math.ceil((total ? Number(total.count) : 0) / limit),
      };
    } catch (error) {
      logger.error('获取操作日志失败:', error);
      // 返回空数据
      return {
        items: [],
        total: 0,
        page: parseInt(query.page || '1', 10),
        limit: parseInt(query.limit || '10', 10),
        totalPages: 0,
      };
    }
  }

  // 分页查询日志(带筛选)
  static async paginate(
    page: number = 1,
    limit: number = 20,
    filters?: {
      action?: string;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<PaginatedResponse<OperationLog & { username?: string; role?: string }>> {
    try {
      const offset = (page - 1) * limit;

      // 构建基础查询条件
      let baseQuery = db('operation_logs');

      // 应用筛选条件
      if (filters?.action) {
        baseQuery = baseQuery.where('action', filters.action);
      }

      if (filters?.startDate) {
        baseQuery = baseQuery.where('created_at', '>=', filters.startDate);
      }

      if (filters?.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        baseQuery = baseQuery.where('created_at', '<=', endDate);
      }

      // 先获取总数
      const totalResult = await baseQuery.clone().count('id as count').first();
      const total = totalResult ? Number(totalResult.count) : 0;

      // 再获取分页数据（带 join）
      const logs = await db('operation_logs')
        .select('operation_logs.*', 'users.username', 'users.role')
        .leftJoin('users', 'operation_logs.admin_id', 'users.id')
        .modify((query) => {
          if (filters?.action) {
            query.where('operation_logs.action', filters.action);
          }
          if (filters?.startDate) {
            query.where('operation_logs.created_at', '>=', filters.startDate);
          }
          if (filters?.endDate) {
            const endDate = new Date(filters.endDate);
            endDate.setHours(23, 59, 59, 999);
            query.where('operation_logs.created_at', '<=', endDate);
          }
        })
        .orderBy('operation_logs.created_at', 'desc')
        .limit(limit)
        .offset(offset);

      return {
        items: logs.map(parseLogDetails),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      logger.error('分页查询操作日志失败:', error);
      return {
        items: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
      };
    }
  }

  // 获取操作统计
  static async getStats(filters?: {
    startDate?: Date;
    endDate?: Date;
  }): Promise<{ total: number; byAction: Record<string, number> }> {
    try {
      let query = db('operation_logs');

      if (filters?.startDate) {
        query = query.where('created_at', '>=', filters.startDate);
      }

      if (filters?.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        query = query.where('created_at', '<=', endDate);
      }

      const logs = await query;

      const byAction: Record<string, number> = {};
      logs.forEach((log: OperationLogRow) => {
        const action = log.action;
        byAction[action] = (byAction[action] || 0) + 1;
      });

      return {
        total: logs.length,
        byAction,
      };
    } catch (error) {
      logger.error('获取操作统计失败:', error);
      return { total: 0, byAction: {} };
    }
  }
}

export default OperationLogModel;
