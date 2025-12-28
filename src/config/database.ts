import knex from 'knex';
import path from 'path';
import { env } from './env.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据库配置
const createDatabaseConfig = () => {
  // 根据环境变量选择数据库类型
  if (env.DB_TYPE === 'sqlite') {
    const dbPath = env.DB_PATH || path.join(__dirname, '../../data/database.sqlite');
    console.log(`使用 SQLite 数据库: ${dbPath}`);

    return {
      client: 'better-sqlite3',
      connection: {
        filename: dbPath
      },
      useNullAsDefault: true,
      // SQLite 不需要连接池，移除这些设置
      acquireConnectionTimeout: 120000,
    };
  } else {
    // MySQL 配置
    console.log(`使用 MySQL 数据库: ${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`);

    return {
      client: 'mysql2',
      connection: {
        host: env.DB_HOST || 'localhost',
        port: env.DB_PORT || 3306,
        user: env.DB_USER || 'root',
        password: env.DB_PASSWORD || '',
        database: env.DB_NAME || 'playwright_user_sys',
        charset: 'utf8mb4',
        // MySQL2 需要 +00:00 格式的时区，不接受 UTC
        // 如果 TZ 设置为 UTC，转换为 +00:00
        timezone: (process.env.TZ === 'UTC' ? '+00:00' : process.env.TZ) || '+00:00',
        dateStrings: true,
      },
      pool: {
        min: parseInt(env.DB_POOL_MIN || '2'),
        max: parseInt(env.DB_POOL_MAX || '10'),
        // 空闲超时，单位毫秒
        idleTimeoutMillis: 30000,
        // 连接超时，单位毫秒
        acquireTimeoutMillis: 60000,
        // 创建连接的错误将被记录并抛出
        propagateCreateError: false,
      },
      // 增加连接限制选项
      acquireConnectionTimeout: 60000,
    };
  }
};

// 初始化数据库
export async function initDatabase() {
  try {
    console.log('正在初始化数据库...');
    const config = createDatabaseConfig();

    // 如果是测试环境且使用内存数据库
    if (process.env.NODE_ENV === 'test' && process.env.DATABASE_PATH === ':memory:') {
      console.log('使用内存数据库进行测试');
      config.connection = { filename: ':memory:' };
    }

    // 创建数据库连接
    dbInstance = knex(config);

    // 测试连接
    await dbInstance.raw('SELECT 1');
    console.log('数据库连接创建成功');

    return dbInstance;
  } catch (error) {
    console.error('创建数据库连接失败:', error);
    throw error;
  }
}

// 创建数据库连接
console.log('正在创建数据库连接...');
let dbInstance :knex.Knex<any, unknown[]>;

try {
  dbInstance = knex(createDatabaseConfig());
  console.log('数据库连接创建成功');
} catch (error) {
  console.error('创建数据库连接失败:', error);
  throw error;
}

export const db = dbInstance;

export default db;
