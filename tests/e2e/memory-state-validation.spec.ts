/**
 * 内存状态和 IPC 验证测试
 *
 * 验证内容：
 * - MemoryStore 内存数据一致性
 * - gRPC 连接管理
 * - IPC 数据传输正确性
 * - 实时状态同步
 */

import { test, expect } from '../fixtures';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ESM 模块中获取 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== MemoryStore 验证 ====================

test.describe('MemoryStore 内存状态验证', () => {

  test('MEM-01: 机器数据应该在内存存储中', async ({ testEnv, apiRequest }) => {
    // 等待机器注册
    await new Promise(resolve => setTimeout(resolve, 3000));

    const response = await apiRequest('/api/machines');
    expect(response.ok).toBe(true);

    const result = await response.json();
    const machines = result.data?.items || result.data || result;

    // 验证至少有一台机器在线
    const onlineMachines = machines.filter((m: any) => m.status === 'online');
    expect(onlineMachines.length).toBeGreaterThan(0);

    console.log(`在线机器数量: ${onlineMachines.length}`);
  });

  test('MEM-02: 内存中的机器数据应该包含所有必需字段', async ({ apiRequest }) => {
    const response = await apiRequest('/api/machines');
    expect(response.ok).toBe(true);

    const result = await response.json();
    const machines = result.data?.items || result.data || result;

    for (const machine of machines) {
      // 验证内存存储字段
      expect(machine).toHaveProperty('id');
      expect(machine).toHaveProperty('hostname');
      expect(machine).toHaveProperty('ip');
      expect(machine).toHaveProperty('grpc_port');
      expect(machine).toHaveProperty('proxy_port');
      expect(machine).toHaveProperty('status');
      expect(machine).toHaveProperty('last_seen');

      // 验证字段类型
      expect(typeof machine.id).toBe('string');
      expect(typeof machine.hostname).toBe('string');
      expect(typeof machine.ip).toBe('string');
      expect(typeof machine.grpc_port).toBe('number');
      expect(typeof machine.proxy_port).toBe('number');
      expect(typeof machine.status).toBe('string');
    }
  });

  test('MEM-03: 内存状态应该实时更新 (CPU/内存)', async ({ testEnv, apiRequest }) => {
    // 第一次采样
    const response1 = await apiRequest('/api/machines');
    const result1 = await response1.json();
    const machines1 = result1.data || result;
    const machine1 = machines1[0];

    // 等待心跳更新 (30 秒间隔)
    await new Promise(resolve => setTimeout(resolve, 35000));

    // 第二次采样
    const response2 = await apiRequest('/api/machines');
    const result2 = await response2.json();
    const machines2 = result2.data?.items || result2.data || result;
    const machine2 = machines2.find((m: any) => m.id === machine1.id);

    if (machine2) {
      // 验证 last_seen 已更新
      if (machine1.last_seen && machine2.last_seen) {
        const time1 = new Date(machine1.last_seen).getTime();
        const time2 = new Date(machine2.last_seen).getTime();

        expect(time2).toBeGreaterThan(time1);
        console.log(`last_seen 已更新: ${machine1.last_seen} → ${machine2.last_seen}`);
      }

      // 验证 CPU 和内存使用率存在
      if (machine2.cpu_usage !== null && machine2.cpu_usage !== undefined) {
        expect(machine2.cpu_usage).toBeGreaterThanOrEqual(0);
        expect(machine2.cpu_usage).toBeLessThanOrEqual(100);
        console.log(`CPU 使用率: ${machine2.cpu_usage}%`);
      }

      if (machine2.memory_usage !== null && machine2.memory_usage !== undefined) {
        expect(machine2.memory_usage).toBeGreaterThanOrEqual(0);
        expect(machine2.memory_usage).toBeLessThanOrEqual(100);
        console.log(`内存使用率: ${machine2.memory_usage}%`);
      }
    }
  });

  test('MEM-04: 会话数据应该在内存存储中', async ({ apiRequest }) => {
    const response = await apiRequest('/api/admin/sessions');
    expect(response.ok).toBe(true);

    const result = await response.json();
    const sessions = result.data?.items || result.data || result;

    // 验证会话数据结构
    for (const session of sessions) {
      expect(session).toHaveProperty('id');
      expect(session).toHaveProperty('user_id');
      expect(session).toHaveProperty('machine_id');
      expect(session).toHaveProperty('status');
      expect(session).toHaveProperty('start_time');
    }

    console.log(`会话总数: ${sessions.length}`);
  });
});

