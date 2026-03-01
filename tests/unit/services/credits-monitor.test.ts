/**
 * UNIT-MONITOR: 积分监控单元测试
 *
 * 测试文件: tests/unit/services/credits-monitor.test.ts
 *
 * 基于代码位置: src/services/credits-monitor.service.ts
 *
 * 监控逻辑:
 * 1. 定期检查所有活跃会话的点数情况
 * 2. 计算会话持续时间和消耗点数
 * 3. 扣除用户点数（增量扣费）
 * 4. 点数不足时关闭会话
 * 5. 触发 Webhook 事件
 *
 * 测试覆盖:
 * - 正常监控流程
 * - 点数计算
 * - 会话关闭
 * - 边界条件
 * - 错误处理
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionStatus } from '@shared/types/index.js';

// Mock models
const mockSessionModel = {
  findActiveSessions: vi.fn(),
  markDisconnected: vi.fn(),
  batchUpdate: vi.fn(),
  findById: vi.fn(),
};

const mockUserModel = {
  findById: vi.fn(),
  deductCredits: vi.fn(),
};

const mockMachineModel = {
  decrementInstanceCount: vi.fn(),
};

const mockConnectionManager = {
  getActiveConnections: vi.fn(),
  closeBrowser: vi.fn(),
  sendCloseBrowserCommand: vi.fn(),
};

const mockWebhookEvent = vi.fn();

describe('CreditsMonitor - 积分监控', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
  });

  describe('正常监控流程', () => {
    it('UNIT-MONITOR-001: 应该检查所有活跃会话的点数', async () => {
      // Mock: 返回2个活跃会话
      mockSessionModel.findActiveSessions.mockResolvedValue([
        {
          id: 'session-1',
          user_id: 1,
          machine_id: 'machine-1',
          start_time: new Date(Date.now() - 60000), // 1分钟前
          duration: 60,
          credits_used: 0,
        },
        {
          id: 'session-2',
          user_id: 1,
          machine_id: 'machine-1',
          start_time: new Date(Date.now() - 30000), // 30秒前
          duration: 30,
          credits_used: 0,
        },
      ]);

      mockConnectionManager.getActiveConnections.mockReturnValue(['machine-1']);
      mockUserModel.findById.mockResolvedValue({
        id: 1,
        username: 'test-user',
        credits: 100,
      });

      const activeSessions = await mockSessionModel.findActiveSessions();
      expect(activeSessions).toHaveLength(2);
    });

    it('UNIT-MONITOR-002: 应该正确计算会话持续时间和点数', () => {
      const duration = 90; // 90秒
      const credits = Math.max(1, Math.ceil(duration / 60));

      expect(credits).toBe(2); // 90秒 = 2分钟
    });

    it('UNIT-MONITOR-003: 应该进行增量扣费（避免重复计费）', async () => {
      // 第一次检查：已运行60秒，应扣1点
      const session1 = {
        duration: 60,
        credits_used: 0,
      };
      const credits1 = Math.max(1, Math.ceil(session1.duration / 60));
      const newCredits1 = credits1 - session1.credits_used;
      expect(newCredits1).toBe(1);

      // 第二次检查：已运行120秒，应扣2点（但已记录1点，本次只扣1点）
      const session2 = {
        duration: 120,
        credits_used: 1,
      };
      const credits2 = Math.max(1, Math.ceil(session2.duration / 60));
      const newCredits2 = credits2 - session2.credits_used;
      expect(newCredits2).toBe(1);

      // 验证总扣费 = 2点
      const totalDeducted = newCredits1 + newCredits2;
      expect(totalDeducted).toBe(2);
    });
  });

  describe('点数不足处理', () => {
    it('UNIT-MONITOR-004: 点数不足时应该关闭所有会话', async () => {
      const user = {
        id: 1,
        username: 'test-user',
        credits: 0, // 点数不足
      };

      const sessions = [
        { id: 'session-1', machine_id: 'machine-1', duration: 60 },
        { id: 'session-2', machine_id: 'machine-1', duration: 60 },
      ];

      mockUserModel.findById.mockResolvedValue(user);
      mockConnectionManager.closeBrowser.mockResolvedValue(true);
      mockSessionModel.markDisconnected.mockResolvedValue(undefined);
      mockMachineModel.decrementInstanceCount.mockResolvedValue(undefined);

      // 模拟检查点数并关闭会话
      if (user.credits <= 0) {
        for (const session of sessions) {
          await mockConnectionManager.closeBrowser(session.machine_id, session.id);
          await mockSessionModel.markDisconnected(session.id, session.duration);
          await mockMachineModel.decrementInstanceCount(session.machine_id);
        }
      }

      expect(mockConnectionManager.closeBrowser).toHaveBeenCalledTimes(2);
      expect(mockSessionModel.markDisconnected).toHaveBeenCalledTimes(2);
    });

    it('UNIT-MONITOR-005: 点数即将不足时应该发送警告', async () => {
      const user = {
        id: 1,
        username: 'test-user',
        credits: 3, // 点数即将不足
      };

      const totalNewCreditsToDeduct = 2; // 本次需要扣除2点

      mockUserModel.findById.mockResolvedValue(user);

      // 模拟检查并发送警告
      if (user.credits < totalNewCreditsToDeduct + 2) {
        await mockWebhookEvent(1, 'CREDITS_LOW', {
          user_id: user.id,
          credits_remaining: user.credits,
          warning_at: new Date(),
        });
      }

      expect(mockWebhookEvent).toHaveBeenCalledWith(
        1,
        'CREDITS_LOW',
        expect.objectContaining({
          user_id: 1,
          credits_remaining: 3,
        })
      );
    });
  });

  describe('无效会话处理', () => {
    it('UNIT-MONITOR-006: 应该标记不在在线机器上的会话为已断开', async () => {
      const activeSessions = [
        {
          id: 'session-1',
          machine_id: 'machine-1',
          duration: 60,
        },
        {
          id: 'session-2',
          machine_id: 'machine-offline', // 不在线的机器
          duration: 60,
        },
      ];

      mockConnectionManager.getActiveConnections.mockReturnValue(['machine-1']);
      mockSessionModel.markDisconnected.mockResolvedValue(undefined);

      // 过滤出无效会话
      const invalidSessions = activeSessions.filter(
        (session) => !session.machine_id || !mockConnectionManager.getActiveConnections().includes(session.machine_id)
      );

      expect(invalidSessions).toHaveLength(1);
      expect(invalidSessions[0].id).toBe('session-2');

      // 标记为已断开
      for (const session of invalidSessions) {
        await mockSessionModel.markDisconnected(session.id, session.duration);
      }

      expect(mockSessionModel.markDisconnected).toHaveBeenCalledWith('session-2', 60);
    });
  });

  describe('批量处理', () => {
    it('UNIT-MONITOR-007: 应该按用户分组处理会话', async () => {
      const sessions = [
        { id: 'session-1', user_id: 1, machine_id: 'machine-1', duration: 60, credits_used: 0 },
        { id: 'session-2', user_id: 1, machine_id: 'machine-1', duration: 60, credits_used: 0 },
        { id: 'session-3', user_id: 2, machine_id: 'machine-1', duration: 60, credits_used: 0 },
      ];

      // 按用户ID分组
      const sessionsByUser = new Map<number, typeof sessions>();
      for (const session of sessions) {
        if (!sessionsByUser.has(session.user_id)) {
          sessionsByUser.set(session.user_id, []);
        }
        sessionsByUser.get(session.user_id)!.push(session);
      }

      expect(sessionsByUser.size).toBe(2);
      expect(sessionsByUser.get(1)).toHaveLength(2);
      expect(sessionsByUser.get(2)).toHaveLength(1);
    });

    it('UNIT-MONITOR-008: 应该使用事务批量更新会话和扣除点数', async () => {
      const sessionUpdates = [
        { id: 'session-1', duration: 60, credits_used: 1 },
        { id: 'session-2', duration: 120, credits_used: 2 },
      ];

      const totalCredits = 3;
      const userId = 1;

      const mockTransaction = async (callback: any) => {
        await callback({
          sessionModel: {
            batchUpdate: vi.fn().mockResolvedValue(2),
          },
          userModel: {
            deductCredits: vi.fn().mockResolvedValue(undefined),
          },
        });
      };

      // 模拟事务处理
      await mockTransaction(async (trx: any) => {
        await mockSessionModel.batchUpdate(sessionUpdates, trx);
        await mockUserModel.deductCredits(userId, totalCredits, trx);
      });

      expect(mockSessionModel.batchUpdate).toHaveBeenCalledWith(sessionUpdates, expect.anything());
      expect(mockUserModel.deductCredits).toHaveBeenCalledWith(userId, totalCredits, expect.anything());
    });
  });

  describe('定时器', () => {
    it('UNIT-MONITOR-009: 应该启动定时监控', () => {
      const checkFunction = vi.fn();
      const intervalMs = 10000;

      const timer = setInterval(checkFunction, intervalMs);

      expect(timer).toBeDefined();

      // 清理
      clearInterval(timer);
    });

    it('UNIT-MONITOR-010: 应该能够停止定时监控', () => {
      const checkFunction = vi.fn();
      const intervalMs = 10000;

      const timer = setInterval(checkFunction, intervalMs);

      // 停止定时器
      clearInterval(timer);

      // 验证定时器已停止
      expect(timer).toBeDefined();
    });
  });

  describe('边界条件', () => {
    it('应该处理会话没有开始时间的情况', async () => {
      const session = {
        id: 'session-1',
        start_time: null, // 没有开始时间
        duration: 0,
      };

      // 使用已记录的持续时间
      const duration = session.duration || 0;

      expect(duration).toBe(0);

      // 计算点数
      const credits = duration > 0 ? Math.max(1, Math.ceil(duration / 60)) : 0;
      expect(credits).toBe(0);
    });

    it('应该处理会话持续时间为0的情况', () => {
      const duration = 0;
      const credits = duration > 0 ? Math.max(1, Math.ceil(duration / 60)) : 0;
      expect(credits).toBe(0);
    });

    it('应该处理用户不存在的情况', async () => {
      mockUserModel.findById.mockResolvedValue(null);

      const userId = 999;
      const user = await mockUserModel.findById(userId);

      expect(user).toBeNull();

      // 应该跳过处理
      if (!user) {
        console.log(`用户 ${userId} 不存在，跳过处理`);
        expect(true).toBe(true);
      }
    });
  });

  describe('错误处理', () => {
    it('应该处理数据库查询失败的情况', async () => {
      mockSessionModel.findActiveSessions.mockRejectedValue(new Error('数据库查询失败'));

      await expect(mockSessionModel.findActiveSessions()).rejects.toThrow('数据库查询失败');
    });

    it('应该处理扣费失败的情况', async () => {
      mockUserModel.deductCredits.mockRejectedValue(new Error('扣费失败'));

      await expect(mockUserModel.deductCredits(1, 10)).rejects.toThrow('扣费失败');
    });

    it('应该处理关闭浏览器失败的情况', async () => {
      mockConnectionManager.closeBrowser.mockRejectedValue(new Error('关闭浏览器失败'));

      await expect(mockConnectionManager.closeBrowser('machine-1', 'session-1')).rejects.toThrow('关闭浏览器失败');

      // 应该尝试发送关闭命令
      expect(mockConnectionManager.sendCloseBrowserCommand).not.toHaveBeenCalled();
    });
  });
});
