/**
 * 数据库测试辅助工具
 * 用于创建、清理和初始化测试数据库
 */

import knex, { Knex } from 'knex';

let testDbConnection: Knex | null = null;

/**
 * 数据库配置
 */
const dbConfig = {
  client: 'mysql2',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'playwright_test',
  },
};

/**
 * 获取数据库连接（无数据库名）
 */
function getAdminConnection(): Knex {
  return knex({
    client: dbConfig.client,
    connection: {
      host: dbConfig.connection.host,
      port: dbConfig.connection.port,
      user: dbConfig.connection.user,
      password: dbConfig.connection.password,
    },
  });
}

/**
 * 获取测试数据库连接
 */
export function getTestDbConnection(): Knex {
  if (!testDbConnection) {
    testDbConnection = knex(dbConfig);
  }
  return testDbConnection;
}

/**
 * 创建测试数据库
 * @returns Promise<string> 数据库名称
 */
export async function createTestDatabase(): Promise<string> {
  const adminConn = getAdminConnection();
  const dbName = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    // 创建数据库
    await adminConn.raw(`CREATE DATABASE ${dbName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`✅ 创建测试数据库: ${dbName}`);

    return dbName;
  } finally {
    await adminConn.destroy();
  }
}

/**
 * 删除测试数据库
 * @param dbName 数据库名称
 */
export async function dropTestDatabase(dbName: string): Promise<void> {
  const adminConn = getAdminConnection();

  try {
    // 强制关闭所有连接
    await adminConn.raw(`DROP DATABASE IF EXISTS ${dbName}`);
    console.log(`🗑️  删除测试数据库: ${dbName}`);
  } catch (error) {
    console.warn(`删除数据库失败: ${dbName}`, error);
  } finally {
    await adminConn.destroy();
  }
}

/**
 * 初始化数据库连接
 * @param dbName 数据库名称
 */
export async function initTestDatabase(dbName: string): Promise<Knex> {
  // 关闭旧连接
  if (testDbConnection) {
    await testDbConnection.destroy();
    testDbConnection = null;
  }

  // 创建新连接
  testDbConnection = knex({
    ...dbConfig,
    connection: {
      ...dbConfig.connection,
      database: dbName,
    },
  });

  return testDbConnection;
}

/**
 * 运行数据库迁移
 * @param db 数据库连接
 */
export async function runMigrations(db: Knex): Promise<void> {
  // 这里假设有迁移目录
  // 实际使用时需要根据项目迁移工具调整
  const migrationsDir = './migrations';

  try {
    // 使用 Knex 迁移 API
    const migrate = require('knex/lib/migrate/index.js');
    const config = { ...dbConfig, connection: { ...dbConfig.connection, database: db.client.config.connection.database } };

    const migration = new migrate(config);
    await migration.latest();
    console.log('✅ 数据库迁移完成');
  } catch (error: any) {
    if (error.message.includes('already exists')) {
      console.log('✅ 数据库表已存在');
    } else {
      console.warn('迁移警告:', error.message);
    }
  }
}

/**
 * 清空所有测试表（保留表结构）
 */
export async function clearAllTables(): Promise<void> {
  const db = getTestDbConnection();

  const tables = [
    'sessions',
    'machines',
    'users',
    'credit_history',
    'operation_logs',
  ];

  try {
    // 按依赖顺序清空（外键约束）
    for (const table of tables) {
      await db(table).truncate();
    }

    console.log('🧹 清空所有测试表');
  } catch (error) {
    console.error('清空表失败:', error);
    throw error;
  }
}

/**
 * 清空指定表
 * @param tableNames 表名数组
 */
export async function clearTables(...tableNames: string[]): Promise<void> {
  const db = getTestDbConnection();

  for (const tableName of tableNames) {
    try {
      await db(tableName).truncate();
      console.log(`🧹 清空表: ${tableName}`);
    } catch (error) {
      console.warn(`清空表失败: ${tableName}`, error);
    }
  }
}

/**
 * 等待数据库连接就绪
 * @param timeout 超时时间（毫秒）
 */
export async function waitForDatabase(timeout: number = 30000): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const db = getTestDbConnection();
      await db.raw('SELECT 1');
      console.log('✅ 数据库连接就绪');
      return;
    } catch (error) {
      // 继续等待
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  throw new Error(`Database connection timeout after ${timeout}ms`);
}

/**
 * 关闭数据库连接
 */
export async function closeDatabase(): Promise<void> {
  if (testDbConnection) {
    await testDbConnection.destroy();
    testDbConnection = null;
    console.log('🔒 数据库连接已关闭');
  }
}

/**
 * 事务包装器
 * 自动回滚测试期间的事务
 */
export async function withTransaction<T>(
  callback: (trx: Knex.Transaction) => Promise<T>
): Promise<T> {
  const db = getTestDbConnection();

  try {
    const result = await db.transaction(callback);
    await db.rollback(); // 测试环境总是回滚
    return result;
  } catch (error) {
    await db.rollback();
    throw error;
  }
}

/**
 * 导出数据库实例
 */
export default getTestDbConnection;
