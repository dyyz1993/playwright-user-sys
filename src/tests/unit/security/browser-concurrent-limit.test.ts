import { describe, it, expect } from 'vitest';

// Pure logic test — no database, no service imports
// Tests the concurrent limit logic in isolation
function checkConcurrentLimit(currentSessions: number, maxSessions: number): void {
  if (currentSessions >= maxSessions) {
    const error = new Error(`已达到最大并发会话数上限 (${maxSessions})，请稍后再试`) as Error & { code?: string };
    (error as unknown as Record<string, unknown>).code = 'MAX_SESSIONS_REACHED';
    throw error;
  }
}

describe('Concurrent session limit logic', () => {
  it('should throw when current sessions >= maxSessions', () => {
    expect(() => checkConcurrentLimit(10, 10)).toThrow(/上限/);
    expect(() => checkConcurrentLimit(11, 10)).toThrow(/上限/);
  });

  it('should NOT throw when current sessions < maxSessions', () => {
    expect(() => checkConcurrentLimit(0, 10)).not.toThrow();
    expect(() => checkConcurrentLimit(9, 10)).not.toThrow();
  });

  it('should include MAX_SESSIONS_REACHED error code', () => {
    try {
      checkConcurrentLimit(10, 10);
      expect.unreachable('Should have thrown');
    } catch (error: unknown) {
      expect(error instanceof Error).toBe(true);
      expect((error as Error & { code?: string }).code).toBe('MAX_SESSIONS_REACHED');
      expect((error as Error).message).toContain('10');
    }
  });

  it('should handle edge case: maxSessions = 1', () => {
    expect(() => checkConcurrentLimit(0, 1)).not.toThrow();
    expect(() => checkConcurrentLimit(1, 1)).toThrow();
  });

  it('should handle zero sessions gracefully', () => {
    expect(() => checkConcurrentLimit(0, 10)).not.toThrow();
  });
});
