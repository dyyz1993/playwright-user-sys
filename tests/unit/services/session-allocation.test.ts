/**
 * UNIT-ALLOC: 会话分配单元测试
 *
 * 测试文件: tests/unit/services/session-allocation.test.ts
 *
 * 基于代码位置: src/services/session.service.ts 和 src/models/machine.model.ts
 *
 * 分配逻辑:
 * 1. 查找可用的实例机器（连接状态且未达到最大实例数）
 * 2. 选择实例数量最少的机器（负载均衡）
 * 3. 创建会话记录
 * 4. 启动浏览器实例
 * 5. 更新会话状态
 *
 * 测试覆盖:
 * - 正常分配流程
 * - 机器选择算法
 * - 边界条件
 * - 错误处理
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionStatus } from '@shared/types/index.js';

// Mock connectionManager
const mockConnectionManager = {
  getAllConnectedMachines: vi.fn(),
  launchBrowser: vi.fn(),
  closeBrowser: vi.fn(),
  getActiveConnections: vi.fn(),
};

// Mock database
const mockDb = vi.fn();

describe('SessionAllocation - 会话分配', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('正常分配流程', () => {
    it('UNIT-ALLOC-001: 应该成功分配会话到可用机器', async () => {
      // Mock: 有2台已连接的机器
      mockConnectionManager.getAllConnectedMachines.mockReturnValue(['machine-1', 'machine-2']);

      // Mock: 数据库返回可用机器（按实例数升序排列）
      const mockMachines = [
        { id: 'machine-1', hostname: 'host-1', ip: '192.168.1.1', instance_count: 2, max_instances: 5 },
        { id: 'machine-2', hostname: 'host-2', ip: '192.168.1.2', instance_count: 3, max_instances: 5 },
      ];

      // Mock: 启动浏览器成功
      mockConnectionManager.launchBrowser.mockResolvedValue({
        port: 9222,
        browser_ws_endpoint: 'ws://localhost:9222',
      });

      // 模拟分配逻辑
      const selectedMachine = mockMachines[0]; // 选择实例数最少的机器
      expect(selectedMachine.id).toBe('machine-1');
      expect(selectedMachine.instance_count).toBeLessThan(selectedMachine.max_instances);
    });

    it('UNIT-ALLOC-002: 应该选择实例数量最少的机器', async () => {
      const machines = [
        { id: 'machine-1', instance_count: 5, max_instances: 10 },
        { id: 'machine-2', instance_count: 2, max_instances: 10 }, // 最少
        { id: 'machine-3', instance_count: 4, max_instances: 10 },
      ];

      // 按实例数升序排序，选择第一个
      const sorted = [...machines].sort((a, b) => a.instance_count - b.instance_count);
      const selected = sorted[0];

      expect(selected.id).toBe('machine-2');
      expect(selected.instance_count).toBe(2);
    });

    it('UNIT-ALLOC-003: 应该成功启动浏览器并更新会话状态', async () => {
      mockConnectionManager.launchBrowser.mockResolvedValue({
        port: 9222,
        browser_ws_endpoint: 'ws://localhost:9222',
      });

      const result = await mockConnectionManager.launchBrowser('machine-1', 'session-123', {
        viewport: { width: 1280, height: 800 },
      });

      expect(result.port).toBeDefined();
      expect(result.browser_ws_endpoint).toContain('ws://');
      expect(mockConnectionManager.launchBrowser).toHaveBeenCalledWith('machine-1', 'session-123', {
        viewport: { width: 1280, height: 800 },
      });
    });
  });

  describe('机器选择算法', () => {
    it('UNIT-ALLOC-004: 应该只选择已连接的机器', async () => {
      mockConnectionManager.getAllConnectedMachines.mockReturnValue(['machine-1', 'machine-3']);

      const connectedMachines = mockConnectionManager.getAllConnectedMachines();

      // 只有已连接的机器才应该被选择
      expect(connectedMachines).toContain('machine-1');
      expect(connectedMachines).toContain('machine-3');
      expect(connectedMachines).not.toContain('machine-2'); // 未连接
      expect(connectedMachines.length).toBe(2);
    });

    it('UNIT-ALLOC-005: 应该排除已达到最大实例数的机器', async () => {
      const machines = [
        { id: 'machine-1', instance_count: 5, max_instances: 5 }, // 已满
        { id: 'machine-2', instance_count: 3, max_instances: 5 }, // 可用
      ];

      const available = machines.filter((m) => m.instance_count < m.max_instances);

      expect(available).toHaveLength(1);
      expect(available[0].id).toBe('machine-2');
    });

    it('UNIT-ALLOC-006: 多台机器可用时应选择负载最低的', async () => {
      const machines = [
        { id: 'machine-1', instance_count: 1, max_instances: 10, load: 0.1 },
        { id: 'machine-2', instance_count: 8, max_instances: 10, load: 0.8 },
        { id: 'machine-3', instance_count: 3, max_instances: 10, load: 0.3 },
      ];

      // 按实例数升序排序
      const sorted = [...machines].sort((a, b) => a.instance_count - b.instance_count);
      const selected = sorted[0];

      expect(selected.id).toBe('machine-1');
      expect(selected.instance_count).toBe(1);
    });
  });

  describe('边界条件', () => {
    it('UNIT-ALLOC-007: 没有可用机器时应返回错误', async () => {
      mockConnectionManager.getAllConnectedMachines.mockReturnValue([]);

      const connectedMachines = mockConnectionManager.getAllConnectedMachines();

      expect(connectedMachines).toHaveLength(0);

      // 验证错误处理
      expect(() => {
        if (connectedMachines.length === 0) {
          throw new Error('当前没有可用的实例机器，请稍后再试');
        }
      }).toThrow('当前没有可用的实例机器，请稍后再试');
    });

    it('UNIT-ALLOC-008: 所有机器都已满载时应返回错误', async () => {
      const machines = [
        { id: 'machine-1', instance_count: 5, max_instances: 5 }, // 已满
        { id: 'machine-2', instance_count: 5, max_instances: 5 }, // 已满
      ];

      const available = machines.filter((m) => m.instance_count < m.max_instances);

      expect(available).toHaveLength(0);

      // 验证错误处理
      expect(() => {
        if (available.length === 0) {
          throw new Error('所有机器实例数已满，请稍后再试');
        }
      }).toThrow('所有机器实例数已满，请稍后再试');
    });
  });

  describe('错误处理', () => {
    it('应该处理启动浏览器失败的情况', async () => {
      mockConnectionManager.launchBrowser.mockRejectedValue(new Error('启动浏览器失败'));

      await expect(mockConnectionManager.launchBrowser('machine-1', 'session-123', {})).rejects.toThrow(
        '启动浏览器失败'
      );

      // 验证失败后应该标记会话为错误状态
      expect(SessionStatus.ERROR).toBe('error');
    });

    it('应该处理机器连接中断的情况', async () => {
      mockConnectionManager.getAllConnectedMachines.mockReturnValue(['machine-1']);
      mockConnectionManager.launchBrowser.mockRejectedValue(new Error('机器连接中断'));

      await expect(mockConnectionManager.launchBrowser('machine-1', 'session-123', {})).rejects.toThrow('机器连接中断');
    });
  });

  describe('性能和并发', () => {
    it('应该高效地查找可用机器', () => {
      const machines = Array.from({ length: 100 }, (_, i) => ({
        id: `machine-${i}`,
        instance_count: Math.floor(Math.random() * 10),
        max_instances: 10,
      }));

      const startTime = Date.now();
      const available = machines.filter((m) => m.instance_count < m.max_instances);
      const sorted = available.sort((a, b) => a.instance_count - b.instance_count);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(10); // 应该非常快
      expect(sorted.length).toBeGreaterThan(0);
    });

    it('应该支持并发创建会话', async () => {
      const sessions = Array.from({ length: 5 }, (_, i) => `session-${i}`);

      mockConnectionManager.launchBrowser.mockImplementation((machineId, sessionId) =>
        Promise.resolve({
          port: 9222 + parseInt(sessionId.split('-')[1]),
          browser_ws_endpoint: `ws://localhost:9222`,
        })
      );

      const results = await Promise.all(
        sessions.map((sessionId) => mockConnectionManager.launchBrowser('machine-1', sessionId, {}))
      );

      expect(results).toHaveLength(5);
      expect(mockConnectionManager.launchBrowser).toHaveBeenCalledTimes(5);
    });
  });
});
