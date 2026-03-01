/**
 * 端口管理辅助工具
 * 用于动态分配可用端口，避免测试时的端口冲突
 */

import { createServer } from 'net';

/**
 * 获取一个可用的端口号
 * @returns Promise<number> 可用的端口号
 */
export async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    // 监听端口 0，让系统自动分配可用端口
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'string' ? parseInt(address.split(':')[1], 10) : address?.port;

      server.close(() => {
        resolve(port!);
      });
    });

    server.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * 批量获取多个可用端口
 * @param count 端口数量
 * @returns Promise<number[]> 可用的端口号数组
 */
export async function getFreePorts(count: number): Promise<number[]> {
  const ports: number[] = [];

  for (let i = 0; i < count; i++) {
    const port = await getFreePort();
    ports.push(port);
  }

  return ports;
}

/**
 * 检查端口是否可用
 * @param port 端口号
 * @returns Promise<boolean> 端口是否可用
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();

    server.once('error', () => {
      resolve(false); // 端口被占用
    });

    server.listen(port, () => {
      server.once('close', () => {
        resolve(true); // 端口可用
      });
      server.close();
    });
  });
}

/**
 * 等待端口就绪（服务启动）
 * @param port 端口号
 * @param timeout 超时时间（毫秒）
 * @returns Promise<void>
 */
export async function waitForPort(port: number, timeout: number = 30000): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await isPortInUse(port)) {
      return; // 端口已被监听，说明服务已启动
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Port ${port} not ready after ${timeout}ms`);
}

/**
 * 检查端口是否已被监听
 * @param port 端口号
 * @returns Promise<boolean> 端口是否被监听
 */
async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();

    server.once('error', () => {
      resolve(true); // 端口被占用（说明服务已启动）
    });

    server.listen(port, () => {
      server.once('close', () => {
        resolve(false); // 端口可用
      });
      server.close();
    });
  });
}

/**
 * 端口分配器类
 * 用于管理测试期间的端口分配和释放
 */
export class PortAllocator {
  private allocatedPorts: Set<number> = new Set();

  /**
   * 分配一个端口
   */
  async allocate(): Promise<number> {
    const port = await getFreePort();
    this.allocatedPorts.add(port);
    return port;
  }

  /**
   * 分配多个端口
   */
  async allocateMany(count: number): Promise<number[]> {
    const ports = await getFreePorts(count);
    ports.forEach((port) => this.allocatedPorts.add(port));
    return ports;
  }

  /**
   * 释放端口（从分配记录中移除）
   */
  release(port: number): void {
    this.allocatedPorts.delete(port);
  }

  /**
   * 释放所有端口
   */
  releaseAll(): void {
    this.allocatedPorts.clear();
  }

  /**
   * 获取已分配的端口列表
   */
  getAllocated(): number[] {
    return Array.from(this.allocatedPorts);
  }
}
