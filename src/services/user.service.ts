import { db } from '../config/database.js';
import { UserModel, CreateUserInput, UpdateUserInput, User } from '../models/user.model.js';
import { OperationLogModel } from '../models/operation-log.model.js';
import { SessionModel } from '../models/session.model.js';
import { UserRole, UserStatus, PaginationQuery, PaginatedResponse } from '@shared/types/index.js';
import { NotFoundError } from '../utils/errors.js';
import { hashPassword } from '../utils/auth.js';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@shared/utils/logger.js';

export interface CreateUserServiceInput {
  username: string;
  email?: string;
  password: string;
  role?: UserRole;
  credits?: number;
}

export interface UserListQuery extends PaginationQuery {
  search?: string;
  role?: UserRole;
  status?: UserStatus;
  sort?: string;
  order?: string;
}

export async function createUser(data: CreateUserServiceInput, adminId?: number): Promise<User> {
  return await db.transaction(async (trx) => {
    const existing = await trx('users').where({ username: data.username }).first();
    if (existing) {
      throw new Error('用户名已存在');
    }

    const hashedPassword = await hashPassword(data.password);
    const apiKey = uuidv4();

    const [id] = await trx('users').insert({
      username: data.username,
      password: hashedPassword,
      email: data.email || null,
      role: data.role || UserRole.USER,
      status: UserStatus.ACTIVE,
      credits: data.credits || 0,
      api_key: apiKey,
      created_at: new Date(),
      updated_at: new Date(),
    });

    if (adminId) {
      await trx('operation_logs').insert({
        admin_id: adminId,
        action: '创建用户',
        details: JSON.stringify({
          username: data.username,
          role: data.role || UserRole.USER,
          credits: data.credits || 0,
        }),
        target_user_id: id,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    const user = await trx('users').where({ id }).first();
    return user;
  });
}

export async function updateUser(userId: number, data: UpdateUserServiceInput, adminId?: number): Promise<User | null> {
  return await db.transaction(async (trx) => {
    const existing = await trx('users').where({ id: userId }).first();
    if (!existing) return null;

    const updateData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (data.email !== undefined) updateData.email = data.email;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.webhook_url !== undefined) updateData.webhook_url = data.webhook_url;
    if (data.password) {
      updateData.password = await hashPassword(data.password);
    }

    await trx('users').where({ id: userId }).update(updateData);

    if (adminId) {
      await trx('operation_logs').insert({
        admin_id: adminId,
        action: '更新用户',
        details: JSON.stringify({
          ...updateData,
          password: data.password ? '已更新' : undefined,
        }),
        target_user_id: userId,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    return await trx('users').where({ id: userId }).first();
  });
}

export async function deleteUser(userId: number, adminId?: number): Promise<boolean> {
  const activeSessions = await SessionModel.findActiveSessions();
  const userActiveSessions = activeSessions.filter((s: { user_id: number }) => s.user_id === userId);
  if (userActiveSessions.length > 0) {
    throw new Error('该用户有活跃会话，请先释放所有会话后再删除');
  }

  return await db.transaction(async (trx) => {
    const existing = await trx('users').where({ id: userId }).first();
    if (!existing) throw new NotFoundError('用户');
    if (existing.role === UserRole.ADMIN) throw new Error('不允许删除管理员账号');

    const deleted = await trx('users').where({ id: userId }).delete();

    if (adminId && deleted > 0) {
      await trx('operation_logs').insert({
        admin_id: adminId,
        action: '删除用户',
        details: JSON.stringify({ username: existing.username }),
        target_user_id: userId,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    return deleted > 0;
  });
}

export async function batchDeleteUsers(
  userIds: number[],
  adminId?: number
): Promise<{ deleted: number[]; failed: Array<{ userId: number; error: string }> }> {
  const deleted: number[] = [];
  const failed: Array<{ userId: number; error: string }> = [];

  const activeSessions = await SessionModel.findActiveSessions();
  const activeUserIds = new Set(activeSessions.map((s: { user_id: number }) => s.user_id));

  await db.transaction(async (trx) => {
    for (const userId of userIds) {
      try {
        if (activeUserIds.has(userId)) {
          failed.push({ userId, error: '该用户有活跃会话，请先释放所有会话后再删除' });
          continue;
        }

        const existing = await trx('users').where({ id: userId }).first();
        if (!existing) {
          failed.push({ userId, error: '用户不存在' });
          continue;
        }
        if (existing.role === UserRole.ADMIN) {
          failed.push({ userId, error: '不允许删除管理员账号' });
          continue;
        }

        await trx('users').where({ id: userId }).delete();
        deleted.push(userId);

        if (adminId) {
          await trx('operation_logs').insert({
            admin_id: adminId,
            action: '批量删除用户',
            details: JSON.stringify({ username: existing.username }),
            target_user_id: userId,
            created_at: new Date(),
            updated_at: new Date(),
          });
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : '删除失败';
        failed.push({ userId, error: message });
      }
    }
  });

  return { deleted, failed };
}

export async function addCredits(
  userId: number,
  amount: number,
  adminId?: number,
  reason?: string
): Promise<User | null> {
  return await db.transaction(async (trx) => {
    const existing = await trx('users').where({ id: userId }).first();
    if (!existing) return null;

    await trx('users').where({ id: userId }).increment('credits', amount);

    if (adminId) {
      await trx('operation_logs').insert({
        admin_id: adminId,
        action: '添加点数',
        details: JSON.stringify({
          amount,
          reason: reason || '管理员分配',
          username: existing.username,
        }),
        target_user_id: userId,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    return await trx('users').where({ id: userId }).first();
  });
}

export async function batchRecharge(
  userIds: number[],
  credits: number,
  adminId?: number,
  reason?: string
): Promise<{ recharged: number[]; failed: Array<{ userId: number; error: string }> }> {
  const recharged: number[] = [];
  const failed: Array<{ userId: number; error: string }> = [];

  await db.transaction(async (trx) => {
    for (const userId of userIds) {
      try {
        const existing = await trx('users').where({ id: userId }).first();
        if (!existing) {
          failed.push({ userId, error: '用户不存在' });
          continue;
        }

        await trx('users').where({ id: userId }).increment('credits', credits);
        recharged.push(userId);

        if (adminId) {
          await trx('operation_logs').insert({
            admin_id: adminId,
            action: '批量充值',
            details: JSON.stringify({
              amount: credits,
              reason: reason || '管理员批量分配',
              username: existing.username,
            }),
            target_user_id: userId,
            created_at: new Date(),
            updated_at: new Date(),
          });
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : '充值失败';
        failed.push({ userId, error: message });
      }
    }
  });

  return { recharged, failed };
}

export async function resetApiKey(userId: number, adminId?: number): Promise<string> {
  const apiKey = uuidv4();

  await db.transaction(async (trx) => {
    const existing = await trx('users').where({ id: userId }).first();
    if (!existing) throw new NotFoundError('用户');

    await trx('users').where({ id: userId }).update({
      api_key: apiKey,
      updated_at: new Date(),
    });

    if (adminId) {
      await trx('operation_logs').insert({
        admin_id: adminId,
        action: '重置API Key',
        details: JSON.stringify({ username: existing.username }),
        target_user_id: userId,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }
  });

  return apiKey;
}

export async function listUsers(query: UserListQuery): Promise<PaginatedResponse<User>> {
  return UserModel.findAll(query);
}

export async function getUserById(userId: number): Promise<User | null> {
  return UserModel.findById(userId);
}

export async function getUserStats(): Promise<{ total: number; active: number; inactive: number }> {
  return UserModel.getStats();
}

export async function getUserSessionStats(userId: number): Promise<{
  total_sessions: number;
  total_duration: number;
  total_credits_used: number;
}> {
  return SessionModel.getUserSessionStats(userId);
}

export async function exportUsersCsv(filters: { search?: string; role?: string; status?: string }): Promise<string> {
  const queryFilters: UserListQuery = { limit: '10000' };
  if (filters.search) queryFilters.search = filters.search;
  if (filters.role) queryFilters.role = filters.role as UserRole;
  if (filters.status) queryFilters.status = filters.status as UserStatus;

  const result = await UserModel.findAll(queryFilters);
  const users = result.items;

  const headers = ['ID', '用户名', '邮箱', '角色', '积分', '状态', '创建时间'];
  const csvRows: string[] = [];

  csvRows.push('\uFEFF' + headers.map((h) => `"${h}"`).join(','));

  for (const user of users) {
    const row = [
      user.id,
      user.username,
      user.email || '',
      user.role === 'admin' ? '管理员' : '普通用户',
      user.credits,
      user.status === 'active' ? '活跃' : '禁用',
      new Date(user.created_at).toLocaleString('zh-CN'),
    ];
    csvRows.push(row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','));
  }

  return csvRows.join('\n');
}

export async function getCreditsStats(): Promise<{ total: number; used: number; available: number }> {
  return UserModel.getCreditsStats();
}

export async function countAll(): Promise<number> {
  return UserModel.countAll();
}

export async function sumAllCredits(): Promise<number> {
  return UserModel.sumAllCredits();
}

export async function countNewUsers(days: number): Promise<number> {
  return UserModel.countNewUsers(days);
}

export async function findByUsername(username: string): Promise<User | null> {
  return UserModel.findByUsername(username);
}

export async function findByApiKey(apiKey: string): Promise<User | null> {
  return UserModel.findByApiKey(apiKey);
}

export interface UpdateUserServiceInput {
  email?: string;
  password?: string;
  status?: UserStatus;
  webhook_url?: string;
  role?: UserRole;
}
