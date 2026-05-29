import { randomUUID, createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import jwt, { SignOptions } from 'jsonwebtoken';
import { UserRole } from '@shared/types/index.js';
import { logger } from '@shared/utils/logger.js';

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'test') return 'test-secret-key-for-testing-only-32chars';
    if (process.env.NODE_ENV === 'development') {
      logger.warn('Using default development JWT secret. Set JWT_SECRET in production!');
      return 'dev-only-secret-key';
    }
    throw new Error('JWT_SECRET 必须在生产环境中设置至少 32 个字符的安全密钥');
  }
  if (process.env.NODE_ENV === 'production' && secret.length < 32) {
    throw new Error('JWT_SECRET 必须在生产环境中设置至少 32 个字符的安全密钥');
  }
  return secret;
}

export function isSha256Hash(hash: string): boolean {
  return /^[a-f0-9]{64}$/i.test(hash);
}

export async function verifyPasswordWithMigration(
  password: string,
  hash: string
): Promise<{ valid: boolean; needsMigration: boolean }> {
  if (hash.startsWith('$2a$') || hash.startsWith('$2b$')) {
    const valid = await bcrypt.compare(password, hash);
    return { valid, needsMigration: false };
  }

  if (isSha256Hash(hash)) {
    const sha256Hash = createHash('sha256').update(password).digest('hex');
    if (sha256Hash === hash) {
      return { valid: true, needsMigration: true };
    }
    return { valid: false, needsMigration: false };
  }

  return { valid: false, needsMigration: false };
}

// 生成 API Key
export function generateApiKey(): string {
  return randomUUID();
}

// 生成 JWT Token
export function generateToken(payload: { id: number; username: string; role: UserRole }): string {
  const secret = getJwtSecret();

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
export function verifyToken(token: string): jwt.JwtPayload | null {
  try {
    const secret = getJwtSecret();
    return jwt.verify(token, secret) as jwt.JwtPayload;
  } catch (_error: unknown) {
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
  verifyPasswordWithMigration,
  isSha256Hash,
  generateApiKey,
  generateToken,
  verifyToken,
  extractTokenFromHeader,
};
