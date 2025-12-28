/**
 * Puppeteer 连接层集成测试
 * 测试浏览器服务与 Puppeteer 的连接、交互和断开
 *
 * INT-CONN-001: 启动浏览器实例
 * INT-CONN-002: 获取浏览器 WebSocket 端点
 * INT-CONN-003: 获取会话端口和路径
 * INT-CONN-004: 连接到现有浏览器
 * INT-CONN-005: 浏览器页面操作
 * INT-CONN-006: 截图功能
 * INT-CONN-007: 会话配置更新
 * INT-CONN-008: 浏览器断开连接
 * INT-CONN-009: 清理失败的浏览器启动
 * INT-CONN-010: 多个浏览器实例管理
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import puppeteer from 'puppeteer-core';
import { browserService } from '../../src/machine/browser.service.js';
import { createTestUser } from '../helpers/factories.js';
import { clearTables, getTestDbConnection } from '../helpers/database.js';
import { getFreePort } from '../helpers/ports.js';
import type { Browser, Page } from 'puppeteer-core';

describe('Puppeteer 连接层集成测试', () => {
  let testUser: any;
  const db = getTestDbConnection();

  beforeAll(async () => {
    // 清理数据库
    await clearTables('sessions', 'users', 'machines');

    // 创建测试用户
    testUser = await createTestUser({ credits: 100 });
  });

  afterAll(async () => {
    // 关闭所有浏览器实例
    await browserService.closeAllBrowsers();

    // 清理数据库
    await clearTables('sessions', 'users', 'machines');
  });

  beforeEach(async () => {
    // 每个测试前清理会话表
    await clearTables('sessions');
  });

  afterEach(async () => {
    // 每个测试后关闭所有浏览器，确保隔离
    await browserService.closeAllBrowsers();
  });

  /**
   * INT-CONN-001: 启动浏览器实例
   * 测试能够成功启动浏览器并返回正确信息
   */
  it('INT-CONN-001: 应该能成功启动浏览器实例', async () => {
    const sessionId = `test-session-${Date.now()}`;

    const browserInstance = await browserService.launchBrowser(sessionId, {
      headless: true,
    });

    expect(browserInstance).toBeDefined();
    expect(browserInstance.browserWSEndpoint).toBeDefined();
    expect(browserInstance.port).toBeGreaterThan(0);
    expect(browserInstance.path).toBeDefined();

    // 验证浏览器服务中记录了会话
    const activeSessions = browserService.getActiveSessions();
    expect(activeSessions).toBe(1);

    // 清理
    await browserService.closeBrowser(sessionId);
  });

  /**
   * INT-CONN-002: 获取浏览器 WebSocket 端点
   * 测试能够获取并使用 WebSocket 端点连接到浏览器
   */
  it('INT-CONN-002: 应该能获取浏览器 WebSocket 端点并连接', { timeout: 60000 }, async () => {
    const sessionId = `test-session-${Date.now()}`;

    // 启动浏览器
    const browserInstance = await browserService.launchBrowser(sessionId, {
      headless: true,
    });

    // 获取 WebSocket 端点
    const wsEndpoint = browserService.getBrowserWSEndpoint(sessionId);
    expect(wsEndpoint).toBe(browserInstance.browserWSEndpoint);

    // 使用 WebSocket 端点连接到浏览器
    const connectedBrowser = await puppeteer.connect({
      browserWSEndpoint: wsEndpoint!,
    });

    expect(connectedBrowser).toBeDefined();
    expect(connectedBrowser.isConnected()).toBe(true);

    // 验证可以获取页面
    const pages = await connectedBrowser.pages();
    expect(pages.length).toBeGreaterThan(0);

    // 清理
    await connectedBrowser.disconnect();
    await browserService.closeBrowser(sessionId);
  });

  /**
   * INT-CONN-003: 获取会话端口和路径
   * 测试能够获取会话的端口和路径信息
   */
  it('INT-CONN-003: 应该能正确获取会话的端口和路径', async () => {
    const sessionId = `test-session-${Date.now()}`;

    const browserInstance = await browserService.launchBrowser(sessionId, {
      headless: true,
    });

    // 获取端口
    const port = browserService.getPort(sessionId);
    expect(port).toBe(browserInstance.port);
    expect(port).toBeGreaterThan(0);

    // 获取路径
    const path = browserService.getPath(sessionId);
    expect(path).toBe(browserInstance.path);
    expect(path).toBeDefined();

    // 清理
    await browserService.closeBrowser(sessionId);
  });

  /**
   * INT-CONN-004: 连接到现有浏览器
   * 测试 puppeteer-core 能够连接到已启动的浏览器
   */
  it('INT-CONN-004: 应该能通过 puppeteer-core 连接到现有浏览器', { timeout: 60000 }, async () => {
    const sessionId = `test-session-${Date.now()}`;

    // 启动浏览器
    const browserInstance = await browserService.launchBrowser(sessionId, {
      headless: true,
    });

    // 使用 puppeteer-core 连接
    const browser = await puppeteer.connect({
      browserWSEndpoint: browserInstance.browserWSEndpoint,
    });

    expect(browser).toBeDefined();
    expect(browser.isConnected()).toBe(true);

    // 获取主页面
    const pages = await browser.pages();
    const page = pages[0];
    expect(page).toBeDefined();

    // 测试基本页面操作
    await page.goto('about:blank');
    const title = await page.title();
    expect(title).toBeDefined();

    // 清理
    await browser.disconnect();
    await browserService.closeBrowser(sessionId);
  });

  /**
   * INT-CONN-005: 浏览器页面操作
   * 测试基本的页面操作（导航、执行脚本、获取内容）
   */
  it('INT-CONN-005: 应该能进行基本的浏览器页面操作', { timeout: 60000 }, async () => {
    const sessionId = `test-session-${Date.now()}`;

    // 启动浏览器
    const browserInstance = await browserService.launchBrowser(sessionId, {
      headless: true,
    });

    // 连接到浏览器
    const browser = await puppeteer.connect({
      browserWSEndpoint: browserInstance.browserWSEndpoint,
    });

    const page = (await browser.pages())[0];

    // 测试导航到 example.com
    await page.goto('https://example.com');
    const title = await page.title();
    expect(title).toContain('Example');

    // 测试执行 JavaScript
    const result = await page.evaluate(() => {
      return document.title;
    });
    expect(result).toContain('Example');

    // 测试获取页面内容
    const content = await page.content();
    expect(content).toContain('<html');
    expect(content).toContain('Example Domain');

    // 清理
    await browser.disconnect();
    await browserService.closeBrowser(sessionId);
  });

  /**
   * INT-CONN-006: 截图功能
   * 测试能够截取浏览器屏幕截图
   */
  it('INT-CONN-006: 应该能截取浏览器屏幕截图', { timeout: 60000 }, async () => {
    const sessionId = `test-session-${Date.now()}`;

    // 启动浏览器
    const browserInstance = await browserService.launchBrowser(sessionId, {
      headless: true,
    });

    // 验证初始截图 URL 已生成
    expect(browserInstance.screenshotUrl).toBeDefined();

    // 连接到浏览器
    const browser = await puppeteer.connect({
      browserWSEndpoint: browserInstance.browserWSEndpoint,
    });

    const page = (await browser.pages())[0];

    // 导航到页面
    await page.goto('https://example.com');

    // 截取截图
    const screenshot = await page.screenshot({
      type: 'png',
      encoding: 'base64',
    });

    expect(screenshot).toBeDefined();
    expect(typeof screenshot).toBe('string');
    expect(screenshot.length).toBeGreaterThan(0);

    // 清理
    await browser.disconnect();
    await browserService.closeBrowser(sessionId);
  });

  /**
   * INT-CONN-007: 会话配置更新
   * 测试能够更新会话配置（FPS、clip、交互模式等）
   */
  it('INT-CONN-007: 应该能更新会话配置', async () => {
    const sessionId = `test-session-${Date.now()}`;

    // 启动浏览器
    await browserService.launchBrowser(sessionId, {
      headless: true,
    });

    // 获取初始配置
    const initialConfig = browserService.getSessionConfig(sessionId);
    expect(initialConfig).toBeDefined();
    expect(initialConfig?.fps).toBe(15); // 默认值

    // 更新 FPS
    const updated = browserService.updateSessionConfig(sessionId, {
      fps: 30,
    });
    expect(updated).toBe(true);

    // 验证配置已更新
    const updatedConfig = browserService.getSessionConfig(sessionId);
    expect(updatedConfig?.fps).toBe(30);

    // 更新 clip
    browserService.updateSessionConfig(sessionId, {
      clip: { x: 0, y: 0, width: 800, height: 600 },
    });

    const configWithClip = browserService.getSessionConfig(sessionId);
    expect(configWithClip?.clip).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });

    // 清理
    await browserService.closeBrowser(sessionId);
  });

  /**
   * INT-CONN-008: 浏览器断开连接
   * 测试能够正确处理浏览器的断开连接事件
   */
  it('INT-CONN-008: 应该能正确处理浏览器断开连接', { timeout: 60000 }, async () => {
    const sessionId = `test-session-${Date.now()}`;

    // 启动浏览器
    const browserInstance = await browserService.launchBrowser(sessionId, {
      headless: true,
    });

    // 连接到浏览器
    const browser = await puppeteer.connect({
      browserWSEndpoint: browserInstance.browserWSEndpoint,
    });

    // 断开 puppeteer 连接
    await browser.disconnect();

    // 浏览器服务中的会话应该仍然存在
    const port = browserService.getPort(sessionId);
    expect(port).toBeDefined();

    // 关闭浏览器
    const closed = await browserService.closeBrowser(sessionId);
    expect(closed).toBe(true);

    // 验证会话已删除
    const portAfterClose = browserService.getPort(sessionId);
    expect(portAfterClose).toBeNull();
  });

  /**
   * INT-CONN-009: 清理失败的浏览器启动
   * 测试能够清理启动失败的浏览器实例
   */
  it('INT-CONN-009: 应该能清理失败的浏览器启动', async () => {
    const sessionId = `test-session-fail-${Date.now()}`;

    // 尝试使用无效的可执行文件路径启动浏览器
    // 这应该会失败并清理
    try {
      await browserService.launchBrowser(sessionId, {
        headless: true,
        // 不传递有效配置，期望失败
      } as any);
    } catch (error) {
      // 预期会失败
      expect(error).toBeDefined();
    }

    // 验证会话不存在
    const port = browserService.getPort(sessionId);
    expect(port).toBeNull();
  });

  /**
   * INT-CONN-010: 多个浏览器实例管理
   * 测试能够同时管理多个浏览器实例
   */
  it('INT-CONN-010: 应该能同时管理多个浏览器实例', { timeout: 120000 }, async () => {
    const sessionIds = [
      `test-session-multi-1-${Date.now()}`,
      `test-session-multi-2-${Date.now()}`,
      `test-session-multi-3-${Date.now()}`,
    ];

    // 启动多个浏览器
    const browsers: any[] = [];
    for (const sessionId of sessionIds) {
      const browserInstance = await browserService.launchBrowser(sessionId, {
        headless: true,
      });
      browsers.push(browserInstance);
    }

    // 验证所有会话都存在
    expect(browserService.getActiveSessions()).toBe(3);

    // 验证每个会话的端口不同
    const ports = sessionIds.map(id => browserService.getPort(id));
    const uniquePorts = new Set(ports);
    expect(uniquePorts.size).toBe(3);

    // 连接到每个浏览器并测试
    for (let i = 0; i < browsers.length; i++) {
      const browser = await puppeteer.connect({
        browserWSEndpoint: browsers[i].browserWSEndpoint,
      });

      const page = (await browser.pages())[0];
      await page.goto('https://example.com');
      const title = await page.title();
      expect(title).toContain('Example');

      await browser.disconnect();
    }

    // 关闭所有浏览器
    for (const sessionId of sessionIds) {
      await browserService.closeBrowser(sessionId);
    }

    // 验证所有会话都已关闭
    expect(browserService.getActiveSessions()).toBe(0);
  });
});
