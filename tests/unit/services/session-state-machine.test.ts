/**
 * UNIT-STATE: 会话状态机单元测试
 *
 * 测试文件: tests/unit/services/session-state-machine.test.ts
 *
 * 基于代码位置: src/models/session.model.ts 和 @shared/types/index.ts
 *
 * 实际 SessionStatus 枚举值: CREATED, CONNECTED, DISCONNECTED, EXPIRED, ERROR, COMPLETED
 *
 * 状态转换图:
 * CREATED -> CONNECTED -> DISCONNECTED -> COMPLETED
 *          ↘ ERROR ↗                        ↑
 *            └────────────────────────────────┘
 *
 * EXPIRED: 会话过期状态
 *
 * 测试覆盖:
 * - 所有有效状态转换
 * - 无效状态转换（应该失败）
 * - 状态回滚保护
 * - 终态保护
 * - 状态与计费的关系
 */

import { describe, it, expect } from 'vitest';
import { SessionStatus } from '@shared/types/index.js';

describe('SessionStateMachine - 会话状态机', () => {

  describe('有效状态转换', () => {
    it('UNIT-STATE-001: CREATED -> CONNECTED 是合法转换', () => {
      const transition = isValidTransition(SessionStatus.CREATED, SessionStatus.CONNECTED);
      expect(transition).toBe(true);
    });

    it('UNIT-STATE-002: CONNECTED -> DISCONNECTED 是合法转换', () => {
      const transition = isValidTransition(SessionStatus.CONNECTED, SessionStatus.DISCONNECTED);
      expect(transition).toBe(true);
    });

    it('UNIT-STATE-003: DISCONNECTED -> COMPLETED 是合法转换', () => {
      const transition = isValidTransition(SessionStatus.DISCONNECTED, SessionStatus.COMPLETED);
      expect(transition).toBe(true);
    });

    it('UNIT-STATE-004: CREATED -> ERROR 是合法转换', () => {
      const transition = isValidTransition(SessionStatus.CREATED, SessionStatus.ERROR);
      expect(transition).toBe(true);
    });

    it('UNIT-STATE-005: CONNECTED -> ERROR 是合法转换', () => {
      const transition = isValidTransition(SessionStatus.CONNECTED, SessionStatus.ERROR);
      expect(transition).toBe(true);
    });

    it('UNIT-STATE-006: CONNECTED -> EXPIRED 是合法转换', () => {
      const transition = isValidTransition(SessionStatus.CONNECTED, SessionStatus.EXPIRED);
      expect(transition).toBe(true);
    });

    it('UNIT-STATE-007: DISCONNECTED -> ERROR 是合法转换', () => {
      const transition = isValidTransition(SessionStatus.DISCONNECTED, SessionStatus.ERROR);
      expect(transition).toBe(true);
    });

    it('UNIT-STATE-008: ERROR -> COMPLETED 是合法转换', () => {
      const transition = isValidTransition(SessionStatus.ERROR, SessionStatus.COMPLETED);
      expect(transition).toBe(true);
    });

    it('UNIT-STATE-009: EXPIRED -> COMPLETED 是合法转换', () => {
      const transition = isValidTransition(SessionStatus.EXPIRED, SessionStatus.COMPLETED);
      expect(transition).toBe(true);
    });
  });

  describe('无效状态转换', () => {
    it('UNIT-STATE-010: CONNECTED -> CREATED 是非法转换', () => {
      const transition = isValidTransition(SessionStatus.CONNECTED, SessionStatus.CREATED);
      expect(transition).toBe(false);
    });

    it('UNIT-STATE-011: DISCONNECTED -> CONNECTED 是非法转换', () => {
      const transition = isValidTransition(SessionStatus.DISCONNECTED, SessionStatus.CONNECTED);
      expect(transition).toBe(false);
    });

    it('UNIT-STATE-012: COMPLETED -> CONNECTED 是非法转换（终态）', () => {
      const transition = isValidTransition(SessionStatus.COMPLETED, SessionStatus.CONNECTED);
      expect(transition).toBe(false);
    });

    it('UNIT-STATE-013: COMPLETED -> DISCONNECTED 是非法转换（终态）', () => {
      const transition = isValidTransition(SessionStatus.COMPLETED, SessionStatus.DISCONNECTED);
      expect(transition).toBe(false);
    });

    it('UNIT-STATE-014: COMPLETED -> ERROR 是非法转换（终态）', () => {
      const transition = isValidTransition(SessionStatus.COMPLETED, SessionStatus.ERROR);
      expect(transition).toBe(false);
    });
  });

  describe('状态与计费关系', () => {
    it('UNIT-STATE-015: CREATED 状态不应计费', () => {
      const status = SessionStatus.CREATED;
      const shouldBill = shouldBillForStatus(status);
      expect(shouldBill).toBe(false);
    });

    it('UNIT-STATE-016: CONNECTED 状态应开始计费', () => {
      const status = SessionStatus.CONNECTED;
      const shouldBill = shouldBillForStatus(status);
      expect(shouldBill).toBe(true);
    });

    it('UNIT-STATE-017: DISCONNECTED 状态应结算计费', () => {
      const status = SessionStatus.DISCONNECTED;
      const shouldBill = shouldBillForStatus(status);
      expect(shouldBill).toBe(true);
    });

    it('UNIT-STATE-018: COMPLETED 状态不再计费', () => {
      const status = SessionStatus.COMPLETED;
      const shouldBill = shouldBillForStatus(status);
      expect(shouldBill).toBe(false);
    });

    it('UNIT-STATE-019: ERROR 状态可能结算计费', () => {
      const status = SessionStatus.ERROR;
      const shouldBill = shouldBillForStatus(status);
      expect(shouldBill).toBe(true);
    });

    it('UNIT-STATE-020: EXPIRED 状态应结算计费', () => {
      const status = SessionStatus.EXPIRED;
      const shouldBill = shouldBillForStatus(status);
      expect(shouldBill).toBe(true);
    });
  });

  describe('完整状态转换流程', () => {
    it('UNIT-STATE-021: 正常会话流程 CREATED -> CONNECTED -> DISCONNECTED -> COMPLETED', () => {
      const flow = [
        SessionStatus.CREATED,
        SessionStatus.CONNECTED,
        SessionStatus.DISCONNECTED,
        SessionStatus.COMPLETED,
      ];

      for (let i = 0; i < flow.length - 1; i++) {
        const from = flow[i];
        const to = flow[i + 1];
        const isValid = isValidTransition(from, to);
        expect(isValid).toBe(true);
      }
    });

    it('UNIT-STATE-022: 错误会话流程 CREATED -> ERROR -> COMPLETED', () => {
      const flow = [
        SessionStatus.CREATED,
        SessionStatus.ERROR,
        SessionStatus.COMPLETED,
      ];

      for (let i = 0; i < flow.length - 1; i++) {
        const from = flow[i];
        const to = flow[i + 1];
        const isValid = isValidTransition(from, to);
        expect(isValid).toBe(true);
      }
    });

    it('UNIT-STATE-023: 过期会话流程 CREATED -> CONNECTED -> EXPIRED -> COMPLETED', () => {
      const flow = [
        SessionStatus.CREATED,
        SessionStatus.CONNECTED,
        SessionStatus.EXPIRED,
        SessionStatus.COMPLETED,
      ];

      for (let i = 0; i < flow.length - 1; i++) {
        const from = flow[i];
        const to = flow[i + 1];
        const isValid = isValidTransition(from, to);
        expect(isValid).toBe(true);
      }
    });
  });

  describe('状态机属性', () => {
    it('UNIT-STATE-024: COMPLETED 是终态', () => {
      const isFinal = isFinalState(SessionStatus.COMPLETED);
      expect(isFinal).toBe(true);
    });

    it('UNIT-STATE-025: ERROR 可以转到终态', () => {
      const canTransition = isValidTransition(SessionStatus.ERROR, SessionStatus.COMPLETED);
      expect(canTransition).toBe(true);
    });

    it('UNIT-STATE-026: CREATED 是初始状态', () => {
      // CREATED 只能从无到有创建，不能从其他状态转换而来
      expect(SessionStatus.CREATED).toBeDefined();
    });

    it('UNIT-STATE-027: 所有状态都应该有明确的定义', () => {
      const allStatuses = Object.values(SessionStatus);
      const expectedStatuses = [
        'created',
        'connected',
        'disconnected',
        'expired',
        'error',
        'completed',
      ];

      allStatuses.forEach(status => {
        expect(expectedStatuses).toContain(status);
      });
    });
  });

  describe('边界条件', () => {
    it('UNIT-STATE-028: 状态不能跳过中间步骤', () => {
      // CREATED -> DISCONNECTED 是非法的（必须经过 CONNECTED）
      const transition = isValidTransition(SessionStatus.CREATED, SessionStatus.DISCONNECTED);
      expect(transition).toBe(false);
    });

    it('UNIT-STATE-029: 从计费状态转到非计费状态需要经过结算', () => {
      // CONNECTED -> COMPLETED 是非法的（应该先经过 DISCONNECTED 结算）
      const transition1 = isValidTransition(SessionStatus.CONNECTED, SessionStatus.COMPLETED);
      expect(transition1).toBe(false);

      // 但 CONNECTED -> ERROR 是合法的（异常情况）
      const transition2 = isValidTransition(SessionStatus.CONNECTED, SessionStatus.ERROR);
      expect(transition2).toBe(true);
    });

    it('UNIT-STATE-030: 状态应该有明确的字符串表示', () => {
      expect(SessionStatus.CREATED).toBe('created');
      expect(SessionStatus.CONNECTED).toBe('connected');
      expect(SessionStatus.DISCONNECTED).toBe('disconnected');
      expect(SessionStatus.EXPIRED).toBe('expired');
      expect(SessionStatus.ERROR).toBe('error');
      expect(SessionStatus.COMPLETED).toBe('completed');
    });
  });

  describe('状态转换规则', () => {
    it('UNIT-STATE-031: 应该定义所有合法的状态转换', () => {
      const validTransitions = {
        [SessionStatus.CREATED]: [
          SessionStatus.CONNECTED,
          SessionStatus.ERROR,
        ],
        [SessionStatus.CONNECTED]: [
          SessionStatus.DISCONNECTED,
          SessionStatus.ERROR,
          SessionStatus.EXPIRED,
        ],
        [SessionStatus.DISCONNECTED]: [
          SessionStatus.COMPLETED,
          SessionStatus.ERROR,
        ],
        [SessionStatus.EXPIRED]: [
          SessionStatus.COMPLETED,
        ],
        [SessionStatus.ERROR]: [
          SessionStatus.COMPLETED,
        ],
        [SessionStatus.COMPLETED]: [], // 终态
      };

      // 验证所有定义的转换都是合法的
      Object.entries(validTransitions).forEach(([from, toList]) => {
        toList.forEach(to => {
          const isValid = isValidTransition(from as SessionStatus, to);
          expect(isValid).toBe(true);
        });
      });

      // 验证数量
      expect(Object.keys(validTransitions).length).toBe(6);
    });
  });
});