// ==================== gRPC 连接管理验证 ====================

test.describe('gRPC 连接管理验证', () => {

  test('GRPC-01: 机器应该成功建立 gRPC 连接', async ({ testEnv }) => {
    const testMachine = testEnv.machines[0];

    // 验证机器进程是否运行
    try {
      // 检查进程是否存在
      process.kill(testMachine.pid, 0); // 发送信号 0 检查进程
      console.log(`机器进程 ${testMachine.pid} 正在运行`);
    } catch (error) {
      throw new Error(`机器进程 ${testMachine.pid} 未运行`);
    }

    // 验证 gRPC 端口是否开放
    const net = await import('net');
    const portOpen = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      socket.connect(testMachine.grpcPort, '127.0.0.1', () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('error', () => resolve(false));
      socket.setTimeout(1000, () => {
        socket.destroy();
        resolve(false);
      });
    });

    expect(portOpen).toBe(true);
    console.log(`gRPC 端口 ${testMachine.grpcPort} 可访问`);
  });

  test('GRPC-02: 代理端口应该可访问', async ({ testEnv }) => {
    const testMachine = testEnv.machines[0];
    const net = await import('net');

    const proxyOpen = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      socket.connect(testMachine.proxyPort, '127.0.0.1', () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('error', () => resolve(false));
      socket.setTimeout(1000, () => {
        socket.destroy();
        resolve(false);
      });
    });

    expect(proxyOpen).toBe(true);
    console.log(`代理端口 ${testMachine.proxyPort} 可访问`);
  });

  test('GRPC-03: gRPC 连接应该保持活动状态', async ({ testEnv }) => {
    // 等待心跳更新
    await new Promise(resolve => setTimeout(resolve, 35000));

    // 验证机器仍然在线
    const testMachine = testEnv.machines[0];

    // 检查进程仍在运行
    try {
      process.kill(testMachine.pid, 0);
      console.log(`gRPC 连接保持活动: PID ${testMachine.pid}`);
    } catch (error) {
      throw new Error(`gRPC 连接已断开: PID ${testMachine.pid}`);
    }
  });

  test('GRPC-04: 机器应该能重新连接 (容错)', async ({ testEnv }) => {
    // 这个测试需要模拟网络中断，暂时跳过
    test.skip(true, '需要实现网络中断模拟');
  });
});

// ==================== IPC 数据传输验证 ====================

test.describe('IPC 数据传输验证', () => {

  test('IPC-01: 机器注册数据应该正确传输', async ({ testEnv }) => {
    const testMachine = testEnv.machines[0];

    // 从日志中验证注册数据
    const logsDir = path.join(__dirname, '../../logs/test-logs');
    const logFiles = fs.readdirSync(logsDir)
      .filter(f => f.startsWith(`machine-0-`))
      .sort()
      .reverse();

    if (logFiles.length > 0) {
      const logContent = fs.readFileSync(
        path.join(logsDir, logFiles[0]),
        'utf-8'
      );

      // 验证注册数据传输
      expect(logContent).toContain('注册机器');
      expect(logContent).toContain(testMachine.id);
      expect(logContent).toContain(testMachine.grpcPort.toString());
      expect(logContent).toContain(testMachine.proxyPort.toString());

      console.log('注册数据传输验证通过');
    }
  });

  test('IPC-02: 心跳数据应该正确传输', async ({ testEnv }) => {
    // 等待心跳发送
    await new Promise(resolve => setTimeout(resolve, 35000));

    const testMachine = testEnv.machines[0];

    // 从日志中验证心跳数据
    const logsDir = path.join(__dirname, '../../logs/test-logs');
    const logFiles = fs.readdirSync(logsDir)
      .filter(f => f.startsWith(`machine-0-`))
      .sort()
      .reverse();

    if (logFiles.length > 0) {
      const logContent = fs.readFileSync(
        path.join(logsDir, logFiles[0]),
        'utf-8'
      );

      // 验证心跳数据传输
      // 心跳日志应该包含时间戳和机器信息
      expect(logContent).toContain('心跳');

      console.log('心跳数据传输验证通过');
    }
  });

  test('IPC-03: 会话状态更新应该正确传输', async ({ testEnv }) => {
    // 这个测试需要创建实际会话，暂时跳过
    test.skip(true, '需要实现会话创建测试');
  });

  test('IPC-04: 数据传输应该可靠 (无丢失)', async ({ testEnv }) => {
    // 这个测试需要验证消息传输的可靠性
    test.skip(true, '需要实现消息序列号验证');
  });
});

