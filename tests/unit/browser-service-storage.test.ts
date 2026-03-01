/**
 * BrowserService storageState 处理单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { browserService } from '../../src/machine/browser.service.js';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('BrowserService storageState 处理', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `browser-service-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('应该正确处理 storageStatePath 参数', async () => {
    // 创建测试文件
    const storageState = {
      cookies: [
        {
          name: 'testCookie',
          value: 'testValue123',
          domain: 'example.com',
          path: '/',
          expires: Date.now() + 3600000,
          httpOnly: false,
          secure: false,
          sameSite: 'Lax' as const,
        },
      ],
    };

    const storageStatePath = join(tempDir, 'storage-state.json');
    writeFileSync(storageStatePath, JSON.stringify(storageState, null, 2));

    // 验证 convertPuppeteerOptions 方法不会抛出错误
    const options = {
      storageStatePath,
    };

    const puppeteerOptions = await (browserService as any).convertPuppeteerOptions(options);
    expect(puppeteerOptions).toBeDefined();
    // userDataDir 应该不在参数中（因为没有设置）
    expect(puppeteerOptions.args?.find((arg) => arg.startsWith('--user-data-dir'))).toBeUndefined();
  });

  it('应该正确处理 userDataDir 参数', async () => {
    const userDataDir = join(tempDir, 'chrome-profile');

    const options = {
      userDataDir,
    };

    const puppeteerOptions = await (browserService as any).convertPuppeteerOptions(options);
    expect(puppeteerOptions).toBeDefined();

    // 验证 userDataDir 被添加到 args
    const userDataDirArg = puppeteerOptions.args?.find((arg) => arg.startsWith('--user-data-dir='));
    expect(userDataDirArg).toBe(`--user-data-dir=${userDataDir}`);
  });

  it('应该同时处理多个参数', async () => {
    const userDataDir = join(tempDir, 'chrome-profile');
    const viewport = { width: 1920, height: 1080 };

    const options = {
      userDataDir,
      viewport,
      userAgent: 'TestBrowser/1.0',
    };

    const puppeteerOptions = await (browserService as any).convertPuppeteerOptions(options);
    expect(puppeteerOptions).toBeDefined();

    // 验证所有参数都被正确处理
    expect(puppeteerOptions.args?.some((arg) => arg.startsWith('--user-data-dir='))).toBe(true);
    expect(puppeteerOptions.args?.some((arg) => arg.startsWith('--user-agent='))).toBe(true);
    expect(puppeteerOptions.args?.some((arg) => arg.startsWith('--window-size='))).toBe(true);
    expect(puppeteerOptions.defaultViewport).toEqual({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
    });
  });

  it('应该正确处理包含 origins 的 storageState', async () => {
    const storageState = {
      origins: [
        {
          origin: 'https://example.com',
          localStorage: [
            { name: 'sessionToken', value: 'abc123xyz' },
            { name: 'userPreference', value: '{"theme":"dark"}' },
          ],
        },
      ],
    };

    const options = {
      storageState,
    };

    const puppeteerOptions = await (browserService as any).convertPuppeteerOptions(options);
    expect(puppeteerOptions).toBeDefined();
  });

  it('应该正确处理包含 cookies 和 origins 的完整 storageState', async () => {
    const storageState = {
      cookies: [
        {
          name: 'sessionCookie',
          value: 'sessionValue',
          domain: '.example.com',
          path: '/',
          expires: Date.now() + 86400000,
          httpOnly: true,
          secure: true,
          sameSite: 'Strict' as const,
        },
      ],
      origins: [
        {
          origin: 'https://example.com',
          localStorage: [{ name: 'authToken', value: 'token123' }],
        },
      ],
    };

    const options = {
      storageState,
    };

    const puppeteerOptions = await (browserService as any).convertPuppeteerOptions(options);
    expect(puppeteerOptions).toBeDefined();
  });
});
