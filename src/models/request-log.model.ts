import { db } from '../config/database.js';
import { PaginationQuery, PaginatedResponse } from '@shared/types/index.js';

export interface RequestLog {
  id: number;
  user_id: number | null;
  method: string;
  path: string;
  status_code: number;
  ip: string | null;
  user_agent: string | null;
  response_time: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateRequestLogInput {
  user_id?: number;
  method: string;
  path: string;
  status_code: number;
  ip?: string;
  user_agent?: string;
  response_time?: number;
}

export class RequestLogModel {
  // 创建请求日志
  static async create(data: CreateRequestLogInput): Promise<RequestLog> {
    const [id] = await db('request_logs').insert({
      user_id: data.user_id || null,
      method: data.method,
      path: data.path,
      status_code: data.status_code,
      ip: data.ip || null,
      user_agent: data.user_agent || null,
      response_time: data.response_time || null,
      created_at: new Date(),
      updated_at: new Date(),
    });

    return this.findById(id);
  }

  // 通过 ID 查找请求日志
  static async findById(id: number): Promise<RequestLog | null> {
    return db('request_logs').where({ id }).first() || null;
  }

  // 获取用户的所有请求日志（分页）
  static async findByUserId(userId: number, query: PaginationQuery = {}): Promise<PaginatedResponse<RequestLog>> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const offset = (page - 1) * limit;
    const sort = query.sort || 'created_at';
    const order = query.order || 'desc';

    const [logs, total] = await Promise.all([
      db('request_logs').where({ user_id: userId }).orderBy(sort, order).limit(limit).offset(offset),
      db('request_logs').where({ user_id: userId }).count('id as count').first(),
    ]);

    return {
      items: logs,
      total: total ? Number(total.count) : 0,
      page,
      limit,
      totalPages: Math.ceil((total ? Number(total.count) : 0) / limit),
    };
  }

  // 获取所有错误请求日志（状态码 >= 400）
  static async findErrors(query: PaginationQuery = {}): Promise<PaginatedResponse<RequestLog>> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const offset = (page - 1) * limit;
    const sort = query.sort || 'created_at';
    const order = query.order || 'desc';

    const [logs, total] = await Promise.all([
      db('request_logs').where('status_code', '>=', 400).orderBy(sort, order).limit(limit).offset(offset),
      db('request_logs').where('status_code', '>=', 400).count('id as count').first(),
    ]);

    return {
      items: logs,
      total: total ? Number(total.count) : 0,
      page,
      limit,
      totalPages: Math.ceil((total ? Number(total.count) : 0) / limit),
    };
  }

  // 获取所有请求日志（分页）
  static async findAll(query: PaginationQuery = {}): Promise<PaginatedResponse<RequestLog>> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const offset = (page - 1) * limit;
    const sort = query.sort || 'created_at';
    const order = query.order || 'desc';

    const [logs, total] = await Promise.all([
      db('request_logs').orderBy(sort, order).limit(limit).offset(offset),
      db('request_logs').count('id as count').first(),
    ]);

    return {
      items: logs,
      total: total ? Number(total.count) : 0,
      page,
      limit,
      totalPages: Math.ceil((total ? Number(total.count) : 0) / limit),
    };
  }

  // 获取请求统计信息
  static async getStats(days: number = 7): Promise<any> {
    // 获取最近 n 天的请求数量
    const dailyStats = await db('request_logs')
      .select(db.raw('date(created_at) as date'))
      .count('id as count')
      .whereRaw(`created_at >= datetime('now', '-${days} days')`)
      .groupBy('date')
      .orderBy('date');

    // 获取状态码分布
    const statusStats = await db('request_logs')
      .select('status_code')
      .count('id as count')
      .groupBy('status_code')
      .orderBy('status_code');

    // 获取路径分布
    const pathStats = await db('request_logs')
      .select('path')
      .count('id as count')
      .groupBy('path')
      .orderBy('count', 'desc')
      .limit(10);

    return {
      daily: dailyStats,
      statusCodes: statusStats,
      topPaths: pathStats,
    };
  }
}

export default RequestLogModel;
