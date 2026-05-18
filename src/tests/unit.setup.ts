import { unlinkSync, existsSync } from 'fs';

process.env.NODE_ENV = 'test';
process.env.DB_TYPE = 'sqlite';
process.env.DB_NAME = 'playwright_test_user_sys';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only-32chars';
process.env.JWT_EXPIRES_IN = '24h';
process.env.ADMIN_PASSWORD = 'test-admin-password-for-testing';

if (process.env.UNIT_TEST_SQLITE_PATH) {
  process.env.DB_PATH = process.env.UNIT_TEST_SQLITE_PATH;
}

process.on('exit', () => {
  const dbPath = process.env.UNIT_TEST_SQLITE_PATH;
  if (dbPath && existsSync(dbPath)) {
    try {
      unlinkSync(dbPath);
    } catch (_e) {
      // ignore cleanup errors
    }
  }
});
