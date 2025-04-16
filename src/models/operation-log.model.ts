import { db } from '../database/index.js';
import { PaginationQuery, PaginatedResponse } from '../types/index.js';

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
      details: data.details ? JSON.stringify(data.details) : null,
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
    const log = await db('operation_logs').where({ id }).first();
    if (!log) return null;

    return {
      ...log,
      details: log.details ? JSON.parse(log.details) : null,
    };
  }

  // 获取管理员的所有操作日志（分页）
  static async findByAdminId(adminId: number, query: PaginationQuery = {}): Promise<PaginatedResponse<OperationLog>> {
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
      items: logs.map((log: { details: string; }) => ({
        ...log,
        details: log.details ? JSON.parse(log.details) : null,
      })),
      total: total ? Number(total.count) : 0,
      page,
      limit,
      totalPages: Math.ceil((total ? Number(total.count) : 0) / limit),
    };
  }

  // 获取针对特定用户的所有操作日志（分页）
  static async findByTargetUserId(userId: number, query: PaginationQuery = {}): Promise<PaginatedResponse<OperationLog>> {
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
      items: logs.map((log: { details: string; }) => ({
        ...log,
        details: log.details ? JSON.parse(log.details) : null,
      })),
      total: total ? Number(total.count) : 0,
      page,
      limit,
      totalPages: Math.ceil((total ? Number(total.count) : 0) / limit),
    };
  }

  // 获取所有操作日志（分页）
  static async findAll(query: PaginationQuery = {}): Promise<PaginatedResponse<OperationLog>> {
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
      items: logs.map((log: { details: string; }) => ({
        ...log,
        details: log.details ? JSON.parse(log.details) : null,
      })),
      total: total ? Number(total.count) : 0,
      page,
      limit,
      totalPages: Math.ceil((total ? Number(total.count) : 0) / limit),
    };
  }
}

export default OperationLogModel;
