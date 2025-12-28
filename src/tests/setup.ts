/**
 * Vitest setup file
 * This runs before all tests to ensure environment variables are set
 */

// 确保测试环境变量在模块加载前就设置好
// 使用 MySQL 进行测试（better-sqlite3 需要编译原生模块）
process.env.NODE_ENV = 'test';
process.env.DB_TYPE = 'mysql';
process.env.DB_NAME = 'playwright_test_user_sys';  // 使用测试数据库
