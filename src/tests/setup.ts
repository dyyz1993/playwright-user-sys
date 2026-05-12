/**
 * Vitest setup file
 * This runs before all tests to ensure environment variables are set
 */

process.env.NODE_ENV = 'test';
process.env.DB_TYPE = 'mysql';
process.env.DB_NAME = 'playwright_test_user_sys';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only-32chars';
process.env.JWT_EXPIRES_IN = '24h';
process.env.ADMIN_PASSWORD = 'test-admin-password-for-testing';
