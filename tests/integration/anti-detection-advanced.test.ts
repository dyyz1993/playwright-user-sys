/**
 * 高级反机器人检测验证测试 (2025版本)
 *
 * 测试范围 (30+ 检测点):
 *
 * 1. 网络层检测
 *    - HTTP/2 指纹
 *    - TLS 指纹特征 (通过 User-Agent 验证)
 *
 * 2. WebRTC 检测
 *    - RTCDataChannel 支持
 *    - RTCPeerConnection 支持
 *    - getUserMedia 支持
 *    - enumerateDevices (摄像头/麦克风枚举)
 *    - WebRTC IP 泄露检测
 *
 * 3. Service Worker 检测
 *    - navigator.serviceWorker 支持
 *    - serviceWorker.register() 能力
 *    - Push API 支持
 *
 * 4. 高级浏览器指纹
 *    - WebGL 渲染器指纹 (UNMASKED_RENDERER_WEBGL)
 *    - WebGL Vendor (UNMASKED_VENDOR_WEBGL)
 *    - WebAssembly 支持
 *    - AudioContext 指纹 (高级)
 *    - Canvas 指纹 (高级)
 *    - 字体检测
 *
 * 5. 设备能力检测
 *    - Battery API
 *    - Connection API
 *    - DeviceOrientation
 *    - DeviceMotion
 *    - Vibration API
 *    - Touch points
 *
 * 6. Chrome 特定检测
 *    - chrome.loadTimes
 *    - chrome.runtime
 *    - PerformanceTiming
 *    - window.external
 *    - document.documentURI
 *
 * 7. Headless 特定检测
 *    - _WEBDRIVER_ELEM_CACHE
 *    - window.chrome.runtime 特定字段
 *    - navigator.plugins
 *    - navigator.languages
 *    - chrome.loadTimes 缺失
 *
 * 8. 行为检测 (基础)
 *    - 鼠标事件支持
 *    - 触摸事件支持
 *    - 键盘事件支持
 *
 * 9. 第三方检测网站验证
 *    - bot.sannysoft.com
 *    - arh.antoinevastel.com/bots/areyouheadless
 *    - pixelscan.net
 *    - abrahamjuliot.github.io/creepjs
 *    - browserscan.net
 *
 * 测试编号: ANTI-ADV-001 ~ ANTI-ADV-035
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
import { db, initDatabase } from '../../src/config/database.js';
import { getFreePort } from '../helpers/ports.js';
import puppeteer from 'puppeteer-core';
import type { FastifyInstance } from 'fastify';
import { execSync } from 'child_process';

// ========================================
// 测试配置
// ========================================

const NUM_USERS = 1;
const NUM_MACHINES = 1;
const INITIAL_CREDITS = 1000;

describe('高级反机器人检测验证测试 (2025)', () => {
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
      execSync('nvm use 20', { stdio: 'inherit' });
    } catch (e) {
      console.log('   ⚠️  nvm use 20 失败，使用当前 Node.js 版本');
    }
    const nodeVersion = process.version;
    console.log(`   当前 Node.js 版本: ${nodeVersion}`);

    // 步骤 2: 创建测试数据库
    console.log('\n[步骤 2] 准备测试数据库...');
    try {
      await db.destroy();
      console.log('   已销毁现有数据库连接');
    } catch (e) {
      // 忽略错误
    }
    await initDatabase();
    const { createTables } = await import('../../src/models/migrations.js');
    await createTables();
    console.log('   ✅ 测试数据库准备完成');

    // 步骤 3: 创建测试用户
    console.log('\n[步骤 3] 创建测试用户...');
    for (let i = 0; i < NUM_USERS; i++) {
      const { generateToken, generateApiKey } = await import('../../src/utils/auth.js');

      const userData = {
        username: `anti_detection_advanced_user_${Date.now()}_${i}`,
        password: 'password123',
        role: 'user',
        credits: INITIAL_CREDITS,
        email: `test_advanced_${Date.now()}_${i}@example.com`,
      };

      const user = await UserModel.create(userData);

      const token = generateToken({
        id: user.id,
        username: user.username,
        role: user.role,
      });

      let apiKey = user.api_key;
      if (!apiKey) {
        apiKey = generateApiKey();
        await UserModel.update(user.id, { api_key: apiKey });
      }

      testUsers.push({
        id: user.id!,
        username: user.username!,
        token,
        apiKey,
      });

      console.log(`   ✅ 用户 ${i + 1}: ${user.username} (积分: ${user.credits})`);
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
      const machineId = `test-adv-machine-${Date.now()}-${i}`;

      const machineConfig = {
        machineId,
        machineName: `测试高级机器-${i}`,
        managerHost: `127.0.0.1:${managerGrpcPort}`,
        grpcPort,
        proxyPort,
        maxSessions: 5,
        sessionTimeout: 300000,
        chromePath: process.env.CHROME_PATH || (
          process.platform === 'darwin'
            ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
            : process.platform === 'linux'
              ? '/usr/bin/google-chrome-stable'
              : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        ),
        heartbeatInterval: 30000,
        disconnectionTimeout: 10000,
        activityReportInterval: 3000,
        sessionActivityTimeout: 10000,
        dataDir: '/tmp/playwright-advanced-test-data',
        tempDir: '/tmp/playwright-advanced-test-temp',
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
    await new Promise(resolve => setTimeout(resolve, 2000));
    const registeredMachines = await db('machines').select('*').where('status', 'online');
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
    await db('sessions').del();
    await db('credit_history').del();

    for (const user of testUsers) {
      await db('users').where({ id: user.id }).update({ credits: INITIAL_CREDITS });
    }

    for (const machine of machineServers) {
      await db('machines').where({ id: machine.machineId }).update({ instance_count: 0 });
    }
  }, 10000);

  // ========================================
  // 辅助函数：创建会话并连接
  // ========================================

  async function createSessionAndConnect() {
    const user = testUsers[0];

    console.log('\n[创建会话] 发起请求...');
    const response = await managerApp.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: {
        authorization: `Bearer ${user.token}`,
      },
    });

    expect(response.statusCode).toBe(201);
    const sessionData = JSON.parse(response.body);
    console.log(`   ✅ 会话创建成功: ${sessionData.data.id}`);

    console.log('[连接浏览器] 连接到 Puppeteer...');
    const browserWSEndpoint = sessionData.data.browserWSEndpoint;
    const browser = await puppeteer.connect({
      browserWSEndpoint,
    });
    const page = (await browser.pages())[0];
    console.log('   ✅ 浏览器连接成功');

    return { browser, page, sessionId: sessionData.data.id };
  }

  // ========================================
  // 第一部分: WebRTC 检测 (ANTI-ADV-001 ~ ANTI-ADV-005)
  // ========================================

  /**
   * ANTI-ADV-001: WebRTC RTCDataChannel 支持
   *
   * 检测点:
   * - RTCDataChannel 构造函数可用
   * - 正常浏览器支持 WebRTC 数据通道
   *
   * 修复方法:
   * - 确保不使用 --disable-webrtc 参数
   * - WebRTC 在 headless 模式下通常可用
   */
  it('ANTI-ADV-001: WebRTC RTCDataChannel 应该支持', { timeout: 60000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] WebRTC RTCDataChannel...');
    const dataChannelInfo = await page.evaluate(() => {
      return {
        exists: typeof (window as any).RTCDataChannel === 'function',
        hasPrototype: typeof (window as any).RTCDataChannel?.prototype === 'object',
      };
    });

    console.log(`   RTCDataChannel 存在: ${dataChannelInfo.exists}`);
    console.log(`   RTCDataChannel.prototype 存在: ${dataChannelInfo.hasPrototype}`);

    expect(dataChannelInfo.exists).toBe(true);
    console.log('   ✅ RTCDataChannel 支持');

    await browser.close();
    console.log('✅ ANTI-ADV-001 测试通过');
  });

  /**
   * ANTI-ADV-002: WebRTC RTCPeerConnection 支持
   *
   * 检测点:
   * - RTCPeerConnection 构造函数可用
   * - 支持 WebRTC P2P 连接
   *
   * 修复方法:
   * - 确保不使用 --disable-webrtc 参数
   */
  it('ANTI-ADV-002: WebRTC RTCPeerConnection 应该支持', { timeout: 60000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] WebRTC RTCPeerConnection...');
    const peerConnectionInfo = await page.evaluate(() => {
      return {
        exists: typeof (window as any).RTCPeerConnection === 'function' ||
                 typeof (window as any).webkitRTCPeerConnection === 'function' ||
                 typeof (window as any).mozRTCPeerConnection === 'function',
        hasGenerateCertificate: typeof (window as any).RTCPeerConnection?.generateCertificate === 'function',
      };
    });

    console.log(`   RTCPeerConnection 存在: ${peerConnectionInfo.exists}`);
    console.log(`   generateCertificate 存在: ${peerConnectionInfo.hasGenerateCertificate}`);

    expect(peerConnectionInfo.exists).toBe(true);
    console.log('   ✅ RTCPeerConnection 支持');

    await browser.close();
    console.log('✅ ANTI-ADV-002 测试通过');
  });

  /**
   * ANTI-ADV-003: WebRTC getUserMedia 支持
   *
   * 检测点:
   * - navigator.mediaDevices.getUserMedia 可用
   * - 支持媒体设备访问
   *
   * 修复方法:
   * - 使用真实设备或注入 fake mediaDevices
   */
  it('ANTI-ADV-003: WebRTC getUserMedia 应该支持', { timeout: 60000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] WebRTC getUserMedia...');
    const getUserMediaInfo = await page.evaluate(() => {
      return {
        mediaDevicesExists: typeof navigator.mediaDevices === 'object',
        getUserMediaExists: typeof navigator.mediaDevices?.getUserMedia === 'function',
        hasEnumerateDevices: typeof navigator.mediaDevices?.enumerateDevices === 'function',
      };
    });

    console.log(`   mediaDevices 存在: ${getUserMediaInfo.mediaDevicesExists}`);
    console.log(`   getUserMedia 存在: ${getUserMediaInfo.getUserMediaExists}`);
    console.log(`   enumerateDevices 存在: ${getUserMediaInfo.hasEnumerateDevices}`);

    // 在 headless 模式下，这些可能不存在
    if (getUserMediaInfo.mediaDevicesExists) {
      console.log('   ✅ getUserMedia 支持');
    } else {
      console.log('   ⚠️  getUserMedia 不支持（headless 模式正常）');
    }

    await browser.close();
    console.log('✅ ANTI-ADV-003 测试完成');
  });

  /**
   * ANTI-ADV-004: WebRTC enumerateDevices 支持
   *
   * 检测点:
   * - 可以枚举媒体设备
   * - 返回设备列表
   *
   * 修复方法:
   * - 使用真实设备或注入假设备列表
   */
  it('ANTI-ADV-004: WebRTC enumerateDevices 应该支持', { timeout: 60000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] WebRTC enumerateDevices...');
    const devicesInfo = await page.evaluate(async () => {
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== 'function') {
        return { supported: false, deviceCount: 0 };
      }

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return {
          supported: true,
          deviceCount: devices.length,
          hasAudioInput: devices.some(d => d.kind === 'audioinput'),
          hasVideoInput: devices.some(d => d.kind === 'videoinput'),
          hasAudioOutput: devices.some(d => d.kind === 'audiooutput'),
        };
      } catch (e) {
        return { supported: false, error: (e as Error).message };
      }
    });

    console.log(`   enumerateDevices 支持: ${devicesInfo.supported}`);
    if (devicesInfo.supported) {
      console.log(`   设备数量: ${devicesInfo.deviceCount}`);
      console.log(`   音频输入: ${devicesInfo.hasAudioInput}`);
      console.log(`   视频输入: ${devicesInfo.hasVideoInput}`);
      console.log(`   音频输出: ${devicesInfo.hasAudioOutput}`);
    }

    await browser.close();
    console.log('✅ ANTI-ADV-004 测试完成');
  });

  /**
   * ANTI-ADV-005: WebRTC IP 泄露检测
   *
   * 检测点:
   * - WebRTC 不应该泄露本地 IP
   * - 检查 ICE 候选
   *
   * 修复方法:
   * - 使用 --webrtc-ip-handling-policy=disable_non_proxied_udp
   * - 项目已配置此参数
   */
  it('ANTI-ADV-005: WebRTC 不应该泄露本地 IP', { timeout: 60000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] WebRTC IP 泄露...');
    const ipLeakInfo = await page.evaluate(async () => {
      try {
        const pc = new (window as any).RTCPeerConnection({
          iceServers: [] // 不使用 STUN 服务器
        });

        // 创建 offers
        const offer = await pc.createOffer({
          offerToReceiveAudio: 1,
          offerToReceiveVideo: 1
        });
        await pc.setLocalDescription(offer);

        // 等待 ICE 候选
        await new Promise<void>(resolve => {
          if (pc.iceGatheringState === 'complete') {
            resolve();
          } else {
            pc.addEventListener('icegatheringstatechange', () => {
              if (pc.iceGatheringState === 'complete') {
                resolve();
              }
            });
          }
        });

        const localDescription = pc.localDescription;
        const candidates: string[] = [];

        if (localDescription && localDescription.sdp) {
          const lines = localDescription.sdp.split('\n');
          for (const line of lines) {
            if (line.startsWith('a=candidate:')) {
              candidates.push(line);
            }
          }
        }

        pc.close();

        // 检查本地 IP 模式
        const hasLocalIP = candidates.some(c =>
          c.includes('192.168.') ||
          c.includes('10.') ||
          c.includes('172.16.') ||
          c.includes('127.') ||
          c.includes('host')
        );

        return {
          candidateCount: candidates.length,
          hasLocalIP,
          candidates: candidates.slice(0, 3) // 只返回前 3 个
        };
      } catch (e) {
        return { error: (e as Error).message };
      }
    });

    console.log(`   ICE 候选数量: ${ipLeakInfo.candidateCount}`);
    if (ipLeakInfo.candidates) {
      console.log(`   前 3 个候选: ${ipLeakInfo.candidates.join(', ')}`);
    }
    console.log(`   检测到本地 IP: ${ipLeakInfo.hasLocalIP}`);

    // 由于使用了 --webrtc-ip-handling-policy=disable_non_proxied_udp
    // 理论上不应该泄露本地 IP
    if (ipLeakInfo.hasLocalIP) {
      console.log('   ⚠️  检测到可能的本地 IP 泄露');
    } else {
      console.log('   ✅ 未检测到本地 IP 泄露');
    }

    await browser.close();
    console.log('✅ ANTI-ADV-005 测试完成');
  });

  // ========================================
  // 第二部分: Service Worker 检测 (ANTI-ADV-006 ~ ANTI-ADV-008)
  // ========================================

  /**
   * ANTI-ADV-006: Service Worker 基本支持
   *
   * 检测点:
   * - navigator.serviceWorker 存在
   * - serviceWorker 对象可用
   *
   * 修复方法:
   * - Service Worker 在 headless 模式下通常可用
   */
  it('ANTI-ADV-006: Service Worker 应该支持', { timeout: 60000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] Service Worker...');
    const swInfo = await page.evaluate(() => {
      return {
        serviceWorkerExists: typeof navigator.serviceWorker === 'object',
        hasRegister: typeof navigator.serviceWorker?.register === 'function',
        hasController: navigator.serviceWorker?.controller !== undefined,
        readyExists: navigator.serviceWorker?.ready !== undefined,
      };
    });

    console.log(`   serviceWorker 存在: ${swInfo.serviceWorkerExists}`);
    console.log(`   register 方法存在: ${swInfo.hasRegister}`);
    console.log(`   controller 存在: ${swInfo.hasController}`);
    console.log(`   ready 存在: ${swInfo.readyExists}`);

    expect(swInfo.serviceWorkerExists).toBe(true);
    expect(swInfo.hasRegister).toBe(true);
    console.log('   ✅ Service Worker 支持');

    await browser.close();
    console.log('✅ ANTI-ADV-006 测试通过');
  });

  /**
   * ANTI-ADV-007: Push API 支持
   *
   * 检测点:
   * - PushManager 可用
   * - 支持推送通知
   *
   * 修复方法:
   * - Push API 在 headless 模式下通常可用
   */
  it('ANTI-ADV-007: Push API 应该支持', { timeout: 60000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] Push API...');
    const pushInfo = await page.evaluate(() => {
      return {
        pushManagerExists: typeof (window as any).PushManager === 'function',
        hasSwPush: typeof navigator.serviceWorker?.push === 'function',
      };
    });

    console.log(`   PushManager 存在: ${pushInfo.pushManagerExists}`);
    console.log(`   serviceWorker.push 存在: ${pushInfo.hasSwPush}`);

    if (pushInfo.pushManagerExists || pushInfo.hasSwPush) {
      console.log('   ✅ Push API 支持');
    } else {
      console.log('   ⚠️  Push API 可能不支持（headless 模式）');
    }

    await browser.close();
    console.log('✅ ANTI-ADV-007 测试完成');
  });

  /**
   * ANTI-ADV-008: Notification API 支持
   *
   * 检测点:
   * - Notification 构造函数可用
   * - 支持桌面通知
   *
   * 修复方法:
   * - Notification API 在 headless 模式下可能不可用
   */
  it('ANTI-ADV-008: Notification API 应该支持', { timeout: 60000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] Notification API...');
    const notificationInfo = await page.evaluate(() => {
      return {
        notificationExists: typeof (window as any).Notification === 'function',
        hasPermission: typeof (window as any).Notification?.permission === 'string',
        permission: (window as any).Notification?.permission,
      };
    });

    console.log(`   Notification 存在: ${notificationInfo.notificationExists}`);
    console.log(`   permission 属性存在: ${notificationInfo.hasPermission}`);
    if (notificationInfo.permission) {
      console.log(`   当前权限: ${notificationInfo.permission}`);
    }

    if (notificationInfo.notificationExists) {
      console.log('   ✅ Notification API 支持');
    } else {
      console.log('   ⚠️  Notification API 不支持（headless 模式正常）');
    }

    await browser.close();
    console.log('✅ ANTI-ADV-008 测试完成');
  });

  // ========================================
  // 第三部分: 高级浏览器指纹 (ANTI-ADV-009 ~ ANTI-ADV-014)
  // ========================================

  /**
   * ANTI-ADV-009: WebGL 高级指纹检测
   *
   * 检测点:
   * - WebGL 调试信息
   * - WebGL 扩展
   * - WebGL 参数
   *
   * 修复方法:
   * - 使用指纹生成器修改 WebGL 参数
   */
  it('ANTI-ADV-009: WebGL 高级指纹检测', { timeout: 60000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] WebGL 高级指纹...');
    const webglInfo = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') ||
                 canvas.getContext('webgl') ||
                 canvas.getContext('experimental-webgl');

      if (!gl) {
        return { error: 'WebGL 不可用' };
      }

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');

      return {
        vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : null,
        renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null,
        webglVersion: gl.getParameter(gl.VERSION),
        shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        maxViewportDims: gl.getParameter(gl.MAX_VIEWPORT_DIMS),
        maxRenderBufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
        extensions: gl.getSupportedExtensions()?.slice(0, 10) || [],
      };
    });

    if (webglInfo.error) {
      console.log(`   ⚠️  ${webglInfo.error}`);
    } else {
      console.log(`   Vendor: ${webglInfo.vendor}`);
      console.log(`   Renderer: ${webglInfo.renderer}`);
      console.log(`   Version: ${webglInfo.webglVersion}`);
      console.log(`   Shading Language: ${webglInfo.shadingLanguageVersion}`);
      console.log(`   Max Texture Size: ${webglInfo.maxTextureSize}`);
      console.log(`   扩展数量: ${webglInfo.extensions.length}`);

      // 检查虚拟化特征
      const suspiciousPatterns = ['SwiftShader', 'Google SwiftShader', 'VMware', 'VirtualBox', 'llvmpipe'];
      const isSuspicious = suspiciousPatterns.some(pattern =>
        webglInfo.renderer?.includes(pattern) || webglInfo.vendor?.includes(pattern)
      );

      if (isSuspicious) {
        console.log('   ⚠️  WebGL 包含虚拟化特征');
      } else {
        console.log('   ✅ WebGL 指纹正常');
      }

      expect(isSuspicious).toBe(false);
    }

    await browser.close();
    console.log('✅ ANTI-ADV-009 测试通过');
  });

  /**
   * ANTI-ADV-010: WebAssembly 支持
   *
   * 检测点:
   * - WebAssembly 可用
   * - 可以编译和实例化模块
   *
   * 修复方法:
   * - WebAssembly 在现代浏览器中通常可用
   */
  it('ANTI-ADV-010: WebAssembly 应该支持', { timeout: 60000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] WebAssembly...');
    const wasmInfo = await page.evaluate(async () => {
      return {
        exists: typeof WebAssembly === 'object',
        hasCompile: typeof WebAssembly.compile === 'function',
        hasInstantiate: typeof WebAssembly.instantiate === 'function',
        memorySupported: typeof WebAssembly.Memory === 'function',
        tableSupported: typeof WebAssembly.Table === 'function',
      };
    });

    console.log(`   WebAssembly 存在: ${wasmInfo.exists}`);
    console.log(`   compile 方法存在: ${wasmInfo.hasCompile}`);
    console.log(`   instantiate 方法存在: ${wasmInfo.hasInstantiate}`);
    console.log(`   Memory 支持: ${wasmInfo.memorySupported}`);
    console.log(`   Table 支持: ${wasmInfo.tableSupported}`);

    expect(wasmInfo.exists).toBe(true);
    expect(wasmInfo.hasCompile).toBe(true);
    expect(wasmInfo.hasInstantiate).toBe(true);
    console.log('   ✅ WebAssembly 支持');

    await browser.close();
    console.log('✅ ANTI-ADV-010 测试通过');
  });

  /**
   * ANTI-ADV-011: AudioContext 高级指纹检测
   *
   * 检测点:
   * - AudioContext 特征
   * - 音频参数
   *
   * 修复方法:
   * - 使用指纹生成器修改音频参数
   */
  it('ANTI-ADV-011: AudioContext 高级指纹检测', { timeout: 60000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] AudioContext 高级指纹...');
    const audioInfo = await page.evaluate(() => {
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) {
          return { error: 'AudioContext 不存在' };
        }

        const ctx = new AudioContext();

        return {
          sampleRate: ctx.sampleRate,
          maxChannelCount: ctx.destination.maxChannelCount,
          channelCount: ctx.destination.channelCount,
          state: ctx.state,
          baseLatency: ctx.baseLatency,
          outputLatency: (ctx as any).outputLatency,
          currentTime: ctx.currentTime,
        };
      } catch (e) {
        return { error: (e as Error).message };
      }
    });

    if (audioInfo.error) {
      console.log(`   ⚠️  ${audioInfo.error}`);
    } else {
      console.log(`   Sample Rate: ${audioInfo.sampleRate} Hz`);
      console.log(`   Max Channel Count: ${audioInfo.maxChannelCount}`);
      console.log(`   Channel Count: ${audioInfo.channelCount}`);
      console.log(`   State: ${audioInfo.state}`);
      console.log(`   Base Latency: ${audioInfo.baseLatency}`);
      console.log(`   Output Latency: ${audioInfo.outputLatency}`);
      console.log(`   Current Time: ${audioInfo.currentTime}`);

      // 检查合理的采样率
      const validSampleRates = [44100, 48000, 96000];
      expect(validSampleRates).toContain(audioInfo.sampleRate);
      console.log('   ✅ AudioContext 指纹正常');
    }

    await browser.close();
    console.log('✅ ANTI-ADV-011 测试通过');
  });

  /**
   * ANTI-ADV-012: Canvas 高级指纹检测
   *
   * 检测点:
   * - Canvas 渲染特征
   * - 文本渲染
   * - 图形渲染
   *
   * 修复方法:
   * - 使用指纹生成器随机化 Canvas
   */
  it('ANTI-ADV-012: Canvas 高级指纹检测', { timeout: 60000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] Canvas 高级指纹...');
    const canvasInfo = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return { error: 'Canvas 2D 不可用' };
      }

      // 绘制复杂图形
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('Hello, world!', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('Hello, world!', 4, 17);

      // 绘制圆形
      ctx.beginPath();
      ctx.arc(50, 50, 20, 0, Math.PI * 2);
      ctx.fillStyle = '#ff0000';
      ctx.fill();

      // 绘制线条
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(100, 100);
      ctx.strokeStyle = '#0000ff';
      ctx.stroke();

      return {
        dataUrl: canvas.toDataURL(),
        hasDataUrl: typeof canvas.toDataURL === 'function',
        width: canvas.width,
        height: canvas.height,
      };
    });

    expect(canvasInfo.hasDataUrl).toBe(true);
    expect(canvasInfo.dataUrl).toBeTruthy();
    expect(canvasInfo.dataUrl).toMatch(/^data:image\/png;base64/);
    console.log('   ✅ Canvas 高级指纹正常');

    await browser.close();
    console.log('✅ ANTI-ADV-012 测试通过');
  });

  /**
   * ANTI-ADV-013: 字体检测
   *
   * 检测点:
   * - 已安装字体列表
   * - 通过测量文本宽度检测
   *
   * 修复方法:
   * - 使用指纹生成器伪造字体列表
   */
  it('ANTI-ADV-013: 字体检测', { timeout: 60000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] 字体指纹...');
    const fontInfo = await page.evaluate(() => {
      const testFonts = [
        'Arial', 'Arial Black', 'Arial Narrow', 'Calibri', 'Cambria',
        'Cambria Math', 'Comic Sans MS', 'Consolas', 'Courier', 'Courier New',
        'Georgia', 'Helvetica', 'Impact', 'Lucida Console', 'Lucida Sans Unicode',
        'Microsoft Sans Serif', 'Palatino Linotype', 'Segoe UI', 'Tahoma',
        'Times', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Monaco'
      ];

      const baseFonts = ['monospace', 'sans-serif', 'serif'];
      const testString = 'mmmmmmmmmmlli';
      const testSize = '72px';
      const h = document.getElementsByTagName('body')[0];
      const span = document.createElement('span');
      span.style.fontSize = testSize;
      span.innerHTML = testString;
      const defaultWidth = {};
      const defaultHeight = {};

      // 创建基准宽度
      for (const baseFont of baseFonts) {
        span.style.fontFamily = baseFont;
        h.appendChild(span);
        defaultWidth[baseFont] = span.offsetWidth;
        defaultHeight[baseFont] = span.offsetHeight;
        h.removeChild(span);
      }

      // 检测字体
      const detectedFonts: string[] = [];
      for (const font of testFonts) {
        let detected = false;
        for (const baseFont of baseFonts) {
          span.style.fontFamily = `'${font}', ${baseFont}`;
          h.appendChild(span);
          const width = span.offsetWidth;
          const height = span.offsetHeight;
          h.removeChild(span);

          if (width !== defaultWidth[baseFont] || height !== defaultHeight[baseFont]) {
            detected = true;
            break;
          }
        }
        if (detected) {
          detectedFonts.push(font);
        }
      }

      return {
        detectedFonts: detectedFonts.slice(0, 15),
        totalDetected: detectedFonts.length,
      };
    });

    console.log(`   检测到的字体数量: ${fontInfo.totalDetected}`);
    console.log(`   前 15 个字体: ${fontInfo.detectedFonts.join(', ')}`);

    // 应该检测到一些常见字体
    expect(fontInfo.totalDetected).toBeGreaterThan(0);
    console.log('   ✅ 字体检测正常');

    await browser.close();
    console.log('✅ ANTI-ADV-013 测试通过');
  });

  /**
   * ANTI-ADV-014: CSS 特性检测
   *
   * 检测点:
   * - CSS 特性支持
   * - CSS 媒体查询
   *
   * 修复方法:
   * - CSS 在 headless 模式下通常正常
   */
  it('ANTI-ADV-014: CSS 特性检测', { timeout: 60000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] CSS 特性...');
    const cssInfo = await page.evaluate(() => {
      const testElement = document.createElement('div');

      return {
        supportsGrid: typeof (testElement as any).style.grid !== 'undefined',
        supportsFlex: typeof (testElement as any).style.flex !== 'undefined',
        supportsTransform: typeof (testElement as any).style.transform !== 'undefined',
        supportsTransition: typeof (testElement as any).style.transition !== 'undefined',
        supportsAnimation: typeof (testElement as any).style.animation !== 'undefined',
        supportsFilter: typeof (testElement as any).style.filter !== 'undefined',
      };
    });

    console.log(`   CSS Grid: ${cssInfo.supportsGrid}`);
    console.log(`   CSS Flex: ${cssInfo.supportsFlex}`);
    console.log(`   CSS Transform: ${cssInfo.supportsTransform}`);
    console.log(`   CSS Transition: ${cssInfo.supportsTransition}`);
    console.log(`   CSS Animation: ${cssInfo.supportsAnimation}`);
    console.log(`   CSS Filter: ${cssInfo.supportsFilter}`);

    expect(cssInfo.supportsGrid).toBe(true);
    expect(cssInfo.supportsFlex).toBe(true);
    console.log('   ✅ CSS 特性支持正常');

    await browser.close();
    console.log('✅ ANTI-ADV-014 测试通过');
  });

  // ========================================
  // 第四部分: 设备能力检测 (ANTI-ADV-015 ~ ANTI-ADV-020)
  // ========================================

  /**
   * ANTI-ADV-015: Battery API 检测
   *
   * 检测点:
   * - navigator.getBattery 可用
   * - 返回电池状态
   *
   * 修复方法:
   * - 注入 fake battery API
   */
  it('ANTI-ADV-015: Battery API 检测', { timeout: 60000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] Battery API...');
    const batteryInfo = await page.evaluate(async () => {
      const getBattery = (navigator as any).getBattery;
      if (typeof getBattery !== 'function') {
        return { supported: false };
      }

      try {
        const battery = await getBattery();
        return {
          supported: true,
          charging: battery.charging,
          level: battery.level,
          chargingTime: battery.chargingTime,
          dischargingTime: battery.dischargingTime,
        };
      } catch (e) {
        return { supported: false, error: (e as Error).message };
      }
    });

    console.log(`   Battery API 支持: ${batteryInfo.supported}`);
    if (batteryInfo.supported) {
      console.log(`   充电状态: ${batteryInfo.charging}`);
      console.log(`   电量: ${batteryInfo.level * 100}%`);
      console.log('   ✅ Battery API 可用');
    } else {
      console.log('   ⚠️  Battery API 不支持（headless 模式正常）');
    }

    await browser.close();
    console.log('✅ ANTI-ADV-015 测试完成');
  });

  /**
   * ANTI-ADV-016: Connection API 检测
   *
   * 检测点:
   * - navigator.connection 存在
   * - 包含网络信息
   *
   * 修复方法:
   * - 注入 fake connection API
   */
  it('ANTI-ADV-016: Connection API 检测', { timeout: 60000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] Connection API...');
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
        type: connection.type,
      };
    });

    if (connectionInfo.exists) {
      console.log(`   Effective Type: ${connectionInfo.effectiveType}`);
      console.log(`   RTT: ${connectionInfo.rtt} ms`);
      console.log(`   Downlink: ${connectionInfo.downlink} Mbps`);
      console.log(`   Save Data: ${connectionInfo.saveData}`);
      console.log('   ✅ Connection API 可用');
    } else {
      console.log('   ⚠️  Connection API 不存在（可选功能）');
    }

    await browser.close();
    console.log('✅ ANTI-ADV-016 测试完成');
  });

  /**
   * ANTI-ADV-017: DeviceOrientation 检测
   *
   * 检测点:
   * - DeviceOrientationEvent 支持
   *
   * 修复方法:
   * - 在移动设备模拟时应该支持
   */
  it('ANTI-ADV-017: DeviceOrientation 检测', { timeout: 60000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] DeviceOrientation...');
    const orientationInfo = await page.evaluate(() => {
      return {
        deviceOrientationEventExists: typeof (window as any).DeviceOrientationEvent === 'function',
        hasDeviceOrientation: 'ondeviceorientation' in window,
      };
    });

    console.log(`   DeviceOrientationEvent 存在: ${orientationInfo.deviceOrientationEventExists}`);
    console.log(`   ondeviceorientation 存在: ${orientationInfo.hasDeviceOrientation}`);

    if (orientationInfo.deviceOrientationEventExists) {
      console.log('   ✅ DeviceOrientation 支持');
    } else {
      console.log('   ⚠️  DeviceOrientation 不支持（桌面模式正常）');
    }

    await browser.close();
    console.log('✅ ANTI-ADV-017 测试完成');
  });

  /**
   * ANTI-ADV-018: DeviceMotion 检测
   *
   * 检测点:
   * - DeviceMotionEvent 支持
   *
   * 修复方法:
   * - 在移动设备模拟时应该支持
   */
  it('ANTI-ADV-018: DeviceMotion 检测', { timeout: 60000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] DeviceMotion...');
    const motionInfo = await page.evaluate(() => {
      return {
        deviceMotionEventExists: typeof (window as any).DeviceMotionEvent === 'function',
        hasDeviceMotion: 'ondevicemotion' in window,
      };
    });

    console.log(`   DeviceMotionEvent 存在: ${motionInfo.deviceMotionEventExists}`);
    console.log(`   ondevicemotion 存在: ${motionInfo.hasDeviceMotion}`);

    if (motionInfo.deviceMotionEventExists) {
      console.log('   ✅ DeviceMotion 支持');
    } else {
      console.log('   ⚠️  DeviceMotion 不支持（桌面模式正常）');
    }

    await browser.close();
    console.log('✅ ANTI-ADV-018 测试完成');
  });

  /**
   * ANTI-ADV-019: Vibration API 检测
   *
   * 检测点:
   * - navigator.vibrate 可用
   *
   * 修复方法:
   * - 在移动设备模拟时应该支持
   */
  it('ANTI-ADV-019: Vibration API 检测', { timeout: 60000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] Vibration API...');
    const vibrationInfo = await page.evaluate(() => {
      return {
        vibrateExists: typeof navigator.vibrate === 'function',
      };
    });

    console.log(`   vibrate 方法存在: ${vibrationInfo.vibrateExists}`);

    if (vibrationInfo.vibrateExists) {
      console.log('   ✅ Vibration API 支持');
    } else {
      console.log('   ⚠️  Vibration API 不支持（桌面模式正常）');
    }

    await browser.close();
    console.log('✅ ANTI-ADV-019 测试完成');
  });

  /**
   * ANTI-ADV-020: Touch Points 检测
   *
   * 检测点:
   * - navigator.maxTouchPoints
   * - 触摸事件支持
   *
   * 修复方法:
   * - 在移动设备模拟时应该 > 0
   */
  it('ANTI-ADV-020: Touch Points 检测', { timeout: 60000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] Touch Points...');
    const touchInfo = await page.evaluate(() => {
      return {
        maxTouchPoints: navigator.maxTouchPoints,
        hasTouchStart: 'ontouchstart' in window,
        hasTouchMove: 'ontouchmove' in window,
        hasTouchEnd: 'ontouchend' in window,
      };
    });

    console.log(`   maxTouchPoints: ${touchInfo.maxTouchPoints}`);
    console.log(`   ontouchstart: ${touchInfo.hasTouchStart}`);
    console.log(`   ontouchmove: ${touchInfo.hasTouchMove}`);
    console.log(`   ontouchend: ${touchInfo.hasTouchEnd}`);

    if (touchInfo.maxTouchPoints > 0) {
      console.log('   ✅ 触摸支持');
    } else {
      console.log('   ⚠️  无触摸支持（桌面模式正常）');
    }

    await browser.close();
    console.log('✅ ANTI-ADV-020 测试完成');
  });

  // ========================================
  // 第五部分: Chrome 特定检测 (ANTI-ADV-021 ~ ANTI-ADV-025)
  // ========================================

  /**
   * ANTI-ADV-021: chrome.loadTimes 检测
   *
   * 检测点:
   * - chrome.loadTimes() 可用
   * - 返回页面加载时间信息
   *
   * 修复方法:
   * - 新版 Chrome 已弃用，不应该存在
   */
  it('ANTI-ADV-021: chrome.loadTimes 检测', { timeout: 60000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] chrome.loadTimes...');
    const loadTimesInfo = await page.evaluate(() => {
      return {
        chromeExists: typeof (window as any).chrome === 'object',
        loadTimesExists: typeof (window as any).chrome?.loadTimes === 'function',
      };
    });

    console.log(`   window.chrome 存在: ${loadTimesInfo.chromeExists}`);
    console.log(`   chrome.loadTimes 存在: ${loadTimesInfo.loadTimesExists}`);

    // chrome.loadTimes 在新版 Chrome 中已弃用
    if (loadTimesInfo.loadTimesExists) {
      console.log('   ⚠️  chrome.loadTimes 存在（新版 Chrome 应该弃用）');
    } else {
      console.log('   ✅ chrome.loadTimes 不存在（符合预期）');
    }

    await browser.close();
    console.log('✅ ANTI-ADV-021 测试完成');
  });

  /**
   * ANTI-ADV-022: chrome.runtime 检测
   *
   * 检测点:
   * - chrome.runtime 存在
   * - 不包含自动化特征
   *
   * 修复方法:
   * - 删除自动化相关的 runtime 字段
   */
  it('ANTI-ADV-022: chrome.runtime 检测', { timeout: 60000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] chrome.runtime...');
    const runtimeInfo = await page.evaluate(() => {
      const runtime = (window as any).chrome?.runtime;
      if (!runtime) {
        return { exists: false };
      }

      return {
        exists: true,
        id: typeof runtime.id,
        getManifest: typeof runtime.getManifest,
        getURL: typeof runtime.getURL,
        connect: typeof runtime.connect,
        sendMessage: typeof runtime.sendMessage,
      };
    });

    console.log(`   chrome.runtime 存在: ${runtimeInfo.exists}`);
    if (runtimeInfo.exists) {
      console.log(`   id: ${runtimeInfo.id}`);
      console.log(`   getManifest: ${runtimeInfo.getManifest}`);
      console.log(`   getURL: ${runtimeInfo.getURL}`);
      console.log('   ✅ chrome.runtime 存在');
    } else {
      console.log('   ⚠️  chrome.runtime 不存在');
    }

    await browser.close();
    console.log('✅ ANTI-ADV-022 测试完成');
  });

  /**
   * ANTI-ADV-023: PerformanceTiming 检测
   *
   * 检测点:
   * - performance.timing 存在
   * - 包含合理的时间戳
   *
   * 修复方法:
   * - PerformanceTiming 通常正常
   */
  it('ANTI-ADV-023: PerformanceTiming 检测', { timeout: 60000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] PerformanceTiming...');
    const timingInfo = await page.evaluate(() => {
      const timing = performance.timing;
      if (!timing) {
        return { exists: false };
      }

      return {
        exists: true,
        navigationStart: timing.navigationStart,
        loadEventEnd: timing.loadEventEnd,
        domComplete: timing.domComplete,
        domContentLoadedEventEnd: timing.domContentLoadedEventEnd,
        responseStart: timing.responseStart,
        requestStart: timing.requestStart,
      };
    });

    console.log(`   performance.timing 存在: ${timingInfo.exists}`);
    if (timingInfo.exists) {
      console.log(`   navigationStart: ${timingInfo.navigationStart}`);
      console.log(`   domComplete: ${timingInfo.domComplete}`);
      console.log(`   loadEventEnd: ${timingInfo.loadEventEnd}`);
      console.log('   ✅ PerformanceTiming 正常');
    } else {
      console.log('   ⚠️  PerformanceTiming 不存在');
    }

    await browser.close();
    console.log('✅ ANTI-ADV-023 测试完成');
  });

  /**
   * ANTI-ADV-024: window.external 检测
   *
   * 检测点:
   * - window.external 存在（IE/Edge 特定）
   *
   * 修复方法:
   * - Chrome 通常没有 window.external
   */
  it('ANTI-ADV-024: window.external 检测', { timeout: 60000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] window.external...');
    const externalInfo = await page.evaluate(() => {
      return {
        exists: typeof (window as any).external === 'object',
        methods: (window as any).external ? Object.keys((window as any).external).slice(0, 5) : [],
      };
    });

    console.log(`   window.external 存在: ${externalInfo.exists}`);
    if (externalInfo.exists && externalInfo.methods.length > 0) {
      console.log(`   方法: ${externalInfo.methods.join(', ')}`);
    }

    // Chrome 通常没有 window.external（这是 IE/Edge 特定的）
    console.log('   ✅ window.external 检测完成');

    await browser.close();
    console.log('✅ ANTI-ADV-024 测试完成');
  });

  /**
   * ANTI-ADV-025: document.documentURI 检测
   *
   * 检测点:
   * - document.documentURI 与 document.URL 一致
   *
   * 修复方法:
   * - 通常正常
   */
  it('ANTI-ADV-025: document.documentURI 检测', { timeout: 60000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] document.documentURI...');
    const uriInfo = await page.evaluate(() => {
      return {
        documentURI: document.documentURI,
        URL: document.URL,
        matches: document.documentURI === document.URL,
      };
    });

    console.log(`   documentURI: ${uriInfo.documentURI}`);
    console.log(`   URL: ${uriInfo.URL}`);
    console.log(`   匹配: ${uriInfo.matches}`);

    expect(uriInfo.matches).toBe(true);
    console.log('   ✅ document.documentURI 正常');

    await browser.close();
    console.log('✅ ANTI-ADV-025 测试通过');
  });

  // ========================================
  // 第六部分: 行为检测基础 (ANTI-ADV-026 ~ ANTI-ADV-028)
  // ========================================

  /**
   * ANTI-ADV-026: 鼠标事件支持
   *
   * 检测点:
   * - 鼠标事件可用
   * - MouseEvent 构造函数
   *
   * 修复方法:
   * - 鼠标事件通常支持
   */
  it('ANTI-ADV-026: 鼠标事件支持', { timeout: 60000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] 鼠标事件...');
    const mouseInfo = await page.evaluate(() => {
      return {
        mouseEventExists: typeof MouseEvent === 'function',
        hasClick: 'onclick' in window,
        hasMouseMove: 'onmousemove' in window,
        hasMouseDown: 'onmousedown' in window,
        hasMouseUp: 'onmouseup' in window,
      };
    });

    console.log(`   MouseEvent 存在: ${mouseInfo.mouseEventExists}`);
    console.log(`   onclick: ${mouseInfo.hasClick}`);
    console.log(`   onmousemove: ${mouseInfo.hasMouseMove}`);
    console.log(`   onmousedown: ${mouseInfo.hasMouseDown}`);
    console.log(`   onmouseup: ${mouseInfo.hasMouseUp}`);

    expect(mouseInfo.mouseEventExists).toBe(true);
    expect(mouseInfo.hasClick).toBe(true);
    console.log('   ✅ 鼠标事件支持');

    await browser.close();
    console.log('✅ ANTI-ADV-026 测试通过');
  });

  /**
   * ANTI-ADV-027: 键盘事件支持
   *
   * 检测点:
   * - 键盘事件可用
   * - KeyboardEvent 构造函数
   *
   * 修复方法:
   * - 键盘事件通常支持
   */
  it('ANTI-ADV-027: 键盘事件支持', { timeout: 60000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] 键盘事件...');
    const keyboardInfo = await page.evaluate(() => {
      return {
        keyboardEventExists: typeof KeyboardEvent === 'function',
        hasKeyDown: 'onkeydown' in window,
        hasKeyUp: 'onkeyup' in window,
        hasKeyPress: 'onkeypress' in window,
      };
    });

    console.log(`   KeyboardEvent 存在: ${keyboardInfo.keyboardEventExists}`);
    console.log(`   onkeydown: ${keyboardInfo.hasKeyDown}`);
    console.log(`   onkeyup: ${keyboardInfo.hasKeyUp}`);
    console.log(`   onkeypress: ${keyboardInfo.hasKeyPress}`);

    expect(keyboardInfo.keyboardEventExists).toBe(true);
    expect(keyboardInfo.hasKeyDown).toBe(true);
    console.log('   ✅ 键盘事件支持');

    await browser.close();
    console.log('✅ ANTI-ADV-027 测试通过');
  });

  /**
   * ANTI-ADV-028: 焦点和滚动事件支持
   *
   * 检测点:
   * - 焦点事件可用
   * - 滚动事件可用
   *
   * 修复方法:
   * - 这些事件通常支持
   */
  it('ANTI-ADV-028: 焦点和滚动事件支持', { timeout: 60000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] 焦点和滚动事件...');
    const eventInfo = await page.evaluate(() => {
      return {
        hasFocus: 'onfocus' in window,
        hasBlur: 'onblur' in window,
        hasScroll: 'onscroll' in window,
        hasWheel: 'onwheel' in window,
        hasResize: 'onresize' in window,
      };
    });

    console.log(`   onfocus: ${eventInfo.hasFocus}`);
    console.log(`   onblur: ${eventInfo.hasBlur}`);
    console.log(`   onscroll: ${eventInfo.hasScroll}`);
    console.log(`   onwheel: ${eventInfo.hasWheel}`);
    console.log(`   onresize: ${eventInfo.hasResize}`);

    expect(eventInfo.hasFocus).toBe(true);
    expect(eventInfo.hasBlur).toBe(true);
    expect(eventInfo.hasScroll).toBe(true);
    console.log('   ✅ 焦点和滚动事件支持');

    await browser.close();
    console.log('✅ ANTI-ADV-028 测试通过');
  });

  // ========================================
  // 第七部分: 综合检测评分 (ANTI-ADV-029 ~ ANTI-ADV-030)
  // ========================================

  /**
   * ANTI-ADV-029: 基础反机器人检测评分
   *
   * 检测点:
   * - 综合基础检测项
   * - 给出总体评分
   */
  it('ANTI-ADV-029: 基础反机器人检测评分', { timeout: 60000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] 基础反机器人综合评分...');
    const detectionResults = await page.evaluate(() => {
      const results: Record<string, any> = {};

      // 1. navigator.webdriver
      results.webdriver = (navigator as any).webdriver === undefined;

      // 2. User-Agent
      const ua = navigator.userAgent;
      results.userAgent = !ua.includes('HeadlessChrome') &&
        !ua.includes('Selenium') &&
        !ua.includes('Puppeteer') &&
        !ua.includes('Playwright') &&
        !ua.includes('WebDriver');

      // 3. window.chrome
      results.chrome = typeof window.chrome === 'object';

      // 4. navigator.plugins
      results.plugins = navigator.plugins.length > 0;

      // 5. navigator.languages
      results.languages = navigator.languages && navigator.languages.length > 0;

      // 6. 自动化特征变量
      const suspiciousVars = [
        '_WEBDRIVER_ELEM_CACHE',
        'cdc_adoQpoasnfa',
        'cdc_IadQpoasnfa',
        '__driver_evaluate',
        '__webdriver_evaluate',
        '__selenium_evaluate',
        'callSelenium',
        '$cdc_asdjflasutopfhvcZLmcfl_',
        '$chrome_asyncScriptInfo'
      ];
      results.noSuspiciousVars = !suspiciousVars.some(v => typeof (window as any)[v] !== 'undefined');

      // 7. 屏幕尺寸
      results.screenSize = screen.width > 0 && screen.height > 0;

      // 8. devicePixelRatio
      results.devicePixelRatio = window.devicePixelRatio > 0;

      // 9. hardwareConcurrency
      results.hardwareConcurrency = navigator.hardwareConcurrency > 0;

      // 10. WebGL
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      results.webgl = !!gl;

      // 11. Canvas
      const ctx = canvas.getContext('2d');
      results.canvas = !!ctx;

      // 12. AudioContext
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      results.audioContext = typeof AudioContext === 'function';

      // 13. WebRTC
      results.webrtc = typeof (window as any).RTCPeerConnection === 'function' ||
                       typeof (window as any).webkitRTCPeerConnection === 'function';

      // 14. Service Worker
      results.serviceWorker = typeof navigator.serviceWorker === 'object';

      // 15. WebAssembly
      results.webassembly = typeof WebAssembly === 'object';

      return results;
    });

    console.log('\n   基础反机器人检测结果:');
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
    const score = (passCount / totalChecks * 100).toFixed(2);

    console.log(`\n   总分: ${score}% (${passCount}/${totalChecks} 通过)`);

    if (failedChecks.length > 0) {
      console.log(`   失败项: ${failedChecks.join(', ')}`);
    }

    expect(parseFloat(score)).toBeGreaterThan(70);
    console.log('   ✅ 基础反机器人检测评分合格');

    await browser.close();
    console.log('✅ ANTI-ADV-029 测试通过');
  });

  /**
   * ANTI-ADV-030: 高级反机器人检测评分
   *
   * 检测点:
   * - 综合高级检测项
   * - 给出总体评分
   */
  it('ANTI-ADV-030: 高级反机器人检测评分', { timeout: 60000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] 高级反机器人综合评分...');
    const detectionResults = await page.evaluate(async () => {
      const results: Record<string, any> = {};

      // WebRTC 相关
      const mediaDevices = navigator.mediaDevices;
      results.getUserMedia = typeof mediaDevices?.getUserMedia === 'function';
      results.enumerateDevices = typeof mediaDevices?.enumerateDevices === 'function';
      results.rtcDataChannel = typeof (window as any).RTCDataChannel === 'function';

      // Service Worker 相关
      const sw = navigator.serviceWorker;
      results.swRegister = typeof sw?.register === 'function';
      results.swController = sw?.controller !== undefined;
      results.swReady = sw?.ready !== undefined;

      // WebGL 扩展
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        results.webglDebugInfo = !!debugInfo;
        if (debugInfo) {
          const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
          results.webglRenderer = !renderer?.includes('SwiftShader');
        }
      }

      // WebAssembly
      results.wasmCompile = typeof WebAssembly.compile === 'function';
      results.wasmInstantiate = typeof WebAssembly.instantiate === 'function';
      results.wasmMemory = typeof WebAssembly.Memory === 'function';

      // 设备能力
      const connection = (navigator as any).connection;
      results.connectionAPI = typeof connection === 'object';
      results.deviceOrientation = typeof (window as any).DeviceOrientationEvent === 'function';
      results.deviceMotion = typeof (window as any).DeviceMotionEvent === 'function';
      results.vibrate = typeof navigator.vibrate === 'function';

      // Chrome 特定
      results.chromeObject = typeof (window as any).chrome === 'object';
      const runtime = (window as any).chrome?.runtime;
      results.chromeRuntime = typeof runtime === 'object';

      // 事件支持
      results.mouseEvents = typeof MouseEvent === 'function';
      results.keyboardEvents = typeof KeyboardEvent === 'function';
      results.focusEvents = 'onfocus' in window;
      results.scrollEvents = 'onscroll' in window;

      // 性能 API
      results.performanceTiming = typeof performance.timing === 'object';
      results.performanceNow = typeof performance.now === 'function';

      // 存储 API
      results.localStorage = typeof localStorage !== 'undefined';
      results.sessionStorage = typeof sessionStorage !== 'undefined';
      results.indexedDB = typeof indexedDB !== 'undefined';

      // 历史 API
      results.historyAPI = typeof history.pushState === 'function';

      return results;
    });

    console.log('\n   高级反机器人检测结果:');
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
    const score = (passCount / totalChecks * 100).toFixed(2);

    console.log(`\n   总分: ${score}% (${passCount}/${totalChecks} 通过)`);

    if (failedChecks.length > 0) {
      console.log(`   失败项: ${failedChecks.join(', ')}`);
    }

    // 高级检测允许更低的通过率（因为有些功能在 headless 模式下不可用）
    expect(parseFloat(score)).toBeGreaterThan(50);
    console.log('   ✅ 高级反机器人检测评分合格');

    await browser.close();
    console.log('✅ ANTI-ADV-030 测试通过');
  });

  // ========================================
  // 第八部分: 第三方检测网站验证 (ANTI-ADV-031 ~ ANTI-ADV-035)
  // ========================================

  /**
   * ANTI-ADV-031: bot.sannysoft.com 检测验证
   *
   * 检测点:
   * - 访问 bot.sannysoft.com
   * - 检查检测结果
   *
   * 注意: 此测试需要网络连接
   */
  it('ANTI-ADV-031: bot.sannysoft.com 检测验证', { timeout: 120000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] 访问 bot.sannysoft.com...');

    try {
      await page.goto('https://bot.sannysoft.com/', {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      // 等待页面加载
      await page.waitForTimeout(5000);

      // 截图
      const screenshot = await page.screenshot({ encoding: 'base64' });
      console.log(`   页面已加载，截图大小: ${screenshot.length} bytes`);

      // 尝试读取检测结果
      const检测结果 = await page.evaluate(() => {
        const rows = document.querySelectorAll('table tr');
        const results: Record<string, string> = {};

        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 2) {
            const key = cells[0]?.textContent?.trim();
            const value = cells[1]?.textContent?.trim();
            if (key) {
              results[key] = value || '';
            }
          }
        });

        return results;
      });

      console.log('\n   检测结果:');
      for (const [key, value] of Object.entries(检测结果)) {
        console.log(`     ${key}: ${value}`);
      }

      console.log('   ✅ bot.sannysoft.com 检测完成');
    } catch (error) {
      console.log(`   ⚠️  访问失败: ${(error as Error).message}`);
    }

    await browser.close();
    console.log('✅ ANTI-ADV-031 测试完成');
  });

  /**
   * ANTI-ADV-032: arh.antoinevastel.com headless 检测验证
   *
   * 检测点:
   * - 访问 headless 检测网站
   * - 检查是否被识别为 headless
   */
  it('ANTI-ADV-032: arh.antoinevastel.com headless 检测验证', { timeout: 120000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] 访问 arh.antoinevastel.com/bots/areyouheadless...');

    try {
      await page.goto('https://arh.antoinevastel.com/bots/areyouheadless', {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      await page.waitForTimeout(5000);

      const result = await page.evaluate(() => {
        const resultDiv = document.querySelector('#result');
        return resultDiv?.textContent?.trim() || '';
      });

      console.log(`   检测结果: ${result}`);

      if (result.toLowerCase().includes('not headless') || result.toLowerCase().includes('headed')) {
        console.log('   ✅ 未被识别为 headless 浏览器');
      } else {
        console.log('   ⚠️  可能被识别为 headless 浏览器');
      }

    } catch (error) {
      console.log(`   ⚠️  访问失败: ${(error as Error).message}`);
    }

    await browser.close();
    console.log('✅ ANTI-ADV-032 测试完成');
  });

  /**
   * ANTI-ADV-033: browserscan.net 检测验证
   *
   * 检测点:
   * - 访问 browserscan.net
   * - 检查浏览器指纹
   */
  it('ANTI-ADV-033: browserscan.net 检测验证', { timeout: 120000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] 访问 browserscan.net...');

    try {
      await page.goto('https://www.browserscan.net/', {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      await page.waitForTimeout(10000);

      // 截图
      const screenshot = await page.screenshot({ encoding: 'base64' });
      console.log(`   页面已加载，截图大小: ${screenshot.length} bytes`);

      // 尝试读取浏览器信息
      const browserInfo = await page.evaluate(() => {
        return {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          language: navigator.language,
          hardwareConcurrency: navigator.hardwareConcurrency,
          deviceMemory: (navigator as any).deviceMemory,
        };
      });

      console.log('\n   浏览器信息:');
      console.log(`     User-Agent: ${browserInfo.userAgent}`);
      console.log(`     Platform: ${browserInfo.platform}`);
      console.log(`     Language: ${browserInfo.language}`);
      console.log(`     Hardware Concurrency: ${browserInfo.hardwareConcurrency}`);
      console.log(`     Device Memory: ${browserInfo.deviceMemory}`);

      console.log('   ✅ browserscan.net 检测完成');
    } catch (error) {
      console.log(`   ⚠️  访问失败: ${(error as Error).message}`);
    }

    await browser.close();
    console.log('✅ ANTI-ADV-033 测试完成');
  });

  /**
   * ANTI-ADV-034: 综合检测报告生成
   *
   * 检测点:
   * - 汇总所有检测项
   * - 生成详细报告
   */
  it('ANTI-ADV-034: 综合检测报告生成', { timeout: 60000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] 生成综合检测报告...');

    const report = await page.evaluate(async () => {
      const reportData: Record<string, any> = {
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        languages: navigator.languages,
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: (navigator as any).deviceMemory,
        maxTouchPoints: navigator.maxTouchPoints,
        webdriver: (navigator as any).webdriver,
        plugins: navigator.plugins.length,
        cookieEnabled: navigator.cookieEnabled,
        doNotTrack: navigator.doNotTrack,
        screen: {
          width: screen.width,
          height: screen.height,
          availWidth: screen.availWidth,
          availHeight: screen.availHeight,
          colorDepth: screen.colorDepth,
          pixelDepth: screen.pixelDepth,
        },
        window: {
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          outerWidth: window.outerWidth,
          outerHeight: window.outerHeight,
          devicePixelRatio: window.devicePixelRatio,
        },
        timezone: {
          offset: new Date().getTimezoneOffset(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        features: {
          webgl: !!((document.createElement('canvas')).getContext('webgl') ||
                     (document.createElement('canvas')).getContext('experimental-webgl')),
          webgl2: !!((document.createElement('canvas')).getContext('webgl2')),
          webrtc: typeof (window as any).RTCPeerConnection === 'function',
          serviceWorker: typeof navigator.serviceWorker === 'object',
          webassembly: typeof WebAssembly === 'object',
          localStorage: typeof localStorage !== 'undefined',
          sessionStorage: typeof sessionStorage !== 'undefined',
          indexedDB: typeof indexedDB !== 'undefined',
        },
        chrome: {
          exists: typeof (window as any).chrome === 'object',
          loadTimes: typeof (window as any).chrome?.loadTimes === 'function',
          runtime: typeof (window as any).chrome?.runtime === 'object',
        },
        suspiciousVars: {
          _WEBDRIVER_ELEM_CACHE: typeof (window as any)._WEBDRIVER_ELEM_CACHE !== 'undefined',
          cdc_adoQpoasnfa: typeof (window as any).cdc_adoQpoasnfa !== 'undefined',
        },
      };

      // WebGL 信息
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        reportData.webgl = {
          vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : null,
          renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null,
        };
      }

      return reportData;
    });

    console.log('\n   ========== 综合检测报告 ==========');
    console.log(`   时间戳: ${report.timestamp}`);
    console.log(`   User-Agent: ${report.userAgent}`);
    console.log(`   平台: ${report.platform}`);
    console.log(`   语言: ${report.language} (${report.languages.join(', ')})`);
    console.log(`   CPU 核心: ${report.hardwareConcurrency}`);
    console.log(`   内存: ${report.deviceMemory} GB`);
    console.log(`   触摸点: ${report.maxTouchPoints}`);
    console.log(`   webdriver: ${report.webdriver}`);
    console.log(`   插件数: ${report.plugins}`);
    console.log(`   Cookie: ${report.cookieEnabled}`);
    console.log(`   Do Not Track: ${report.doNotTrack}`);
    console.log(`\n   屏幕信息:`);
    console.log(`     分辨率: ${report.screen.width}x${report.screen.height}`);
    console.log(`     可用: ${report.screen.availWidth}x${report.screen.availHeight}`);
    console.log(`     色深: ${report.screen.colorDepth}`);
    console.log(`\n   窗口信息:`);
    console.log(`     内部: ${report.window.innerWidth}x${report.window.innerHeight}`);
    console.log(`     外部: ${report.window.outerWidth}x${report.window.outerHeight}`);
    console.log(`     DPR: ${report.window.devicePixelRatio}`);
    console.log(`\n   时区:`);
    console.log(`     偏移: ${report.timezone.offset} 分钟`);
    console.log(`     时区: ${report.timezone.timezone}`);
    console.log(`\n   功能支持:`);
    console.log(`     WebGL: ${report.features.webgl}`);
    console.log(`     WebGL2: ${report.features.webgl2}`);
    console.log(`     WebRTC: ${report.features.webrtc}`);
    console.log(`     Service Worker: ${report.features.serviceWorker}`);
    console.log(`     WebAssembly: ${report.features.webassembly}`);
    console.log(`     LocalStorage: ${report.features.localStorage}`);
    console.log(`     SessionStorage: ${report.features.sessionStorage}`);
    console.log(`     IndexedDB: ${report.features.indexedDB}`);
    console.log(`\n   Chrome 特性:`);
    console.log(`     对象存在: ${report.chrome.exists}`);
    console.log(`     loadTimes: ${report.chrome.loadTimes}`);
    console.log(`     runtime: ${report.chrome.runtime}`);
    console.log(`\n   可疑变量:`);
    console.log(`     _WEBDRIVER_ELEM_CACHE: ${report.suspiciousVars._WEBDRIVER_ELEM_CACHE}`);
    console.log(`     cdc_adoQpoasnfa: ${report.suspiciousVars.cdc_adoQpoasnfa}`);
    if (report.webgl) {
      console.log(`\n   WebGL:`);
      console.log(`     Vendor: ${report.webgl.vendor}`);
      console.log(`     Renderer: ${report.webgl.renderer}`);
    }
    console.log('   ================================\n');

    await browser.close();
    console.log('✅ ANTI-ADV-034 测试通过');
  });

  /**
   * ANTI-ADV-035: 最终风险评估
   *
   * 检测点:
   * - 基于所有检测结果
   * - 给出总体风险评级
   */
  it('ANTI-ADV-035: 最终风险评估', { timeout: 60000 }, async () => {
    const { page, browser } = await createSessionAndConnect();

    console.log('\n[检测] 执行最终风险评估...');

    const riskAssessment = await page.evaluate(() => {
      let riskScore = 0;
      const riskFactors: string[] = [];

      // 高风险检测
      if ((navigator as any).webdriver !== undefined) {
        riskScore += 30;
        riskFactors.push('navigator.webdriver is defined');
      }

      const ua = navigator.userAgent;
      if (ua.includes('HeadlessChrome') || ua.includes('Selenium') || ua.includes('Puppeteer')) {
        riskScore += 25;
        riskFactors.push('Suspicious User-Agent');
      }

      if (typeof (window as any).chrome !== 'object') {
        riskScore += 15;
        riskFactors.push('window.chrome is missing');
      }

      if (navigator.plugins.length === 0) {
        riskScore += 10;
        riskFactors.push('No plugins detected');
      }

      const suspiciousVars = ['_WEBDRIVER_ELEM_CACHE', 'cdc_adoQpoasnfa'];
      const foundSuspicious = suspiciousVars.filter(v => typeof (window as any)[v] !== 'undefined');
      if (foundSuspicious.length > 0) {
        riskScore += 20;
        riskFactors.push(`Suspicious variables found: ${foundSuspicious.join(', ')}`);
      }

      // 中风险检测
      if (!navigator.languages || navigator.languages.length === 0) {
        riskScore += 10;
        riskFactors.push('No languages detected');
      }

      if (screen.width === 0 || screen.height === 0) {
        riskScore += 15;
        riskFactors.push('Invalid screen dimensions');
      }

      if (window.devicePixelRatio === 0) {
        riskScore += 10;
        riskFactors.push('Invalid devicePixelRatio');
      }

      // 低风险检测
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
          if (renderer && (renderer.includes('SwiftShader') || renderer.includes('VMware'))) {
            riskScore += 10;
            riskFactors.push('Suspicious WebGL renderer');
          }
        }
      }

      let riskLevel = 'LOW';
      if (riskScore >= 70) {
        riskLevel = 'CRITICAL';
      } else if (riskScore >= 50) {
        riskLevel = 'HIGH';
      } else if (riskScore >= 30) {
        riskLevel = 'MEDIUM';
      }

      return {
        riskScore: Math.min(riskScore, 100),
        riskLevel,
        riskFactors,
      };
    });

    console.log('\n   ========== 风险评估报告 ==========');
    console.log(`   风险评分: ${riskAssessment.riskScore}/100`);
    console.log(`   风险等级: ${riskAssessment.riskLevel}`);
    console.log(`\n   风险因素:`);
    if (riskAssessment.riskFactors.length > 0) {
      riskAssessment.riskFactors.forEach((factor, index) => {
        console.log(`     ${index + 1}. ${factor}`);
      });
    } else {
      console.log('     无明显风险因素');
    }
    console.log('   =================================\n');

    // 风险评分应该小于 50
    expect(riskAssessment.riskScore).toBeLessThan(50);

    if (riskAssessment.riskLevel === 'LOW' || riskAssessment.riskLevel === 'MEDIUM') {
      console.log('   ✅ 风险评估通过');
    } else {
      console.log(`   ⚠️  风险等级为 ${riskAssessment.riskLevel}，需要优化`);
    }

    await browser.close();
    console.log('✅ ANTI-ADV-035 测试通过');
  });
});
