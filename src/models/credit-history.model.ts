import { db } from '../config/database.js';

// 点数历史记录模型
export interface CreditHistory {
  id: number;
  user_id: number;
  amount: number;
  action: 'add' | 'deduct' | 'use';
  balance_after: number;
  description?: string;
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

// 点数历史记录模型类
export class CreditHistoryModel {
  // 创建点数历史记录
  static async create(data: Omit<CreditHistory, 'id' | 'created_at' | 'updated_at'>): Promise<CreditHistory> {
    const now = new Date();
    const result = await db('credit_history').insert({
      ...data,
      created_at: now,
      updated_at: now,
    });

    return {
      id: result[0],
      ...data,
      created_at: now,
      updated_at: now,
    };
  }

  // 根据用户 ID 获取点数历史记录
  static async findByUserId(userId: number, limit = 10, offset = 0): Promise<CreditHistory[]> {
    return db('credit_history')
      .where('user_id', userId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);
  }

  // 获取所有点数历史记录
  static async findAll(limit = 10, offset = 0): Promise<CreditHistory[]> {
    return db('credit_history')
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);
  }

  // 获取点数历史记录总数
  static async count(): Promise<number> {
    const result = await db('credit_history').count('id as count').first();
    return result ? result.count as number : 0;
  }

  // 获取用户点数历史记录总数
  static async countByUserId(userId: number): Promise<number> {
    const result = await db('credit_history')
      .where('user_id', userId)
      .count('id as count')
      .first();
    return result ? result.count as number : 0;
  }

  // 获取用户已使用的积分总数
  static async getTotalUsedByUser(userId: number): Promise<number> {
    const result = await db('credit_history')
      .where('user_id', userId)
      .where('action', 'use')
      .sum('amount as total')
      .first();
    return result ? (result.total as number || 0) : 0;
  }
}