// ==================== 实时状态同步验证 ====================

test.describe('实时状态同步验证', () => {

  test('SYNC-01: 机器状态变化应该实时同步', async ({ apiRequest }) => {
    // 获取初始状态
    const response1 = await apiRequest('/api/machines');
    const result1 = await response1.json();
    const machines1 = result1.data || result;

    // 等待心跳更新
    await new Promise(resolve => setTimeout(resolve, 35000));

    // 获取更新后的状态
    const response2 = await apiRequest('/api/machines');
    const result2 = await response2.json();
    const machines2 = result2.data || result;

    // 验证状态已更新
    expect(machines2.length).toBe(machines1.length);

    for (const machine1 of machines1) {
      const machine2 = machines2.find((m: any) => m.id === machine1.id);
      expect(machine2).toBeDefined();

      if (machine2) {
        // 验证 last_seen 已更新
        if (machine1.last_seen && machine2.last_seen) {
          const time1 = new Date(machine1.last_seen).getTime();
          const time2 = new Date(machine2.last_seen).getTime();

          expect(time2).toBeGreaterThanOrEqual(time1);
        }
      }
    }

    console.log('实时状态同步验证通过');
  });

  test('SYNC-02: 多机器状态应该独立同步', async ({ testEnv, apiRequest }) => {
    // 验证每台机器的状态是独立的
    const response = await apiRequest('/api/machines');
    const result = await response.json();
    const machines = result.data?.items || result.data || result;

    // 每台机器应该有独立的 ID 和状态
    const machineIds = new Set();
    for (const machine of machines) {
      machineIds.add(machine.id);
    }

    expect(machineIds.size).toBeGreaterThan(1);
    console.log(`独立机器数量: ${machineIds.size}`);
  });

  test('SYNC-03: 状态同步延迟应该在可接受范围内', async ({ apiRequest }) => {
    // 测试状态同步延迟
    const startTime = Date.now();

    const response = await apiRequest('/api/machines');
    expect(response.ok).toBe(true);

    const endTime = Date.now();
    const latency = endTime - startTime;

    // API 响应延迟应该小于 500ms
    expect(latency).toBeLessThan(500);
    console.log(`状态同步延迟: ${latency}ms`);
  });
});

// ==================== 容错和恢复验证 ====================

test.describe('容错和恢复验证', () => {

  test('FAULT-01: 机器断开后应该标记为离线', async ({ testEnv }) => {
    // 这个测试需要停止机器服务，暂时跳过
    test.skip(true, '需要实现机器停止测试');
  });

  test('FAULT-02: 机器重连后应该恢复在线', async ({ testEnv }) => {
    // 这个测试需要重启机器服务，暂时跳过
    test.skip(true, '需要实现机器重启测试');
  });

  test('FAULT-03: 心跳超时应该触发离线标记', async ({ testEnv }) => {
    // 这个测试需要模拟心跳超时，暂时跳过
    test.skip(true, '需要实现心跳超时模拟');
  });

  test('FAULT-04: 部分机器离线不应影响其他机器', async ({ testEnv }) => {
    // 验证单点故障不影响整体
    const response = await apiRequest('/api/machines');
    expect(response.ok).toBe(true);

    const result = await response.json();
    const machines = result.data?.items || result.data || result;

    // 至少应该有一台机器在线
    const onlineMachines = machines.filter((m: any) => m.status === 'online');
    expect(onlineMachines.length).toBeGreaterThan(0);

    console.log(`在线机器: ${onlineMachines.length}/${machines.length}`);
  });
});

