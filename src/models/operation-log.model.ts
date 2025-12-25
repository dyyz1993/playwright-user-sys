import { db } from '../config/database.js';
import { PaginationQuery, PaginatedResponse } from '@shared/types/index.js';

export interface OperationLog {
  id: number;
  admin_id: number;
  action: string;
  details: any;
  target_user_id: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateOperationLogInput {
  admin_id: number;
  action: string;
  details?: any;
  target_user_id?: number;
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
        console.error(`解析日志详情失败 (ID: ${id}):`, parseError);
        return {
          ...log,
          details: { error: '无法解析的数据', raw: log.details },
        };
      }
    } catch (error) {
      console.error(`查找日志失败 (ID: ${id}):`, error);
      return null;
    }
  }

  // 获取管理员的所有操作日志（分页）
  static async findByAdminId(adminId: number, query: PaginationQuery = {}): Promise<PaginatedResponse<OperationLog>> {
    try {
      const page = query.page || 1;
      const limit = query.limit || 10;
      const offset = (page - 1) * limit;
      const sort = query.sort || 'created_at';
      const order = query.order || 'desc';

      const [logs, total] = await Promise.all([
        db('operation_logs')
          .where({ admin_id: adminId })
          .orderBy(sort, order)
          .limit(limit)
          .offset(offset),
        db('operation_logs').where({ admin_id: adminId }).count('id as count').first(),
      ]);

      return {
        items: logs.map((log: any) => {
          try {
            // 如果 details 是字符串，尝试解析为 JSON 对象
            // 如果已经是对象，直接使用
            return {
              ...log,
              details: log.details ? (typeof log.details === 'string' ? JSON.parse(log.details) : log.details) : null,
            };
          } catch (error) {
            console.error(`解析管理员日志详情失败 (ID: ${log.id}):`, error);
            return {
              ...log,
              details: { error: '无法解析的数据', raw: log.details },
            };
          }
        }),
        total: total ? Number(total.count) : 0,
        page,
        limit,
        totalPages: Math.ceil((total ? Number(total.count) : 0) / limit),
      };
    } catch (error) {
      console.error(`获取管理员 ${adminId} 的操作日志失败:`, error);
      return {
        items: [],
        total: 0,
        page: query.page || 1,
        limit: query.limit || 10,
        totalPages: 0,
      };
    }
  }

  // 获取针对特定用户的所有操作日志（分页）
  static async findByTargetUserId(userId: number, query: PaginationQuery = {}): Promise<PaginatedResponse<OperationLog>> {
    try {
      const page = query.page || 1;
      const limit = query.limit || 10;
      const offset = (page - 1) * limit;
      const sort = query.sort || 'created_at';
      const order = query.order || 'desc';

      const [logs, total] = await Promise.all([
        db('operation_logs')
          .where({ target_user_id: userId })
          .orderBy(sort, order)
          .limit(limit)
          .offset(offset),
        db('operation_logs').where({ target_user_id: userId }).count('id as count').first(),
      ]);

      return {
        items: logs.map((log: any) => {
          try {
            // 如果 details 是字符串，尝试解析为 JSON 对象
            // 如果已经是对象，直接使用
            return {
              ...log,
              details: log.details ? (typeof log.details === 'string' ? JSON.parse(log.details) : log.details) : null,
            };
          } catch (error) {
            console.error(`解析用户日志详情失败 (ID: ${log.id}):`, error);
            return {
              ...log,
              details: { error: '无法解析的数据', raw: log.details },
            };
          }
        }),
        total: total ? Number(total.count) : 0,
        page,
        limit,
        totalPages: Math.ceil((total ? Number(total.count) : 0) / limit),
      };
    } catch (error) {
      console.error(`获取用户 ${userId} 的操作日志失败:`, error);
      return {
        items: [],
        total: 0,
        page: query.page || 1,
        limit: query.limit || 10,
        totalPages: 0,
      };
    }
  }

  // 获取所有操作日志（分页）
  static async findAll(query: PaginationQuery = {}): Promise<PaginatedResponse<OperationLog>> {
    try {
      const page = query.page || 1;
      const limit = query.limit || 10;
      const offset = (page - 1) * limit;
      const sort = query.sort || 'created_at';
      const order = query.order || 'desc';

      const [logs, total] = await Promise.all([
        db('operation_logs')
          .orderBy(sort, order)
          .limit(limit)
          .offset(offset),
        db('operation_logs').count('id as count').first(),
      ]);

      return {
        items: logs.map((log: any) => {
          try {
            // 如果 details 是字符串，尝试解析为 JSON 对象
            // 如果已经是对象，直接使用
            return {
              ...log,
              details: log.details ? (typeof log.details === 'string' ? JSON.parse(log.details) : log.details) : null,
            };
          } catch (error) {
            console.error(`解析日志详情失败 (ID: ${log.id}):`, error);
            // 如果解析失败，返回错误对象
            return {
              ...log,
              details: { error: '无法解析的数据', raw: log.details },
            };
          }
        }),
        total: total ? Number(total.count) : 0,
        page,
        limit,
        totalPages: Math.ceil((total ? Number(total.count) : 0) / limit),
      };
    } catch (error) {
      console.error('获取操作日志失败:', error);
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
}

export default OperationLogModel;
