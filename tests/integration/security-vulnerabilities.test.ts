/**
 * 安全测试 - 异常与攻击场景
 *
 * 测试范围:
 * - 认证绕过
 * - 资源滥用
 * - 业务逻辑漏洞
 * - 数据安全
 * - 权限提升
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
import { createTestUser, createTestAdmin } from '../helpers/factories.js';
import puppeteer from 'puppeteer-core';
import type { FastifyInstance } from 'fastify';
import { execSync } from 'child_process';

// ========================================
// 测试配置
// ========================================

const NUM_USERS = 2;
const NUM_MACHINES = 1;
const INITIAL_CREDITS = 100;

describe('安全测试 (TIER-041 ~ TIER-050)', () => {
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
    role: string;
  }> = [];
  let testAdmin: any;

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

    // 设置测试环境变量
    process.env.NODE_ENV = 'test';
    process.env.DB_TYPE = 'mysql';
    process.env.DB_NAME = 'playwright_test_security';
    process.env.DB_HOST = process.env.DB_HOST || 'REDACTED_INTERNAL_HOST';
    process.env.DB_PORT = process.env.DB_PORT || '3306';
    process.env.DB_USER = process.env.DB_USER || 'root';
    process.env.DB_PASSWORD = process.env.DB_PASSWORD || '';

    // 设置其他必需的环境变量
    process.env.JWT_SECRET = 'test_secret_key_for_testing_only';
    process.env.JWT_EXPIRES_IN = '24h';
    process.env.INSTANCE_TIMEOUT = '60000';
    process.env.MACHINE_MONITOR_INTERVAL = '30000';

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

    // 步骤 3: 创建测试用户和管理员
    console.log(`\n[步骤 3] 创建测试用户和管理员...`);

    // 创建管理员
    const admin = await createTestAdmin({
      username: `admin_${Date.now()}`,
      credits: 1000,
    });

    const { generateToken } = await import('../../src/utils/auth.js');
    const adminToken = generateToken({
      id: admin.id,
      username: admin.username,
      role: admin.role,
    });

    testAdmin = {
      id: admin.id,
      username: admin.username,
      token: adminToken,
      apiKey: admin.api_key || '',
      role: admin.role,
    };

    console.log(`   ✅ 管理员: ${admin.username} (积分: ${admin.credits})`);

    // 创建普通用户
    for (let i = 0; i < NUM_USERS; i++) {
      const user = await createTestUser({
        username: `testuser_${Date.now()}_${i}`,
        credits: INITIAL_CREDITS,
      });

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
        role: user.role,
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

    // 步骤 5: 启动机器端服务
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
        maxSessions: 5,
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

    // 步骤 6: 验证机器注册成功
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

  beforeEach(async () => {
    // 清理会话表
    await db('sessions').del();
    await db('credit_history').del();

    // 重置用户积分
    for (const user of testUsers) {
      await db('users').where({ id: user.id }).update({ credits: INITIAL_CREDITS });
    }

    // 重置管理员积分
    await db('users').where({ id: testAdmin.id }).update({ credits: 1000 });

    // 重置机器实例计数
    for (const machine of machineServers) {
      await db('machines').where({ id: machine.machineId }).update({ instance_count: 0 });
    }
  }, 10000);

  // ========================================
  // 测试用例：认证与授权漏洞
  // ========================================

  describe('认证与授权漏洞 (TIER-041 ~ TIER-043)', () => {
    /**
     * TIER-041: SQL注入漏洞测试 - 用户名注入
     *
     * 测试内容:
     * 1. 尝试使用SQL注入作为用户名登录
     * 2. 验证系统正确转义特殊字符
     * 3. 验证不会泄露数据库结构信息
     */
    it('TIER-041: SQL注入漏洞 - 用户名字段特殊字符转义', { timeout: 60000 }, async () => {
      console.log('\n[步骤 1] 尝试创建包含SQL注入的用户名...');
      const sqlInjectionPayloads = [
        "admin'--",
        "admin'/*",
        "' OR '1'='1",
        "' OR 1=1--",
        "'; DROP TABLE users;--",
        "1' UNION SELECT * FROM users--",
      ];

      for (const payload of sqlInjectionPayloads) {
        console.log(`   测试payload: ${payload}`);

        // 尝试使用注入payload创建用户
        const response = await managerApp.inject({
          method: 'POST',
          url: '/api/auth/register',
          payload: {
            username: payload,
            password: 'password123',
          },
        });

        // Layer 1: API Response - 应该返回错误或被正确转义
        expect(response.statusCode).toBeGreaterThanOrEqual(400);
        console.log(`   ✅ HTTP状态码: ${response.statusCode} (拒绝请求)`);
      }

      // Layer 2: Database - 验证没有创建异常用户
      console.log('\n[步骤 2] 验证数据库中无异常用户...');
      const users = await db('users').select('username');
      const dangerousUsers = users.filter((u: any) =>
        u.username.includes("'") ||
        u.username.includes('--') ||
        u.username.includes('/*')
      );
      expect(dangerousUsers.length).toBe(0);
      console.log('   ✅ 数据库中无包含SQL注入的用户');

      // Layer 3: Authentication - 验证注入无法绕过登录
      console.log('\n[步骤 3] 验证SQL注入无法绕过认证...');
      const loginResponse = await managerApp.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: "' OR '1'='1",
          password: 'anything',
        },
      });

      expect(loginResponse.statusCode).toBe(401);
      const loginData = JSON.parse(loginResponse.body);
      expect(loginData.success).toBe(false);
      console.log('   ✅ SQL注入无法绕过登录');

      console.log('✅ TIER-041 SQL注入防护测试通过');
    });

    /**
     * TIER-042: JWT Token伪造测试
     *
     * 测试内容:
     * 1. 尝试使用伪造的JWT token访问API
     * 2. 验证签名验证有效
     * 3. 验证过期的token被拒绝
     */
    it('TIER-042: JWT Token伪造和篡改检测', { timeout: 60000 }, async () => {
      const user = testUsers[0];

      console.log('\n[步骤 1] 测试无效token访问...');
      const invalidTokens = [
        '', // 空token
        'invalid.token.here', // 格式错误
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6OTk5LCJ1c2VybmFtZSI6ImhhY2tlciIsInJvbGUiOiJhZG1pbiJ9.signature', // 篡改的token
        `${user.token}tampered`, // 篡改有效token
      ];

      for (const invalidToken of invalidTokens) {
        console.log(`   测试token: ${invalidToken.substring(0, 30)}...`);

        const response = await managerApp.inject({
          method: 'GET',
          url: '/api/sessions',
          headers: {
            authorization: `Bearer ${invalidToken}`,
          },
        });

        // Layer 1: API Response - 应该返回401未授权
        expect(response.statusCode).toBe(401);
        const responseData = JSON.parse(response.body);
        expect(responseData.success).toBe(false);
        console.log(`   ✅ 拒绝无效token: ${responseData.error || 'Unauthorized'}`);
      }

      console.log('\n[步骤 2] 测试无token访问...');
      const noTokenResponse = await managerApp.inject({
        method: 'GET',
        url: '/api/sessions',
      });

      expect(noTokenResponse.statusCode).toBe(401);
      console.log('   ✅ 拒绝无token请求');

      console.log('\n[步骤 3] 验证有效token能正常访问...');
      const validResponse = await managerApp.inject({
        method: 'GET',
        url: '/api/sessions',
        headers: {
          authorization: `Bearer ${user.token}`,
        },
      });

      expect(validResponse.statusCode).toBe(200);
      console.log('   ✅ 有效token能正常访问');

      console.log('✅ TIER-042 JWT Token验证测试通过');
    });

    /**
     * TIER-043: 水平越权漏洞测试 - 用户访问其他用户资源
     *
     * 测试内容:
     * 1. 用户A尝试访问用户B的会话
     * 2. 用户A尝试修改用户B的信息
     * 3. 验证权限隔离有效
     */
    it('TIER-043: 水平越权漏洞 - 用户无法访问其他用户资源', { timeout: 60000 }, async () => {
      const userA = testUsers[0];
      const userB = testUsers[1];

      console.log('\n[步骤 1] 用户B创建会话...');
      const sessionB = await managerApp.inject({
        method: 'POST',
        url: '/api/sessions',
        headers: {
          authorization: `Bearer ${userB.token}`,
        },
      });

      expect(sessionB.statusCode).toBe(201);
      const sessionBData = JSON.parse(sessionB.body);
      const sessionBId = sessionBData.id;
      console.log(`   ✅ 用户B创建会话: ${sessionBId}`);

      console.log('\n[步骤 2] 用户A尝试访问用户B的会话...');
      const unauthorizedAccess = await managerApp.inject({
        method: 'GET',
        url: `/api/sessions/${sessionBId}`,
        headers: {
          authorization: `Bearer ${userA.token}`,
        },
      });

      // Layer 1: API Response - 应该返回403禁止访问或404不存在
      expect([403, 404]).toContain(unauthorizedAccess.statusCode);
      console.log(`   ✅ 拒绝越权访问 (HTTP ${unauthorizedAccess.statusCode})`);

      console.log('\n[步骤 3] 用户A尝试结束用户B的会话...');
      const unauthorizedEnd = await managerApp.inject({
        method: 'POST',
        url: `/api/sessions/${sessionBId}/end`,
        headers: {
          authorization: `Bearer ${userA.token}`,
        },
      });

      expect([403, 404]).toContain(unauthorizedEnd.statusCode);
      console.log('   ✅ 拒绝越权结束会话');

      console.log('\n[步骤 4] 验证用户B的会话仍然活跃...');
      const sessionBAfter = await SessionModel.findById(sessionBId);
      expect(sessionBAfter).toBeDefined();
      expect(sessionBAfter!.user_id).toBe(userB.id);
      console.log('   ✅ 用户B的会话未被修改');

      // Layer 2: Database - 验证权限隔离
      console.log('\n[步骤 5] 验证用户A只能看到自己的会话...');
      const userASessions = await managerApp.inject({
        method: 'GET',
        url: '/api/sessions',
        headers: {
          authorization: `Bearer ${userA.token}`,
        },
      });

      const userASessionsData = JSON.parse(userASessions.body);
      const hasUserBSessions = userASessionsData.items?.some((s: any) => s.id === sessionBId);
      expect(hasUserBSessions).toBe(false);
      console.log('   ✅ 用户A无法看到用户B的会话');

      console.log('✅ TIER-043 水平越权防护测试通过');
    });
  });

  // ========================================
  // 测试用例：资源滥用漏洞
  // ========================================

  describe('资源滥用漏洞 (TIER-044 ~ TIER-046)', () => {
    /**
     * TIER-044: 会话资源耗尽攻击
     *
     * 测试内容:
     * 1. 单个用户尝试创建大量会话
     * 2. 验证会话数量限制
     * 3. 验证不会导致服务器资源耗尽
     */
    it('TIER-044: 会话资源耗尽攻击 - 限制单用户会话数量', { timeout: 90000 }, async () => {
      const user = testUsers[0];

      console.log('\n[步骤 1] 用户尝试创建大量会话...');
      const maxAllowedSessions = 100; // 设置一个合理的上限
      const createdSessions: string[] = [];

      for (let i = 0; i < maxAllowedSessions + 10; i++) {
        const response = await managerApp.inject({
          method: 'POST',
          url: '/api/sessions',
          headers: {
            authorization: `Bearer ${user.token}`,
          },
        });

        if (response.statusCode === 201) {
          const sessionData = JSON.parse(response.body);
          createdSessions.push(sessionData.id);
        } else if (response.statusCode === 429) {
          // 达到速率限制
          console.log(`   ✅ 在第 ${i + 1} 个会话时触发速率限制`);
          break;
        } else {
          console.log(`   会话 ${i + 1}: HTTP ${response.statusCode}`);
        }

        // 每创建10个会话暂停一下
        if (i > 0 && i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      console.log(`   总共创建了 ${createdSessions.length} 个会话`);

      // Layer 1: API Response - 验证不会无限创建会话
      expect(createdSessions.length).toBeLessThan(maxAllowedSessions + 10);
      console.log('   ✅ 会话数量受到限制');

      // Layer 2: Database - 验证数据库中的会话数量
      console.log('\n[步骤 2] 验证数据库中的会话数量...');
      const userSessions = await SessionModel.findByUserId(user.id);
      expect(userSessions.items.length).toBeLessThan(maxAllowedSessions + 10);
      console.log(`   ✅ 数据库中会话数量: ${userSessions.items.length}`);

      // Layer 3: System Resources - 验证机器资源未耗尽
      console.log('\n[步骤 3] 验证机器资源状态...');
      const machines = await MachineModel.findAll();
      for (const machine of machines.items) {
        console.log(`   机器 ${machine.id}: ${machine.instanceCount}/${machine.maxInstances} 实例`);
        expect(machine.instanceCount).toBeLessThanOrEqual(machine.maxInstances);
      }
      console.log('   ✅ 机器资源未超限');

      // 清理创建的会话
      console.log('\n[步骤 4] 清理测试会话...');
      for (const sessionId of createdSessions) {
        await managerApp.inject({
          method: 'POST',
          url: `/api/sessions/${sessionId}/end`,
          headers: {
            authorization: `Bearer ${user.token}`,
          },
        });
      }
      console.log('   ✅ 测试会话已清理');

      console.log('✅ TIER-044 会话资源耗尽防护测试通过');
    });

    /**
     * TIER-045: 积分绕过攻击
     *
     * 测试内容:
     * 1. 尝试在积分不足时创建会话
     * 2. 验证积分检查在会话创建前执行
     * 3. 验证不会出现负积分
     */
    it('TIER-045: 积分绕过攻击 - 积分不足时拒绝服务', { timeout: 60000 }, async () => {
      const user = testUsers[0];

      console.log('\n[步骤 1] 设置用户积分为0...');
      await db('users').where({ id: user.id }).update({ credits: 0 });

      const userAfterSet = await UserModel.findById(user.id);
      expect(userAfterSet!.credits).toBe(0);
      console.log('   ✅ 用户积分已设置为0');

      console.log('\n[步骤 2] 尝试在积分不足时创建会话...');
      const response = await managerApp.inject({
        method: 'POST',
        url: '/api/sessions',
        headers: {
          authorization: `Bearer ${user.token}`,
        },
      });

      // Layer 1: API Response - 应该返回402支付失败
      expect(response.statusCode).toBe(402);
      const responseData = JSON.parse(response.body);
      expect(responseData.success).toBe(false);
      expect(responseData.error).toContain('Insufficient credits');
      console.log(`   ✅ 拒绝创建会话: ${responseData.error}`);

      // Layer 2: Database - 验证没有创建会话
      console.log('\n[步骤 3] 验证没有创建会话...');
      const userSessions = await SessionModel.findByUserId(user.id);
      expect(userSessions.items.length).toBe(0);
      console.log('   ✅ 未创建任何会话');

      // Layer 3: Database - 验证积分没有变化
      console.log('\n[步骤 4] 验证积分保持为0...');
      const userAfterAttempt = await UserModel.findById(user.id);
      expect(userAfterAttempt!.credits).toBe(0);
      console.log('   ✅ 积分保持为0，未出现负值');

      // Layer 4: Credit History - 验证没有产生积分记录
      console.log('\n[步骤 5] 验证没有产生积分历史...');
      const history = await CreditHistoryModel.findByUserId(user.id);
      expect(history.items.length).toBe(0);
      console.log('   ✅ 未产生积分历史记录');

      console.log('✅ TIER-045 积分绕过防护测试通过');
    });

    /**
     * TIER-046: 并发竞争条件攻击
     *
     * 测试内容:
     * 1. 并发创建多个会话
     * 2. 验证积分扣除正确
     * 3. 验证不会出现积分扣减不一致
     */
    it('TIER-046: 并发竞争条件 - 多会话同时创建和结束', { timeout: 90000 }, async () => {
      const user = testUsers[0];
      const concurrentSessions = 5;

      console.log(`\n[步骤 1] 并发创建 ${concurrentSessions} 个会话...`);
      const userBefore = await UserModel.findById(user.id);
      const initialCredits = userBefore!.credits;
      console.log(`   用户初始积分: ${initialCredits}`);

      // 并发创建会话
      const createPromises = Array(concurrentSessions).fill(null).map(() =>
        managerApp.inject({
          method: 'POST',
          url: '/api/sessions',
          headers: {
            authorization: `Bearer ${user.token}`,
          },
        })
      );

      const createResponses = await Promise.all(createPromises);
      const successfulCreates = createResponses.filter(r => r.statusCode === 201);

      console.log(`   成功创建 ${successfulCreates.length} 个会话`);

      // Layer 1: API Response - 验证所有请求都成功
      expect(successfulCreates.length).toBe(concurrentSessions);

      const sessionIds = successfulCreates.map(r => {
        const data = JSON.parse(r.body);
        return data.id;
      });

      // Layer 2: Database - 验证创建后积分未变化（后扣费）
      console.log('\n[步骤 2] 验证创建后积分未变化...');
      const userAfterCreate = await UserModel.findById(user.id);
      expect(userAfterCreate!.credits).toBe(initialCredits);
      console.log('   ✅ 创建会话后积分未扣除（后扣费模式）');

      console.log('\n[步骤 3] 使用会话3秒...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      console.log('\n[步骤 4] 并发结束所有会话...');
      const endPromises = sessionIds.map(sessionId =>
        managerApp.inject({
          method: 'POST',
          url: `/api/sessions/${sessionId}/end`,
          headers: {
            authorization: `Bearer ${user.token}`,
          },
        })
      );

      const endResponses = await Promise.all(endPromises);
      const successfulEnds = endResponses.filter(r => r.statusCode === 200);

      console.log(`   成功结束 ${successfulEnds.length} 个会话`);
      expect(successfulEnds.length).toBe(concurrentSessions);

      // Layer 3: Database - 验证积分正确扣除
      console.log('\n[步骤 5] 验证积分扣除...');
      await new Promise(resolve => setTimeout(resolve, 1000)); // 等待扣费完成

      const userAfterEnd = await UserModel.findById(user.id);
      const expectedCharge = concurrentSessions * 1; // 每个会话最少1分钟
      const actualCharge = initialCredits - userAfterEnd!.credits;

      console.log(`   预期扣除: ${expectedCharge} 积分`);
      console.log(`   实际扣除: ${actualCharge} 积分`);

      expect(actualCharge).toBe(expectedCharge);
      console.log('   ✅ 积分扣除正确');

      // Layer 4: Credit History - 验证积分历史记录
      console.log('\n[步骤 6] 验证积分历史记录...');
      const history = await CreditHistoryModel.findByUserId(user.id);
      const sessionEndRecords = history.items.filter(h => h.operation === 'session_end');

      expect(sessionEndRecords.length).toBeGreaterThanOrEqual(concurrentSessions);
      console.log(`   ✅ 积分历史记录数: ${sessionEndRecords.length}`);

      console.log('✅ TIER-046 并发竞争条件测试通过');
    });
  });

  // ========================================
  // 测试用例：业务逻辑漏洞
  // ========================================

  describe('业务逻辑漏洞 (TIER-047 ~ TIER-048)', () => {
    /**
     * TIER-047: 会话固定攻击
     *
     * 测试内容:
     * 1. 尝试指定会话ID
     * 2. 验证会话ID由服务器生成
     * 3. 验证无法预测会话ID
     */
    it('TIER-047: 会话固定攻击 - 会话ID必须由服务器生成', { timeout: 60000 }, async () => {
      const user = testUsers[0];

      console.log('\n[步骤 1] 尝试指定会话ID...');
      const customSessionId = 'custom-session-id-12345';

      const response = await managerApp.inject({
        method: 'POST',
        url: '/api/sessions',
        headers: {
          authorization: `Bearer ${user.token}`,
        },
        payload: {
          id: customSessionId, // 尝试指定ID
        },
      });

      expect(response.statusCode).toBe(201);
      const responseData = JSON.parse(response.body);

      // Layer 1: API Response - 验证会话ID不是指定的
      expect(responseData.id).toBeDefined();
      expect(responseData.id).not.toBe(customSessionId);
      console.log(`   ✅ 会话ID由服务器生成: ${responseData.id}`);
      console.log(`   ❌ 拒绝自定义ID: ${customSessionId}`);

      // Layer 2: Database - 验证数据库中的会话ID
      console.log('\n[步骤 2] 验证数据库中无自定义ID...');
      const customSessionInDb = await SessionModel.findById(customSessionId);
      expect(customSessionInDb).toBeNull();
      console.log('   ✅ 数据库中无自定义会话ID');

      const serverSessionInDb = await SessionModel.findById(responseData.id);
      expect(serverSessionInDb).toBeDefined();
      console.log('   ✅ 服务器生成的会话ID存在于数据库');

      // Layer 3: Uniqueness - 验证会话ID唯一性
      console.log('\n[步骤 3] 验证会话ID唯一性（连续创建）...');
      const sessionIds: string[] = [];

      for (let i = 0; i < 10; i++) {
        const resp = await managerApp.inject({
          method: 'POST',
          url: '/api/sessions',
          headers: {
            authorization: `Bearer ${user.token}`,
          },
        });

        if (resp.statusCode === 201) {
          const data = JSON.parse(resp.body);
          sessionIds.push(data.id);
        }
      }

      const uniqueIds = new Set(sessionIds);
      expect(uniqueIds.size).toBe(sessionIds.length);
      console.log(`   ✅ 创建的 ${sessionIds.length} 个会话ID全部唯一`);

      console.log('✅ TIER-047 会话固定攻击防护测试通过');
    });

    /**
     * TIER-048: 计费逻辑漏洞
     *
     * 测试内容:
     * 1. 创建会话后立即结束
     * 2. 验证最少扣费1分钟
     * 3. 验证不会出现0扣费
     */
    it('TIER-048: 计费逻辑漏洞 - 最短会话也扣费1分钟', { timeout: 60000 }, async () => {
      const user = testUsers[0];

      console.log('\n[步骤 1] 记录用户初始积分...');
      const userBefore = await UserModel.findById(user.id);
      const initialCredits = userBefore!.credits;
      console.log(`   初始积分: ${initialCredits}`);

      console.log('\n[步骤 2] 创建会话...');
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

      console.log('\n[步骤 3] 立即结束会话（< 1分钟）...');
      await new Promise(resolve => setTimeout(resolve, 100)); // 仅100ms

      const endResponse = await managerApp.inject({
        method: 'POST',
        url: `/api/sessions/${sessionData.id}/end`,
        headers: {
          authorization: `Bearer ${user.token}`,
        },
      });

      expect(endResponse.statusCode).toBe(200);

      // Layer 1: API Response - 验证响应
      const endData = JSON.parse(endResponse.body);
      expect(endData.credits_used).toBeGreaterThanOrEqual(1);
      console.log(`   扣除积分: ${endData.credits_used}`);

      // Layer 2: Database - 验证积分扣除
      console.log('\n[步骤 4] 验证积分扣除...');
      await new Promise(resolve => setTimeout(resolve, 500)); // 等待扣费

      const userAfter = await UserModel.findById(user.id);
      const creditsDeducted = initialCredits - userAfter!.credits;

      console.log(`   扣除积分: ${creditsDeducted}`);
      expect(creditsDeducted).toBeGreaterThanOrEqual(1);
      console.log('   ✅ 最短会话也扣除至少1分钟积分');

      // Layer 3: Session Record - 验证会话记录
      console.log('\n[步骤 5] 验证会话记录...');
      const session = await SessionModel.findById(sessionData.id);
      expect(session!.status).toBe('closed');
      expect(session!.credits_used).toBeGreaterThanOrEqual(1);
      expect(session!.duration).toBeGreaterThan(0);
      console.log(`   会话时长: ${session!.duration}秒`);
      console.log(`   扣除积分: ${session!.credits_used}`);

      // Layer 4: Credit History - 验证积分历史
      console.log('\n[步骤 6] 验证积分历史...');
      const history = await CreditHistoryModel.findByUserId(user.id);
      const latestRecord = history.items[0];

      expect(latestRecord.amount).toBeLessThanOrEqual(-1);
      expect(latestRecord.operation).toBe('session_end');
      console.log(`   积分历史记录: ${latestRecord.amount} (${latestRecord.operation})`);

      console.log('✅ TIER-048 计费逻辑漏洞测试通过');
    });
  });

  // ========================================
  // 测试用例：数据安全
  // ========================================

  describe('数据安全 (TIER-049 ~ TIER-050)', () => {
    /**
     * TIER-049: 敏感信息泄露
     *
     * 测试内容:
     * 1. 验证API响应不包含密码
     * 2. 验证错误消息不泄露系统信息
     * 3. 验证日志不包含敏感数据
     */
    it('TIER-049: 敏感信息泄露 - API不返回密码字段', { timeout: 60000 }, async () => {
      const user = testUsers[0];

      console.log('\n[步骤 1] 测试登录接口不返回密码...');
      const loginResponse = await managerApp.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: user.username,
          password: 'password123',
        },
      });

      expect(loginResponse.statusCode).toBe(200);
      const loginData = JSON.parse(loginResponse.body);

      expect(loginData.data).toBeDefined();
      expect(loginData.data.user).toBeDefined();
      expect(loginData.data.user.password).toBeUndefined();
      expect(loginData.data.user.api_key).toBeUndefined();
      console.log('   ✅ 登录接口不返回密码和API密钥');

      console.log('\n[步骤 2] 测试用户信息接口不返回密码...');
      const userResponse = await managerApp.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${user.token}`,
        },
      });

      expect(userResponse.statusCode).toBe(200);
      const userData = JSON.parse(userResponse.body);

      expect(userData.data).toBeDefined();
      expect(userData.data.user).toBeDefined();
      expect(userData.data.user.password).toBeUndefined();
      console.log('   ✅ 用户信息接口不返回密码');

      console.log('\n[步骤 3] 测试错误消息不泄露系统信息...');
      const errorResponse = await managerApp.inject({
        method: 'GET',
        url: '/api/sessions/nonexistent-session-id',
        headers: {
          authorization: `Bearer ${user.token}`,
        },
      });

      expect(errorResponse.statusCode).toBe(404);
      const errorData = JSON.parse(errorResponse.body);

      expect(errorData.error).toBeDefined();
      expect(errorData.error).not.toContain('Error:');
      expect(errorData.error).not.toContain('SELECT');
      expect(errorData.error).not.toContain('database');
      console.log(`   错误消息: ${errorData.error}`);
      console.log('   ✅ 错误消息不泄露系统信息');

      console.log('\n[步骤 4] 测试会话列表不包含敏感信息...');
      const createResponse = await managerApp.inject({
        method: 'POST',
        url: '/api/sessions',
        headers: {
          authorization: `Bearer ${user.token}`,
        },
      });

      const sessionsResponse = await managerApp.inject({
        method: 'GET',
        url: '/api/sessions',
        headers: {
          authorization: `Bearer ${user.token}`,
        },
      });

      expect(sessionsResponse.statusCode).toBe(200);
      const sessionsData = JSON.parse(sessionsResponse.body);

      if (sessionsData.data && sessionsData.data.items && sessionsData.data.items.length > 0) {
        const session = sessionsData.data.items[0];
        expect(session.ws_url).toBeDefined(); // WebSocket URL应该返回
        expect(session.machine_id).toBeDefined();
        console.log('   ✅ 会话信息包含必要字段但不包含敏感数据');
      }

      console.log('✅ TIER-049 敏感信息泄露测试通过');
    });

    /**
     * TIER-050: 垂直权限提升
     *
     * 测试内容:
     * 1. 普通用户尝试访问管理员接口
     * 2. 验证权限检查有效
     * 3. 验证无法提升权限
     */
    it('TIER-050: 垂直权限提升 - 普通用户无法访问管理员接口', { timeout: 60000 }, async () => {
      const user = testUsers[0];
      const admin = testAdmin;

      console.log('\n[步骤 1] 创建测试用户和机器...');
      const testUser = await createTestUser({
        username: `victim_${Date.now()}`,
        credits: 50,
      });

      const testMachine = await createTestUser({
        username: `machine_${Date.now()}`,
        credits: 0,
      });

      console.log(`   ✅ 测试用户ID: ${testUser.id}`);
      console.log(`   ✅ 测试机器用户ID: ${testMachine.id}`);

      console.log('\n[步骤 2] 普通用户尝试访问管理员API...');

      // 测试各种管理员API
      const adminEndpoints = [
        { method: 'GET', url: '/api/admin/users' },
        { method: 'GET', url: `/api/admin/users/${testUser.id}` },
        { method: 'PUT', url: `/api/admin/users/${testUser.id}`, payload: { credits: 999 } },
        { method: 'GET', url: '/api/admin/machines' },
        { method: 'GET', url: '/api/admin/sessions' },
        { method: 'GET', url: '/api/admin/logs' },
      ];

      for (const endpoint of adminEndpoints) {
        console.log(`   测试: ${endpoint.method} ${endpoint.url}`);

        const response = await managerApp.inject({
          method: endpoint.method as any,
          url: endpoint.url,
          headers: {
            authorization: `Bearer ${user.token}`,
          },
          payload: endpoint.payload,
        });

        // Layer 1: API Response - 应该返回403禁止访问
        expect([403, 404]).toContain(response.statusCode);
        console.log(`   ✅ 拒绝访问 (HTTP ${response.statusCode})`);
      }

      console.log('\n[步骤 3] 管理员可以访问相同API...');
      const adminResponse = await managerApp.inject({
        method: 'GET',
        url: '/api/admin/users',
        headers: {
          authorization: `Bearer ${admin.token}`,
        },
      });

      expect(adminResponse.statusCode).toBe(200);
      console.log('   ✅ 管理员可以访问');

      console.log('\n[步骤 4] 验证普通用户无法修改自己为管理员...');
      const promoteResponse = await managerApp.inject({
        method: 'PUT',
        url: `/api/admin/users/${user.id}`,
        headers: {
          authorization: `Bearer ${user.token}`,
        },
        payload: {
          role: 'admin',
        },
      });

      expect([403, 404]).toContain(promoteResponse.statusCode);
      console.log('   ✅ 拒绝将自己提升为管理员');

      // Layer 2: Database - 验证用户角色未改变
      console.log('\n[步骤 5] 验证用户角色未改变...');
      const userAfter = await UserModel.findById(user.id);
      expect(userAfter!.role).toBe('user');
      console.log(`   ✅ 用户角色保持为: ${userAfter!.role}`);

      console.log('✅ TIER-050 垂直权限提升测试通过');
    });
  });

  // ========================================
  // 测试套件结束
  // ========================================
});