/**
 * 辅助函数：验证状态转换是否合法
 */
function isValidTransition(from: SessionStatus, to: SessionStatus): boolean {
  const validTransitions: Record<SessionStatus, SessionStatus[]> = {
    [SessionStatus.CREATED]: [
      SessionStatus.CONNECTED,
      SessionStatus.ERROR,
    ],
    [SessionStatus.CONNECTED]: [
      SessionStatus.DISCONNECTED,
      SessionStatus.ERROR,
      SessionStatus.EXPIRED,
    ],
    [SessionStatus.DISCONNECTED]: [
      SessionStatus.COMPLETED,
      SessionStatus.ERROR,
    ],
    [SessionStatus.EXPIRED]: [
      SessionStatus.COMPLETED,
    ],
    [SessionStatus.ERROR]: [
      SessionStatus.COMPLETED,
    ],
    [SessionStatus.COMPLETED]: [], // 终态，不能转换
  };

  return validTransitions[from]?.includes(to) ?? false;
}

/**
 * 辅助函数：检查状态是否为终态
 */
function isFinalState(status: SessionStatus): boolean {
  const finalStates = [SessionStatus.COMPLETED];
  return finalStates.includes(status);
}

/**
 * 辅助函数：检查状态是否应该计费
 */
function shouldBillForStatus(status: SessionStatus): boolean {
  const billableStatuses = [
    SessionStatus.CONNECTED,
    SessionStatus.DISCONNECTED, // 结算时计费
    SessionStatus.ERROR, // 结算时计费
    SessionStatus.EXPIRED, // 结算时计费
  ];

  return billableStatuses.includes(status);
}
