import { describe, it, expect } from 'vitest';
import { calculateCreditsUsed } from '../../../shared/utils/credits-calculator.js';

describe('calculateCreditsUsed', () => {
  it('should return 0 for 0 seconds', () => {
    expect(calculateCreditsUsed(0)).toBe(0);
  });

  it('should return 0 for negative seconds', () => {
    expect(calculateCreditsUsed(-10)).toBe(0);
  });

  it('should return 1 for any positive duration up to 60s', () => {
    expect(calculateCreditsUsed(1)).toBe(1);
    expect(calculateCreditsUsed(30)).toBe(1);
    expect(calculateCreditsUsed(60)).toBe(1);
  });

  it('should return 2 for 61 seconds', () => {
    expect(calculateCreditsUsed(61)).toBe(2);
  });

  it('should return 2 for 120 seconds (exactly 2 minutes)', () => {
    expect(calculateCreditsUsed(120)).toBe(2);
  });

  it('should return 3 for 121 seconds', () => {
    expect(calculateCreditsUsed(121)).toBe(3);
  });

  it('should handle fractional seconds by ceiling', () => {
    expect(calculateCreditsUsed(0.5)).toBe(1);
    expect(calculateCreditsUsed(60.1)).toBe(2);
  });

  it('should handle large durations', () => {
    expect(calculateCreditsUsed(3600)).toBe(60);
    expect(calculateCreditsUsed(86400)).toBe(1440);
  });
});
