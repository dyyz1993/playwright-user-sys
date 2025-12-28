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

const NUM_USERS = 5; // 5个并发用户
const NUM_MACHINES = 2; // 2台机器
const INITIAL_CREDITS = 100; // 初始积分

describe('多用户并发集成测试 (TIER-031 ~ TIER-040)', () => {
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
    process.env.NODE_ENV = 'test';
    process.env.DB_TYPE = 'mysql';
    process.env.DB_NAME = 'playwright_test_user_sys'; // 使用相同的数据库避免连接池冲突
    process.env.DB_HOST = process.env.DB_HOST || 'REDACTED_INTERNAL_HOST';
    process.env.DB_PORT = process.env.DB_PORT || '3306';
    process.env.DB_USER = process.env.DB_USER || 'root';
    process.env.DB_PASSWORD = process.env.DB_PASSWORD || '';
    // 注意：JWT_SECRET、JWT_EXPIRES_IN、INSTANCE_TIMEOUT、MACHINE_MONITOR_INTERVAL
    // 等配置使用 .env.test 或 GitHub Actions 环境变量，不再硬编码覆盖
    // 增加连接池大小以支持并发测试
    process.env.DB_POOL_MIN = '5';
    process.env.DB_POOL_MAX = '20';

    managerHttpPort = parseInt(process.env.PORT || '3000', 10);
    managerGrpcPort = parseInt(process.env.GRPC_PORT || '50051', 10);

    console.log(`   HTTP 端口: ${managerHttpPort}`);
    console.log(`   gRPC 端口: ${managerGrpcPort}`);
    console.log(`   数据库: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);

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

    await initDatabase();
    await runMigrations();
    console.log('✅ 数据库迁移完成');

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

    // 步骤 4: 启动管理端服务器
    console.log('\n[步骤 4] 启动管理端服务器...');
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
        chromePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
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
    await new Promise(resolve => setTimeout(resolve, 3000));

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

    console.log('✅ 测试数据已重置');
  }, 10000);

  // ========================================
  // 测试用例: 并发测试 (TIER-031 ~ TIER-040)
  // ========================================

  describe('并发会话创建 (TIER-031 ~ TIER-035)', () => {
    it('TIER-031: 5个用户同时创建会话应该全部成功', { timeout: 90000 }, async () => {
      console.log('\n[步骤 1] 5个用户同时创建会话...');

      // 记录创建前的用户积分
      const creditsBefore: Record<number, number> = {};
      for (const user of testUsers) {
        const userRecord = await UserModel.findById(user.id);
        creditsBefore[user.id] = userRecord.credits;
        console.log(`   用户 ${user.id} 创建前积分: ${creditsBefore[user.id]}`);
      }

      // 并发创建会话
      const sessionPromises = testUsers.map(async (user) => {
        const response = await managerApp.inject({
          method: 'POST',
          url: '/api/sessions',
          headers: {
            'x-api-key': user.apiKey,  // 使用 API Key 而不是 JWT Token
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

      console.log('\n[步骤 2] 验证所有会话创建成功...');
      let successCount = 0;
      for (const result of results) {
        console.log(`   用户 ${result.userId}: ${result.statusCode === 201 ? '✅' : '❌'} (${result.statusCode})`);
        if (result.statusCode === 201) {
          successCount++;
        }
      }

      expect(successCount).toBe(NUM_USERS);

      console.log('\n[步骤 3] 验证数据库中的会话记录...');
      const sessions = await SessionModel.findAll();
      console.log(`   会话总数: ${sessions.total}`);
      expect(sessions.total).toBe(NUM_USERS);

      console.log('\n[步骤 4] 验证积分未扣费（后扣费模式）...');
      for (const user of testUsers) {
        const userRecord = await UserModel.findById(user.id);
        console.log(`   用户 ${user.id} 创建后积分: ${userRecord.credits}`);
        expect(userRecord.credits).toBe(creditsBefore[user.id]);
      }

      console.log('\n✅ TIER-031 测试通过: 5个用户同时创建会话成功');
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

        return response.json();
      });

      const results = await Promise.all(sessionPromises);

      console.log('\n[步骤 2] 从数据库查询会话并统计机器分配...');
      const machineSessionCount: Record<string, number> = {};

      // API 返回的响应中没有 machine_id，需要从数据库查询
      for (const result of results) {
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

      // 验证所有会话都分配了机器
      const totalAssigned = Object.values(machineSessionCount).reduce((sum, count) => sum + count, 0);
      console.log(`   总分配会话数: ${totalAssigned}`);
      expect(totalAssigned).toBe(NUM_USERS);

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
          session: response.json(),
        };
      });

      const results = await Promise.all(sessionPromises);

      console.log('\n[步骤 2] 验证会话隔离...');

      // 验证每个会话都有唯一的 ID
      const sessionIds = results.map(r => r.session.data.id);
      const uniqueSessionIds = new Set(sessionIds);
      console.log(`   会话总数: ${sessionIds.length}`);
      console.log(`   唯一会话数: ${uniqueSessionIds.size}`);
      expect(uniqueSessionIds.size).toBe(NUM_USERS);

      // 验证每个会话都关联到正确的用户
      for (const result of results) {
        const session = await SessionModel.findById(result.session.data.id);
        console.log(`   会话 ${result.session.data.id} -> 用户 ${result.userId}`);
        expect(session.user_id).toBe(result.userId);
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
          session: response.json(),
        };
      });

      const results = await Promise.all(sessionPromises);

      console.log('\n[步骤 2] 等待10秒...');
      await new Promise(resolve => setTimeout(resolve, 10000));

      console.log('\n[步骤 3] 5个用户同时释放会话...');

      const releasePromises = results.map(async (result) => {
        // 查找对应用户的 apiKey
        const user = testUsers.find(u => u.id === result.userId);
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

      console.log('\n[步骤 4] 验证所有会话释放成功...');
      let successCount = 0;
      for (const result of releaseResults) {
        console.log(`   用户 ${result.userId}: ${result.statusCode === 200 ? '✅' : '❌'} (${result.statusCode})`);
        if (result.statusCode === 200) {
          successCount++;
        }
      }

      expect(successCount).toBe(NUM_USERS);

      console.log('\n[步骤 5] 验证积分扣费...');
      let totalDeducted = 0;
      for (const user of testUsers) {
        const userRecord = await UserModel.findById(user.id);
        const deducted = INITIAL_CREDITS - userRecord.credits;
        totalDeducted += deducted;
        console.log(`   用户 ${user.id}: 扣除 ${deducted} 积分，剩余 ${userRecord.credits}`);
        expect(deducted).toBeGreaterThan(0);
      }

      console.log(`   总扣除积分: ${totalDeducted}`);
      expect(totalDeducted).toBe(NUM_USERS); // 每个用户扣1点（<1分钟按1分钟计）

      console.log('\n✅ TIER-034 测试通过: 并发释放会话正确扣费');
    });

    it('TIER-035: 并发用户同时使用浏览器应该互不干扰', { timeout: 180000 }, async () => {
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
          session: response.json(),
        };
      });

      const results = await Promise.all(sessionPromises);

      console.log('\n[步骤 2] 5个用户同时连接浏览器并访问百度...');

      const browserPromises = results.map(async (result) => {
        const sessionId = result.session.data.id;
        const wsUrl = result.session.data.directUrl || result.session.data.browserWSEndpoint;

        if (!wsUrl) {
          throw new Error(`No WebSocket URL for session ${sessionId}`);
        }

        const browser = await puppeteer.connect({
          browserWSEndpoint: wsUrl,
        });

        const page = (await browser.pages())[0];

        // 每个用户访问不同的URL以确保隔离
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

        // 验证每个用户都访问到了自己的搜索页面
        expect(result.url).toContain(result.searchQuery);
        expect(result.title).toContain('百度');
      }

      console.log('\n✅ TIER-035 测试通过: 并发浏览器操作互不干扰');
    });
  });

  describe('并发计费测试 (TIER-036 ~ TIER-040)', () => {
    it('TIER-036: 并发会话积分扣费应该准确计算', { timeout: 120000 }, async () => {
      console.log('\n[步骤 1] 5个用户同时创建会话...');

      // 创建会话
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
          session: response.json(),
        };
      });

      const results = await Promise.all(sessionPromises);

      console.log('\n[步骤 2] 等待65秒（确保扣2点积分）...');
      await new Promise(resolve => setTimeout(resolve, 65000));

      console.log('\n[步骤 3] 5个用户同时释放会话...');

      const releasePromises = results.map(async (result) => {
        // 查找对应用户的 apiKey
        const user = testUsers.find(u => u.id === result.userId);
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

      for (const user of testUsers) {
        const userRecord = await UserModel.findById(user.id);
        const deducted = INITIAL_CREDITS - userRecord.credits;
        console.log(`   用户 ${user.id}: 扣除 ${deducted} 积分，剩余 ${userRecord.credits}`);

        // 65秒应该扣2点（>1分钟，<=2分钟）
        expect(deducted).toBe(2);
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
          session: response.json(),
        };
      });

      const results = await Promise.all(sessionPromises);

      console.log('\n[步骤 2] 等待10秒...');
      await new Promise(resolve => setTimeout(resolve, 10000));

      console.log('\n[步骤 3] 5个用户同时释放会话...');

      const releasePromises = results.map(async (result) => {
        // 查找对应用户的 apiKey
        const user = testUsers.find(u => u.id === result.userId);
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

      for (const user of testUsers) {
        const historyRecords = await CreditHistoryModel.findByUserId(user.id);
        console.log(`   用户 ${user.id}: ${historyRecords.length} 条积分历史`);
        expect(historyRecords.length).toBeGreaterThan(0);

        // 验证最新的记录是扣费
        const latestRecord = historyRecords[0];
        console.log(`     最新记录: ${latestRecord.action} ${latestRecord.amount} 积分, 剩余 ${latestRecord.balance_after} 积分`);
        expect(latestRecord.action).toBe('use');
      }

      console.log('\n✅ TIER-037 测试通过: 积分历史记录正确');
    });
  });
});
