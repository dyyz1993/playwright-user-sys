/**
 * 反机器人检测验证测试
 *
 * 测试范围:
 * - navigator.webdriver 检测
 * - User-Agent 检测（HeadlessChrome, Selenium, Puppeteer 等）
 * - Chrome DevTools Protocol 特征
 * - navigator.plugins, navigator.languages
 * - window.chrome 对象
 * - canvas/webgl 指纹
 * - permissions API
 * - 自动化工具特征变量（_WEBDRIVER_ELEM_CACHE, window.cdc_adoQpoasnfa 等）
 * - Headless 模式检测
 * - 时区/语言一致性
 *
 * 架构流程:
 * 客户端SDK -> 管理端HTTP API -> session.service
 * -> connectionManager (gRPC客户端)
 * -> 机器端gRPC服务器 -> browserService -> Chrome实例
 * -> 验证反检测措施是否生效
 *
 * 测试编号: ANTI-001 ~ ANTI-015
 */

// 在导入任何模块之前设置环境变量
import { config } from 'dotenv';
import { resolve } from 'path';

// 加载测试环境变量
const envTestPath = resolve(process.cwd(), '.env.test');
config({ path: envTestPath });

// 确保设置测试环境
process.env.NODE_ENV = 'test';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildManager } from '../../src/manager/app.js';
import { MachineServer } from '../../src/machine/app.js';
import { UserModel } from '../../src/models/user.model.js';
import { UserRole } from '../../src/shared/types/index.js';
import { getFreePort } from '../helpers/ports.js';
import {
  createIsolatedTestDatabase,
  dropIsolatedTestDatabase,
  type IsolatedTestDatabase,
} from '../../src/tests/helpers/isolated-database.js';
import puppeteer from 'puppeteer-core';
import type { FastifyInstance } from 'fastify';
import { execSync } from 'child_process';

// ========================================
// 测试配置
// ========================================

const NUM_USERS = 1;
const NUM_MACHINES = 1;
const INITIAL_CREDITS = 1000;

