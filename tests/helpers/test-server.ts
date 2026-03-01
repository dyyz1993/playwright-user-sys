/**
 * 测试服务器启动工具
 * 用于在测试中启动管理服务器和机器服务，使用动态端口避免冲突
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 服务器进程
let managerProcess: ChildProcess | null = null;
let machineProcess: ChildProcess | null = null;

// 动态分配的端口
export const testPorts = {
  manager: 0,
  managerGrpc: 0,
  machineGrpc: 0,
  machineProxy: 0,
};

// 日志文件路径
const logsDir = path.join(__dirname, '../../logs/test-logs');
fs.mkdirSync(logsDir, { recursive: true });

/**
 * 获取可用的随机端口
 */
async function getAvailablePort(): Promise<number> {
  const net = await import('net');
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

/**
 * 初始化测试端口
 */
export async function initTestPorts(): Promise<void> {
  testPorts.manager = await getAvailablePort();
  testPorts.managerGrpc = await getAvailablePort();
  testPorts.machineGrpc = await getAvailablePort();
  testPorts.machineProxy = await getAvailablePort();

  console.log('🔧 测试端口分配:', testPorts);
}

/**
 * 启动管理服务器
 */
export async function startManagerServer(): Promise<void> {
  if (managerProcess) {
    console.log('⚠️  管理服务器已在运行');
    return;
  }

  console.log('🚀 启动管理服务器...');

  const logFile = path.join(logsDir, 'manager.log');
  const logStream = fs.createWriteStream(logFile);

  // 设置环境变量
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(testPorts.manager),
    GRPC_PORT: String(testPorts.managerGrpc),
    BASE_URL: `http://localhost:${testPorts.manager}`,
  };

  managerProcess = spawn('npx', ['tsx', 'src/server.ts'], {
    cwd: path.join(__dirname, '../..'),
    env,
    stdio: ['ignore', logStream, logStream],
  });

  managerProcess.on('error', (err) => {
    console.error('❌ 管理服务器启动失败:', err);
  });

  // 等待服务器启动
  await waitForServer(`http://localhost:${testPorts.manager}/health`);
  console.log(`✅ 管理服务器已启动: http://localhost:${testPorts.manager}`);
}

/**
 * 启动机器服务
 */
export async function startMachineServer(): Promise<void> {
  if (machineProcess) {
    console.log('⚠️  机器服务已在运行');
    return;
  }

  console.log('🚀 启动机器服务...');

  const logFile = path.join(logsDir, 'machine.log');
  const logStream = fs.createWriteStream(logFile);

  // 设置环境变量
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    MANAGER_HOST: `localhost:${testPorts.managerGrpc}`,
    MACHINE_GRPC_PORT: String(testPorts.machineGrpc),
    PROXY_PORT: String(testPorts.machineProxy),
  };

  machineProcess = spawn('npx', ['tsx', 'src/machine/server.ts'], {
    cwd: path.join(__dirname, '../..'),
    env,
    stdio: ['ignore', logStream, logStream],
  });

  machineProcess.on('error', (err) => {
    console.error('❌ 机器服务启动失败:', err);
  });

  // 等待机器服务注册
  await new Promise((resolve) => setTimeout(resolve, 2000));
  console.log(`✅ 机器服务已启动: gRPC端口=${testPorts.machineGrpc}, 代理端口=${testPorts.machineProxy}`);
}

/**
 * 等待服务器就绪
 */
async function waitForServer(url: string, timeout = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // 继续等待
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`服务器启动超时: ${url}`);
}

/**
 * 停止所有服务器
 */
export async function stopAllServers(): Promise<void> {
  console.log('🛑 停止测试服务器...');

  if (managerProcess) {
    managerProcess.kill('SIGTERM');
    managerProcess = null;
  }

  if (machineProcess) {
    machineProcess.kill('SIGTERM');
    machineProcess = null;
  }

  // 等待进程完全退出
  await new Promise((resolve) => setTimeout(resolve, 1000));
  console.log('✅ 所有服务器已停止');
}

/**
 * 获取测试环境的 BASE_URL
 */
export function getTestBaseUrl(): string {
  return `http://localhost:${testPorts.manager}`;
}
