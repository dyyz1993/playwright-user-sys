import { db } from '../config/database.js';
import { UserRole, UserStatus, PaginationQuery, PaginatedResponse } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';
import { hashPassword, comparePassword } from '../utils/auth.js';

export interface User {
  id: number;
  username: string;
  password: string;
  email: string | null;
  role: UserRole;
  status: UserStatus;
  credits: number;
  api_key: string | null;
  webhook_url: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserInput {
  username: string;
  password: string;
  email?: string;
  role?: UserRole;
  status?: UserStatus;
  credits?: number;
  webhook_url?: string;
}

export interface UpdateUserInput {
  email?: string;
  password?: string;
  status?: UserStatus;
  credits?: number;
  webhook_url?: string;
}

export class UserModel {
  // 创建用户
  static async create(data: CreateUserInput): Promise<User | null> {
    const hashedPassword = await hashPassword(data.password);
    const apiKey = uuidv4();

    const [id] = await db('users').insert({
      username: data.username,
      password: hashedPassword,
      email: data.email || null,
      role: data.role || UserRole.USER,
      status: data.status || UserStatus.ACTIVE,
      credits: data.credits || 0,
      api_key: apiKey,
      webhook_url: data.webhook_url || null,
      created_at: new Date(),
      updated_at: new Date(),
    });

    return this.findById(id);
  }

  // 通过 ID 查找用户
  static async findById(id: number): Promise<User | null> {
    return db('users').where({ id }).first() || null;
  }

  // 通过用户名查找用户
  static async findByUsername(username: string): Promise<User | null> {
    return db('users').where({ username }).first() || null;
  }

  // 通过 API Key 查找用户
  static async findByApiKey(apiKey: string): Promise<User | null> {
    return db('users').where({ api_key: apiKey }).first() || null;
  }

  // 更新用户
  static async update(id: number, data: UpdateUserInput): Promise<User | null> {
    const updateData: any = {
      ...data,
      updated_at: new Date(),
    };

    // 如果提供了密码，则哈希处理
    if (data.password) {
      updateData.password = await hashPassword(data.password);
    }

    await db('users').where({ id }).update(updateData);
    return this.findById(id);
  }

  // 重置 API Key
  static async resetApiKey(id: number): Promise<string> {
    const apiKey = uuidv4();
    await db('users').where({ id }).update({
      api_key: apiKey,
      updated_at: new Date(),
    });

    return apiKey;
  }

  // 验证用户密码
  static async verifyPassword(user: User, password: string): Promise<boolean> {
    return comparePassword(password, user.password);
  }

  // 添加点数
  static async addCredits(id: number, amount: number): Promise<User | null> {
    await db('users').where({ id }).increment('credits', amount);
    return this.findById(id);
  }

  // 扣除点数
  static async deductCredits(id: number, amount: number): Promise<User | null> {
    const user = await this.findById(id);
    if (!user) return null;

    if (user.credits < amount) {
      throw new Error('点数不足');
    }

    await db('users').where({ id }).decrement('credits', amount);
    return this.findById(id);
  }

  // 获取所有用户（分页）
  static async findAll(query: PaginationQuery = {}): Promise<PaginatedResponse<User>> {
    try {
      console.log('开始查询用户数据');
      const page = query.page || 1;
      const limit = query.limit || 10;
      const offset = (page - 1) * limit;
      const sort = query.sort || 'created_at';
      const order = query.order || 'desc';

      const [users, total] = await Promise.all([
        db('users')
          .orderBy(sort, order)
          .limit(limit)
          .offset(offset),
        db('users').count('id as count').first(),
      ]);

      console.log(`找到 ${users.length} 个用户，总数 ${total ? total.count : 0}`);

      return {
        items: users,
        total: total ? Number(total.count) : 0,
        page,
        limit,
        totalPages: Math.ceil((total ? Number(total.count) : 0) / limit),
      };
    } catch (error) {
      console.error('查询用户数据失败:', error);
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

  // 删除用户
  static async delete(id: number): Promise<boolean> {
    const deleted = await db('users').where({ id }).delete();
    return deleted > 0;
  }

  // 获取用户统计数据
  static async getStats(): Promise<{ total: number; active: number; inactive: number }> {
    try {
      // 获取总用户数
      const totalResult = await db('users').count('id as count').first();
      const total = totalResult ? Number(totalResult.count) : 0;

      // 获取活跃用户数
      const activeResult = await db('users').where({ status: UserStatus.ACTIVE }).count('id as count').first();
      const active = activeResult ? Number(activeResult.count) : 0;

      // 获取非活跃用户数
      const inactiveResult = await db('users').where({ status: UserStatus.INACTIVE }).count('id as count').first();
      const inactive = inactiveResult ? Number(inactiveResult.count) : 0;

      return { total, active, inactive };
    } catch (error) {
      console.error('获取用户统计数据失败:', error);
      return { total: 0, active: 0, inactive: 0 };
    }
  }

  // 获取点数统计数据
  static async getCreditsStats(): Promise<{ total: number; used: number; available: number }> {
    try {
      // 获取总点数
      const totalResult = await db('users').sum('credits as total').first();
      const total = totalResult && totalResult.total ? Number(totalResult.total) : 0;

      // 获取已使用点数（从会话表中计算）
      const usedResult = await db('sessions')
        .whereNotNull('duration')
        .sum('duration as total_seconds')
        .first();

      // 将秒数转换为分钟（向上取整）
      const totalSeconds = usedResult && usedResult.total_seconds ? Number(usedResult.total_seconds) : 0;
      const used = Math.ceil(totalSeconds / 60);

      // 计算可用点数
      const available = total;

      return { total, used, available };
    } catch (error) {
      console.error('获取点数统计数据失败:', error);
      return { total: 0, used: 0, available: 0 };
    }
  }
}

export default UserModel;