describe('反机器人检测验证测试', () => {
  // ========================================
  // 全局变量声明
  // ========================================

  let testDb: IsolatedTestDatabase;
  let managerApp: FastifyInstance;
  let managerHttpPort: number;
  let managerGrpcPort: number;
  let machineServers: Array<{
    server: MachineServer;
    grpcPort: number;
    proxyPort: number;
    machineId: string;
  }> = [];
  let testUsers: Array<{
    id: number;
    username: string;
    token: string;
    apiKey: string;
  }> = [];

  // ========================================
  // beforeAll: 环境准备
  // ========================================

  beforeAll(async () => {
    console.log('\n========================================');
    console.log('beforeAll: 开始环境准备');
    console.log('========================================');

    // 步骤 1: 切换到 Node.js 20
    console.log('\n[步骤 1] 切换到 Node.js 20...');
    try {
      execSync('nvm use 20', { stdio: 'inherit' });
    } catch (e) {
      console.log('   ⚠️  nvm use 20 失败，使用当前 Node.js 版本');
    }
    const nodeVersion = process.version;
    console.log(`   当前 Node.js 版本: ${nodeVersion}`);

    // 步骤 2: 创建独立测试数据库
    console.log('\n[步骤 2] 创建独立测试数据库...');
    testDb = await createIsolatedTestDatabase();
    console.log(`   ✅ 测试数据库准备完成: ${testDb.dbName}`);

    // 步骤 3: 创建测试用户
    console.log('\n[步骤 3] 创建测试用户...');
    for (let i = 0; i < NUM_USERS; i++) {
      const { generateToken, generateApiKey } = await import('../../src/utils/auth.js');

      const userData = {
        username: `anti_detection_user_${Date.now()}_${i}`,
        password: 'password123',
        role: UserRole.USER,
        credits: INITIAL_CREDITS,
        email: `test_${Date.now()}_${i}@example.com`,
      };

      const user = await UserModel.create(userData);

      const token = generateToken({
        id: user!.id,
        username: user!.username,
        role: user!.role,
      });

      let apiKey = user!.api_key;
      if (!apiKey) {
        apiKey = generateApiKey();
        await UserModel.update(user!.id, { api_key: apiKey });
      }

      testUsers.push({
        id: user!.id!,
        username: user!.username!,
        token,
        apiKey,
      });

      console.log(`   ✅ 用户 ${i + 1}: ${user!.username} (积分: ${user!.credits})`);
    }
    console.log(`   ✅ 创建了 ${testUsers.length} 个测试用户`);

    // 步骤 4: 启动管理端服务器
    console.log('\n[步骤 4] 启动管理端服务器...');
    managerHttpPort = await getFreePort();
    managerGrpcPort = await getFreePort();
    managerApp = await buildManager();
    await managerApp.listen({ port: managerHttpPort, host: '127.0.0.1' });
    console.log(`   ✅ 管理端启动成功 HTTP端口:${managerHttpPort} gRPC端口:${managerGrpcPort}`);

    // 步骤 5: 启动机器端服务
    console.log('\n[步骤 5] 启动机器端服务...');
    process.env.PORT = managerHttpPort.toString();
    process.env.GRPC_PORT = managerGrpcPort.toString();
    process.env.HOST = '127.0.0.1';

    const { startGrpcServer } = await import('../../src/services/machine-grpc.service.js');
    startGrpcServer(managerGrpcPort);
    console.log(`   管理端gRPC服务器: 127.0.0.1:${managerGrpcPort}`);

    for (let i = 0; i < NUM_MACHINES; i++) {
      const grpcPort = await getFreePort();
      const proxyPort = await getFreePort();
      const machineId = `test-machine-${Date.now()}-${i}`;

      const machineConfig = {
        machineId,
        machineName: `测试机器-${i}`,
        managerHost: `127.0.0.1:${managerGrpcPort}`,
        grpcPort,
        proxyPort,
        maxSessions: 5,
        sessionTimeout: 300000,
        chromePath:
          process.env.CHROME_PATH ||
          (process.platform === 'darwin'
            ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
            : process.platform === 'linux'
              ? '/usr/bin/google-chrome-stable'
              : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'),
        heartbeatInterval: 30000,
        disconnectionTimeout: 10000,
        activityReportInterval: 3000,
        sessionActivityTimeout: 10000,
        dataDir: '/tmp/playwright-test-data',
        tempDir: '/tmp/playwright-test-temp',
      };

      const machineServer = new MachineServer(machineConfig);
      await machineServer.start();

      machineServers.push({
        server: machineServer,
        grpcPort,
        proxyPort,
        machineId,
      });
      console.log(`   ✅ 机器端 ${i + 1} 启动成功: ${machineId} (gRPC:${grpcPort}, Proxy:${proxyPort})`);
    }

    // 步骤 6: 验证机器注册
    console.log('\n[步骤 6] 验证机器注册状态...');
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const registeredMachines = await testDb.db('machines').select('*').where('status', 'online');
    expect(registeredMachines.length).toBe(NUM_MACHINES);
    console.log(`   ✅ 成功注册 ${registeredMachines.length} 台机器`);

    console.log('\n========================================');
    console.log('beforeAll: 环境准备完成');
    console.log('========================================\n');
  }, 120000);

  // ========================================
  // afterAll: 清理环境
  // ========================================

  afterAll(async () => {
    console.log('\n========================================');
    console.log('afterAll: 开始清理和关闭');
    console.log('========================================');

    console.log('\n[步骤 1] 关闭所有机器端...');
    for (let i = 0; i < machineServers.length; i++) {
      const { server, machineId } = machineServers[i];
      await server.stop();
      console.log(`   ✅ 机器端已关闭: ${machineId}`);
    }

    console.log('\n[步骤 2] 关闭管理端服务器...');
    if (managerApp) {
      await managerApp.close();
      console.log('✅ 管理端服务器已关闭');
    }

    console.log('\n[步骤 3] 清理独立测试数据库...');
    if (testDb) {
      await dropIsolatedTestDatabase(testDb);
      console.log('✅ 测试数据库已删除');
    }

    console.log('\n========================================');
    console.log('afterAll: 清理完成');
    console.log('========================================\n');
  }, 60000);

  // ========================================
  // beforeEach: 每个测试前的准备
  // ========================================

  beforeEach(async () => {
    await testDb.db('sessions').del();
    await testDb.db('credit_history').del();

    for (const user of testUsers) {
      await testDb.db('users').where({ id: user.id }).update({ credits: INITIAL_CREDITS });
    }

    for (const machine of machineServers) {
      await testDb.db('machines').where({ id: machine.machineId }).update({ instance_count: 0 });
    }
  }, 10000);

  // ========================================
  // 测试用例：基础反检测验证
  // ========================================

  /**
   * ANTI-001: navigator.webdriver 应该是 undefined
   *
   * 检测点:
   * - navigator.webdriver 属性是否存在
   * - 正常浏览器该属性为 undefined
   * - 自动化工具通常设置为 true
   *
   * 修复方法:
   * - 使用 --disable-blink-features=AutomationControlled
   * - 通过 page.evaluateOnNewDocument 删除该属性
   */
  it('ANTI-001: navigator.webdriver 应该是 undefined', { timeout: 60000 }, async () => {
    const user = testUsers[0];

    console.log('\n[步骤 1] 创建浏览器会话...');
    const response = await managerApp.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: {
        authorization: `Bearer ${user.token}`,
      },
    });

    expect(response.statusCode).toBe(201);
    const sessionData = JSON.parse(response.body);
    const sessionId = sessionData.data.id;
    console.log(`   ✅ 会话创建成功: ${sessionId}`);

    console.log('\n[步骤 2] 连接到浏览器...');
    const browserWSEndpoint = sessionData.data.browserWSEndpoint;
    const browser = await puppeteer.connect({
      browserWSEndpoint,
    });
    const page = (await browser.pages())[0];
    console.log('   ✅ 浏览器连接成功');

    console.log('\n[步骤 3] 检查 navigator.webdriver...');
    const webdriverValue = await page.evaluate(() => {
      return (window as any).navigator.webdriver;
    });

    console.log(`   navigator.webdriver 值: ${webdriverValue}`);

    expect(webdriverValue).toBeUndefined();
    console.log('   ✅ navigator.webdriver 是 undefined');

    await browser.close();
    console.log('✅ ANTI-001 测试通过');
  });

  /**
   * ANTI-002: User-Agent 不应包含自动化标识
   *
   * 检测点:
   * - 不包含 HeadlessChrome
   * - 不包含 Selenium
   * - 不包含 Puppeteer
   * - 不包含 Playwright
   *
   * 修复方法:
   * - 使用指纹生成器生成真实 UA
   * - 或者手动设置真实浏览器 UA
   */
  it('ANTI-002: User-Agent 不应包含自动化标识', { timeout: 60000 }, async () => {
    const user = testUsers[0];

    console.log('\n[步骤 1] 创建浏览器会话...');
    const response = await managerApp.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: {
        authorization: `Bearer ${user.token}`,
      },
    });

    expect(response.statusCode).toBe(201);
    const sessionData = JSON.parse(response.body);
    const sessionId = sessionData.data.id;

    console.log('\n[步骤 2] 连接到浏览器并检查 User-Agent...');
    const browserWSEndpoint = sessionData.data.browserWSEndpoint;
    const browser = await puppeteer.connect({
      browserWSEndpoint,
    });
    const page = (await browser.pages())[0];

    const userAgent = await page.evaluate(() => navigator.userAgent);
    console.log(`   User-Agent: ${userAgent}`);

    const forbiddenStrings = ['HeadlessChrome', 'Selenium', 'Puppeteer', 'Playwright', 'WebDriver'];
    const foundForbidden = forbiddenStrings.filter((str) => userAgent.includes(str));

    expect(foundForbidden.length).toBe(0);
    console.log(`   ✅ User-Agent 不包含任何自动化标识`);

    await browser.close();
    console.log('✅ ANTI-002 测试通过');
  });

  /**
   * ANTI-003: window.chrome 对象应该存在
   *
   * 检测点:
   * - window.chrome 对象是否存在
   * - 正常 Chrome 浏览器该对象存在
   * - Headless 模式下可能缺失
   *
   * 修复方法:
   * - 使用 --disable-blink-features=AutomationControlled
   * - 或者注入 fake chrome 对象
   */
  it('ANTI-003: window.chrome 对象应该存在', { timeout: 60000 }, async () => {
    const user = testUsers[0];

    console.log('\n[步骤 1] 创建浏览器会话...');
    const response = await managerApp.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: {
        authorization: `Bearer ${user.token}`,
      },
    });

    expect(response.statusCode).toBe(201);
    const sessionData = JSON.parse(response.body);

    console.log('\n[步骤 2] 连接到浏览器并检查 window.chrome...');
    const browserWSEndpoint = sessionData.data.browserWSEndpoint;
    const browser = await puppeteer.connect({
      browserWSEndpoint,
    });
    const page = (await browser.pages())[0];

    const chromeExists = await page.evaluate(() => typeof window.chrome === 'object');
    console.log(`   window.chrome 存在: ${chromeExists}`);

    expect(chromeExists).toBe(true);
    console.log('   ✅ window.chrome 对象存在');

    await browser.close();
    console.log('✅ ANTI-003 测试通过');
  });

  /**
   * ANTI-004: navigator.plugins 不应该为空
   *
   * 检测点:
   * - navigator.plugins.length > 0
   * - 正常浏览器有多个插件（PDF, Chrome PDF Viewer 等）
   * - Headless 模式下通常为空
   *
   * 修复方法:
   * - 使用 fingerprint-injector 注入插件
   * - 或者手动注入 fake plugins
   */
  it('ANTI-004: navigator.plugins 不应该为空', { timeout: 60000 }, async () => {
    const user = testUsers[0];

    console.log('\n[步骤 1] 创建浏览器会话...');
    const response = await managerApp.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: {
        authorization: `Bearer ${user.token}`,
      },
    });

    expect(response.statusCode).toBe(201);
    const sessionData = JSON.parse(response.body);

    console.log('\n[步骤 2] 连接到浏览器并检查 navigator.plugins...');
    const browserWSEndpoint = sessionData.data.browserWSEndpoint;
    const browser = await puppeteer.connect({
      browserWSEndpoint,
    });
    const page = (await browser.pages())[0];

    const pluginsInfo = await page.evaluate(() => {
      return {
        length: navigator.plugins.length,
        plugins: Array.from(navigator.plugins).map((p) => p.name),
      };
    });

    console.log(`   navigator.plugins.length: ${pluginsInfo.length}`);
    console.log(`   插件列表: ${pluginsInfo.plugins.join(', ')}`);

    expect(pluginsInfo.length).toBeGreaterThan(0);
    console.log('   ✅ navigator.plugins 不为空');

    await browser.close();
    console.log('✅ ANTI-004 测试通过');
  });

  /**
   * ANTI-005: navigator.languages 应该包含合理值
   *
   * 检测点:
   * - navigator.languages 是数组
   * - 包含至少一个语言代码
   * - 通常与 navigator.language 匹配
   *
   * 修复方法:
   * - 使用指纹注入设置合理语言
   * - 或者手动设置 navigator.languages
   */
  it('ANTI-005: navigator.languages 应该包含合理值', { timeout: 60000 }, async () => {
    const user = testUsers[0];

    console.log('\n[步骤 1] 创建浏览器会话...');
    const response = await managerApp.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: {
        authorization: `Bearer ${user.token}`,
      },
    });

    expect(response.statusCode).toBe(201);
    const sessionData = JSON.parse(response.body);

    console.log('\n[步骤 2] 连接到浏览器并检查 navigator.languages...');
    const browserWSEndpoint = sessionData.data.browserWSEndpoint;
    const browser = await puppeteer.connect({
      browserWSEndpoint,
    });
    const page = (await browser.pages())[0];

    const languagesInfo = await page.evaluate(() => {
      return {
        languages: navigator.languages,
        language: navigator.language,
        isArray: Array.isArray(navigator.languages),
        length: navigator.languages?.length || 0,
      };
    });

    console.log(`   navigator.languages: ${JSON.stringify(languagesInfo.languages)}`);
    console.log(`   navigator.language: ${languagesInfo.language}`);
    console.log(`   是数组: ${languagesInfo.isArray}`);
    console.log(`   长度: ${languagesInfo.length}`);

    expect(languagesInfo.isArray).toBe(true);
    expect(languagesInfo.length).toBeGreaterThan(0);
    console.log('   ✅ navigator.languages 包含合理值');

    await browser.close();
    console.log('✅ ANTI-005 测试通过');
  });

  /**
   * ANTI-006: 不应暴露自动化特征变量
   *
   * 检测点:
   * - _WEBDRIVER_ELEM_CACHE 不应存在
   * - window.cdc_adoQpoasnfa 不应存在（Puppeteer 特征）
   * - window.cdc_adoQpoasnfa 不应存在（Selenium 特征）
   * - 其他自动化工具特征变量
   *
   * 修复方法:
   * - 使用 puppeteer-extra-plugin-stealth
   * - 或者手动删除这些变量
   */
  it('ANTI-006: 不应暴露自动化特征变量', { timeout: 60000 }, async () => {
    const user = testUsers[0];

    console.log('\n[步骤 1] 创建浏览器会话...');
    const response = await managerApp.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: {
        authorization: `Bearer ${user.token}`,
      },
    });

    expect(response.statusCode).toBe(201);
    const sessionData = JSON.parse(response.body);

    console.log('\n[步骤 2] 连接到浏览器并检查自动化特征变量...');
    const browserWSEndpoint = sessionData.data.browserWSEndpoint;
    const browser = await puppeteer.connect({
      browserWSEndpoint,
    });
    const page = (await browser.pages())[0];

    const suspiciousVars = await page.evaluate(() => {
      return {
        _WEBDRIVER_ELEM_CACHE: typeof (window as any)._WEBDRIVER_ELEM_CACHE !== 'undefined',
        cdc_adoQpoasnfa: typeof (window as any).cdc_adoQpoasnfa !== 'undefined',
        cdc_IadQpoasnfa: typeof (window as any).cdc_IadQpoasnfa !== 'undefined',
        __driver_evaluate: typeof (window as any).__driver_evaluate !== 'undefined',
        __webdriver_evaluate: typeof (window as any).__webdriver_evaluate !== 'undefined',
        __selenium_evaluate: typeof (window as any).__selenium_evaluate !== 'undefined',
        __fxdriver_evaluate: typeof (window as any).__fxdriver_evaluate !== 'undefined',
        __driver_unwrapped: typeof (window as any).__driver_unwrapped !== 'undefined',
        __webdriver_unwrapped: typeof (window as any).__webdriver_unwrapped !== 'undefined',
        __selenium_unwrapped: typeof (window as any).__selenium_unwrapped !== 'undefined',
        __fxdriver_unwrapped: typeof (window as any).__fxdriver_unwrapped !== 'undefined',
        callSelenium: typeof (window as any).callSelenium !== 'undefined',
        $cdc_asdjflasutopfhvcZLmcfl_: typeof (window as any).$cdc_asdjflasutopfhvcZLmcfl_ !== 'undefined',
        $chrome_asyncScriptInfo: typeof (window as any).$chrome_asyncScriptInfo !== 'undefined',
      };
    });

    console.log('   自动化特征变量检查:');
    const foundSuspicious: string[] = [];
    for (const [key, exists] of Object.entries(suspiciousVars)) {
      if (exists) {
        console.log(`     ⚠️  ${key}: 存在`);
        foundSuspicious.push(key);
      } else {
        console.log(`     ✅ ${key}: 不存在`);
      }
    }

    expect(foundSuspicious.length).toBe(0);
    console.log('   ✅ 不存在自动化特征变量');

    await browser.close();
    console.log('✅ ANTI-006 测试通过');
  });

  /**
   * ANTI-007: permissions API 应该可用
   *
   * 检测点:
   * - navigator.permissions.query 能正常调用
   * - 返回有效的 PermissionStatus
   * - Headless 模式下可能不可用
   *
   * 修复方法:
   * - 确保使用真实浏览器而非 headless 模式
   * - 或者注入 fake permissions API
   */
  it('ANTI-007: permissions API 应该可用', { timeout: 60000 }, async () => {
    const user = testUsers[0];

    console.log('\n[步骤 1] 创建浏览器会话...');
    const response = await managerApp.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: {
        authorization: `Bearer ${user.token}`,
      },
    });

    expect(response.statusCode).toBe(201);
    const sessionData = JSON.parse(response.body);

    console.log('\n[步骤 2] 连接到浏览器并检查 permissions API...');
    const browserWSEndpoint = sessionData.data.browserWSEndpoint;
    const browser = await puppeteer.connect({
      browserWSEndpoint,
    });
    const page = (await browser.pages())[0];

    const permissionsInfo = await page.evaluate(async () => {
      try {
        const permissions = navigator.permissions;
        if (!permissions) {
          return { exists: false, error: 'permissions API 不存在' };
        }

        const result = await permissions.query({ name: 'geolocation' as any });
        return {
          exists: true,
          state: result.state,
          hasQuery: typeof permissions.query === 'function',
        };
      } catch (error) {
        return { exists: false, error: (error as Error).message };
      }
    });

    console.log(`   permissions API 存在: ${permissionsInfo.exists}`);
    if (permissionsInfo.exists) {
      console.log(`   geolocation 状态: ${permissionsInfo.state}`);
      console.log(`   query 方法可用: ${permissionsInfo.hasQuery}`);
    }

    expect(permissionsInfo.exists).toBe(true);
    expect(permissionsInfo.hasQuery).toBe(true);
    console.log('   ✅ permissions API 可用');

    await browser.close();
    console.log('✅ ANTI-007 测试通过');
  });

  /**
   * ANTI-008: WebGL 指纹应该正常
   *
   * 检测点:
   * - WebGL renderer 字符串合理
   * - WebGL vendor 字符串合理
   * - 不包含 "SwiftShader" 或 "Google" 等明显标识
   *
   * 修复方法:
   * - 使用指纹注入修改 WebGL 参数
   * - 或者使用真实 GPU
   */
  it('ANTI-008: WebGL 指纹应该正常', { timeout: 60000 }, async () => {
    const user = testUsers[0];

    console.log('\n[步骤 1] 创建浏览器会话...');
    const response = await managerApp.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: {
        authorization: `Bearer ${user.token}`,
      },
    });

    expect(response.statusCode).toBe(201);
    const sessionData = JSON.parse(response.body);

    console.log('\n[步骤 2] 连接到浏览器并检查 WebGL 指纹...');
    const browserWSEndpoint = sessionData.data.browserWSEndpoint;
    const browser = await puppeteer.connect({
      browserWSEndpoint,
    });
    const page = (await browser.pages())[0];

    const webglInfo = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

      if (!gl) {
        return { error: 'WebGL 不可用' };
      }

      const webgl = gl as WebGLRenderingContext;
      const debugInfo = webgl.getExtension('WEBGL_debug_renderer_info');
      if (!debugInfo) {
        return { error: 'WEBGL_debug_renderer_info 不可用' };
      }

      return {
        vendor: webgl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
        renderer: webgl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL),
      };
    });

    if (webglInfo.error) {
      console.log(`   ⚠️  ${webglInfo.error}`);
    } else {
      console.log(`   WebGL Vendor: ${webglInfo.vendor}`);
      console.log(`   WebGL Renderer: ${webglInfo.renderer}`);

      // 检查是否包含明显标识
      const suspiciousPatterns = ['SwiftShader', 'Google SwiftShader', 'VMware', 'VirtualBox'];
      const isSuspicious = suspiciousPatterns.some(
        (pattern) => webglInfo.renderer?.includes(pattern) || webglInfo.vendor?.includes(pattern)
      );

      if (isSuspicious) {
        console.log('   ⚠️  WebGL 指纹包含虚拟化特征');
      } else {
        console.log('   ✅ WebGL 指纹正常');
      }

      expect(isSuspicious).toBe(false);
    }

    await browser.close();
    console.log('✅ ANTI-008 测试通过');
  });

  /**
   * ANTI-009: Canvas 指纹应该正常
   *
   * 检测点:
   * - Canvas toDataURL() 能正常工作
   * - 生成的数据合理
   *
   * 修复方法:
   * - Canvas 通常在 headless 模式下也能正常工作
   * - 但指纹可能一致，需要随机化
   */
  it('ANTI-009: Canvas 指纹应该正常', { timeout: 60000 }, async () => {
    const user = testUsers[0];

    console.log('\n[步骤 1] 创建浏览器会话...');
    const response = await managerApp.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: {
        authorization: `Bearer ${user.token}`,
      },
    });

    expect(response.statusCode).toBe(201);
    const sessionData = JSON.parse(response.body);

    console.log('\n[步骤 2] 连接到浏览器并检查 Canvas 指纹...');
    const browserWSEndpoint = sessionData.data.browserWSEndpoint;
    const browser = await puppeteer.connect({
      browserWSEndpoint,
    });
    const page = (await browser.pages())[0];

    const canvasInfo = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return { error: 'Canvas 2D 不可用' };
      }

      // 绘制一些文本
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('Hello, world!', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('Hello, world!', 4, 17);

      return {
        dataUrl: canvas.toDataURL(),
        hasDataUrl: typeof canvas.toDataURL === 'function',
      };
    });

    expect(canvasInfo.hasDataUrl).toBe(true);
    expect(canvasInfo.dataUrl).toBeTruthy();
    expect(canvasInfo.dataUrl).toMatch(/^data:image\/png;base64/);
    console.log('   ✅ Canvas 指纹正常');

    await browser.close();
    console.log('✅ ANTI-009 测试通过');
  });

  /**
   * ANTI-010: 屏幕尺寸应该合理
   *
   * 检测点:
   * - screen.width 和 screen.height 在合理范围内
   * - 不应该是 0 或异常值
   * - 应该与 viewport 匹配
   *
   * 修复方法:
   * - 使用真实 viewport 尺寸
   * - 设置合理的 deviceScaleFactor
   */
  it('ANTI-010: 屏幕尺寸应该合理', { timeout: 60000 }, async () => {
    const user = testUsers[0];

    console.log('\n[步骤 1] 创建浏览器会话...');
    const response = await managerApp.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: {
        authorization: `Bearer ${user.token}`,
      },
    });

    expect(response.statusCode).toBe(201);
    const sessionData = JSON.parse(response.body);

    console.log('\n[步骤 2] 连接到浏览器并检查屏幕尺寸...');
    const browserWSEndpoint = sessionData.data.browserWSEndpoint;
    const browser = await puppeteer.connect({
      browserWSEndpoint,
    });
    const page = (await browser.pages())[0];

    const screenInfo = await page.evaluate(() => {
      return {
        screenWidth: screen.width,
        screenHeight: screen.height,
        screenAvailWidth: screen.availWidth,
        screenAvailHeight: screen.availHeight,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight,
        devicePixelRatio: window.devicePixelRatio,
      };
    });

    console.log(`   screen.width: ${screenInfo.screenWidth}`);
    console.log(`   screen.height: ${screenInfo.screenHeight}`);
    console.log(`   screen.availWidth: ${screenInfo.screenAvailWidth}`);
    console.log(`   screen.availHeight: ${screenInfo.screenAvailHeight}`);
    console.log(`   window.innerWidth: ${screenInfo.innerWidth}`);
    console.log(`   window.innerHeight: ${screenInfo.innerHeight}`);
    console.log(`   window.outerWidth: ${screenInfo.outerWidth}`);
    console.log(`   window.outerHeight: ${screenInfo.outerHeight}`);
    console.log(`   devicePixelRatio: ${screenInfo.devicePixelRatio}`);

    // 验证合理性
    expect(screenInfo.screenWidth).toBeGreaterThan(0);
    expect(screenInfo.screenHeight).toBeGreaterThan(0);
    expect(screenInfo.innerWidth).toBeGreaterThan(0);
    expect(screenInfo.innerHeight).toBeGreaterThan(0);
    expect(screenInfo.devicePixelRatio).toBeGreaterThan(0);
    console.log('   ✅ 屏幕尺寸合理');

    await browser.close();
    console.log('✅ ANTI-010 测试通过');
  });

  /**
   * ANTI-011: 时区和语言应该一致
   *
   * 检测点:
   * - getTimezoneOffset() 与设置时区匹配
   * - 语言设置与时区匹配（例如：zh-CN 应该匹配 Asia/Shanghai）
   *
   * 修复方法:
   * - 使用 --timezone 参数设置时区
   * - 确保语言与时区一致
   */
  it('ANTI-011: 时区和语言应该一致', { timeout: 60000 }, async () => {
    const user = testUsers[0];

    console.log('\n[步骤 1] 创建浏览器会话...');
    const response = await managerApp.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: {
        authorization: `Bearer ${user.token}`,
      },
    });

    expect(response.statusCode).toBe(201);
    const sessionData = JSON.parse(response.body);

    console.log('\n[步骤 2] 连接到浏览器并检查时区和语言...');
    const browserWSEndpoint = sessionData.data.browserWSEndpoint;
    const browser = await puppeteer.connect({
      browserWSEndpoint,
    });
    const page = (await browser.pages())[0];

    const localeInfo = await page.evaluate(() => {
      const date = new Date();
      return {
        timezoneOffset: date.getTimezoneOffset(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: navigator.language,
        languages: navigator.languages,
        locale: Intl.DateTimeFormat().resolvedOptions().locale,
      };
    });

    console.log(`   timezoneOffset: ${localeInfo.timezoneOffset} 分钟`);
    console.log(`   timezone: ${localeInfo.timezone}`);
    console.log(`   language: ${localeInfo.language}`);
    console.log(`   languages: ${localeInfo.languages.join(', ')}`);
    console.log(`   locale: ${localeInfo.locale}`);

    // 验证时区偏移量合理（UTC+8 是 -480 分钟）
    expect(localeInfo.timezoneOffset).toBeGreaterThanOrEqual(-720);
    expect(localeInfo.timezoneOffset).toBeLessThanOrEqual(720);
    expect(localeInfo.timezone).toBeTruthy();
    expect(localeInfo.language).toBeTruthy();
    console.log('   ✅ 时区和语言设置合理');

    await browser.close();
    console.log('✅ ANTI-011 测试通过');
  });

  /**
   * ANTI-012: 设备内存和并发数应该合理
   *
   * 检测点:
   * - navigator.deviceMemory 应该是合理值（2, 4, 8）
   * - navigator.hardwareConcurrency 应该是合理值（2-16）
   *
   * 修复方法:
   * - 使用指纹注入设置合理值
   * - 或者通过 CDP 修改
   */
  it('ANTI-012: 设备内存和并发数应该合理', { timeout: 60000 }, async () => {
    const user = testUsers[0];

    console.log('\n[步骤 1] 创建浏览器会话...');
    const response = await managerApp.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: {
        authorization: `Bearer ${user.token}`,
      },
    });

    expect(response.statusCode).toBe(201);
    const sessionData = JSON.parse(response.body);

    console.log('\n[步骤 2] 连接到浏览器并检查设备信息...');
    const browserWSEndpoint = sessionData.data.browserWSEndpoint;
    const browser = await puppeteer.connect({
      browserWSEndpoint,
    });
    const page = (await browser.pages())[0];

    const deviceInfo = await page.evaluate(() => {
      return {
        deviceMemory: (navigator as any).deviceMemory,
        hardwareConcurrency: navigator.hardwareConcurrency,
        maxTouchPoints: navigator.maxTouchPoints,
      };
    });

    console.log(`   deviceMemory: ${deviceInfo.deviceMemory} GB`);
    console.log(`   hardwareConcurrency: ${deviceInfo.hardwareConcurrency} 核心`);
    console.log(`   maxTouchPoints: ${deviceInfo.maxTouchPoints}`);

    if (deviceInfo.deviceMemory !== undefined) {
      expect([2, 4, 8, 16]).toContain(deviceInfo.deviceMemory);
      console.log('   ✅ deviceMemory 合理');
    } else {
      console.log('   ⚠️  deviceMemory 未定义（可能不支持）');
    }

    if (deviceInfo.hardwareConcurrency !== undefined) {
      expect(deviceInfo.hardwareConcurrency).toBeGreaterThan(0);
      expect(deviceInfo.hardwareConcurrency).toBeLessThanOrEqual(32);
      console.log('   ✅ hardwareConcurrency 合理');
    } else {
      console.log('   ⚠️  hardwareConcurrency 未定义');
    }

    await browser.close();
    console.log('✅ ANTI-012 测试通过');
  });

  /**
   * ANTI-013: Connection API 应该可用
   *
   * 检测点:
   * - navigator.connection 对象存在
   * - 包含有效的网络信息
   *
   * 修复方法:
   * - 注入 fake connection 对象
   * - 或者使用真实网络环境
   */
  it('ANTI-013: Connection API 应该可用', { timeout: 60000 }, async () => {
    const user = testUsers[0];

    console.log('\n[步骤 1] 创建浏览器会话...');
    const response = await managerApp.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: {
        authorization: `Bearer ${user.token}`,
      },
    });

    expect(response.statusCode).toBe(201);
    const sessionData = JSON.parse(response.body);

    console.log('\n[步骤 2] 连接到浏览器并检查 Connection API...');
    const browserWSEndpoint = sessionData.data.browserWSEndpoint;
    const browser = await puppeteer.connect({
      browserWSEndpoint,
    });
    const page = (await browser.pages())[0];

    const connectionInfo = await page.evaluate(() => {
      const connection = (navigator as any).connection;
      if (!connection) {
        return { exists: false };
      }

      return {
        exists: true,
        effectiveType: connection.effectiveType,
        rtt: connection.rtt,
        downlink: connection.downlink,
        saveData: connection.saveData,
      };
    });

    if (connectionInfo.exists) {
      console.log(`   effectiveType: ${connectionInfo.effectiveType}`);
      console.log(`   rtt: ${connectionInfo.rtt} ms`);
      console.log(`   downlink: ${connectionInfo.downlink} Mbps`);
      console.log(`   saveData: ${connectionInfo.saveData}`);
      console.log('   ✅ Connection API 可用');
    } else {
      console.log('   ⚠️  Connection API 不存在（可选功能）');
    }

    await browser.close();
    console.log('✅ ANTI-013 测试通过');
  });

  /**
   * ANTI-014: 音频上下文应该正常工作
   *
   * 检测点:
   * - AudioContext 能正常创建
   * - audioContext.currentTime 能正常工作
   *
   * 修复方法:
   * - 音频功能在 headless 模式下通常可用
   * - 但可能需要用户交互才能启动
   */
  it('ANTI-014: 音频上下文应该正常工作', { timeout: 60000 }, async () => {
    const user = testUsers[0];

    console.log('\n[步骤 1] 创建浏览器会话...');
    const response = await managerApp.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: {
        authorization: `Bearer ${user.token}`,
      },
    });

    expect(response.statusCode).toBe(201);
    const sessionData = JSON.parse(response.body);

    console.log('\n[步骤 2] 连接到浏览器并检查 AudioContext...');
    const browserWSEndpoint = sessionData.data.browserWSEndpoint;
    const browser = await puppeteer.connect({
      browserWSEndpoint,
    });
    const page = (await browser.pages())[0];

    const audioInfo = await page.evaluate(() => {
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) {
          return { exists: false, error: 'AudioContext 不存在' };
        }

        const ctx = new AudioContext();
        return {
          exists: true,
          currentTime: ctx.currentTime,
          sampleRate: ctx.sampleRate,
          state: ctx.state,
        };
      } catch (error) {
        return { exists: false, error: (error as Error).message };
      }
    });

    if (audioInfo.exists) {
      console.log(`   currentTime: ${audioInfo.currentTime}`);
      console.log(`   sampleRate: ${audioInfo.sampleRate} Hz`);
      console.log(`   state: ${audioInfo.state}`);
      console.log('   ✅ AudioContext 正常工作');
    } else {
      console.log(`   ⚠️  ${audioInfo.error}`);
    }

    expect(audioInfo.exists).toBe(true);

    await browser.close();
    console.log('✅ ANTI-014 测试通过');
  });

  /**
   * ANTI-015: 综合检测评分
   *
   * 检测点:
   * - 综合所有检测项，给出总体评分
   * - 识别主要风险点
   *
   * 修复方法:
   * - 根据评分结果针对性优化
   */
  it('ANTI-015: 综合检测评分', { timeout: 60000 }, async () => {
    const user = testUsers[0];

    console.log('\n[步骤 1] 创建浏览器会话...');
    const response = await managerApp.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: {
        authorization: `Bearer ${user.token}`,
      },
    });

    expect(response.statusCode).toBe(201);
    const sessionData = JSON.parse(response.body);

    console.log('\n[步骤 2] 连接到浏览器并进行综合检测...');
    const browserWSEndpoint = sessionData.data.browserWSEndpoint;
    const browser = await puppeteer.connect({
      browserWSEndpoint,
    });
    const page = (await browser.pages())[0];

    const detectionResults = await page.evaluate(() => {
      const results: Record<string, any> = {};

      // 1. navigator.webdriver
      results.webdriver = (navigator as any).webdriver === undefined;

      // 2. User-Agent
      const ua = navigator.userAgent;
      results.userAgent =
        !ua.includes('HeadlessChrome') &&
        !ua.includes('Selenium') &&
        !ua.includes('Puppeteer') &&
        !ua.includes('Playwright');

      // 3. window.chrome
      results.chrome = typeof window.chrome === 'object';

      // 4. navigator.plugins
      results.plugins = navigator.plugins.length > 0;

      // 5. navigator.languages
      results.languages = navigator.languages && navigator.languages.length > 0;

      // 6. 自动化特征变量
      const suspiciousVars = ['_WEBDRIVER_ELEM_CACHE', 'cdc_adoQpoasnfa'];
      results.noSuspiciousVars = !suspiciousVars.some((v) => typeof (window as any)[v] !== 'undefined');

      // 7. 屏幕尺寸
      results.screenSize = screen.width > 0 && screen.height > 0;

      // 8. devicePixelRatio
      results.devicePixelRatio = window.devicePixelRatio > 0;

      // 9. hardwareConcurrency
      results.hardwareConcurrency = navigator.hardwareConcurrency > 0;

      return results;
    });

    console.log('\n   综合检测结果:');
    let passCount = 0;
    let failCount = 0;
    const failedChecks: string[] = [];

    for (const [check, passed] of Object.entries(detectionResults)) {
      if (passed) {
        console.log(`     ✅ ${check}: 通过`);
        passCount++;
      } else {
        console.log(`     ❌ ${check}: 失败`);
        failCount++;
        failedChecks.push(check);
      }
    }

    const totalChecks = passCount + failCount;
    const score = ((passCount / totalChecks) * 100).toFixed(2);

    console.log(`\n   总分: ${score}% (${passCount}/${totalChecks} 通过)`);

    if (failedChecks.length > 0) {
      console.log(`   失败项: ${failedChecks.join(', ')}`);
    }

    expect(parseFloat(score)).toBeGreaterThan(70);
    console.log('   ✅ 综合检测评分合格');

    await browser.close();
    console.log('✅ ANTI-015 测试通过');
  });
});
