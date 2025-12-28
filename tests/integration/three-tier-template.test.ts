/**
 * 三端架构集成测试模板
 *
 * 测试范围:
 * - [填写测试范围，例如: 客户端SDK基础功能、会话创建流程、计费系统]
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
import { db, initDatabase } from '../../src/config/database.js';
import { runMigrations } from '../../src/models/migrations.js';
import { getFreePort } from '../helpers/ports.js';
import { createTestUser } from '../helpers/factories.js';
import puppeteer from 'puppeteer-core';
import type { FastifyInstance } from 'fastify';
import { execSync } from 'child_process';

// ========================================
// 测试配置
// ========================================

const NUM_USERS = 2; // 客户端数量
const NUM_MACHINES = 2; // 机器端数量
const INITIAL_CREDITS = 100; // 初始积分

describe('三端架构集成测试模板', () => {
  // ========================================
  // 全局变量声明
  // ========================================

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
    process.env.DB_HOST = process.env.DB_HOST || 'REDACTED_INTERNAL_HOST';
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

    // 创建测试数据库（如果不存在）
    const knex = await import('knex');
    const adminDb = knex.default({
      client: 'mysql2',
      connection: {
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
      },
    });

    try {
      await adminDb.raw(`DROP DATABASE IF EXISTS ${process.env.DB_NAME}`);
      await adminDb.raw(`CREATE DATABASE ${process.env.DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      console.log('✅ 测试数据库创建完成');
    } catch (error: any) {
      console.error('❌ 创建数据库失败:', error.message);
      throw error;
    } finally {
      await adminDb.destroy();
    }

    // 现在数据库已创建，初始化应用数据库连接
    await initDatabase();

    // 运行数据库迁移
    await runMigrations();
    console.log('✅ 数据库迁移完成');

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
      const machineConfig = {
        machineId,
        machineName: `测试机器-${i}`,
        managerHost: `127.0.0.1:${managerGrpcPort}`,
        grpcPort: grpcPort,
        proxyPort: proxyPort,
        maxSessions: 5,
        sessionTimeout: 300000, // 5分钟
        // 根据平台自动检测 Chrome 路径
        chromePath: process.env.CHROME_PATH || (
          process.platform === 'darwin'
            ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
            : process.platform === 'linux'
              ? '/usr/bin/google-chrome-stable'
              : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        ),
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
    await new Promise(resolve => setTimeout(resolve, 3000)); // 等待注册完成

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

  // ========================================
  // afterAll: 清理和关闭
  // ========================================

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
    try {
      const knex = await import('knex');
      const adminDb = knex.default({
        client: 'mysql2',
        connection: {
          host: process.env.DB_HOST,
          port: parseInt(process.env.DB_PORT || '3306'),
          user: process.env.DB_USER,
          password: process.env.DB_PASSWORD,
        },
      });

      await adminDb.raw(`DROP DATABASE IF EXISTS ${process.env.DB_NAME}`);
      await adminDb.destroy();
      console.log('✅ 测试数据库已删除');
    } catch (error) {
      console.warn('⚠️  清理数据库失败:', error);
    }

    console.log('\n========================================');
    console.log('afterAll: 清理完成');
    console.log('========================================\n');
  }, 60000);

  // ========================================
  // beforeEach: 每个测试前的准备
  // ========================================

  /**
   * beforeEach: 每个测试前的准备
   */
  beforeEach(async () => {
    // 清理会话表
    await db('sessions').del();
    await db('credit_history').del();

    // 重置用户积分
    for (const user of testUsers) {
      await db('users').where({ id: user.id }).update({ credits: INITIAL_CREDITS });
    }

    // 重置机器实例计数
    for (const machine of machineServers) {
      await db('machines').where({ id: machine.machineId }).update({ instance_count: 0 });
    }
  }, 10000);

  // ========================================
  // 测试用例示例
  // ========================================

  /**
   * TIER-XXX: 测试用例示例 - 客户端SDK基础功能测试
   *
   * 测试内容:
   * 1. 创建客户端实例
   * 2. 测试API请求认证
   * 3. 验证JWT Token有效性
   */
  it('TIER-XXX: 客户端SDK基础功能测试示例', { timeout: 30000 }, async () => {
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
    expect(response.data).toBeDefined();
    expect(response.data.user).toBeDefined();
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

    console.log('✅ TIER-XXX 客户端SDK基础功能测试通过');
  });

  /**
   * TIER-XXX: 测试用例示例 - 创建会话完整流程测试
   *
   * 测试链路:
   * 1. 客户端通过HTTP API请求创建会话
   * 2. 管理端验证用户权限和积分
   * 3. 管理端通过gRPC分配机器
   * 4. 机器端启动Chrome浏览器
   * 5. 返回WebSocket连接信息给客户端
   * 6. 验证后扣费模式
   */
  it('TIER-XXX: 创建会话完整流程测试示例', { timeout: 60000 }, async () => {
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
    console.log(`   会话ID: ${responseBody.id}`);
    console.log(`   机器ID: ${responseBody.machine_id}`);
    console.log(`   状态: ${responseBody.status}`);

    // 严格断言: 验证HTTP响应
    expect(responseBody.id).toBeDefined();
    expect(responseBody.id.length).toBeGreaterThan(10);
    expect(responseBody.machine_id).toBeDefined();
    expect(responseBody.machine_id.length).toBeGreaterThan(5);
    expect(responseBody.status).toBe('created');

    // 步骤 2: 验证数据库中的会话记录
    console.log('\n[步骤 2] 验证数据库会话记录...');
    const session = await SessionModel.findById(responseBody.id);
    expect(session).toBeDefined();
    expect(session!.user_id).toBe(user.id);
    expect(session!.machine_id).toBe(responseBody.machine_id);
    expect(session!.status).toBe('created');
    console.log(`   ✅ 会话记录验证成功: ${session!.id}`);

    // 步骤 3: 验证机器实例计数增加
    console.log('\n[步骤 3] 验证机器实例计数...');
    const machine = await MachineModel.findById(responseBody.machine_id);
    expect(machine).toBeDefined();
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
    await new Promise(resolve => setTimeout(resolve, 2000));

    const browser = await puppeteer.connect({
      browserWSEndpoint: responseBody.ws_url,
    });

    expect(browser.isConnected()).toBe(true);
    console.log('   ✅ 浏览器连接成功');

    const pages = await browser.pages();
    expect(pages.length).toBeGreaterThan(0);
    console.log(`   页面数量: ${pages.length}`);

    // 断开连接
    await browser.disconnect();
    console.log('   ✅ 浏览器已断开连接');

    console.log('✅ TIER-XXX 创建会话完整流程测试通过');
  });

  /**
   * TIER-XXX: 测试用例示例 - 浏览器操作测试
   *
   * 测试内容:
   * 1. 连接到Chrome
   * 2. 导航到百度
   * 3. 验证页面标题
   * 4. 截图测试
   * 5. 搜索操作
   */
  it('TIER-XXX: 连接浏览器并进行操作测试示例', { timeout: 90000 }, async () => {
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
    await new Promise(resolve => setTimeout(resolve, 2000));

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

    // 断开连接
    await browser.disconnect();
    console.log('   ✅ 浏览器已断开连接');

    console.log('✅ TIER-XXX 连接浏览器并进行操作测试通过');
  });

  // ========================================
  // 添加更多测试用例...
  // ========================================

  // it('TIER-XXX: 你的测试用例名称', { timeout: 60000 }, async () => {
  //   // 测试代码...
  // });

  // ========================================
  // 测试套件结束
  // ========================================
});
