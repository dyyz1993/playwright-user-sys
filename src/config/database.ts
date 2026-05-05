import knex, { Knex } from 'knex';
import path from 'path';
import { env } from './env.js';
import { fileURLToPath } from 'url';
import { logger } from '../shared/utils/logger.js';
import { getSqliteClient } from './db-driver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据库配置
const createDatabaseConfig = () => {
  // 根据环境变量选择数据库类型
  if (env.DB_TYPE === 'sqlite') {
    const dbPath = env.DB_PATH || path.join(__dirname, '../../data/database.sqlite');
    logger.info(`使用 SQLite 数据库: ${dbPath}`);

    return {
      client: getSqliteClient(),
      connection: {
        filename: dbPath,
      },
      useNullAsDefault: true,
      // SQLite 不需要连接池，移除这些设置
      acquireConnectionTimeout: 120000,
    };
  } else {
    // MySQL 配置
    logger.info(`使用 MySQL 数据库: ${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`);

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
        // 空闲超时，单位毫秒 - 增加到 120 秒
        idleTimeoutMillis: 120000,
        // 连接超时，单位毫秒 - 增加到 120 秒
        acquireTimeoutMillis: 120000,
        // 创建连接的错误将被记录并抛出
        propagateCreateError: false,
      },
      // 增加连接限制选项 - 匹配池配置的超时时间
      acquireConnectionTimeout: 120000,
    };
  }
};

// 数据库实例
let dbInstance: Knex;

// 初始化数据库
export async function initDatabase(dbName?: string) {
  try {
    logger.info('正在初始化数据库...');
    const config = createDatabaseConfig();

    // 如果已经存在连接，先销毁
    if (dbInstance) {
      logger.info('销毁旧的数据库连接...');
      try {
        await dbInstance.destroy();
        logger.info('旧数据库连接已销毁');
      } catch (e) {
        logger.error('销毁旧连接时出错:', e);
      }
    }

    // 如果是测试环境且使用内存数据库
    if (process.env.NODE_ENV === 'test' && process.env.DATABASE_PATH === ':memory:') {
      logger.info('使用内存数据库进行测试');
      config.connection = { filename: ':memory:' };
    }

    // 如果提供了数据库名称覆盖（用于测试环境）
    if (dbName && config.client === 'mysql2') {
      (config.connection as Record<string, unknown>).database = dbName;
      logger.info(`使用测试数据库: ${dbName}`);
    }

    // 创建数据库连接
    logger.info('创建新的数据库连接...');
    dbInstance = knex(config);
    logger.info('knex 实例已创建');

    // 测试连接
    logger.info('测试数据库连接 (SELECT 1)...');
    await dbInstance.raw('SELECT 1');
    logger.info('数据库连接创建成功');

    return dbInstance;
  } catch (error) {
    logger.error('创建数据库连接失败:', error);
    throw error;
  }
}

// 创建初始数据库连接（非测试环境）
if (process.env.NODE_ENV !== 'test') {
  logger.info('正在创建数据库连接...');
  try {
    dbInstance = knex(createDatabaseConfig());
    logger.info('数据库连接创建成功');
  } catch (error) {
    logger.error('创建数据库连接失败:', error);
    throw error;
  }
}

// 导出 getter 来获取最新的数据库实例
export const getDb = () => dbInstance;

// 创建一个可调用的 db 对象来支持 db('table') 调用方式
const createDbProxy = () => {
  const proxyFn = function (table: string) {
    if (dbInstance) {
      return dbInstance(table);
    }
    throw new Error('Database not initialized. Call initDatabase() first.');
  } as Knex;

  return new Proxy(proxyFn, {
    get(target, prop) {
      if (prop === 'then' || prop === 'catch') {
        // 不拦截 Promise 方法
        return undefined;
      }
      if (dbInstance) {
        return (dbInstance as unknown as Record<string | symbol, unknown>)[prop];
      }
      throw new Error('Database not initialized. Call initDatabase() first.');
    },
    set(target, prop, value) {
      if (dbInstance) {
        (dbInstance as unknown as Record<string | symbol, unknown>)[prop] = value;
        return true;
      }
      return false;
    },
    has(target, prop) {
      return prop in (dbInstance || {});
    },
  });
};

export const db = createDbProxy();

export default db;