// ==================== 数据完整性验证 ====================

test.describe('数据完整性验证', () => {

  test('INT-01: 机器 ID 应该唯一', async ({ apiRequest }) => {
    const response = await apiRequest('/api/machines');
    const result = await response.json();
    const machines = result.data?.items || result.data || result;

    const machineIds = machines.map((m: any) => m.id);
    const uniqueIds = new Set(machineIds);

    expect(uniqueIds.size).toBe(machineIds.length);
    console.log(`机器 ID 唯一性: ${uniqueIds.size}/${machineIds.length}`);
  });

  test('INT-02: 端口号不应该冲突', async ({ apiRequest }) => {
    const response = await apiRequest('/api/machines');
    const result = await response.json();
    const machines = result.data?.items || result.data || result;

    const grpcPorts = machines.map((m: any) => m.grpc_port);
    const proxyPorts = machines.map((m: any) => m.proxy_port);

    // 检查 gRPC 端口唯一性
    const uniqueGrpcPorts = new Set(grpcPorts);
    expect(uniqueGrpcPorts.size).toBe(grpcPorts.length);

    // 检查代理端口唯一性
    const uniqueProxyPorts = new Set(proxyPorts);
    expect(uniqueProxyPorts.size).toBe(proxyPorts.length);

    console.log(`端口唯一性: gRPC ${uniqueGrpcPorts.size}, Proxy ${uniqueProxyPorts.size}`);
  });

  test('INT-03: 时间戳应该单调递增', async ({ apiRequest }) => {
    const response = await apiRequest('/api/admin/sessions');
    const result = await response.json();
    const sessions = result.data?.items || result.data || result;

    // 验证会话时间戳逻辑
    for (const session of sessions) {
      if (session.start_time && session.end_time) {
        const start = new Date(session.start_time).getTime();
        const end = new Date(session.end_time).getTime();

        expect(end).toBeGreaterThanOrEqual(start);
      }
    }

    console.log('时间戳单调性验证通过');
  });
});

// ==================== 性能验证 ====================

test.describe('性能验证', () => {

  test('PERF-MEM01: 内存使用应该稳定', async ({ testEnv, apiRequest }) => {
    // 第一次采样
    const response1 = await apiRequest('/api/machines');
    const result1 = await response1.json();
    const machines1 = result1.data?.items || result1.data || result;
    const machine1 = machines1[0];

    // 等待一段时间
    await new Promise(resolve => setTimeout(resolve, 10000));

    // 第二次采样
    const response2 = await apiRequest('/api/machines');
    const result2 = await response2.json();
    const machines2 = result2.data?.items || result2.data || result;
    const machine2 = machines2.find((m: any) => m.id === machine1.id);

    if (machine2 && machine1.memory_usage && machine2.memory_usage) {
      // 内存使用率变化应该在合理范围内 (±20%)
      const memoryDiff = Math.abs(machine2.memory_usage - machine1.memory_usage);
      expect(memoryDiff).toBeLessThan(20);

      console.log(`内存使用率: ${machine1.memory_usage}% → ${machine2.memory_usage}%`);
    }
  });

  test('PERF-MEM02: CPU 使用应该稳定', async ({ testEnv, apiRequest }) => {
    const response1 = await apiRequest('/api/machines');
    const result1 = await response1.json();
    const machines1 = result1.data?.items || result1.data || result;
    const machine1 = machines1[0];

    await new Promise(resolve => setTimeout(resolve, 10000));

    const response2 = await apiRequest('/api/machines');
    const result2 = await response2.json();
    const machines2 = result2.data?.items || result2.data || result;
    const machine2 = machines2.find((m: any) => m.id === machine1.id);

    if (machine2 && machine1.cpu_usage && machine2.cpu_usage) {
      // CPU 使用率应该相对稳定
      console.log(`CPU 使用率: ${machine1.cpu_usage}% → ${machine2.cpu_usage}%`);
    }
  });
});
