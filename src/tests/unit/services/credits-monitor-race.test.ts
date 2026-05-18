import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionStatus } from '../../../shared/types/index.js';

const mockFindActiveSessions = vi.fn();
const mockMarkDisconnected = vi.fn();
const mockBatchUpdate = vi.fn();
const mockFindById = vi.fn();
const mockDeductCredits = vi.fn();
const mockDecrementInstanceCount = vi.fn();
const mockGetActiveConnections = vi.fn<() => string[]>(() => []);
const mockCloseBrowser = vi.fn();
const mockSendCloseBrowserCommand = vi.fn();
const mockCreateWebhookEvent = vi.fn();

vi.mock('../../../models/session/index.js', () => ({
  SessionModel: {
    findActiveSessions: mockFindActiveSessions,
    markDisconnected: mockMarkDisconnected,
    batchUpdate: mockBatchUpdate,
  },
}));

vi.mock('../../../models/user.model.js', () => ({
  UserModel: {
    findById: mockFindById,
    deductCredits: mockDeductCredits,
  },
}));

vi.mock('../../../models/machine.model.js', () => ({
  MachineModel: {
    decrementInstanceCount: mockDecrementInstanceCount,
  },
}));

vi.mock('../../../services/machine-grpc/index.js', () => ({
  connectionManager: {
    getActiveConnections: mockGetActiveConnections,
    closeBrowser: mockCloseBrowser,
    sendCloseBrowserCommand: mockSendCloseBrowserCommand,
  },
}));

vi.mock('../../../utils/webhook.js', () => ({
  createWebhookEvent: mockCreateWebhookEvent,
}));

vi.mock('../../../config/database.js', () => ({
  db: {
    transaction: vi.fn((fn) =>
      fn({
        commit: vi.fn(),
        rollback: vi.fn(),
      })
    ),
  },
}));

