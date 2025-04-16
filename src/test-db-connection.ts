import { db, initDatabase } from './database/index.js';
import { logger } from './utils/logger.js';
import { config } from './config/index.js';

async function testDatabaseConnection() {
  try {
    logger.info('测试数据库连接...');
    logger.info(`数据库类型: ${config.database.client}`);

    // 初始化数据库
    await initDatabase();

    // 测试查询
    if (config.database.client === 'mysql2') {
      const [tables] = await db.raw('SHOW TABLES');
      logger.info('数据库表列表:');
      logger.info(tables);
    } else {
      // SQLite查询
      const tables = await db.raw("SELECT name FROM sqlite_master WHERE type='table'");
      logger.info('数据库表列表:');
      logger.info(tables);
    }

    // 查询用户表
    const users = await db('users').select('*');
    logger.info(`查询到 ${users.length} 个用户`);

    logger.info('数据库连接测试成功');
  } catch (error) {
    logger.error('数据库连接测试失败:', error);
  } finally {
    // 关闭数据库连接
    await db.destroy();
  }
}

// 运行测试
testDatabaseConnection();
