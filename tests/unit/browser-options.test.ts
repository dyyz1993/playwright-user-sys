/**
 * 浏览器选项单元测试
 * 测试 storageState 和 userDataDir 参数处理
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createSessionRequestSchema } from '../../src/schemas/session.schema';

describe('浏览器选项 Schema 验证', () => {
  it('应该接受 storageStatePath 参数', () => {
    const result = createSessionRequestSchema.safeParse({
      storageStatePath: '/path/to/storage-state.json',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.storageStatePath).toBe('/path/to/storage-state.json');
    }
  });

  it('应该接受 storageState 对象（包含 cookies）', () => {
    const result = createSessionRequestSchema.safeParse({
      storageState: {
        cookies: [
          {
            name: 'testCookie',
            value: 'testValue',
            domain: 'example.com',
            path: '/',
            expires: Date.now() + 3600000,
            httpOnly: false,
            secure: false,
            sameSite: 'Lax' as const,
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.storageState?.cookies).toHaveLength(1);
      expect(result.data.storageState?.cookies?.[0].name).toBe('testCookie');
    }
  });

  it('应该接受 storageState 对象（包含 origins）', () => {
    const result = createSessionRequestSchema.safeParse({
      storageState: {
        origins: [
          {
            origin: 'https://example.com',
            localStorage: [
              { name: 'sessionToken', value: 'abc123' },
              { name: 'userPref', value: '{"theme":"dark"}' },
            ],
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.storageState?.origins).toHaveLength(1);
      expect(result.data.storageState?.origins?.[0].origin).toBe('https://example.com');
      expect(result.data.storageState?.origins?.[0].localStorage).toHaveLength(2);
    }
  });

  it('应该接受 userDataDir 参数', () => {
    const result = createSessionRequestSchema.safeParse({
      userDataDir: '/path/to/user-data-dir',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.userDataDir).toBe('/path/to/user-data-dir');
    }
  });

  it('应该同时接受多个新参数', () => {
    const result = createSessionRequestSchema.safeParse({
      storageStatePath: '/path/to/storage.json',
      userDataDir: '/path/to/user-data',
      viewport: { width: 1920, height: 1080 },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.storageStatePath).toBe('/path/to/storage.json');
      expect(result.data.userDataDir).toBe('/path/to/user-data');
      expect(result.data.viewport?.width).toBe(1920);
    }
  });

  it('应该拒绝无效的 storageState 格式', () => {
    const result = createSessionRequestSchema.safeParse({
      storageState: {
        cookies: [
          {
            name: 'testCookie',
            // 缺少必需字段：value, domain, path
          },
        ],
      },
    });

    expect(result.success).toBe(false);
  });

  it('应该拒绝无效的 sameSite 值', () => {
    const result = createSessionRequestSchema.safeParse({
      storageState: {
        cookies: [
          {
            name: 'testCookie',
            value: 'testValue',
            domain: 'example.com',
            path: '/',
            sameSite: 'Invalid' as any, // 无效值
          },
        ],
      },
    });

    expect(result.success).toBe(false);
  });
});
