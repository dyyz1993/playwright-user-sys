import { describe, it, expect } from 'vitest';

describe('Database Isolation Guard', () => {
  it('should have NODE_ENV=test', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('should NOT use production database name', () => {
    const dbName = process.env.DB_NAME;
    expect(dbName).not.toBe('playwright_user_sys');
    if (dbName) {
      expect(dbName).toContain('test');
    }
  });

  it('should use isolated DB config (sqlite memory for unit, test mysql for integration)', () => {
    const dbType = process.env.DB_TYPE;
    expect(['sqlite', 'mysql']).toContain(dbType);

    if (dbType === 'sqlite') {
      expect(process.env.DB_PATH).toBe(':memory:');
    } else {
      expect(process.env.DB_NAME).toBe('playwright_test_user_sys');
    }
  });
});
