import knex from 'knex';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

config({ path: path.join(rootDir, '.env.dev') });

const TEST_DB_NAME = 'playwright_test_user_sys';

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
};

async function ensureTestDatabase(): Promise<void> {
  const adminDb = knex({
    client: 'mysql2',
    connection: {
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
    },
  });

  try {
    const [databases] = await adminDb.raw('SHOW DATABASES LIKE ?', [TEST_DB_NAME]);

    if (databases.length === 0) {
      console.log(`[全局初始化] 创建测试数据库: ${TEST_DB_NAME}`);
      await adminDb.raw(`CREATE DATABASE \`${TEST_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    } else {
      console.log(`[全局初始化] 测试数据库已存在: ${TEST_DB_NAME}`);
    }
  } finally {
    await adminDb.destroy();
  }
}

async function runMigrations(): Promise<void> {
  const projectRoot = path.resolve(__dirname, '../..');
  const migrationsDir = path.join(projectRoot, 'migrations');

  if (!existsSync(migrationsDir)) {
    console.error(`[全局初始化] 迁移目录不存在: ${migrationsDir}`);
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  console.log(`[全局初始化] 迁移目录: ${migrationsDir}`);

  const testDb = knex({
    client: 'mysql2',
    connection: {
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: TEST_DB_NAME,
    },
    migrations: {
      directory: migrationsDir,
    },
  });

  try {
    const [rows] = await testDb.raw('SHOW TABLES');
    const tableCount = (rows as any[]).length;

    if (tableCount === 0) {
      console.log('[全局初始化] 运行数据库迁移...');
      await testDb.migrate.latest();
      console.log('[全局初始化] 数据库迁移完成');
    } else {
      console.log('[全局初始化] 数据库表已存在，跳过迁移');
    }
  } catch (error: unknown) {
    console.error('[全局初始化] 迁移失败:', error);
    throw error;
  } finally {
    await testDb.destroy();
  }
}

export default async function setup() {
  console.log('\n========================================');
  console.log('[全局初始化] 开始初始化测试环境');
  console.log('========================================');

  process.env.NODE_ENV = 'test';

  const dbType = process.env.DB_TYPE || 'mysql';
  process.env.DB_NAME = TEST_DB_NAME;

  if (dbType !== 'mysql') {
    console.log(`[全局初始化] DB_TYPE=${dbType}, 跳过 MySQL 初始化`);
    console.log('========================================\n');
    return;
  }

  process.env.DB_TYPE = 'mysql';

  try {
    await ensureTestDatabase();
    await runMigrations();
    console.log('========================================');
    console.log('[全局初始化] 测试环境初始化完成');
    console.log('========================================\n');
  } catch (error: unknown) {
    console.error('[全局初始化] 初始化失败:', error);
    throw error;
  }
}
