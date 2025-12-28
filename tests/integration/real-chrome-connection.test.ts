/**
 * 真实Chrome浏览器集成测试
 *
 * 测试范围:
 * - 真实启动Chrome浏览器（非mock）
 * - 使用puppeteer-core连接到Chrome
 * - 跳转到百度并验证页面内容
 * - 统计各项操作耗时
 * - 验证后扣费模式和计费准确性
 *
 * 断言标准:
 * - 必须验证实际值，不能使用 true/false/0/1
 * - 必须验证具体的数值、字符串、对象属性
 * - 必须验证性能指标在合理范围内
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import puppeteer from 'puppeteer-core';
import { browserService } from '../../src/machine/browser.service.js';
import { SessionModel } from '../../src/models/session.model.js';
import { UserModel } from '../../src/models/user.model.js';
import { CreditHistoryModel } from '../../src/models/credit-history.model.js';
import { createTestUser } from '../helpers/factories.js';
import { clearAllTables } from '../helpers/database.js';
import { SessionStatus } from '../../src/shared/types/index.js';
import type { Browser, Page } from 'puppeteer-core';

interface PerformanceMetrics {
  chromeLaunch: number;
  puppeteerConnect: number;
  pageGoto: number;
  sessionCreate: number;
  sessionDisconnect: number;
  chromeClose: number;
  totalDuration: number;
}

describe('真实Chrome浏览器集成测试', () => {
  let testUser: any;

  beforeAll(async () => {
    await clearAllTables();
    testUser = await createTestUser({ credits: 100 });
    console.log(`✅ 创建测试用户: ${testUser.username}, 初始积分: ${testUser.credits}`);
  }, 30000);

  afterAll(async () => {
    await browserService.closeAllBrowsers();
    await clearAllTables();
    console.log('✅ 清理所有测试数据');
  }, 30000);

  beforeEach(async () => {
    // 只清理会话相关表，不清理用户
    await clearAllTables();
    // 重新创建用户
    testUser = await createTestUser({ credits: 100 });
  }, 10000);

  afterEach(async () => {
    await browserService.closeAllBrowsers();
  }, 10000);

  it('REAL-CHROME-001: 应能真实启动Chrome并跳转到百度', { timeout: 120000 }, async () => {
    const metrics = {} as PerformanceMetrics;
    const sessionId = `test-session-${Date.now()}`;
    const totalStartTime = Date.now();

    // ===== 步骤1: 启动Chrome =====
    console.log('\n📋 步骤1: 启动Chrome浏览器...');
    const launchStartTime = Date.now();
    const browserInstance = await browserService.launchBrowser(sessionId, {
      headless: true,
    });
    metrics.chromeLaunch = Date.now() - launchStartTime;

    console.log(`✅ Chrome启动成功, 耗时: ${metrics.chromeLaunch}ms`);
    console.log(`   CDP端点: ${browserInstance.browserWSEndpoint}`);
    console.log(`   端口: ${browserInstance.port}`);
    console.log(`   路径: ${browserInstance.path}`);

    // 严格断言1: 验证启动返回值
    expect(browserInstance).toBeDefined();
    expect(browserInstance.browserWSEndpoint).toMatch(/^ws:\/\/(127\.0\.0\.1|localhost):\d+\/devtools\/browser\/[a-f0-9-]+$/);
    expect(browserInstance.port).toBeGreaterThan(1024);
    expect(browserInstance.port).toBeLessThan(65536);
    expect(browserInstance.path).toBeDefined();
    expect(browserInstance.path.length).toBeGreaterThan(0);

    // 严格断言2: 验证启动耗时
    expect(metrics.chromeLaunch).toBeGreaterThan(50); // 至少50ms
    expect(metrics.chromeLaunch).toBeLessThan(30000); // 最多30秒

    // 严格断言3: 验证浏览器服务记录
    expect(browserService.getActiveSessions()).toBe(1);
    const storedPort = browserService.getPort(sessionId);
    expect(storedPort).toBe(browserInstance.port);
    const storedPath = browserService.getPath(sessionId);
    expect(storedPath).toBe(browserInstance.path);

    // ===== 步骤2: 创建数据库会话记录 =====
    console.log('\n📋 步骤2: 创建数据库会话记录...');
    const createStartTime = Date.now();
    const session = await SessionModel.create({
      user_id: testUser.id,
      machine_id: 'test-machine-001',
    });
    metrics.sessionCreate = Date.now() - createStartTime;

    console.log(`✅ 会话创建成功, ID: ${session.id}, 耗时: ${metrics.sessionCreate}ms`);

    // 严格断言4: 验证会话创建
    expect(session.id).toBeDefined();
    expect(session.id).toBe(sessionId);
    expect(session.status).toBe(SessionStatus.CREATED);
    expect(session.user_id).toBe(testUser.id);
    expect(session.machine_id).toBe('test-machine-001');
    expect(session.start_time).toBeInstanceOf(Date);
    expect(metrics.sessionCreate).toBeLessThan(5000); // 创建应在5秒内完成

    // 严格断言5: 验证创建会话时不扣费（后扣费模式）
    const initialUser = await UserModel.findById(testUser.id);
    const initialCredits = initialUser.credits;
    expect(initialCredits).toBe(100); // 创建会话时不扣费
    console.log(`   初始积分: ${initialCredits} (创建会话后未扣费，验证后扣费模式)`);

    // ===== 步骤3: Puppeteer连接 =====
    console.log('\n📋 步骤3: 使用puppeteer-core连接到Chrome...');
    const connectStartTime = Date.now();
    const browser = await puppeteer.connect({
      browserWSEndpoint: browserInstance.browserWSEndpoint,
    });
    metrics.puppeteerConnect = Date.now() - connectStartTime;

    console.log(`✅ Puppeteer连接成功, 耗时: ${metrics.puppeteerConnect}ms`);

    // 严格断言6: 验证Puppeteer连接
    expect(browser).toBeDefined();
    expect(browser.isConnected()).toBe(true);
    expect(metrics.puppeteerConnect).toBeLessThan(5000); // 连接应在5秒内完成

    // 获取页面
    const pages = await browser.pages();
    expect(pages.length).toBeGreaterThan(0);
    const page = pages[0];
    expect(page).toBeDefined();

    // ===== 步骤4: 跳转到百度 =====
    console.log('\n📋 步骤4: 跳转到百度首页...');
    const gotoStartTime = Date.now();
    await page.goto('https://www.baidu.com', { waitUntil: 'networkidle0' });
    metrics.pageGoto = Date.now() - gotoStartTime;

    console.log(`✅ 页面跳转成功, 耗时: ${metrics.pageGoto}ms`);

    // 严格断言7: 验证页面跳转耗时
    expect(metrics.pageGoto).toBeGreaterThan(100); // 至少100ms（网络请求）
    expect(metrics.pageGoto).toBeLessThan(30000); // 最多30秒

    // 严格断言8: 验证页面标题
    const title = await page.title();
    expect(title).toBe('百度一下，你就知道');
    console.log(`   页面标题: "${title}"`);

    // 严格断言9: 验证URL
    const url = page.url();
    expect(url).toContain('baidu.com');
    expect(url).toMatch(/^https?:\/\/.+/);
    console.log(`   页面URL: ${url}`);

    // 严格断言10: 验证页面内容
    const content = await page.content();
    expect(content).toContain('<html');
    expect(content).toMatch(/<title>百度一下，你就知道<\/title>/i);
    expect(content.length).toBeGreaterThan(1000); // HTML内容应该足够大
    console.log(`   页面内容长度: ${content.length} 字节`);

    // 严格断言11: 验证JavaScript执行
    const pageTitle = await page.evaluate(() => document.title);
    expect(pageTitle).toBe('百度一下，你就知道');

    const pageUrl = await page.evaluate(() => window.location.href);
    expect(pageUrl).toContain('baidu.com');

    // 严格断言12: 验证User-Agent
    const userAgent = await page.evaluate(() => navigator.userAgent);
    expect(userAgent).toContain('Chrome');
    expect(userAgent).toMatch(/Chrome\/\d+\.\d+\.\d+\.\d+/);
    console.log(`   User-Agent: ${userAgent}`);

    // 严格断言13: 验证窗口尺寸
    const viewport = page.viewport();
    expect(viewport).toBeDefined();
    expect(viewport!.width).toBeGreaterThan(0);
    expect(viewport!.height).toBeGreaterThan(0);
    console.log(`   窗口尺寸: ${viewport!.width}x${viewport!.height}`);

    // ===== 步骤5: 等待一段时间以产生计费 =====
    console.log('\n📋 步骤5: 等待3秒以产生计费...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log('✅ 等待完成');

    // ===== 步骤6: 断开会话并验证计费 =====
    console.log('\n📋 步骤6: 断开会话并结算积分...');
    const disconnectStartTime = Date.now();
    await SessionModel.markConnected(sessionId); // 先标记为已连接
    await SessionModel.markDisconnected(sessionId, 0); // 让系统计算持续时间
    metrics.sessionDisconnect = Date.now() - disconnectStartTime;

    console.log(`✅ 会话断开成功, 耗时: ${metrics.sessionDisconnect}ms`);

    // 严格断言14: 验证会话状态
    const updatedSession = await SessionModel.findById(sessionId);
    expect(updatedSession).toBeDefined();
    expect(updatedSession!.status).toBe(SessionStatus.DISCONNECTED);
    expect(updatedSession!.duration).toBeGreaterThan(0);
    expect(updatedSession!.credits_used).toBe(1); // 3秒 = 1分钟 = 1积分
    expect(metrics.sessionDisconnect).toBeLessThan(5000); // 断开应在5秒内完成

    console.log(`   会话状态: ${updatedSession!.status}`);
    console.log(`   持续时间: ${updatedSession!.duration}秒`);
    console.log(`   消耗积分: ${updatedSession!.credits_used}积分`);

    // 严格断言15: 验证积分扣除
    const finalUser = await UserModel.findById(testUser.id);
    const creditsDeducted = initialCredits - finalUser.credits;
    expect(creditsDeducted).toBe(1); // 3秒应该扣1积分
    expect(finalUser.credits).toBe(99);
    console.log(`   积分变化: ${initialCredits} -> ${finalUser.credits} (扣除${creditsDeducted}积分)`);

    // 严格断言16: 验证积分历史记录
    const creditHistory = await CreditHistoryModel.findByUserId(testUser.id);
    expect(creditHistory.length).toBeGreaterThan(0);
    const latestHistory = creditHistory[0];
    expect(latestHistory.action).toBe('use');
    expect(latestHistory.amount).toBe(1);
    expect(latestHistory.balance_after).toBe(99);
    console.log(`   积分历史记录: ${latestHistory.action} ${latestHistory.amount}积分`);

    // ===== 步骤7: 断开Puppeteer连接 =====
    console.log('\n📋 步骤7: 断开Puppeteer连接...');
    await browser.disconnect();
    console.log('✅ Puppeteer连接已断开');

    // ===== 步骤8: 关闭Chrome浏览器 =====
    console.log('\n📋 步骤8: 关闭Chrome浏览器...');
    const closeStartTime = Date.now();
    const closed = await browserService.closeBrowser(sessionId);
    metrics.chromeClose = Date.now() - closeStartTime;

    console.log(`✅ Chrome浏览器已关闭, 耗时: ${metrics.chromeClose}ms`);

    // 严格断言17: 验证浏览器关闭
    expect(closed).toBe(true);
    expect(metrics.chromeClose).toBeLessThan(10000); // 关闭应在10秒内完成
    expect(browserService.getActiveSessions()).toBe(0);
    expect(browserService.getPort(sessionId)).toBeNull();
    expect(browserService.getPath(sessionId)).toBeNull();

    // ===== 总结 =====
    metrics.totalDuration = Date.now() - totalStartTime;
    console.log('\n📊 性能指标总结:');
    console.log(`   Chrome启动: ${metrics.chromeLaunch}ms`);
    console.log(`   会话创建: ${metrics.sessionCreate}ms`);
    console.log(`   Puppeteer连接: ${metrics.puppeteerConnect}ms`);
    console.log(`   页面跳转: ${metrics.pageGoto}ms`);
    console.log(`   会话断开: ${metrics.sessionDisconnect}ms`);
    console.log(`   Chrome关闭: ${metrics.chromeClose}ms`);
    console.log(`   总耗时: ${metrics.totalDuration}ms`);

    // 严格断言18: 验证总体性能
    expect(metrics.totalDuration).toBeLessThan(120000); // 总流程应在2分钟内完成
  });

  it('REAL-CHROME-002: 应能准确计算不同时长的计费', { timeout: 180000 }, async () => {
    const testCases = [
      { waitSeconds: 2, expectedCredits: 1, description: '2秒 = 1积分' },
      { waitSeconds: 5, expectedCredits: 1, description: '5秒 = 1积分' },
    ];

    for (const tc of testCases) {
      console.log(`\n📋 测试用例: ${tc.description}`);
      const sessionId = `test-charging-${Date.now()}`;
      const initialUser = await UserModel.findById(testUser.id);
      const initialCredits = initialUser.credits;

      // 启动浏览器
      const browserInstance = await browserService.launchBrowser(sessionId, {
        headless: true,
      });
      expect(browserInstance.port).toBeGreaterThan(0);

      // 创建会话
      const session = await SessionModel.create({
        user_id: testUser.id,
        machine_id: 'test-machine',
      });
      expect(session.status).toBe(SessionStatus.CREATED);

      // 等待指定时长
      console.log(`   等待 ${tc.waitSeconds} 秒...`);
      await new Promise(resolve => setTimeout(resolve, tc.waitSeconds * 1000));

      // 断开会话
      await SessionModel.markConnected(sessionId);
      await SessionModel.markDisconnected(sessionId, 0);

      // 验证扣费
      const finalUser = await UserModel.findById(testUser.id);
      const creditsDeducted = initialCredits - finalUser.credits;
      expect(creditsDeducted).toBe(tc.expectedCredits);
      console.log(`   实际扣除: ${creditsDeducted}积分 (期望: ${tc.expectedCredits}积分)`);

      // 关闭浏览器
      await browserService.closeBrowser(sessionId);
      console.log(`✅ 测试用例通过: ${tc.description}`);
    }
  });

  it('REAL-CHROME-003: 应能正确处理页面截图', { timeout: 120000 }, async () => {
    const sessionId = `test-screenshot-${Date.now()}`;

    // 启动浏览器
    const browserInstance = await browserService.launchBrowser(sessionId, {
      headless: true,
    });

    // 连接浏览器
    const browser = await puppeteer.connect({
      browserWSEndpoint: browserInstance.browserWSEndpoint,
    });
    const page = (await browser.pages())[0];

    // 跳转到百度
    await page.goto('https://www.baidu.com', { waitUntil: 'networkidle0' });

    // 截图
    const screenshot = await page.screenshot({ type: 'png' });

    // 严格断言: 验证截图
    expect(screenshot).toBeInstanceOf(Buffer);
    expect(screenshot.length).toBeGreaterThan(10000); // PNG截图应该大于10KB
    expect(screenshot.length).toBeLessThan(1000000); // 但小于1MB
    console.log(`✅ 截图成功, 大小: ${screenshot.length} 字节`);

    // 清理
    await browser.disconnect();
    await browserService.closeBrowser(sessionId);
  });

  it('REAL-CHROME-004: 应能执行JavaScript并获取结果', { timeout: 120000 }, async () => {
    const sessionId = `test-js-execution-${Date.now()}`;

    // 启动浏览器
    const browserInstance = await browserService.launchBrowser(sessionId, {
      headless: true,
    });

    // 连接浏览器
    const browser = await puppeteer.connect({
      browserWSEndpoint: browserInstance.browserWSEndpoint,
    });
    const page = (await browser.pages())[0];

    // 跳转到百度
    await page.goto('https://www.baidu.com', { waitUntil: 'networkidle0' });

    // 执行JavaScript
    const result = await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform,
        cookieEnabled: navigator.cookieEnabled,
        screenWidth: screen.width,
        screenHeight: screen.height,
      };
    });

    // 严格断言: 验证JavaScript执行结果
    expect(result.title).toBe('百度一下，你就知道');
    expect(result.url).toContain('baidu.com');
    expect(result.userAgent).toContain('Chrome');
    expect(result.language).toMatch(/^zh-CN|en-US$/);
    expect(result.platform).toMatch(/^MacIntel|Win32|Linux x86_64$/);
    expect(result.cookieEnabled).toBe(true);
    expect(result.screenWidth).toBeGreaterThan(0);
    expect(result.screenHeight).toBeGreaterThan(0);

    console.log(`✅ JavaScript执行成功, 平台: ${result.platform}, 屏幕: ${result.screenWidth}x${result.screenHeight}`);

    // 清理
    await browser.disconnect();
    await browserService.closeBrowser(sessionId);
  });

  it('REAL-CHROME-005: 应能正确处理页面元素', { timeout: 120000 }, async () => {
    const sessionId = `test-element-${Date.now()}`;

    // 启动浏览器
    const browserInstance = await browserService.launchBrowser(sessionId, {
      headless: true,
    });

    // 连接浏览器
    const browser = await puppeteer.connect({
      browserWSEndpoint: browserInstance.browserWSEndpoint,
    });
    const page = (await browser.pages())[0];

    // 跳转到百度
    await page.goto('https://www.baidu.com', { waitUntil: 'networkidle0' });

    // 查找搜索框
    const searchInput = await page.$('#kw');
    expect(searchInput).toBeDefined();

    // 输入搜索词
    await page.type('#kw', 'Playwright测试');

    // 验证输入值
    const inputValue = await page.$eval('#kw', el => (el as HTMLInputElement).value);
    expect(inputValue).toBe('Playwright测试');

    // 点击搜索按钮
    await page.click('#su');

    // 等待导航
    await page.waitForNavigation({ waitUntil: 'networkidle0' });

    // 验证URL包含搜索参数
    const url = page.url();
    expect(url).toContain('s.baidu.com');
    expect(url).toContain('Playwright测试');

    console.log(`✅ 页面元素操作成功, 搜索URL: ${url}`);

    // 清理
    await browser.disconnect();
    await browserService.closeBrowser(sessionId);
  });
});
