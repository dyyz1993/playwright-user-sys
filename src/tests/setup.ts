/**
 * Vitest setup file
 * This runs before all tests to ensure environment variables are set
 */

process.env.NODE_ENV = 'test';
process.env.DB_TYPE = 'mysql';
process.env.DB_NAME = 'playwright_test_user_sys';
