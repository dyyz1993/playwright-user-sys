/**
 * Timezone 集成测试
 *
 * 测试 timezone 参数功能：
 * - 默认时区：Asia/Shanghai
 * - 自定义时区：通过 timezone 参数设置
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer';

// 类型定义，避免直接导入 BrowserService
type BrowserService = {
  launchBrowser(sessionId: string, options: any): Promise<{ browserWSEndpoint?: string; port: number }>;
  closeBrowser(sessionId: string): Promise<void>;
  closeAllBrowsers(): Promise<void>;
};

type BrowserOptions = {
  sharedUserData?: boolean;
  viewport?: { width: number; height: number };
  headless?: boolean;
  timezone?: string;
  userId?: number;
};

describe('Timezone Integration Tests', () => {
  let browserService: BrowserService;
  const testDataBaseDir = path.join(process.cwd(), 'data', 'user-data');

  beforeAll(async () => {
    // 动态导入 BrowserService，避免模块加载时的依赖问题
    const { BrowserService: BrowserServiceClass } = await import('../../src/machine/browser.service.js');
    browserService = new BrowserServiceClass();
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

  describe('默认时区设置', () => {
    test('不传timezone参数时应使用默认时区 Asia/Shanghai', async () => {
      const sessionId = 'test-timezone-default';
      const options: BrowserOptions = {
        viewport: { width: 1280, height: 800 },
        headless: true,
      };

      // 启动浏览器
      const result = await browserService.launchBrowser(sessionId, options);
      expect(result.browserWSEndpoint).toBeTruthy();
      expect(result.browserWSEndpoint).toMatch(/^ws?:\/\/.+/);
      expect(result.browserWSEndpoint!.length).toBeGreaterThan(10);

      // 连接浏览器验证时区
      const browser = await puppeteer.connect({
        browserWSEndpoint: result.browserWSEndpoint!,
      });
      const page = (await browser.pages())[0];

      const timezoneInfo = await page.evaluate(() => {
        const date = new Date();
        return {
          timezoneOffset: date.getTimezoneOffset(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
      });

      console.log(`   默认时区: ${timezoneInfo.timezone}`);
      console.log(`   时区偏移: ${timezoneInfo.timezoneOffset} 分钟`);

      // 默认应该是 Asia/Shanghai (UTC+8, offset = -480)
      expect(timezoneInfo.timezone).toBe('Asia/Shanghai');
      expect(timezoneInfo.timezoneOffset).toBe(-480);

      await browser.disconnect();
      await browserService.closeBrowser(sessionId);
    });
  });

  describe('自定义时区设置', () => {
    test('应该正确设置 America/New_York 时区', async () => {
      const sessionId = 'test-timezone-newyork';
      const options: BrowserOptions = {
        timezone: 'America/New_York',
        viewport: { width: 1280, height: 800 },
        headless: true,
      };

      // 启动浏览器
      const result = await browserService.launchBrowser(sessionId, options);
      expect(result.browserWSEndpoint).toBeTruthy();
      expect(result.browserWSEndpoint).toMatch(/^ws?:\/\/.+/);

      // 连接浏览器验证时区
      const browser = await puppeteer.connect({
        browserWSEndpoint: result.browserWSEndpoint!,
      });
      const page = (await browser.pages())[0];

      const timezoneInfo = await page.evaluate(() => {
        const date = new Date();
        return {
          timezoneOffset: date.getTimezoneOffset(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
      });

      console.log(`   设置时区: America/New_York`);
      console.log(`   实际时区: ${timezoneInfo.timezone}`);
      console.log(`   时区偏移: ${timezoneInfo.timezoneOffset} 分钟`);

      expect(timezoneInfo.timezone).toBe('America/New_York');

      await browser.disconnect();
      await browserService.closeBrowser(sessionId);
    });

    test('应该正确设置 Asia/Tokyo 时区', async () => {
      const sessionId = 'test-timezone-tokyo';
      const options: BrowserOptions = {
        timezone: 'Asia/Tokyo',
        viewport: { width: 1280, height: 800 },
        headless: true,
      };

      // 启动浏览器
      const result = await browserService.launchBrowser(sessionId, options);
      expect(result.browserWSEndpoint).toBeTruthy();
      expect(result.browserWSEndpoint).toMatch(/^ws?:\/\/.+/);

      // 连接浏览器验证时区
      const browser = await puppeteer.connect({
        browserWSEndpoint: result.browserWSEndpoint!,
      });
      const page = (await browser.pages())[0];

      const timezoneInfo = await page.evaluate(() => {
        const date = new Date();
        return {
          timezoneOffset: date.getTimezoneOffset(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
      });

      console.log(`   设置时区: Asia/Tokyo`);
      console.log(`   实际时区: ${timezoneInfo.timezone}`);
      console.log(`   时区偏移: ${timezoneInfo.timezoneOffset} 分钟`);

      expect(timezoneInfo.timezone).toBe('Asia/Tokyo');
      // UTC+9 = -540 分钟
      expect(timezoneInfo.timezoneOffset).toBe(-540);

      await browser.disconnect();
      await browserService.closeBrowser(sessionId);
    });

    test('应该正确设置 Europe/London 时区', async () => {
      const sessionId = 'test-timezone-london';
      const options: BrowserOptions = {
        timezone: 'Europe/London',
        viewport: { width: 1280, height: 800 },
        headless: true,
      };

      // 启动浏览器
      const result = await browserService.launchBrowser(sessionId, options);
      expect(result.browserWSEndpoint).toBeTruthy();
      expect(result.browserWSEndpoint).toMatch(/^ws?:\/\/.+/);

      // 连接浏览器验证时区
      const browser = await puppeteer.connect({
        browserWSEndpoint: result.browserWSEndpoint!,
      });
      const page = (await browser.pages())[0];

      const timezoneInfo = await page.evaluate(() => {
        const date = new Date();
        return {
          timezoneOffset: date.getTimezoneOffset(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
      });

      console.log(`   设置时区: Europe/London`);
      console.log(`   实际时区: ${timezoneInfo.timezone}`);
      console.log(`   时区偏移: ${timezoneInfo.timezoneOffset} 分钟`);

      expect(timezoneInfo.timezone).toBe('Europe/London');

      await browser.disconnect();
      await browserService.closeBrowser(sessionId);
    });
  });

  describe('时区与其他参数组合', () => {
    test('timezone 与 sharedUserData 组合使用', async () => {
      const userId = 2001;
      const sessionId = 'test-timezone-shared';
      const options: BrowserOptions = {
        timezone: 'America/Los_Angeles',
        sharedUserData: true,
        viewport: { width: 1280, height: 800 },
        headless: true,
      };

      // 添加 userId 到 options
      (options as any).userId = userId;

      // 启动浏览器
      const result = await browserService.launchBrowser(sessionId, options);
      expect(result.browserWSEndpoint).toBeTruthy();
      expect(result.browserWSEndpoint).toMatch(/^ws?:\/\/.+/);

      // 连接浏览器验证时区
      const browser = await puppeteer.connect({
        browserWSEndpoint: result.browserWSEndpoint!,
      });
      const page = (await browser.pages())[0];

      const timezoneInfo = await page.evaluate(() => {
        return {
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
      });

      console.log(`   设置时区: America/Los_Angeles`);
      console.log(`   实际时区: ${timezoneInfo.timezone}`);

      expect(timezoneInfo.timezone).toBe('America/Los_Angeles');

      // 验证共享目录存在
      const sharedDir = path.join(testDataBaseDir, String(userId), 'shared');
      const exists = await fs.access(sharedDir).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      await browser.disconnect();
      await browserService.closeBrowser(sessionId);
    });
  });
});
