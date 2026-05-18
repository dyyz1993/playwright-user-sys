import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSafeErrorMessage } from '../../../src/utils/response.js';

describe('getSafeErrorMessage', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('should return generic message in production', () => {
    process.env.NODE_ENV = 'production';
    const error = new Error('Internal DB connection string: mysql://root:pass@db:3306');
    expect(getSafeErrorMessage(error)).toBe('服务器内部错误');
  });

  it('should return actual error message in development', () => {
    process.env.NODE_ENV = 'development';
    const error = new Error('some debug info');
    expect(getSafeErrorMessage(error)).toBe('some debug info');
  });

  it('should handle non-Error values', () => {
    process.env.NODE_ENV = 'production';
    expect(getSafeErrorMessage('string error')).toBe('服务器内部错误');
    expect(getSafeErrorMessage(null)).toBe('服务器内部错误');
    expect(getSafeErrorMessage(undefined)).toBe('服务器内部错误');
  });

  it('should return stringified non-Error in development', () => {
    process.env.NODE_ENV = 'development';
    expect(getSafeErrorMessage('string error')).toBe('string error');
    expect(getSafeErrorMessage(42)).toBe('42');
  });
});
