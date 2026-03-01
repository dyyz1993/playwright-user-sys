/**
 * SharedUserData 集成测试
 *
 * 测试 sharedUserData 参数功能：
 * - sharedUserData=false (默认): 每个会话有独立的用户数据目录
 * - sharedUserData=true: 所有会话共享同一个用户数据目录
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

// 类型定义，避免直接导入 BrowserService
type BrowserService = {
  launchBrowser(sessionId: string, options: any): Promise<{ browserWSEndpoint?: string }>;
  closeBrowser(sessionId: string): Promise<void>;
  closeAllBrowsers(): Promise<void>;
};

type BrowserOptions = {
  sharedUserData?: boolean;
  viewport?: { width: number; height: number };
  headless?: boolean;
};

describe('SharedUserData Integration Tests', () => {
  let browserService: BrowserService;
  const testDataBaseDir = path.join(process.cwd(), 'data', 'user-data');

  beforeAll(async () => {
    // 动态导入 BrowserService，避免模块加载时的依赖问题
    const { BrowserService: BrowserServiceClass } = await import('../../src/machine/browser.service.js');
    browserService = new BrowserServiceClass() as unknown as BrowserService;
  });

  afterAll(async () => {
    // 清理所有浏览器实例
    await browserService.closeAllBrowsers();
  });

  beforeEach(async () => {
    // 清理测试数据目录
    try {
      await fs.rm(testDataBaseDir, { recursive: true, force: true });
    } catch (error) {
      // 忽略错误，目录可能不存在
    }
  });

  describe('独立会话模式 (sharedUserData=false)', () => {
    test('应该为每个会话创建独立的用户数据目录', async () => {
      const userId = 1001;
      const sessionId1 = 'test-session-independent-1';
      const sessionId2 = 'test-session-independent-2';

      const options: BrowserOptions = {
        sharedUserData: false,
        viewport: { width: 1280, height: 800 },
        headless: true,
      };

      // 添加 userId 到 options
      (options as any).userId = userId;

      // 启动第一个浏览器
      const result1 = await browserService.launchBrowser(sessionId1, options);
      expect(result1.browserWSEndpoint).toBeTruthy();
      expect(result1.browserWSEndpoint).toMatch(/^ws?:\/\/.+/);
      expect(result1.browserWSEndpoint!.length).toBeGreaterThan(10);

      // 检查第一个会话的用户数据目录是否存在
      const userDataDir1 = path.join(testDataBaseDir, String(userId), 'sessions', sessionId1);
      const exists1 = await fs
        .access(userDataDir1)
        .then(() => true)
        .catch(() => false);
      expect(exists1).toBe(true);

      // 启动第二个浏览器
      const result2 = await browserService.launchBrowser(sessionId2, options);
      expect(result2.browserWSEndpoint).toBeTruthy();
      expect(result2.browserWSEndpoint).toMatch(/^ws?:\/\/.+/);
      expect(result2.browserWSEndpoint!.length).toBeGreaterThan(10);

      // 检查第二个会话的用户数据目录是否存在
      const userDataDir2 = path.join(testDataBaseDir, String(userId), 'sessions', sessionId2);
      const exists2 = await fs
        .access(userDataDir2)
        .then(() => true)
        .catch(() => false);
      expect(exists2).toBe(true);

      // 验证两个目录是独立的
      expect(userDataDir1).not.toBe(userDataDir2);

      // 清理
      await browserService.closeBrowser(sessionId1);
      await browserService.closeBrowser(sessionId2);

      // 验证独立会话目录已被清理
      const existsAfterCleanup1 = await fs
        .access(userDataDir1)
        .then(() => true)
        .catch(() => false);
      const existsAfterCleanup2 = await fs
        .access(userDataDir2)
        .then(() => true)
        .catch(() => false);
      expect(existsAfterCleanup1).toBe(false);
      expect(existsAfterCleanup2).toBe(false);
    });

    test('默认行为 (不传 sharedUserData) 应该是独立会话模式', async () => {
      const userId = 1002;
      const sessionId = 'test-session-default';

      const options: BrowserOptions = {
        // 不设置 sharedUserData
        viewport: { width: 1280, height: 800 },
        headless: true,
      };

      (options as any).userId = userId;

      // 启动浏览器
      const result = await browserService.launchBrowser(sessionId, options);
      expect(result.browserWSEndpoint).toBeTruthy();
      expect(result.browserWSEndpoint).toMatch(/^ws?:\/\/.+/);
      expect(result.browserWSEndpoint!.length).toBeGreaterThan(10);

      // 检查用户数据目录是否使用独立模式路径
      const userDataDir = path.join(testDataBaseDir, String(userId), 'sessions', sessionId);
      const exists = await fs
        .access(userDataDir)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);

      // 清理
      await browserService.closeBrowser(sessionId);
    });
  });

  describe('共享会话模式 (sharedUserData=true)', () => {
    test('应该为所有会话使用同一个共享用户数据目录', async () => {
      const userId = 1003;
      const sessionId1 = 'test-session-shared-1';
      const sessionId2 = 'test-session-shared-2';

      const options: BrowserOptions = {
        sharedUserData: true,
        viewport: { width: 1280, height: 800 },
        headless: true,
      };

      (options as any).userId = userId;

      // 启动第一个浏览器
      const result1 = await browserService.launchBrowser(sessionId1, options);
      expect(result1.browserWSEndpoint).toBeTruthy();
      expect(result1.browserWSEndpoint).toMatch(/^ws?:\/\/.+/);
      expect(result1.browserWSEndpoint!.length).toBeGreaterThan(10);

      // 检查共享用户数据目录是否存在
      const sharedDir = path.join(testDataBaseDir, String(userId), 'shared');
      const exists1 = await fs
        .access(sharedDir)
        .then(() => true)
        .catch(() => false);
      expect(exists1).toBe(true);

      // 启动第二个浏览器
      const result2 = await browserService.launchBrowser(sessionId2, options);
      expect(result2.browserWSEndpoint).toBeTruthy();
      expect(result2.browserWSEndpoint).toMatch(/^ws?:\/\/.+/);
      expect(result2.browserWSEndpoint!.length).toBeGreaterThan(10);

      // 验证共享目录仍然存在
      const exists2 = await fs
        .access(sharedDir)
        .then(() => true)
        .catch(() => false);
      expect(exists2).toBe(true);

      // 关闭第一个浏览器
      await browserService.closeBrowser(sessionId1);

      // 验证共享目录仍然存在（共享会话不会被清理）
      const existsAfterClose1 = await fs
        .access(sharedDir)
        .then(() => true)
        .catch(() => false);
      expect(existsAfterClose1).toBe(true);

      // 关闭第二个浏览器
      await browserService.closeBrowser(sessionId2);

      // 验证共享目录仍然存在
      const existsAfterClose2 = await fs
        .access(sharedDir)
        .then(() => true)
        .catch(() => false);
      expect(existsAfterClose2).toBe(true);
    });
  });

  describe('兼容模式 (没有 userId)', () => {
    test('应该在兼容模式下使用 sessions/{sessionId} 路径', async () => {
      const sessionId = 'test-session-compat';

      const options: BrowserOptions = {
        viewport: { width: 1280, height: 800 },
        headless: true,
      };

      // 不设置 userId

      // 启动浏览器
      const result = await browserService.launchBrowser(sessionId, options);
      expect(result.browserWSEndpoint).toBeTruthy();
      expect(result.browserWSEndpoint).toMatch(/^ws?:\/\/.+/);
      expect(result.browserWSEndpoint!.length).toBeGreaterThan(10);

      // 检查兼容模式路径
      const userDataDir = path.join(testDataBaseDir, 'sessions', sessionId);
      const exists = await fs
        .access(userDataDir)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);

      // 清理
      await browserService.closeBrowser(sessionId);
    });
  });

  describe('目录创建和清理', () => {
    test('应该在启动浏览器时自动创建目录', async () => {
      const userId = 1004;
      const sessionId = 'test-session-mkdir';

      const options: BrowserOptions = {
        sharedUserData: true,
        viewport: { width: 1280, height: 800 },
        headless: true,
      };

      (options as any).userId = userId;

      // 确保目录不存在
      const userDataDir = path.join(testDataBaseDir, String(userId), 'shared');
      try {
        await fs.rm(userDataDir, { recursive: true, force: true });
      } catch (error) {
        // 忽略
      }

      // 启动浏览器
      await browserService.launchBrowser(sessionId, options);

      // 验证目录已创建
      const exists = await fs
        .access(userDataDir)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);

      // 清理
      await browserService.closeBrowser(sessionId);
    });

    test('应该正确处理目录创建失败的情况', async () => {
      const userId = 1005;
      const sessionId = 'test-session-mkdir-fail';

      const options: BrowserOptions = {
        sharedUserData: true,
        viewport: { width: 1280, height: 800 },
        headless: true,
      };

      (options as any).userId = userId;

      // 创建一个文件而不是目录（模拟冲突）
      const userDataDir = path.join(testDataBaseDir, String(userId), 'shared');
      await fs.mkdir(path.dirname(userDataDir), { recursive: true });
      await fs.writeFile(userDataDir, 'this is a file, not a directory');

      // 启动浏览器应该失败
      await expect(browserService.launchBrowser(sessionId, options)).rejects.toThrow();

      // 清理
      try {
        await fs.rm(testDataBaseDir, { recursive: true, force: true });
      } catch (error) {
        // 忽略
      }
    });
  });
});
