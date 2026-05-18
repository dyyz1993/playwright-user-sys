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
      // SQLite 基于单文件 + 文件级写入锁，并发写入能力有限，
      // 多连接反而会增加锁竞争和 SQLITE_BUSY 错误，因此不配置连接池。
      // acquireConnectionTimeout 设为 120s：应对长事务（如迁移、批量写入）
      // 时避免超时中断，SQLite 操作多为磁盘 I/O，偶有耗时属正常。
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
      // MySQL 连接池配置
      // 多连接可充分利用 MySQL 的行级锁并发写入能力，
      // 配合 Server 端 thread_handling 实现高并发吞吐。
      pool: {
        // min=2：保持 2 个常驻连接，避免请求到来时频繁建连（TCP 三次握手 + 认证）
        // 的冷启动延迟。对于低并发场景 2 足够，高并发由 max 兜底弹性扩容。
        min: parseInt(env.DB_POOL_MIN || '2'),
        // max=10：单实例管理 Server 典型并发在 10 以内，10 连接已覆盖峰值。
        // 过大会占用 MySQL max_connections 配额，且增加连接管理开销。
        // 如部署为集群（多 Server → 同一 MySQL），需按实例数缩减单实例 max。
        max: parseInt(env.DB_POOL_MAX || '10'),
        // 空闲超时 120s：连接空闲超过 2 分钟自动回收至 min 水位，
        // 平衡资源占用与突发流量时的连接复用。
        idleTimeoutMillis: 120000,
        // 获取连接超时 120s：池中所有连接均繁忙时，等待新连接的最长时间。
        // 设为 120s 容忍慢查询堆积场景，避免正常请求被误杀。
        acquireTimeoutMillis: 120000,
        // propagateCreateError=false：建连失败时由 knex 内部重试，
        // 避免瞬时网络抖动直接抛错导致请求失败（如 MySQL 临时重启）。
        propagateCreateError: false,
      },
      // 增加连接限制选项 - 匹配池配置的超时时间
      acquireConnectionTimeout: 120000,
    };
  }
};

// 数据库实例
let dbInstance: Knex;
let dbInitializing: Promise<Knex> | null = null;

// 初始化数据库
export async function initDatabase(dbName?: string): Promise<Knex> {
  if (dbInitializing) {
    return dbInitializing;
  }

  if (dbInstance) {
    try {
      await dbInstance.raw('SELECT 1');
      return dbInstance;
    } catch {
      logger.warn('数据库连接已失效，重新创建...');
      const oldInstance = dbInstance;
      dbInstance = undefined as unknown as Knex;
      try {
        await oldInstance.destroy();
      } catch (_e) {
        // ignore destroy errors on stale connection
      }
    }
  }

  dbInitializing = (async () => {
    try {
      logger.info('正在初始化数据库...');
      const config = createDatabaseConfig();

      if (dbInstance) {
        const oldInstance = dbInstance;
        dbInstance = undefined as unknown as Knex;
        try {
          await oldInstance.destroy();
          logger.info('旧数据库连接已销毁');
        } catch (e: unknown) {
          logger.warn('销毁旧连接时出错（可能已销毁）:', e instanceof Error ? e.message : e);
        }
      }

      if (dbName && config.client === 'mysql2') {
        (config.connection as Record<string, unknown>).database = dbName;
        logger.info(`使用测试数据库: ${dbName}`);
      }

      logger.info('创建新的数据库连接...');
      dbInstance = knex(config);
      logger.info('knex 实例已创建');

      logger.info('测试数据库连接 (SELECT 1)...');
      await dbInstance.raw('SELECT 1');
      logger.info('数据库连接创建成功');

      return dbInstance;
    } catch (error: unknown) {
      logger.error('创建数据库连接失败:', error);
      dbInitializing = null;
      throw error;
    } finally {
      dbInitializing = null;
    }
  })();

  return dbInitializing;
}

// 创建初始数据库连接（非测试环境）
if (process.env.NODE_ENV !== 'test') {
  logger.info('正在创建数据库连接...');
  try {
    dbInstance = knex(createDatabaseConfig());
    logger.info('数据库连接创建成功');
  } catch (error: unknown) {
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
    get(_target, prop) {
      if (prop === 'then' || prop === 'catch') {
        // 不拦截 Promise 方法
        return undefined;
      }
      if (dbInstance) {
        return (dbInstance as unknown as Record<string | symbol, unknown>)[prop];
      }
      throw new Error('Database not initialized. Call initDatabase() first.');
    },
    set(_target, prop, value) {
      if (dbInstance) {
        (dbInstance as unknown as Record<string | symbol, unknown>)[prop] = value;
        return true;
      }
      return false;
    },
    has(_target, prop) {
      return prop in (dbInstance || {});
    },
  });
};

export const db = createDbProxy();

export default db;
