import { describe, it, expect } from 'vitest';

// Pure logic test for JWT secret validation
function validateJwtSecret(secret: string | undefined, nodeEnv: string): void {
  if (nodeEnv === 'production') {
    if (!secret || secret === 'your-secret-key-change-in-production-long-enough' || secret.length < 32) {
      throw new Error('JWT_SECRET 必须在生产环境中设置至少 32 个字符的安全密钥');
    }
  }
}

describe('JWT secret production validation', () => {
  it('should reject missing JWT_SECRET in production', () => {
    expect(() => validateJwtSecret(undefined, 'production')).toThrow(/必须/);
  });

  it('should reject default JWT_SECRET in production', () => {
    expect(() => validateJwtSecret('your-secret-key-change-in-production-long-enough', 'production')).toThrow(/必须/);
  });

  it('should reject short JWT_SECRET in production', () => {
    expect(() => validateJwtSecret('short', 'production')).toThrow(/至少 32/);
  });

  it('should accept strong JWT_SECRET in production', () => {
    expect(() =>
      validateJwtSecret('a-very-long-and-secure-production-secret-key-that-is-32-plus-chars', 'production')
    ).not.toThrow();
  });

  it('should NOT validate JWT_SECRET in development', () => {
    expect(() => validateJwtSecret(undefined, 'development')).not.toThrow();
    expect(() => validateJwtSecret('short', 'test')).not.toThrow();
  });

  it('should NOT validate JWT_SECRET in test', () => {
    expect(() => validateJwtSecret('test-key', 'test')).not.toThrow();
  });
});