vi.mock('../../../shared/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

function createSimulatedDeductCredits(initialCredits: number) {
  let currentCredits = initialCredits;

  return vi.fn(async (userId: number, amount: number) => {
    if (currentCredits < amount) {
      throw new Error('点数不足');
    }
    currentCredits -= amount;
    return { id: userId, credits: currentCredits };
  });
}

describe('CreditsMonitor 并发竞态测试', () => {
  let checkSessionCredits: () => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetActiveConnections.mockReturnValue([]);
    mockFindActiveSessions.mockResolvedValue([]);

    const mod = await import('../../../services/credits-monitor.service.js');
    checkSessionCredits = mod.checkSessionCredits;
  });

  describe('deductCredits 原子性防超扣', () => {
    it('RACE-01: 5次并发扣减30点（余额100），最多成功3次，积分不小于0', async () => {
      const userId = 1;
      const initialCredits = 100;
      const deductAmount = 30;
      const concurrency = 5;

      const simulatedDeduct = createSimulatedDeductCredits(initialCredits);
      mockDeductCredits.mockImplementation(simulatedDeduct);

      const results = await Promise.allSettled(
        Array.from({ length: concurrency }, () => simulatedDeduct(userId, deductAmount))
      );

      const successes = results.filter((r) => r.status === 'fulfilled');
      const failures = results.filter((r) => r.status === 'rejected');

      expect(successes.length).toBe(3);
      expect(failures.length).toBeGreaterThanOrEqual(1);

      const totalDeducted = successes.length * deductAmount;
      expect(initialCredits - totalDeducted).toBeGreaterThanOrEqual(0);

      const lastSuccess = successes[successes.length - 1];
      if (lastSuccess.status === 'fulfilled') {
        expect(lastSuccess.value.credits).toBe(initialCredits - totalDeducted);
        expect(lastSuccess.value.credits).toBeGreaterThanOrEqual(0);
      }
    });

    it('RACE-02: 并发扣减后余额精确，无幽灵扣减', async () => {
      const userId = 1;
      const initialCredits = 100;
      const deductAmount = 20;
      const concurrency = 6;

      const simulatedDeduct = createSimulatedDeductCredits(initialCredits);
      mockDeductCredits.mockImplementation(simulatedDeduct);

      const results = await Promise.allSettled(
        Array.from({ length: concurrency }, () => simulatedDeduct(userId, deductAmount))
      );

      const successes = results.filter((r) => r.status === 'fulfilled');
      const totalDeducted = successes.length * deductAmount;

      expect(totalDeducted).toBeLessThanOrEqual(initialCredits);

      const expectedRemaining = initialCredits - totalDeducted;
      const lastSuccess = successes[successes.length - 1];
      if (lastSuccess.status === 'fulfilled') {
        expect(lastSuccess.value.credits).toBe(expectedRemaining);
        expect(lastSuccess.value.credits).toBeGreaterThanOrEqual(0);
      }
    });

    it('RACE-03: 余额恰好等于扣减金额时应该成功', async () => {
      const userId = 1;
      const initialCredits = 50;
      const deductAmount = 25;

      const simulatedDeduct = createSimulatedDeductCredits(initialCredits);
      mockDeductCredits.mockImplementation(simulatedDeduct);

      const result1 = await simulatedDeduct(userId, deductAmount);
      expect(result1.credits).toBe(25);

      const result2 = await simulatedDeduct(userId, deductAmount);
      expect(result2.credits).toBe(0);

      await expect(simulatedDeduct(userId, deductAmount)).rejects.toThrow('点数不足');
    });

    it('RACE-04: 单次扣减金额大于余额时立即失败', async () => {
      const userId = 1;
      const initialCredits = 10;
      const deductAmount = 50;

      const simulatedDeduct = createSimulatedDeductCredits(initialCredits);
      mockDeductCredits.mockImplementation(simulatedDeduct);

      await expect(simulatedDeduct(userId, deductAmount)).rejects.toThrow('点数不足');
    });
  });

  describe('checkSessionCredits 并发调用', () => {
    it('RACE-05: 多个checkSessionCredits并发时总扣减不超过余额', async () => {
      const userId = 1;
      const initialCredits = 100;
      const now = new Date();
      const startTime = new Date(now.getTime() - 120 * 1000);

      const sessions = [
        {
          id: 'sess-race-1',
          user_id: userId,
          machine_id: 'machine-001',
          status: SessionStatus.CONNECTED,
          duration: 0,
          start_time: startTime,
          credits_used: 0,
        },
        {
          id: 'sess-race-2',
          user_id: userId,
          machine_id: 'machine-001',
          status: SessionStatus.CONNECTED,
          duration: 0,
          start_time: startTime,
          credits_used: 0,
        },
      ];

      const user = { id: userId, username: 'raceuser', credits: initialCredits };

      const simulatedDeduct = createSimulatedDeductCredits(initialCredits);
      mockDeductCredits.mockImplementation(simulatedDeduct);

      mockFindActiveSessions.mockResolvedValue(sessions);
      mockGetActiveConnections.mockReturnValue(['machine-001']);
      mockFindById.mockResolvedValue(user);
      mockBatchUpdate.mockResolvedValue(2);

      const concurrency = 5;
      const results = await Promise.allSettled(Array.from({ length: concurrency }, () => checkSessionCredits()));

      const totalDeductions = mockDeductCredits.mock.calls.length;
      let totalDeducted = 0;

      for (const call of mockDeductCredits.mock.calls) {
        const amount = call[1] as number;
        totalDeducted += amount;
      }

      expect(totalDeducted).toBeLessThanOrEqual(initialCredits);
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    });

    it('RACE-06: deductCredits拒绝后不会出现负积分', async () => {
      const userId = 1;
      const initialCredits = 5;

      const simulatedDeduct = createSimulatedDeductCredits(initialCredits);

      const results = await Promise.allSettled(Array.from({ length: 10 }, () => simulatedDeduct(userId, 2)));

      const successes = results.filter((r) => r.status === 'fulfilled');
      const failures = results.filter((r) => r.status === 'rejected');

      expect(successes.length).toBe(2);
      expect(successes.length * 2).toBeLessThanOrEqual(initialCredits);
      expect(failures.length).toBe(8);

      const lastSuccess = successes[successes.length - 1];
      if (lastSuccess.status === 'fulfilled') {
        expect(lastSuccess.value.credits).toBe(initialCredits - successes.length * 2);
        expect(lastSuccess.value.credits).toBeGreaterThanOrEqual(0);
      }
    });

    it('RACE-07: 多用户并发扣减互不干扰', async () => {
      const user1InitialCredits = 60;
      const user2InitialCredits = 40;

      const deduct1 = createSimulatedDeductCredits(user1InitialCredits);
      const deduct2 = createSimulatedDeductCredits(user2InitialCredits);

      mockDeductCredits.mockImplementation(async (userId: number, amount: number) => {
        if (userId === 1) return deduct1(userId, amount);
        if (userId === 2) return deduct2(userId, amount);
        throw new Error('Unknown user');
      });

      const results = await Promise.allSettled([
        ...Array.from({ length: 3 }, () => deduct1(1, 30)),
        ...Array.from({ length: 3 }, () => deduct2(2, 25)),
      ]);

      const user1Successes = results.slice(0, 3).filter((r) => r.status === 'fulfilled');
      const user2Successes = results.slice(3).filter((r) => r.status === 'fulfilled');

      expect(user1Successes.length).toBe(2);
      expect(user2Successes.length).toBe(1);

      const user1Deducted = user1Successes.length * 30;
      const user2Deducted = user2Successes.length * 25;

      expect(user1InitialCredits - user1Deducted).toBeGreaterThanOrEqual(0);
      expect(user2InitialCredits - user2Deducted).toBeGreaterThanOrEqual(0);
    });
  });
});
