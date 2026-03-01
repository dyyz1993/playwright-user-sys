import knex, { Knex } from 'knex';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let testDbCounter = 0;

const dbConfig = {
  host: process.env.DB_HOST || 'REDACTED_INTERNAL_HOST',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'REDACTED_PASSWORD',
};

function getAdminConnection(): Knex {
  return knex({
    client: 'mysql2',
    connection: {
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
    },
    pool: { min: 1, max: 2 },
  });
}

export interface IsolatedTestDatabase {
  dbName: string;
  db: Knex;
}

export async function createIsolatedTestDatabase(): Promise<IsolatedTestDatabase> {
  const dbName = `test_${Date.now()}_${testDbCounter++}`;

  const adminDb = getAdminConnection();

  try {
    await adminDb.raw(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`[测试数据库] 创建独立数据库: ${dbName}`);
  } finally {
    await adminDb.destroy();
  }

  const projectRoot = path.resolve(__dirname, '../../..');
  const migrationsDir = path.join(projectRoot, 'migrations');

  console.log(`[测试数据库] __dirname: ${__dirname}`);
  console.log(`[测试数据库] 项目根目录: ${projectRoot}`);
  console.log(`[测试数据库] 迁移目录: ${migrationsDir}`);

  const db = knex({
    client: 'mysql2',
    connection: {
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbName,
    },
    migrations: {
      directory: migrationsDir,
    },
    pool: { min: 1, max: 5 },
  });

  try {
    await db.migrate.latest();
    console.log(`[测试数据库] 迁移完成: ${dbName}`);
  } catch (error) {
    console.error(`[测试数据库] 迁移失败: ${dbName}`, error);
    throw error;
  }

  return { dbName, db };
}

export async function dropIsolatedTestDatabase(testDb: IsolatedTestDatabase): Promise<void> {
  const { dbName, db } = testDb;

  try {
    await db.destroy();
  } catch (error) {
    console.warn(`[测试数据库] 关闭连接失败: ${dbName}`, error);
  }

  const adminDb = getAdminConnection();

  try {
    await adminDb.raw(`DROP DATABASE IF EXISTS \`${dbName}\``);
    console.log(`[测试数据库] 删除数据库: ${dbName}`);
  } catch (error) {
    console.warn(`[测试数据库] 删除数据库失败: ${dbName}`, error);
  } finally {
    await adminDb.destroy();
  }
}

export async function clearTables(db: Knex, tables: string[]): Promise<void> {
  for (const table of tables) {
    try {
      await db(table).del();
    } catch (error) {
      console.warn(`[测试数据库] 清空表失败: ${table}`, error);
    }
  }
}
