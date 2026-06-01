import knex, { Knex } from 'knex';
import path from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { unlinkSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let testDbCounter = 0;

function isSqlite(): boolean {
  return (process.env.DB_TYPE || 'mysql').toLowerCase() === 'sqlite';
}

const mysqlConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
};

function getAdminConnection(): Knex {
  return knex({
    client: 'mysql2',
    connection: {
      host: mysqlConfig.host,
      port: mysqlConfig.port,
      user: mysqlConfig.user,
      password: mysqlConfig.password,
    },
    pool: { min: 1, max: 2 },
  });
}

export interface IsolatedTestDatabase {
  dbName: string;
  db: Knex;
  dbPath?: string;
}

export async function createIsolatedTestDatabase(): Promise<IsolatedTestDatabase> {
  const projectRoot = path.resolve(__dirname, '../../..');
  const migrationsDir = path.join(projectRoot, 'migrations');

  if (isSqlite()) {
    const dbPath = path.join(tmpdir(), `test-${Date.now()}-${testDbCounter++}-${randomUUID()}.sqlite`);
    const dbName = path.basename(dbPath);

    const db = knex({
      client: 'better-sqlite3',
      connection: { filename: dbPath },
      useNullAsDefault: true,
      migrations: { directory: migrationsDir },
      pool: { min: 1, max: 5 },
    });

    try {
      await db.migrate.latest();
      console.log(`[测试数据库] SQLite 迁移完成: ${dbName}`);
    } catch (error: unknown) {
      console.error(`[测试数据库] SQLite 迁移失败: ${dbName}`, error);
      throw error;
    }

    return { dbName, db, dbPath };
  }

  const dbName = `test_${Date.now()}_${testDbCounter++}`;

  const adminDb = getAdminConnection();

  try {
    await adminDb.raw(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`[测试数据库] 创建独立数据库: ${dbName}`);
  } finally {
    await adminDb.destroy();
  }

  console.log(`[测试数据库] 项目根目录: ${projectRoot}`);
  console.log(`[测试数据库] 迁移目录: ${migrationsDir}`);

  const db = knex({
    client: 'mysql2',
    connection: {
      host: mysqlConfig.host,
      port: mysqlConfig.port,
      user: mysqlConfig.user,
      password: mysqlConfig.password,
      database: dbName,
    },
    migrations: { directory: migrationsDir },
    pool: { min: 1, max: 5 },
  });

  try {
    await db.migrate.latest();
    console.log(`[测试数据库] 迁移完成: ${dbName}`);
  } catch (error: unknown) {
    console.error(`[测试数据库] 迁移失败: ${dbName}`, error);
    throw error;
  }

  return { dbName, db };
}

export async function dropIsolatedTestDatabase(testDb: IsolatedTestDatabase): Promise<void> {
  const { dbName, db, dbPath } = testDb;

  try {
    await db.destroy();
  } catch (error: unknown) {
    console.warn(`[测试数据库] 关闭连接失败: ${dbName}`, error);
  }

  if (dbPath) {
    try {
      if (existsSync(dbPath)) {
        unlinkSync(dbPath);
        console.log(`[测试数据库] 删除 SQLite 文件: ${dbName}`);
      }
    } catch (error: unknown) {
      console.warn(`[测试数据库] 删除 SQLite 文件失败: ${dbName}`, error);
    }
    return;
  }

  const adminDb = getAdminConnection();

  try {
    await adminDb.raw(`DROP DATABASE IF EXISTS \`${dbName}\``);
    console.log(`[测试数据库] 删除数据库: ${dbName}`);
  } catch (error: unknown) {
    console.warn(`[测试数据库] 删除数据库失败: ${dbName}`, error);
  } finally {
    await adminDb.destroy();
  }
}

export async function clearTables(db: Knex, tables: string[]): Promise<void> {
  for (const table of tables) {
    try {
      await db(table).del();
    } catch (error: unknown) {
      console.warn(`[测试数据库] 清空表失败: ${table}`, error);
    }
  }
}
