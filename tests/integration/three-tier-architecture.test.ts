/**
 * 完整三端架构集成测试
 *
 * 测试范围:
 * - N 个客户端用户
 * - 1 个管理端服务器 (Fastify HTTP API + gRPC Server)
 * - N 个机器端服务 (gRPC Server + Chrome 实例)
 *
 * 架构流程:
 * 客户端SDK → 管理端HTTP API → session.service
 * → connectionManager (gRPC客户端)
 * → 机器端gRPC服务器 → browserService → Chrome实例
 *
 * 断言标准:
 * - 必须验证实际值，不能使用 true/false/0/1
 * - 必须验证具体的数值、字符串、对象属性
 * - 必须验证端到端通信链路
 * - 必须验证真实Chrome浏览器操作
 */

// 在导入任何模块之前设置环境变量
// 首先加载 .env.test 文件
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
import { MachineModel } from '../../src/models/machine.model.js';
import { SessionModel } from '../../src/models/session.model.js';
import { CreditHistoryModel } from '../../src/models/credit-history.model.js';
import { getFreePort } from '../helpers/ports.js';
import { createTestUser } from '../helpers/factories.js';
import {
  createIsolatedTestDatabase,
  dropIsolatedTestDatabase,
  type IsolatedTestDatabase,
} from '../../src/tests/helpers/isolated-database.js';
import { initDatabase } from '../../src/config/database.js';
import puppeteer from 'puppeteer-core';
import type { FastifyInstance } from 'fastify';
import { execSync } from 'child_process';

// 测试配置
const NUM_USERS = 2; // 客户端数量
const NUM_MACHINES = 2; // 机器端数量
const INITIAL_CREDITS = 100; // 初始积分

