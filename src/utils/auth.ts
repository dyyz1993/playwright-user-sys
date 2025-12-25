import { createHash } from 'crypto';
import { env } from '../config/env.js';
import * as jwt from 'jsonwebtoken';
import { UserRole } from '@shared/types/index.js';

// 哈希密码
export async function hashPassword(password: string): Promise<string> {
  return createHash('sha256').update(password).digest('hex');
}

// 比较密码
export async function comparePassword(password: string, hashedPassword: string): Promise<boolean> {
  const hashed = await hashPassword(password);
  return hashed === hashedPassword;
}

// 生成 JWT Token
export function generateToken(payload: { id: number; username: string; role: UserRole }): string {
  // 使用硬编码的密钥进行测试
  const secret = process.env.NODE_ENV === 'test' ? 'test-secret-key' : String(env.JWT_SECRET);
  // 使用 any 类型绕过 TypeScript 类型检查
  return (jwt as any).sign(payload, secret, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

// 验证 JWT Token
export function verifyToken(token: string): any {
  try {
    // 使用硬编码的密钥进行测试
    const secret = process.env.NODE_ENV === 'test' ? 'test-secret-key' : String(env.JWT_SECRET);
    // 使用 any 类型绕过 TypeScript 类型检查
    return (jwt as any).verify(token, secret);
  } catch (error) {
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
  generateToken,
  verifyToken,
  extractTokenFromHeader,
};
