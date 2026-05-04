import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import jwt, { SignOptions } from 'jsonwebtoken';
import { UserRole } from '@shared/types/index.js';

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// 生成 API Key
export function generateApiKey(): string {
  return randomUUID();
}

// 生成 JWT Token
export function generateToken(payload: { id: number; username: string; role: UserRole }): string {
  // 在测试环境中优先使用环境变量，如果没有则使用默认值
  let secret: string;
  if (process.env.NODE_ENV === 'test') {
    secret = process.env.JWT_SECRET || 'test-secret-key-for-testing-only-32chars';
  } else {
    secret = String(env.JWT_SECRET);
  }

  // 在测试环境中，使用固定的过期时间，避免环境变量问题
  const expiresIn = process.env.NODE_ENV === 'test' ? '24h' : env.JWT_EXPIRES_IN || '1d';

  // 验证 payload 内容
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload for JWT token');
  }

  if (typeof payload.id !== 'number' || payload.id <= 0) {
    throw new Error(`Invalid payload.id: ${payload.id}`);
  }

  if (!payload.username || typeof payload.username !== 'string') {
    throw new Error(`Invalid payload.username: ${payload.username}`);
  }

  if (!payload.role || typeof payload.role !== 'string') {
    throw new Error(`Invalid payload.role: ${payload.role}`);
  }

  const options: SignOptions = { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] };
  return jwt.sign(payload, secret, options);
}

// 验证 JWT Token
export function verifyToken(token: string): any {
  try {
    // 在测试环境中优先使用环境变量，如果没有则使用默认值
    let secret: string;
    if (process.env.NODE_ENV === 'test') {
      secret = process.env.JWT_SECRET || 'test-secret-key-for-testing-only-32chars';
    } else {
      secret = String(env.JWT_SECRET);
    }
    return jwt.verify(token, secret);
  } catch (_error) {
    return null;
  }
}

// 从请求头中提取 Token
export function extractTokenFromHeader(header: string | undefined): string | null {
  if (!header) return null;

  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

export default {
  hashPassword,
  comparePassword,
  generateApiKey,
  generateToken,
  verifyToken,
  extractTokenFromHeader,
};