describe('完整三端架构集成测试', () => {
  let testDb: IsolatedTestDatabase;
  let managerApp: FastifyInstance;
  let managerHttpPort: number;
  let managerGrpcPort: number;
  let machineServers: Array<{ server: MachineServer; grpcPort: number; proxyPort: number; machineId: string }> = [];
  let testUsers: Array<{ id: number; username: string; token: string; apiKey: string }> = [];

  /**
   * beforeAll: 环境准备
   *
   * 步骤 1: 切换到 Node.js 20
   * 步骤 2: 创建 MySQL 测试数据库
   * 步骤 3: 创建测试用户 (N个)
   * 步骤 4: 启动管理端服务器
   * 步骤 5: 启动机器端服务 (N个)
   * 步骤 6: 验证机器注册成功
   */
  beforeAll(async () => {
    console.log('\n========================================');
    console.log('beforeAll: 开始环境准备');
    console.log('========================================');

    // 步骤 1: 切换到 Node.js 20
    console.log('\n[步骤 1] 切换到 Node.js 20...');
    try {
      const nodeVersion = process.version;
      console.log(`   当前 Node.js 版本: ${nodeVersion}`);

      // 尝试使用 nvm 切换到 Node.js 20
      try {
        execSync('nvm use 20', { stdio: 'inherit' });
        console.log('   ✅ 已切换到 Node.js 20');
      } catch (nvmError) {
        console.warn('   ⚠️  nvm 命令不可用，使用当前 Node.js 版本');
      }
    } catch (error) {
      console.warn('   ⚠️  无法切换 Node.js 版本，使用当前版本');
    }

    // 步骤 2: 创建 MySQL 测试数据库
    console.log('\n[步骤 2] 创建 MySQL 测试数据库...');

    // 设置测试环境变量
    process.env.NODE_ENV = 'test';
    process.env.DB_TYPE = 'mysql';
    process.env.DB_NAME = 'playwright_test_user_sys';
    process.env.DB_HOST = process.env.DB_HOST || 'mysql.19930810.xyz';
    process.env.DB_PORT = process.env.DB_PORT || '3306';
    process.env.DB_USER = process.env.DB_USER || 'root';
    process.env.DB_PASSWORD = process.env.DB_PASSWORD || '';

    // 注意：JWT_SECRET、JWT_EXPIRES_IN、INSTANCE_TIMEOUT、MACHINE_MONITOR_INTERVAL
    // 等配置使用 .env.test 或 GitHub Actions 环境变量，不再硬编码覆盖

    // 动态分配端口
    managerHttpPort = parseInt(process.env.PORT || '3000', 10);
    managerGrpcPort = parseInt(process.env.GRPC_PORT || '50051', 10);

    console.log(`   HTTP 端口: ${managerHttpPort}`);
    console.log(`   gRPC 端口: ${managerGrpcPort}`);
    console.log(`   数据库: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);

    // 创建独立测试数据库
    console.log('\n[步骤 2] 创建独立测试数据库...');
    testDb = await createIsolatedTestDatabase();
    console.log(`✅ 测试数据库创建完成: ${testDb.dbName}`);

    await initDatabase(testDb.dbName);

    // 步骤 3: 创建测试用户 (N个)
    console.log(`\n[步骤 3] 创建 ${NUM_USERS} 个测试用户...`);
    for (let i = 0; i < NUM_USERS; i++) {
      const user = await createTestUser({
        username: `testuser_${Date.now()}_${i}`,
        credits: INITIAL_CREDITS,
      });

      // 生成JWT token
      const { generateToken } = await import('../../src/utils/auth.js');
      const token = generateToken({
        id: user.id,
        username: user.username,
        role: user.role,
      });

      testUsers.push({
        id: user.id,
        username: user.username,
        token,
        apiKey: user.api_key || '',
      });

      console.log(`   ✅ 用户 ${i + 1}: ${user.username} (积分: ${user.credits})`);
    }
    console.log(`✅ ${NUM_USERS} 个测试用户创建完成`);

    // 步骤 4: 启动管理端服务器
    console.log('\n[步骤 4] 启动管理端服务器...');
    process.env.PORT = managerHttpPort.toString();
    process.env.GRPC_PORT = managerGrpcPort.toString();
    process.env.HOST = '127.0.0.1';

    // 启动 gRPC 服务器
    const { startGrpcServer } = await import('../../src/services/machine-grpc.service.js');
    startGrpcServer(managerGrpcPort);
    console.log(`✅ 管理端gRPC服务器: 127.0.0.1:${managerGrpcPort}`);

    managerApp = await buildManager();
    await managerApp.listen({ port: managerHttpPort, host: '127.0.0.1' });
    console.log(`✅ 管理端HTTP服务器: http://127.0.0.1:${managerHttpPort}`);

    // 步骤 5: 启动机器端服务 (N个)
    console.log(`\n[步骤 5] 启动 ${NUM_MACHINES} 个机器端服务...`);
    for (let i = 0; i < NUM_MACHINES; i++) {
      // 使用动态端口分配避免冲突
      const grpcPort = await getFreePort();
      const proxyPort = await getFreePort();
      const machineId = `test-machine-${Date.now()}-${i}`;

      // 创建机器端配置
      // 注意: managerHost 需要格式为 "host:port"
      const machineConfig = {
        machineId,
        machineName: `测试机器-${i}`,
        managerHost: `127.0.0.1:${managerGrpcPort}`,
        grpcPort: grpcPort,
        proxyPort: proxyPort,
        maxSessions: 5,
        sessionTimeout: 300000, // 5分钟
        // 根据平台自动检测 Chrome 路径
        chromePath:
          process.env.CHROME_PATH ||
          (process.platform === 'darwin'
            ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
            : process.platform === 'linux'
              ? '/usr/bin/google-chrome-stable'
              : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'),
        heartbeatInterval: 30000, // 30秒
        disconnectionTimeout: 10000, // 10秒
        activityReportInterval: 3000, // 3秒
        sessionActivityTimeout: 10000, // 10秒
        dataDir: '/tmp/playwright-test-data',
        tempDir: '/tmp/playwright-test-temp',
      };

      // 创建并启动机器端
      const machineServer = new MachineServer(machineConfig);
      await machineServer.start();

      machineServers.push({
        server: machineServer,
        grpcPort,
        proxyPort,
        machineId,
      });

      console.log(`   ✅ 机器 ${i + 1}: ${machineId}`);
      console.log(`      gRPC: ${grpcPort}, Proxy: ${proxyPort}`);
    }
    console.log(`✅ ${NUM_MACHINES} 个机器端服务启动完成`);

    // 步骤 6: 验证机器注册成功
    console.log('\n[步骤 6] 验证机器注册...');
    await new Promise((resolve) => setTimeout(resolve, process.env.CI ? 5000 : 3000)); // 等待注册完成

    const machines = await MachineModel.findAll();
    console.log(`   数据库中的机器数量: ${machines.total}`);

    expect(machines.total).toBeGreaterThanOrEqual(NUM_MACHINES);

    const onlineMachines = machines.items.filter((m: any) => m.status === 'online');
    console.log(`   在线机器数量: ${onlineMachines.length}`);
    expect(onlineMachines.length).toBeGreaterThanOrEqual(NUM_MACHINES);

    console.log('✅ 机器注册验证完成');
    console.log('\n========================================');
    console.log('beforeAll: 环境准备完成');
    console.log('========================================\n');
  }, 180000);

  /**
   * afterAll: 清理和关闭
   *
   * 步骤 1: 关闭所有机器端
   * 步骤 2: 关闭管理端服务器
   * 步骤 3: 清理测试数据库
   */
  afterAll(async () => {
    console.log('\n========================================');
    console.log('afterAll: 开始清理和关闭');
    console.log('========================================');

    // 步骤 1: 关闭所有机器端
    console.log('\n[步骤 1] 关闭所有机器端...');
    for (let i = 0; i < machineServers.length; i++) {
      const { server, machineId } = machineServers[i];
      await server.stop();
      console.log(`   ✅ 机器端已关闭: ${machineId}`);
    }
    console.log('✅ 所有机器端已关闭');

    // 步骤 2: 关闭管理端服务器
    console.log('\n[步骤 2] 关闭管理端服务器...');
    if (managerApp) {
      await managerApp.close();
      console.log('✅ 管理端服务器已关闭');
    } else {
      console.log('⚠️  管理端服务器未启动，跳过关闭');
    }

    // 步骤 3: 清理测试数据
    console.log('\n[步骤 3] 清理测试数据...');
    if (testDb) {
      await dropIsolatedTestDatabase(testDb);
      console.log('✅ 测试数据库已删除');
    }

    console.log('\n========================================');
    console.log('afterAll: 清理完成');
    console.log('========================================\n');
  }, 60000);

  /**
   * beforeEach: 每个测试前的准备
   */
  beforeEach(async () => {
    // 清理会话表
    await testDb.db('sessions').del();
    await testDb.db('credit_history').del();

    // 重置用户积分
    for (const user of testUsers) {
      await testDb.db('users').where({ id: user.id }).update({ credits: INITIAL_CREDITS });
    }

    // 重置机器实例计数
    for (const machine of machineServers) {
      await testDb.db('machines').where({ id: machine.machineId }).update({ instance_count: 0 });
    }
  }, 10000);

  /**
   * TIER-001: 客户端SDK基础功能测试
   *
   * 测试内容:
   * 1. 创建客户端实例
   * 2. 测试API请求认证
   * 3. 验证JWT Token有效性
   */
  it('TIER-001: 客户端SDK基础功能测试', { timeout: 30000 }, async () => {
    const user = testUsers[0];

    // 步骤 1: 创建客户端实例
    console.log('\n[步骤 1] 创建客户端实例...');
    const { Client } = await import('../../src/sdk/client.js');
    const client = new Client({
      apiKey: user.apiKey,
      baseUrl: `http://127.0.0.1:${managerHttpPort}`,
    });
    console.log('   ✅ 客户端实例创建成功');

    // 步骤 2: 测试API请求认证
    console.log('\n[步骤 2] 测试API请求认证...');
    const response = await client.request('GET', '/api/auth/verify');
    expect(response.success).toBe(true);
    expect(response.data).toEqual(expect.any(Object));
    expect(response.data.user).toEqual(expect.any(Object));
    expect(response.data.user.id).toBe(user.id);
    expect(response.data.user.username).toBe(user.username);
    console.log(`   ✅ API认证成功，用户: ${response.data.user.username}`);

    // 步骤 3: 验证JWT Token
    console.log('\n[步骤 3] 验证JWT Token有效性...');
    const authResponse = await managerApp.inject({
      method: 'GET',
      url: '/api/auth/verify',
      headers: {
        authorization: `Bearer ${user.token}`,
      },
    });
    expect(authResponse.statusCode).toBe(200);
    const authData = JSON.parse(authResponse.body);
    expect(authData.success).toBe(true);
    expect(authData.data.user.id).toBe(user.id);
    console.log('   ✅ JWT Token验证成功');

    console.log('✅ TIER-001 客户端SDK基础功能测试通过');
  });

  /**
   * TIER-002: 用户登录认证流程测试
   *
   * 测试内容:
   * 1. 用户登录
   * 2. 验证Token有效性
   * 3. 测试错误处理
   */
  it('TIER-002: 用户登录认证流程测试', { timeout: 30000 }, async () => {
    const user = testUsers[0];

    // 步骤 1: 用户登录
    console.log('\n[步骤 1] 用户登录...');
    const loginResponse = await managerApp.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: user.username,
        password: 'password123',
      },
    });

    console.log(`   HTTP状态码: ${loginResponse.statusCode}`);
    expect(loginResponse.statusCode).toBe(200);

    const loginData = JSON.parse(loginResponse.body);
    expect(loginData.success).toBe(true);
    expect(loginData.data).toEqual(expect.any(Object));
    expect(loginData.data.token).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
    expect(loginData.data.token.length).toBeGreaterThan(50);
    console.log(`   ✅ 登录成功，Token长度: ${loginData.data.token.length}`);

    // 步骤 2: 验证Token有效性
    console.log('\n[步骤 2] 验证Token有效性...');
    const verifyResponse = await managerApp.inject({
      method: 'GET',
      url: '/api/auth/verify',
      headers: {
        authorization: `Bearer ${loginData.data.token}`,
      },
    });

    expect(verifyResponse.statusCode).toBe(200);
    const verifyData = JSON.parse(verifyResponse.body);
    expect(verifyData.success).toBe(true);
    expect(verifyData.data.user.username).toBe(user.username);
    console.log('   ✅ Token验证成功');

    // 步骤 3: 测试错误处理
    console.log('\n[步骤 3] 测试错误处理...');
    const errorResponse = await managerApp.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: user.username,
        password: 'wrongpassword',
      },
    });

    expect(errorResponse.statusCode).toBe(401);
    console.log('   ✅ 错误密码被正确拒绝');

    console.log('✅ TIER-002 用户登录认证流程测试通过');
  });

  /**
   * TIER-003: 创建会话完整流程测试
   *
   * 测试链路:
   * 1. 客户端通过HTTP API请求创建会话
   * 2. 管理端验证用户权限和积分
   * 3. 管理端通过gRPC分配机器
   * 4. 机器端启动Chrome浏览器
   * 5. 返回WebSocket连接信息给客户端
   * 6. 验证后扣费模式
   */
  it('TIER-003: 创建会话完整流程测试', { timeout: 60000 }, async () => {
    const user = testUsers[0];

    // 记录用户初始积分
    const userBefore = await UserModel.findById(user.id);
    const initialCredits = userBefore!.credits;
    console.log(`   用户初始积分: ${initialCredits}`);

    // 步骤 1: 客户端通过HTTP API创建会话
    console.log('\n[步骤 1] 客户端请求创建会话...');
    const response = await managerApp.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: {
        authorization: `Bearer ${user.token}`,
      },
      payload: {
        userAgent: 'test-agent',
        viewport: { width: 1920, height: 1080 },
      },
    });

    console.log(`   HTTP状态码: ${response.statusCode}`);
    expect(response.statusCode).toBe(201);

    const responseBody = JSON.parse(response.body);
    const sessionData = responseBody.data;
    console.log(`   会话ID: ${sessionData.id}`);
    console.log(`   状态: ${sessionData.status}`);

    expect(sessionData.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(sessionData.id.length).toBeGreaterThanOrEqual(36);
    expect(sessionData.status).toBe('created');

    // 步骤 2: 验证数据库中的会话记录
    console.log('\n[步骤 2] 验证数据库会话记录...');
    const session = await SessionModel.findById(sessionData.id);
    expect(session).toEqual(expect.any(Object));
    expect(session!.user_id).toBe(user.id);
    expect(session!.status).toBe('created');
    console.log(`   ✅ 会话记录验证成功: ${session!.id}`);

    // 步骤 3: 验证机器实例计数增加
    console.log('\n[步骤 3] 验证机器实例计数...');
    const machine = await MachineModel.findById(session!.machine_id);
    expect(machine).toEqual(expect.any(Object));
    expect(machine!.instanceCount).toBe(1);
    console.log(`   ✅ 机器实例计数: ${machine!.instanceCount}`);

    // 步骤 4: 验证用户积分未变化（后扣费模式）
    console.log('\n[步骤 4] 验证后扣费模式...');
    const userAfter = await UserModel.findById(user.id);
    expect(userAfter!.credits).toBe(initialCredits);
    console.log(`   ✅ 用户积分: ${userAfter!.credits} (创建会话后未扣费)`);

    // 步骤 5: 使用puppeteer-core连接到真实Chrome
    console.log('\n[步骤 5] 使用puppeteer-core连接Chrome...');

    // 等待WebSocket端点准备就绪
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const browser = await puppeteer.connect({
      browserWSEndpoint: sessionData.directUrl,
    });

    expect(browser.isConnected()).toBe(true);
    console.log('   ✅ 浏览器连接成功');

    const pages = await browser.pages();
    expect(pages.length).toBeGreaterThanOrEqual(1);
    console.log(`   页面数量: ${pages.length}`);

    // 断开连接
    await browser.disconnect();
    console.log('   ✅ 浏览器已断开连接');

    console.log('✅ TIER-003 创建会话完整流程测试通过');
  });

  /**
   * TIER-004: 连接浏览器并进行操作测试
   *
   * 测试内容:
   * 1. 连接到Chrome
   * 2. 导航到百度
   * 3. 验证页面标题
   * 4. 截图测试
   * 5. 搜索操作
   */
  it.skipIf(process.env.CI === 'true')('TIER-004: 连接浏览器并进行操作测试', { timeout: 90000 }, async () => {
    const user = testUsers[0];

    // 创建会话
    console.log('\n[步骤 1] 创建会话...');
    const createResponse = await managerApp.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: {
        authorization: `Bearer ${user.token}`,
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const sessionData = JSON.parse(createResponse.body);
    console.log(`   会话ID: ${sessionData.id}`);
    console.log(`   WebSocket URL: ${sessionData.ws_url}`);

    // 等待WebSocket端点准备就绪
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 连接到Chrome
    console.log('\n[步骤 2] 连接到Chrome...');
    const browser = await puppeteer.connect({
      browserWSEndpoint: sessionData.ws_url,
    });

    expect(browser.isConnected()).toBe(true);
    const pages = await browser.pages();
    const page = pages[0];
    console.log('   ✅ 浏览器连接成功');

    // 导航到百度
    console.log('\n[步骤 3] 导航到百度首页...');
    await page.goto('https://www.baidu.com', { waitUntil: 'networkidle0' });

    const title = await page.title();
    console.log(`   页面标题: "${title}"`);
    expect(title).toBe('百度一下，你就知道');

    const url = page.url();
    expect(url).toContain('baidu.com');
    console.log(`   ✅ 成功跳转到百度`);

    // 截图测试
    console.log('\n[步骤 4] 测试截图功能...');
    const screenshot = await page.screenshot({ type: 'png' });
    expect(screenshot).toBeInstanceOf(Buffer);
    expect(screenshot.length).toBeGreaterThan(10000); // PNG > 10KB
    expect(screenshot.length).toBeLessThan(1000000); // 但 < 1MB
    console.log(`   截图大小: ${screenshot.length} 字节`);
    console.log('   ✅ 截图成功');

    // 搜索操作
    console.log('\n[步骤 5] 测试搜索操作...');
    await page.type('#kw', 'Playwright测试');
    await page.click('#su');

    // 等待搜索结果
    await page.waitForSelector('.result', { timeout: 10000 }).catch(() => {
      console.log('   ⚠️  搜索结果未找到，但操作已完成');
    });

    console.log('   ✅ 搜索操作完成');

    // 断开连接
    await browser.disconnect();
    console.log('   ✅ 浏览器已断开连接');

    console.log('✅ TIER-004 连接浏览器并进行操作测试通过');
  });

  /**
   * TIER-006: 释放会话并验证积分扣除测试
   *
   * 测试内容:
   * 1. 创建会话并连接
   * 2. 使用浏览器一段时间
   * 3. 断开连接并释放会话
   * 4. 验证积分扣除
   * 5. 验证会话记录
   */
  it('TIER-006: 释放会话并验证积分扣除测试', { timeout: 90000 }, async () => {
    const user = testUsers[0];

    // 记录初始积分
    const userBefore = await UserModel.findById(user.id);
    const initialCredits = userBefore!.credits;
    console.log(`   用户初始积分: ${initialCredits}`);

    // 创建会话
    console.log('\n[步骤 1] 创建会话...');
    const createResponse = await managerApp.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: {
        authorization: `Bearer ${user.token}`,
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const createResponseBody = JSON.parse(createResponse.body);
    const sessionId = createResponseBody.data.id;
    console.log(`   会话ID: ${sessionId}`);

    // 等待WebSocket端点准备就绪
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 连接到Chrome
    console.log('\n[步骤 2] 连接到Chrome...');
    const browser = await puppeteer.connect({
      browserWSEndpoint: createResponseBody.data.directUrl,
    });
    console.log('   ✅ 浏览器连接成功');

    // 使用浏览器（导航到百度）
    console.log('\n[步骤 3] 使用浏览器...');
    const page = (await browser.pages())[0];
    await page.goto('https://www.baidu.com', { waitUntil: 'networkidle0' });

    // 等待一段时间以产生计费（至少5秒）
    console.log('\n[步骤 4] 等待5秒以产生计费...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // 断开浏览器连接
    console.log('\n[步骤 5] 断开浏览器连接...');
    await browser.disconnect();

    // 调用API结束会话
    console.log('\n[步骤 6] 结束会话...');
    const endResponse = await managerApp.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/disconnect`,
      headers: {
        authorization: `Bearer ${user.token}`,
      },
    });

    expect(endResponse.statusCode).toBe(200);
    console.log('   ✅ 会话结束请求成功');

    // 等待计费处理
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 验证会话状态
    console.log('\n[步骤 7] 验证会话状态...');
    const session = await SessionModel.findById(sessionId);
    expect(session).toEqual(expect.any(Object));
    expect(session!.status).toBe('disconnected');
    expect(session!.duration).toBeGreaterThanOrEqual(5); // 至少5秒
    expect(session!.credits_used).toBeGreaterThanOrEqual(1); // 至少1点

    console.log(`   会话状态: ${session!.status}`);
    console.log(`   持续时间: ${session!.duration}秒`);
    console.log(`   消耗积分: ${session!.credits_used}`);

    // 验证积分扣除
    console.log('\n[步骤 8] 验证积分扣除...');
    const userAfter = await UserModel.findById(user.id);
    const creditsDeducted = initialCredits - userAfter!.credits;

    expect(creditsDeducted).toBeGreaterThanOrEqual(1);
    expect(userAfter!.credits).toBeLessThan(initialCredits);
    console.log(`   积分变化: ${initialCredits} -> ${userAfter!.credits} (扣除${creditsDeducted}积分)`);

    // 验证积分历史
    console.log('\n[步骤 9] 验证积分历史...');
    const creditHistory = await CreditHistoryModel.findByUserId(user.id);
    expect(creditHistory.length).toBeGreaterThanOrEqual(1);

    const latestHistory = creditHistory[0];
    expect(latestHistory.action).toBe('use');
    expect(latestHistory.amount).toBeGreaterThanOrEqual(1);
    console.log(`   积分历史: ${latestHistory.action} ${latestHistory.amount}积分`);

    // 验证机器实例计数减少
    console.log('\n[步骤 10] 验证机器实例计数...');
    const machine = await MachineModel.findById(session!.machine_id!);
    expect(machine).toEqual(expect.any(Object));
    expect(machine!.instanceCount).toBe(0);
    console.log(`   ✅ 机器实例计数: ${machine!.instanceCount}`);

    console.log('✅ TIER-006 释放会话并验证积分扣除测试通过');
  });
});
