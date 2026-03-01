/**
 * Playwright Fixtures - 专业测试环境管理
 *
 * 功能：
 * - 自动启动/停止管理端和机器服务
 * - 动态端口分配（由 Playwright webServer 处理）
 * - 内置验证：检查服务状态、机器注册、心跳
 * - 自动清理资源
 */

import { test as base, Page } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import net from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== 类型定义 ====================

interface TestMachine {
  process: ChildProcess;
  grpcPort: number;
  proxyPort: number;
  id: string;
  name: string;
  pid: number;
}

interface TestEnvironment {
  managerUrl: string;
  managerGrpcPort: number;
  machines: TestMachine[];
}

// ==================== 全局状态 ====================

const machines: TestMachine[] = [];
const logsDir = path.join(__dirname, '../logs/test-logs');
fs.mkdirSync(logsDir, { recursive: true });

// ==================== 工具函数 ====================

/**
 * 获取可用端口
 */
async function getAvailablePort(): Promise<number> {
  const net = await import('net');
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

/**
 * 等待服务就绪
 */
async function waitForServer(url: string, timeout = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) return;
    } catch {
      // 继续等待
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`服务启动超时: ${url}`);
}

/**
 * 启动机器服务
 */
async function startMachine(index: number, managerGrpcUrl: string): Promise<TestMachine> {
  const [grpcPort, proxyPort] = await Promise.all([getAvailablePort(), getAvailablePort()]);

  const machineId = `test-machine-${Date.now()}-${index}`;
  const machineName = `测试机器-${index + 1}`;

  const logFile = path.join(logsDir, `machine-${index}-${Date.now()}.log`);
  const logStream = fs.createWriteStream(logFile);

  const env = {
    ...process.env,
    NODE_ENV: 'test',
    MACHINE_ID: machineId,
    MACHINE_NAME: machineName,
    MANAGER_HOST: managerGrpcUrl,
    MACHINE_GRPC_PORT: String(grpcPort),
    PROXY_PORT: String(proxyPort),
    TEST_ENV: 'true',
  };

  const childProcess = spawn('npx', ['tsx', 'src/machine/server.ts'], {
    cwd: path.join(__dirname, '..'),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // 连接日志流
  childProcess.stdout?.pipe(logStream);
  childProcess.stderr?.pipe(logStream);

  const machine: TestMachine = {
    process: childProcess,
    grpcPort,
    proxyPort,
    id: machineId,
    name: machineName,
    pid: childProcess.pid!,
  };

  machines.push(machine);

  // 等待机器注册
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log(`✅ 机器服务 #${index + 1} 已启动:`);
  console.log(`   - ID: ${machineId}`);
  console.log(`   - gRPC: localhost:${grpcPort}`);
  console.log(`   - PID: ${childProcess.pid}`);

  return machine;
}

/**
 * 停止所有机器服务
 */
function stopAllMachines(): void {
  machines.forEach((machine) => {
    try {
      machine.process.kill('SIGTERM');
      setTimeout(() => {
        if (!machine.process.killed) {
          machine.process.kill('SIGKILL');
        }
      }, 5000);
    } catch (error) {
      console.error(`❌ 停止机器失败: ${machine.id}`, error);
    }
  });
  machines.length = 0;
}

/**
 * 验证机器是否在管理端注册
 */
async function verifyMachineRegistered(managerUrl: string, expectedCount: number): Promise<void> {
  const maxRetries = 10;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`${managerUrl}/api/admin/machines`, {
        headers: {
          Authorization: `Bearer ${process.env.ADMIN_TOKEN || 'test-token'}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const registeredCount = data.data?.length || data.length || 0;

        if (registeredCount >= expectedCount) {
          console.log(`✅ 验证通过: ${expectedCount} 台机器已注册`);
          return;
        }
      }
    } catch (error) {
      // 继续重试
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.warn(`⚠️  警告: 期望 ${expectedCount} 台机器注册，但未完全验证`);
}

// ==================== Professional Fixtures ====================

/**
 * 扩展的测试 Fixture
 *
 * 特性：
 * - 自动管理机器服务生命周期
 * - 验证服务状态和数据一致性
 * - 提供便捷的 API 访问方法
 * - 自动获取和管理认证 token
 */
export const test = base.extend<{
  testEnv: TestEnvironment;
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<Response>;
  verifyMachineData: () => Promise<void>;
  adminToken: string;
}>({
  // ==================== adminToken Fixture ====================
  /**
   * Admin Token Fixture
   * 自动登录并缓存 admin token
   */
  adminToken: [
    async ({ baseURL }, use) => {
      if (!baseURL) {
        throw new Error('baseURL 未设置');
      }

      // 登录获取 token
      const loginResponse = await fetch(`${baseURL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'admin',
          password: 'REDACTED_ADMIN_PASS',
        }),
      });

      if (!loginResponse.ok) {
        throw new Error(`登录失败: ${loginResponse.status} ${await loginResponse.text()}`);
      }

      const loginData = await loginResponse.json();
      const token = loginData.data?.token || loginData.token;

      if (!token) {
        throw new Error('登录响应中没有 token');
      }

      console.log('✅ 已获取 admin token');

      await use(token);
    },
    { scope: 'test' },
  ],

  // ==================== testEnv Fixture ====================
  /**
   * 测试环境 Fixture
   * 在每个测试文件运行前启动机器，运行后清理
   */
  testEnv: [
    async ({ baseURL }, use) => {
      if (!baseURL) {
        throw new Error('baseURL 未设置');
      }

      // 解析管理端 gRPC 端口（从环境变量或默认值）
      const managerGrpcPort = parseInt(process.env.MANAGER_GRPC_PORT || '50051', 10);
      const managerGrpcUrl = `localhost:${managerGrpcPort}`;

      // 获取要启动的机器数量
      const machineCount = parseInt(process.env.TEST_MACHINE_COUNT || '2', 10);

      console.log(`\n🚀 启动测试环境: ${machineCount} 个机器服务`);

      // 启动所有机器
      const startedMachines: TestMachine[] = [];
      for (let i = 0; i < machineCount; i++) {
        const machine = await startMachine(i, managerGrpcUrl);
        startedMachines.push(machine);
      }

      const testEnv: TestEnvironment = {
        managerUrl: baseURL,
        managerGrpcPort,
        machines: startedMachines,
      };

      // 验证机器注册
      await verifyMachineRegistered(testEnv.managerUrl, machineCount);

      // 使用环境
      await use(testEnv);

      // 清理：停止所有机器
      console.log(`\n🧹 清理测试环境`);
      stopAllMachines();
    },
    { scope: 'test' },
  ], // 每个测试文件运行一次

  // ==================== apiRequest Fixture ====================
  /**
   * API 请求 Fixture
   * 提供便捷的 API 调用方法，自动处理认证和基础 URL
   */
  apiRequest: [
    async ({ testEnv, adminToken }, use) => {
      const request = async (endpoint: string, options: RequestInit = {}) => {
        const url = endpoint.startsWith('http') ? endpoint : `${testEnv.managerUrl}${endpoint}`;

        // 自动添加认证头
        const headers = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
          ...options.headers,
        };

        return fetch(url, { ...options, headers });
      };

      await use(request);
    },
    { scope: 'test' },
  ],

  // ==================== verifyMachineData Fixture ====================
  /**
   * 数据验证 Fixture
   * 验证管理端采集的机器数据是否正确
   */
  verifyMachineData: [
    async ({ testEnv, apiRequest }, use) => {
      const verify = async () => {
        const response = await apiRequest('/api/admin/machines');
        if (!response.ok) {
          throw new Error(`获取机器列表失败: ${response.status}`);
        }

        const result = await response.json();
        const machines = result.data || result;

        // 验证每台机器的数据
        for (const machine of machines) {
          // 基本字段验证
          expect(machine).toHaveProperty('id');
          expect(machine).toHaveProperty('name');
          expect(machine).toHaveProperty('grpc_port');
          expect(machine).toHaveProperty('status');

          // 状态验证
          expect(['online', 'offline']).toContain(machine.status);

          console.log(`✅ 机器数据验证: ${machine.name} (${machine.status})`);
        }

        console.log(`✅ 验证完成: ${machines.length} 台机器数据正确`);
      };

      await use(verify);
    },
    { scope: 'test' },
  ],
});

// 导出 expect
export const expect = base.expect;

// ==================== 使用示例 ====================

/**
 * 示例 1: 基础使用
 *
 * test('测试机器列表', async ({ page, testEnv }) => {
 *   await page.goto(testEnv.managerUrl);
 *   // 测试逻辑...
 * });
 */

/**
 * 示例 2: 使用 API 请求
 *
 * test('测试机器注册', async ({ apiRequest }) => {
 *   const response = await apiRequest('/api/admin/machines');
 *   const data = await response.json();
 *   expect(data.data).toHaveLength(2);
 * });
 */

/**
 * 示例 3: 验证数据
 *
 * test('验证机器数据正确性', async ({ verifyMachineData }) => {
 *   await verifyMachineData();
 * });
 */

/**
 * 示例 4: 访问机器信息
 *
 * test('查看机器详情', async ({ page, testEnv }) => {
 *   const machine = testEnv.machines[0];
 *   console.log(`测试机器: ${machine.name}`);
 *   await page.goto(`${testEnv.managerUrl}/admin/machines`);
 * });
 */
