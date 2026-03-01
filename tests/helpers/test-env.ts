/**
 * 智能测试环境管理器
 *
 * 功能：
 * - 动态分配端口，避免占用固定端口
 * - 自动启动管理端和多个机器服务
 * - 测试结束后自动清理
 * - 平时开发时仍使用配置的固定端口
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import net from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== 类型定义 ====================

export interface TestServer {
  type: 'manager' | 'machine';
  process: ChildProcess;
  ports: {
    http?: number;
    grpc?: number;
    proxy?: number;
  };
  pid: number;
  id: string;
}

export interface TestEnvironment {
  manager: TestServer | null;
  machines: TestServer[];
}

// ==================== 全局状态 ====================

let testEnvironment: TestEnvironment = {
  manager: null,
  machines: [],
};

// 日志目录
const logsDir = path.join(__dirname, '../../logs/test-logs');
fs.mkdirSync(logsDir, { recursive: true });

// ==================== 工具函数 ====================

/**
 * 获取一个可用的随机端口
 */
export async function getAvailablePort(): Promise<number> {
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
 * 获取多个可用端口
 */
export async function getAvailablePorts(count: number): Promise<number[]> {
  const ports: number[] = [];
  for (let i = 0; i < count; i++) {
    const port = await getAvailablePort();
    ports.push(port);
  }
  return ports;
}

/**
 * 等待服务器就绪
 */
async function waitForServer(url: string, options: { timeout?: number; retries?: number } = {}): Promise<void> {
  const { timeout = 30000, retries = 60 } = options;
  const start = Date.now();

  for (let i = 0; i < retries; i++) {
    if (Date.now() - start > timeout) {
      throw new Error(`服务器启动超时: ${url}`);
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        return;
      }
    } catch {
      // 继续等待
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`服务器启动失败: ${url}`);
}

/**
 * 生成机器 ID
 */
function generateMachineId(index: number): string {
  return `test-machine-${Date.now()}-${index}`;
}

/**
 * 生成机器名称
 */
function generateMachineName(index: number): string {
  return `测试机器-${index + 1}`;
}

// ==================== 服务器启动 ====================

/**
 * 启动管理服务器
 */
export async function startManagerServer(): Promise<TestServer> {
  if (testEnvironment.manager) {
    console.log('⚠️  管理服务器已在运行');
    return testEnvironment.manager;
  }

  console.log('🚀 启动管理服务器...');

  // 动态分配端口
  const [httpPort, grpcPort] = await getAvailablePorts(2);

  // 创建日志流
  const logFile = path.join(logsDir, `manager-${Date.now()}.log`);
  const logStream = fs.createWriteStream(logFile);

  // 环境变量
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(httpPort),
    GRPC_PORT: String(grpcPort),
    // 测试环境标记
    TEST_ENV: 'true',
  };

  // 启动进程
  const childProcess = spawn('npx', ['tsx', 'src/server.ts'], {
    cwd: path.join(__dirname, '../..'),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  // 将 stdout 和 stderr 重定向到日志文件
  if (childProcess.stdout) childProcess.stdout.pipe(logStream);
  if (childProcess.stderr) childProcess.stderr.pipe(logStream);

  const server: TestServer = {
    type: 'manager',
    process: childProcess,
    ports: { http: httpPort, grpc: grpcPort },
    pid: childProcess.pid!,
    id: 'manager',
  };

  testEnvironment.manager = server;

  // 等待服务器就绪
  await waitForServer(`http://localhost:${httpPort}/health`);

  console.log(`✅ 管理服务器已启动:`);
  console.log(`   - HTTP: http://localhost:${httpPort}`);
  console.log(`   - gRPC: localhost:${grpcPort}`);
  console.log(`   - PID: ${childProcess.pid}`);

  return server;
}

/**
 * 启动机器服务
 */
export async function startMachineServer(index: number, managerServer: TestServer): Promise<TestServer> {
  console.log(`🚀 启动机器服务 #${index + 1}...`);

  // 动态分配端口
  const [grpcPort, proxyPort] = await getAvailablePorts(2);

  // 创建日志流
  const logFile = path.join(logsDir, `machine-${index}-${Date.now()}.log`);
  const logStream = fs.createWriteStream(logFile);

  // 生成机器信息
  const machineId = generateMachineId(index);
  const machineName = generateMachineName(index);

  // 环境变量
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    MACHINE_ID: machineId,
    MACHINE_NAME: machineName,
    MANAGER_HOST: `localhost:${managerServer.ports.grpc}`,
    MACHINE_GRPC_PORT: String(grpcPort),
    PROXY_PORT: String(proxyPort),
    TEST_ENV: 'true',
  };

  // 启动进程
  const proc = spawn('npx', ['tsx', 'src/machine/server.ts'], {
    cwd: path.join(__dirname, '../..'),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  // 将 stdout 和 stderr 重定向到日志文件
  if (proc.stdout) proc.stdout.pipe(logStream);
  if (proc.stderr) proc.stderr.pipe(logStream);

  const server: TestServer = {
    type: 'machine',
    process: proc,
    ports: { grpc: grpcPort, proxy: proxyPort },
    pid: proc.pid!,
    id: machineId,
  };

  testEnvironment.machines.push(server);

  // 等待机器注册到管理端
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log(`✅ 机器服务 #${index + 1} 已启动:`);
  console.log(`   - ID: ${machineId}`);
  console.log(`   - 名称: ${machineName}`);
  console.log(`   - gRPC: localhost:${grpcPort}`);
  console.log(`   - 代理: localhost:${proxyPort}`);
  console.log(`   - PID: ${proc.pid}`);

  return server;
}

/**
 * 启动多个机器服务
 */
export async function startMachineServers(count: number, managerServer: TestServer): Promise<TestServer[]> {
  console.log(`🚀 启动 ${count} 个机器服务...`);

  const machines: TestServer[] = [];

  // 并行启动所有机器
  const startPromises = Array.from({ length: count }, (_, i) => startMachineServer(i, managerServer));

  const startedMachines = await Promise.all(startPromises);
  machines.push(...startedMachines);

  console.log(`✅ 所有机器服务已启动 (${count} 台)`);

  return machines;
}

// ==================== 环境管理 ====================

/**
 * 启动完整的测试环境（管理端 + 机器）
 */
export async function startTestEnvironment(machineCount: number = 2): Promise<TestEnvironment> {
  console.log('════════════════════════════════════════');
  console.log('🧪 启动测试环境');
  console.log('════════════════════════════════════════');
  console.log(`配置: 1 个管理端 + ${machineCount} 个机器`);
  console.log('');

  // 1. 启动管理服务器
  const manager = await startManagerServer();
  console.log('');

  // 2. 启动机器服务
  await startMachineServers(machineCount, manager);
  console.log('');

  console.log('════════════════════════════════════════');
  console.log('✅ 测试环境启动完成');
  console.log('════════════════════════════════════════');
  console.log('');

  return testEnvironment;
}

/**
 * 停止服务器
 */
function stopServer(server: TestServer): void {
  if (!server.process) return;

  try {
    // 先尝试优雅关闭
    server.process.kill('SIGTERM');

    // 5秒后强制关闭
    setTimeout(() => {
      if (server.process && !server.process.killed) {
        console.log(`⚠️  强制关闭进程: ${server.id} (PID: ${server.pid})`);
        server.process.kill('SIGKILL');
      }
    }, 5000);
  } catch (error) {
    console.error(`❌ 停止服务器失败: ${server.id}`, error);
  }
}

/**
 * 清理测试环境
 */
export async function cleanupTestEnvironment(): Promise<void> {
  console.log('');
  console.log('════════════════════════════════════════');
  console.log('🧹 清理测试环境');
  console.log('════════════════════════════════════════');

  // 停止所有机器
  if (testEnvironment.machines.length > 0) {
    console.log(`停止 ${testEnvironment.machines.length} 个机器服务...`);
    testEnvironment.machines.forEach((machine) => {
      stopServer(machine);
    });
    testEnvironment.machines = [];
  }

  // 停止管理端
  if (testEnvironment.manager) {
    console.log('停止管理服务器...');
    stopServer(testEnvironment.manager);
    testEnvironment.manager = null;
  }

  // 等待所有进程退出
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log('✅ 测试环境已清理');
  console.log('════════════════════════════════════════');
  console.log('');
}

/**
 * 获取管理端 URL
 */
export function getManagerUrl(): string {
  if (!testEnvironment.manager) {
    throw new Error('管理服务器未启动');
  }
  return `http://localhost:${testEnvironment.manager.ports.http}`;
}

/**
 * 获取管理端 gRPC 地址
 */
export function getManagerGrpcUrl(): string {
  if (!testEnvironment.manager) {
    throw new Error('管理服务器未启动');
  }
  return `localhost:${testEnvironment.manager.ports.grpc}`;
}

/**
 * 获取机器信息
 */
export function getMachinesInfo(): Array<{
  id: string;
  name: string;
  grpcPort: number;
  proxyPort: number;
}> {
  return testEnvironment.machines.map((m, i) => ({
    id: m.id,
    name: generateMachineName(i),
    grpcPort: m.ports.grpc!,
    proxyPort: m.ports.proxy!,
  }));
}

/**
 * 导出环境变量供测试使用
 */
export function exportTestEnv(): void {
  if (testEnvironment.manager) {
    process.env.BASE_URL = getManagerUrl();
    process.env.MANAGER_GRPC_URL = getManagerGrpcUrl();
  }
}
