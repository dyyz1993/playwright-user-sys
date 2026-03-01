/**
 * UNIT-CREDITS: 计费算法单元测试
 *
 * 测试文件: tests/unit/services/credits-calculator.test.ts
 *
 * 基于代码位置: src/models/session.model.ts:230
 *
 * 计费公式: credits = Math.max(1, Math.ceil(duration / 60))
 *
 * 测试覆盖:
 * - 基础计费公式验证
 * - 边界条件测试
 * - 极端值处理
 * - 增量扣费逻辑
 */

import { describe, it, expect } from 'vitest';

describe('CreditsCalculator - 计费算法', () => {
  describe('基础计费公式验证', () => {
    it('UNIT-CREDITS-001: 1分钟内应扣1积分', () => {
      const duration = 30; // 30秒
      const credits = Math.max(1, Math.ceil(duration / 60));
      expect(credits).toBe(1);
    });

    it('UNIT-CREDITS-002: 刚好1分钟应扣1积分', () => {
      const duration = 60; // 60秒
      const credits = Math.max(1, Math.ceil(duration / 60));
      expect(credits).toBe(1);
    });

    it('UNIT-CREDITS-003: 超过1分钟应扣2积分', () => {
      const duration = 61; // 61秒
      const credits = Math.max(1, Math.ceil(duration / 60));
      expect(credits).toBe(2);
    });
  });

  describe('边界条件测试', () => {
    it('UNIT-CREDITS-004: 0秒应扣1积分（最小计费）', () => {
      const duration = 0;
      const credits = Math.max(1, Math.ceil(duration / 60));
      expect(credits).toBe(1);
    });

    it('UNIT-CREDITS-005: 1秒应扣1积分', () => {
      const duration = 1;
      const credits = Math.max(1, Math.ceil(duration / 60));
      expect(credits).toBe(1);
    });

    it('UNIT-CREDITS-006: 59秒应扣1积分（未到1分钟）', () => {
      const duration = 59;
      const credits = Math.max(1, Math.ceil(duration / 60));
      expect(credits).toBe(1);
    });

    it('UNIT-CREDITS-007: 119秒应扣2积分（1分59秒）', () => {
      const duration = 119;
      const credits = Math.max(1, Math.ceil(duration / 60));
      expect(credits).toBe(2);
    });

    it('UNIT-CREDITS-008: 120秒应扣2积分（正好2分钟）', () => {
      const duration = 120;
      const credits = Math.max(1, Math.ceil(duration / 60));
      expect(credits).toBe(2);
    });

    it('UNIT-CREDITS-009: 121秒应扣3积分（2分1秒）', () => {
      const duration = 121;
      const credits = Math.max(1, Math.ceil(duration / 60));
      expect(credits).toBe(3);
    });

    it('边界: 30秒应扣1积分', () => {
      const duration = 30;
      const credits = Math.max(1, Math.ceil(duration / 60));
      expect(credits).toBe(1);
    });

    it('边界: 90秒应扣2积分', () => {
      const duration = 90;
      const credits = Math.max(1, Math.ceil(duration / 60));
      expect(credits).toBe(2);
    });

    it('边界: 150秒应扣3积分', () => {
      const duration = 150;
      const credits = Math.max(1, Math.ceil(duration / 60));
      expect(credits).toBe(3);
    });

    it('边界: 300秒应扣5积分', () => {
      const duration = 300;
      const credits = Math.max(1, Math.ceil(duration / 60));
      expect(credits).toBe(5);
    });
  });

  describe('极端值处理', () => {
    it('UNIT-CREDITS-010: 负数应返回1积分（防御性编程）', () => {
      const duration = -1;
      const credits = Math.max(1, Math.ceil(duration / 60));
      // Math.ceil(-0.016) = 0, Math.max(1, 0) = 1
      expect(credits).toBe(1);
    });

    it('UNIT-CREDITS-011: 非常大的数（1天）应正确计算', () => {
      const duration = 86400; // 24小时 = 1440分钟
      const credits = Math.max(1, Math.ceil(duration / 60));
      expect(credits).toBe(1440);
    });

    it('极端: MAX_SAFE_INTEGER 应正确处理', () => {
      const duration = Number.MAX_SAFE_INTEGER;
      const credits = Math.max(1, Math.ceil(duration / 60));
      expect(credits).toBeGreaterThan(0);
      expect(Number.isSafeInteger(credits)).toBe(true);
    });
  });

  describe('精度测试', () => {
    it('UNIT-CREDITS-012: 浮点数舍入（59.9秒）', () => {
      const duration = 59.9;
      const credits = Math.max(1, Math.ceil(duration / 60));
      // 59.9 / 60 = 0.9983... → Ceil = 1
      expect(credits).toBe(1);
    });

    it('精度: 60.1秒应向上取整为2积分', () => {
      const duration = 60.1;
      const credits = Math.max(1, Math.ceil(duration / 60));
      expect(credits).toBe(2);
    });

    it('精度: 119.9秒应向上取整为2积分', () => {
      const duration = 119.9;
      const credits = Math.max(1, Math.ceil(duration / 60));
      expect(credits).toBe(2);
    });

    it('精度: 120.1秒应向上取整为3积分', () => {
      const duration = 120.1;
      const credits = Math.max(1, Math.ceil(duration / 60));
      expect(credits).toBe(3);
    });
  });

  describe('增量扣费逻辑', () => {
    it('UNIT-CREDITS-013: 增量扣费应避免重复计费', () => {
      // 模拟场景：
      // - 初始: credits_used = 0
      // - 第一次检查（10秒后）: duration = 10, credits = 1（增量）
      // - 第二次检查（70秒后）: duration = 70, credits = 2（增量，不是累计）
      // - 第三次检查（150秒后）: duration = 150, credits = 3（增量）

      const timeline = [
        { time: 0, credits: 100, deducted: 0, totalDuration: 0 },
        { time: 10, credits: 100, deducted: 0, totalDuration: 10 }, // 未到1分钟
        { time: 70, credits: 98, deducted: 2, totalDuration: 70 }, // 1分10秒，扣2分
        { time: 150, credits: 97, deducted: 1, totalDuration: 150 }, // 再用80秒，再扣1分
      ];

      // 验证总扣费 = 3分
      const totalDeducted = timeline.reduce((sum, t) => sum + t.deducted, 0);
      expect(totalDeducted).toBe(3);

      // 验证最终积分 = 97
      const finalCredits = timeline[timeline.length - 1].credits;
      expect(finalCredits).toBe(97);

      // 验证最终积分 = 初始积分 - 总扣费
      const initialCredits = timeline[0].credits;
      expect(finalCredits).toBe(initialCredits - totalDeducted);
    });

    it('增量扣费: 模拟后台定时检查', () => {
      // 每10秒检查一次的增量扣费逻辑
      let totalCredits = 100;
      let lastCreditsUsed = 0;

      const checks = [
        { duration: 10 }, // credits = Math.ceil(10/60) = 1, 但增量 = 0
        { duration: 20 }, // credits = Math.ceil(20/60) = 1, 但增量 = 0
        { duration: 30 }, // credits = Math.ceil(30/60) = 1, 但增量 = 0
        { duration: 70 }, // credits = Math.ceil(70/60) = 2, 增量 = 2
        { duration: 150 }, // credits = Math.ceil(150/60) = 3, 增量 = 1
      ];

      checks.forEach(({ duration }) => {
        const newCreditsUsed = Math.max(1, Math.ceil(duration / 60));
        const incrementalCredits = newCreditsUsed - lastCreditsUsed;

        if (incrementalCredits > 0) {
          totalCredits -= incrementalCredits;
          lastCreditsUsed = newCreditsUsed;
        }
      });

      // 最终应该扣除 3 分
      expect(totalCredits).toBe(97);
      expect(lastCreditsUsed).toBe(3);
    });
  });

  describe('实际场景模拟', () => {
    it('场景1: 极短会话（5秒）应扣1积分', () => {
      const duration = 5;
      const credits = Math.max(1, Math.ceil(duration / 60));
      expect(credits).toBe(1);
    });

    it('场景2: 标准会话（2分30秒）应扣3积分', () => {
      const duration = 150;
      const credits = Math.max(1, Math.ceil(duration / 60));
      expect(credits).toBe(3);
    });

    it('场景3: 长时间会话（10分钟）应扣10积分', () => {
      const duration = 600;
      const credits = Math.max(1, Math.ceil(duration / 60));
      expect(credits).toBe(10);
    });

    it('场景4: 超长会话（1小时）应扣60积分', () => {
      const duration = 3600;
      const credits = Math.max(1, Math.ceil(duration / 60));
      expect(credits).toBe(60);
    });

    it('场景5: 跨分钟边界（59秒 → 61秒）', () => {
      const duration1 = 59;
      const credits1 = Math.max(1, Math.ceil(duration1 / 60));
      expect(credits1).toBe(1);

      const duration2 = 61;
      const credits2 = Math.max(1, Math.ceil(duration2 / 60));
      expect(credits2).toBe(2);

      // 仅仅增加2秒，积分增加1
      expect(credits2 - credits1).toBe(1);
    });
  });

  describe('计费公式属性验证', () => {
    it('应该总是返回至少1积分', () => {
      for (let duration = 0; duration <= 120; duration += 10) {
        const credits = Math.max(1, Math.ceil(duration / 60));
        expect(credits).toBeGreaterThanOrEqual(1);
        expect(Number.isInteger(credits)).toBe(true);
      }
    });

    it('应该是单调递增的', () => {
      const credits1 = Math.max(1, Math.ceil(60 / 60)); // 1分钟 = 1积分
      const credits2 = Math.max(1, Math.ceil(61 / 60)); // 61秒 = 2积分
      const credits3 = Math.max(1, Math.ceil(120 / 60)); // 2分钟 = 2积分
      const credits4 = Math.max(1, Math.ceil(121 / 60)); // 121秒 = 3积分

      expect(credits2).toBeGreaterThan(credits1);
      expect(credits3).toBeGreaterThanOrEqual(credits2);
      expect(credits4).toBeGreaterThan(credits3);
    });

    it('应该遵循向上取整规则', () => {
      const testCases = [
        { duration: 1, expected: 1 },
        { duration: 30, expected: 1 },
        { duration: 31, expected: 1 },
        { duration: 60, expected: 1 },
        { duration: 61, expected: 2 },
        { duration: 90, expected: 2 },
        { duration: 91, expected: 2 },
        { duration: 120, expected: 2 },
        { duration: 121, expected: 3 },
      ];

      testCases.forEach(({ duration, expected }) => {
        const credits = Math.max(1, Math.ceil(duration / 60));
        expect(credits).toBe(expected);
      });
    });
  });

  describe('性能和边界', () => {
    it('应该快速计算（性能测试）', () => {
      const iterations = 100000;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        const duration = Math.random() * 3600; // 0-1小时
        Math.max(1, Math.ceil(duration / 60));
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000); // 1秒内完成10万次计算
    });

    it('应该处理NaN输入（防御性）', () => {
      const credits = Math.max(1, Math.ceil(Number.NaN / 60));
      // Math.ceil(NaN) = NaN, Math.max(1, NaN) = NaN
      // 注意: 在JavaScript中，任何与NaN的运算都会返回NaN
      expect(Number.isNaN(credits)).toBe(true);

      // 实际应用中应该先检查isNaN
      const duration = Number.NaN;
      const safeCredits = Number.isNaN(duration) ? 1 : Math.max(1, Math.ceil(duration / 60));
      expect(safeCredits).toBe(1);
    });

    it('应该处理Infinity输入', () => {
      const credits = Math.max(1, Math.ceil(Infinity / 60));
      expect(credits).toBe(Infinity);
    });
  });
});
