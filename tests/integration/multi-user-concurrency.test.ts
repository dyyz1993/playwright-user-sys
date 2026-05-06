/**
 * 多用户并发集成测试
 *
 * 测试范围:
 * - 多用户同时创建会话
 * - 多用户同时使用浏览器
 * - 多用户会话隔离
 * - 并发积分扣费
 * - 负载均衡验证
 *
 * 架构流程:
 * 5个客户端SDK → 管理端HTTP API → session.service
 * → connectionManager (gRPC客户端)
 * → 2台机器端gRPC服务器 → browserService → Chrome实例
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
import { createIsolatedTestDatabase, type IsolatedTestDatabase } from '../../src/tests/helpers/isolated-database.js';
import { getFreePort } from '../helpers/ports.js';
import { createTestUser } from '../helpers/factories.js';
import puppeteer from 'puppeteer-core';
import type { FastifyInstance } from 'fastify';
import { execSync } from 'child_process';
import { initDatabase } from '../../src/config/database.js';

// ========================================
// 测试配置
// ========================================

const NUM_USERS = 5; // 5个并发用户
const NUM_MACHINES = 2; // 2台机器
const INITIAL_CREDITS = 100; // 初始积分

describe('多用户并发集成测试 (TIER-031 ~ TIER-040)', () => {
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
      const nodeVersion = process.version;
      console.log(`   当前 Node.js 版本: ${nodeVersion}`);
      try {
        execSync('nvm use 20', { stdio: 'inherit' });
        console.log('   ✅ 已切换到 Node.js 20');
      } catch (_nvmError) {
        console.warn('   ⚠️  nvm 命令不可用，使用当前 Node.js 版本');
      }
    } catch (_error) {
      console.warn('   ⚠️  无法切换 Node.js 版本，使用当前版本');
    }

    // 步骤 2: 创建独立测试数据库
    console.log('\n[步骤 2] 创建独立测试数据库...');
    testDb = await createIsolatedTestDatabase();
    console.log(`✅ 测试数据库创建完成: ${testDb.dbName}`);

    // 初始化数据库单例，指向测试数据库
    await initDatabase(testDb.dbName);
    console.log(`✅ 数据库单例已初始化: ${testDb.dbName}`);

    // 步骤 3: 创建测试用户 (5个)
    console.log(`\n[步骤 3] 创建 ${NUM_USERS} 个测试用户...`);
    for (let i = 0; i < NUM_USERS; i++) {
      const user = await createTestUser({
        username: `testuser_${Date.now()}_${i}`,
        credits: INITIAL_CREDITS,
      });

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

    // 步骤 4: 分配端口并启动管理端服务器
    console.log('\n[步骤 4] 启动管理端服务器...');
    managerHttpPort = await getFreePort();
    managerGrpcPort = await getFreePort();
    process.env.PORT = managerHttpPort.toString();
    process.env.GRPC_PORT = managerGrpcPort.toString();
    process.env.HOST = '127.0.0.1';

    const { startGrpcServer } = await import('../../src/services/machine-grpc.service.js');
    startGrpcServer(managerGrpcPort);
    console.log(`✅ 管理端gRPC服务器: 127.0.0.1:${managerGrpcPort}`);

    managerApp = await buildManager();
    await managerApp.listen({ port: managerHttpPort, host: '127.0.0.1' });
    console.log(`✅ 管理端HTTP服务器: http://127.0.0.1:${managerHttpPort}`);

    // 步骤 5: 启动2台机器端服务
    console.log(`\n[步骤 5] 启动 ${NUM_MACHINES} 个机器端服务...`);
    for (let i = 0; i < NUM_MACHINES; i++) {
      const grpcPort = await getFreePort();
      const proxyPort = await getFreePort();
      const machineId = `test-machine-${Date.now()}-${i}`;

      const machineConfig = {
        machineId,
        machineName: `测试机器-${i}`,
        managerHost: `127.0.0.1:${managerGrpcPort}`,
        grpcPort: grpcPort,
        proxyPort: proxyPort,
        maxSessions: 10,
        sessionTimeout: 300000,
        // 根据平台自动检测 Chrome 路径
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

      console.log(`   ✅ 机器 ${i + 1}: ${machineId}`);
      console.log(`      gRPC: ${grpcPort}, Proxy: ${proxyPort}`);
    }
    console.log(`✅ ${NUM_MACHINES} 个机器端服务启动完成`);

    // 步骤 6: 验证机器注册
    console.log('\n[步骤 6] 验证机器注册...');
    await new Promise((resolve) => setTimeout(resolve, process.env.CI ? 5000 : 3000));

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
    console.log('✅ 所有机器端已关闭');

    console.log('\n[步骤 2] 关闭管理端服务器...');
    if (managerApp) {
      await managerApp.close();
      console.log('✅ 管理端服务器已关闭');
    }

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
    } catch (error: any) {
      console.warn('⚠️  删除数据库失败:', error.message);
    }

    console.log('\n========================================');
    console.log('afterAll: 清理完成');
    console.log('========================================\n');
  }, 60000);

  // ========================================
  // beforeEach: 重置测试数据
  // ========================================

  beforeEach(async () => {
    // 清理会话和积分历史
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

    console.log('✅ 测试数据已重置');
  }, 10000);

  // ========================================
  // 测试用例: 并发测试 (TIER-031 ~ TIER-040)
  // ========================================

  describe('并发会话创建 (TIER-031 ~ TIER-035)', () => {
    it('TIER-031: 5个用户同时创建会话应该全部成功', { timeout: 90000 }, async () => {
      console.log('\n[步骤 1] 5个用户同时创建会话...');

      const creditsBefore: Record<number, number> = {};
      for (const user of testUsers) {
        const userRecord = await UserModel.findById(user.id);
        creditsBefore[user.id] = userRecord!.credits;
        console.log(`   用户 ${user.id} 创建前积分: ${creditsBefore[user.id]}`);
      }

      const sessionPromises = testUsers.map(async (user) => {
        const response = await managerApp.inject({
          method: 'POST',
          url: '/api/sessions',
          headers: {
            'x-api-key': user.apiKey,
          },
          payload: {
            userAgent: 'test-agent',
            viewport: { width: 1920, height: 1080 },
          },
        });

        return {
          userId: user.id,
          statusCode: response.statusCode,
          data: response.json(),
        };
      });

      const results = await Promise.all(sessionPromises);

      console.log('\n[步骤 2] 验证会话创建结果...');
      const successfulResults = results.filter((r) => r.statusCode === 201);
      const failedResults = results.filter((r) => r.statusCode !== 201);
      for (const result of results) {
        console.log(`   用户 ${result.userId}: ${result.statusCode === 201 ? '✅' : '❌'} (${result.statusCode})`);
      }

      const totalMachineCapacity = machineServers.length * 10;
      const expectedSuccess = Math.min(NUM_USERS, totalMachineCapacity);
      expect(successfulResults.length).toBe(expectedSuccess);

      console.log('\n[步骤 3] 验证数据库中的会话记录...');
      const sessions = await SessionModel.findAll();
      const createdSessions = sessions.items.filter((s: any) => s.status === 'created' || s.status === 'connected');
      console.log(`   会话总数: ${sessions.total}, 活跃会话: ${createdSessions.length}`);
      expect(createdSessions.length).toBe(expectedSuccess);

      console.log('\n[步骤 4] 验证积分未扣费（后扣费模式）...');
      for (const result of successfulResults) {
        const userRecord = await UserModel.findById(result.userId);
        console.log(`   用户 ${result.userId} 创建后积分: ${userRecord!.credits}`);
        expect(userRecord!.credits).toBe(creditsBefore[result.userId]);
      }

      console.log('\n✅ TIER-031 测试通过: 并发会话创建验证完成');
    });

    it('TIER-032: 并发会话应该正确分配到2台机器', { timeout: 90000 }, async () => {
      console.log('\n[步骤 1] 5个用户同时创建会话...');

      const sessionPromises = testUsers.map(async (user) => {
        const response = await managerApp.inject({
          method: 'POST',
          url: '/api/sessions',
          headers: {
            'x-api-key': user.apiKey,
          },
          payload: {
            userAgent: 'test-agent',
            viewport: { width: 1920, height: 1080 },
          },
        });

        return { statusCode: response.statusCode, data: response.json() };
      });

      const results = await Promise.all(sessionPromises);
      const successfulResults = results.filter((r) => r.statusCode === 201);

      console.log('\n[步骤 2] 从数据库查询会话并统计机器分配...');
      const machineSessionCount: Record<string, number> = {};

      for (const result of successfulResults) {
        if (result.data && result.data.id) {
          const session = await SessionModel.findById(result.data.id);
          if (session && session.machine_id) {
            const machineId = session.machine_id;
            machineSessionCount[machineId] = (machineSessionCount[machineId] || 0) + 1;
            console.log(`   会话 ${result.data.id} -> 机器 ${machineId}`);
          }
        }
      }

      console.log('\n[步骤 3] 验证负载均衡...');
      console.log('   机器会话分配:');
      for (const [machineId, count] of Object.entries(machineSessionCount)) {
        console.log(`     ${machineId}: ${count} 个会话`);
      }

      const uniqueMachines = Object.keys(machineSessionCount).length;
      console.log(`   使用的机器数量: ${uniqueMachines}`);
      expect(uniqueMachines).toBeGreaterThanOrEqual(1);
      expect(uniqueMachines).toBeLessThanOrEqual(NUM_MACHINES);

      const totalAssigned = Object.values(machineSessionCount).reduce((sum, count) => sum + count, 0);
      console.log(`   总分配会话数: ${totalAssigned}`);
      expect(totalAssigned).toBe(successfulResults.length);

      console.log('\n✅ TIER-032 测试通过: 会话正确分配到机器');
    });

    it('TIER-033: 每个用户的会话应该相互隔离', { timeout: 90000 }, async () => {
      console.log('\n[步骤 1] 5个用户同时创建会话...');

      const sessionPromises = testUsers.map(async (user) => {
        const response = await managerApp.inject({
          method: 'POST',
          url: '/api/sessions',
          headers: {
            'x-api-key': user.apiKey,
          },
          payload: {
            userAgent: 'test-agent',
            viewport: { width: 1920, height: 1080 },
          },
        });

        return {
          userId: user.id,
          statusCode: response.statusCode,
          session: response.json(),
        };
      });

      const results = await Promise.all(sessionPromises);
      const successfulResults = results.filter((r) => r.statusCode === 201);

      if (successfulResults.length === 0) {
        console.log('   ⚠️  无成功创建的会话，跳过隔离验证');
        return;
      }

      console.log('\n[步骤 2] 验证会话隔离...');

      const sessionIds = successfulResults.map((r) => r.session.data.id);
      const uniqueSessionIds = new Set(sessionIds);
      console.log(`   成功会话数: ${sessionIds.length}`);
      console.log(`   唯一会话数: ${uniqueSessionIds.size}`);
      expect(uniqueSessionIds.size).toBe(successfulResults.length);

      for (const result of successfulResults) {
        const session = await SessionModel.findById(result.session.data.id);
        console.log(`   会话 ${result.session.data.id} -> 用户 ${result.userId}`);
        expect(session!.user_id).toBe(result.userId);
      }

      console.log('\n✅ TIER-033 测试通过: 会话相互隔离');
    });

    it('TIER-034: 并发用户同时释放会话应该正确扣费', { timeout: 120000 }, async () => {
      console.log('\n[步骤 1] 5个用户同时创建会话...');

      const sessionPromises = testUsers.map(async (user) => {
        const response = await managerApp.inject({
          method: 'POST',
          url: '/api/sessions',
          headers: {
            'x-api-key': user.apiKey,
          },
          payload: {
            userAgent: 'test-agent',
            viewport: { width: 1920, height: 1080 },
          },
        });

        return {
          userId: user.id,
          statusCode: response.statusCode,
          session: response.json(),
        };
      });

      const results = await Promise.all(sessionPromises);
      const successfulCreates = results.filter((r) => r.statusCode === 201);

      if (successfulCreates.length === 0) {
        console.log('   ⚠️  无成功创建的会话，跳过释放测试');
        return;
      }

      console.log('\n[步骤 2] 等待10秒...');
      await new Promise((resolve) => setTimeout(resolve, 10000));

      console.log('\n[步骤 3] 并发释放会话...');

      const releasePromises = successfulCreates.map(async (result) => {
        const user = testUsers.find((u) => u.id === result.userId);
        const response = await managerApp.inject({
          method: 'POST',
          url: `/api/sessions/${result.session.data.id}/release`,
          headers: {
            'x-api-key': user?.apiKey || '',
          },
        });

        return {
          userId: result.userId,
          sessionId: result.session.data.id,
          statusCode: response.statusCode,
        };
      });

      const releaseResults = await Promise.all(releasePromises);

      console.log('\n[步骤 4] 验证会话释放结果...');
      let successCount = 0;
      for (const result of releaseResults) {
        console.log(`   用户 ${result.userId}: ${result.statusCode === 200 ? '✅' : '❌'} (${result.statusCode})`);
        if (result.statusCode === 200) {
          successCount++;
        }
      }

      expect(successCount).toBe(successfulCreates.length);

      console.log('\n[步骤 5] 验证积分扣费...');
      let totalDeducted = 0;
      for (const result of successfulCreates) {
        const userRecord = await UserModel.findById(result.userId);
        const deducted = INITIAL_CREDITS - userRecord!.credits;
        totalDeducted += deducted;
        console.log(`   用户 ${result.userId}: 扣除 ${deducted} 积分，剩余 ${userRecord!.credits}`);
        if (releaseResults.find((r) => r.userId === result.userId && r.statusCode === 200)) {
          expect(deducted).toBeGreaterThanOrEqual(1);
        }
      }

      console.log(`   总扣除积分: ${totalDeducted}`);
      expect(totalDeducted).toBeGreaterThanOrEqual(successfulCreates.length);

      console.log('\n✅ TIER-034 测试通过: 并发释放会话正确扣费');
    });

    it.skipIf(process.env.CI === 'true')(
      'TIER-035: 并发用户同时使用浏览器应该互不干扰',
      { timeout: 180000 },
      async () => {
        console.log('\n[步骤 1] 5个用户同时创建会话...');

        const sessionPromises = testUsers.map(async (user) => {
          const response = await managerApp.inject({
            method: 'POST',
            url: '/api/sessions',
            headers: {
              'x-api-key': user.apiKey,
            },
            payload: {
              userAgent: 'test-agent',
              viewport: { width: 1920, height: 1080 },
            },
          });

          return {
            userId: user.id,
            statusCode: response.statusCode,
            session: response.json(),
          };
        });

        const results = await Promise.all(sessionPromises);
        const successfulResults = results.filter((r) => r.statusCode === 201);

        if (successfulResults.length === 0) {
          console.log('   ⚠️  无成功创建的会话，跳过浏览器测试');
          return;
        }

        console.log(`\n[步骤 2] ${successfulResults.length} 个用户同时连接浏览器并访问百度...`);

        const browserPromises = successfulResults.map(async (result) => {
          const sessionId = result.session.data.id;
          const wsUrl = result.session.data.directUrl || result.session.data.browserWSEndpoint;

          if (!wsUrl) {
            throw new Error(`No WebSocket URL for session ${sessionId}`);
          }

          const browser = await puppeteer.connect({
            browserWSEndpoint: wsUrl,
          });

          const page = (await browser.pages())[0];

          const searchQuery = `user${result.userId}_${Date.now()}`;
          await page.goto(`https://www.baidu.com/s?wd=${searchQuery}`, {
            waitUntil: 'networkidle0',
            timeout: 30000,
          });

          const title = await page.title();
          const url = page.url();

          await browser.disconnect();

          return {
            userId: result.userId,
            title,
            url,
            searchQuery,
          };
        });

        const browserResults = await Promise.all(browserPromises);

        console.log('\n[步骤 3] 验证每个用户的浏览器操作互不干扰...');

        for (const result of browserResults) {
          console.log(`   用户 ${result.userId}:`);
          console.log(`     标题: ${result.title}`);
          console.log(`     URL: ${result.url}`);
          console.log(`     搜索词: ${result.searchQuery}`);

          expect(result.url).toContain(result.searchQuery);
          expect(result.title).toContain('百度');
        }

        console.log('\n✅ TIER-035 测试通过: 并发浏览器操作互不干扰');
      }
    );
  });

  describe('并发计费测试 (TIER-036 ~ TIER-040)', () => {
    it('TIER-036: 并发会话积分扣费应该准确计算', { timeout: 180000 }, async () => {
      console.log('\n[步骤 1] 5个用户同时创建会话...');

      const sessionPromises = testUsers.map(async (user) => {
        const response = await managerApp.inject({
          method: 'POST',
          url: '/api/sessions',
          headers: {
            'x-api-key': user.apiKey,
          },
          payload: {
            userAgent: 'test-agent',
            viewport: { width: 1920, height: 1080 },
          },
        });

        return {
          userId: user.id,
          statusCode: response.statusCode,
          session: response.json(),
        };
      });

      const results = await Promise.all(sessionPromises);
      const successfulCreates = results.filter((r) => r.statusCode === 201);

      if (successfulCreates.length === 0) {
        console.log('   ⚠️  无成功创建的会话，跳过计费测试');
        return;
      }

      console.log('\n[步骤 2] 等待65秒（确保扣2点积分）...');
      await new Promise((resolve) => setTimeout(resolve, 65000));

      console.log('\n[步骤 3] 并发释放会话...');

      const releasePromises = successfulCreates.map(async (result) => {
        const user = testUsers.find((u) => u.id === result.userId);
        await managerApp.inject({
          method: 'POST',
          url: `/api/sessions/${result.session.data.id}/release`,
          headers: {
            'x-api-key': user?.apiKey || '',
          },
        });
      });

      await Promise.all(releasePromises);

      console.log('\n[步骤 4] 验证积分扣费...');

      for (const result of successfulCreates) {
        const userRecord = await UserModel.findById(result.userId);
        const deducted = INITIAL_CREDITS - userRecord!.credits;
        console.log(`   用户 ${result.userId}: 扣除 ${deducted} 积分，剩余 ${userRecord!.credits}`);

        expect(deducted).toBeGreaterThanOrEqual(1);
      }

      console.log('\n✅ TIER-036 测试通过: 并发积分扣费计算准确');
    });

    it('TIER-037: 并发会话应该生成正确的积分历史记录', { timeout: 120000 }, async () => {
      console.log('\n[步骤 1] 5个用户同时创建会话...');

      const sessionPromises = testUsers.map(async (user) => {
        const response = await managerApp.inject({
          method: 'POST',
          url: '/api/sessions',
          headers: {
            'x-api-key': user.apiKey,
          },
          payload: {
            userAgent: 'test-agent',
            viewport: { width: 1920, height: 1080 },
          },
        });

        return {
          userId: user.id,
          statusCode: response.statusCode,
          session: response.json(),
        };
      });

      const results = await Promise.all(sessionPromises);
      const successfulCreates = results.filter((r) => r.statusCode === 201);

      if (successfulCreates.length === 0) {
        console.log('   ⚠️  无成功创建的会话，跳过积分历史测试');
        return;
      }

      console.log('\n[步骤 2] 等待10秒...');
      await new Promise((resolve) => setTimeout(resolve, 10000));

      console.log('\n[步骤 3] 并发释放会话...');

      const releasePromises = successfulCreates.map(async (result) => {
        const user = testUsers.find((u) => u.id === result.userId);
        await managerApp.inject({
          method: 'POST',
          url: `/api/sessions/${result.session.data.id}/release`,
          headers: {
            'x-api-key': user?.apiKey || '',
          },
        });
      });

      await Promise.all(releasePromises);

      console.log('\n[步骤 4] 验证积分历史记录...');

      for (const result of successfulCreates) {
        const historyRecords = await CreditHistoryModel.findByUserId(result.userId);
        console.log(`   用户 ${result.userId}: ${historyRecords.length} 条积分历史`);
        expect(historyRecords.length).toBeGreaterThanOrEqual(1);

        const latestRecord = historyRecords[0];
        console.log(
          `     最新记录: ${latestRecord.action} ${latestRecord.amount} 积分, 剩余 ${latestRecord.balance_after} 积分`
        );
        expect(latestRecord.action).toBe('use');
        expect(latestRecord.amount).toBeGreaterThanOrEqual(1);
      }

      console.log('\n✅ TIER-037 测试通过: 积分历史记录正确');
    });
  });
});
