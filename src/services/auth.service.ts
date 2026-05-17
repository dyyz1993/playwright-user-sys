import { db } from '../config/database.js';
import { UserModel } from '../models/user.model.js';
import { verifyPasswordWithMigration, hashPassword, generateToken } from '../utils/auth.js';
import { UserStatus } from '@shared/types/index.js';
import { logger } from '@shared/utils/logger.js';

export interface AuthResult {
  user: {
    id: number;
    username: string;
    email: string | null;
    role: string;
    status: string;
    credits: number;
    api_key: string | null;
    webhook_url: string | null;
    created_at: Date;
  };
  token: string;
}

export async function authenticateUser(username: string, password: string, ipAddress?: string): Promise<AuthResult> {
  const user = await UserModel.findByUsername(username);
  if (!user) {
    throw new Error('用户名或密码错误');
  }

  if (user.status !== UserStatus.ACTIVE) {
    throw new Error('账户已被禁用');
  }

  const { valid, needsMigration } = await verifyPasswordWithMigration(password, user.password);
  if (!valid) {
    throw new Error('用户名或密码错误');
  }

  if (needsMigration) {
    await db.transaction(async (trx) => {
      const newHash = await hashPassword(password);
      await trx('users').where({ id: user.id }).update({
        password: newHash,
        updated_at: new Date(),
      });
      logger.info(`[密码迁移] 用户 ${user.id} 的密码已从 SHA-256 迁移到 bcrypt`);
    });
  }

  const token = generateToken({
    id: user.id,
    username: user.username,
    role: user.role,
  });

  await db('operation_logs')
    .insert({
      admin_id: user.id,
      action: 'login',
      details: JSON.stringify({
        username: user.username,
        role: user.role,
        ip: ipAddress,
      }),
      created_at: new Date(),
      updated_at: new Date(),
    })
    .catch((err: unknown) => {
      logger.error('记录登录操作日志失败: %s', err instanceof Error ? err.message : String(err));
    });

  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email || null,
      role: user.role || 'user',
      status: user.status || 'active',
      credits: user.credits,
      api_key: user.api_key,
      webhook_url: user.webhook_url,
      created_at: user.created_at,
    },
    token,
  };
}

export async function webLogin(username: string, password: string, ipAddress?: string): Promise<AuthResult> {
  return authenticateUser(username, password, ipAddress);
}
