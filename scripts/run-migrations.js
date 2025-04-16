import knex from 'knex';
import config from '../knexfile.js';

// 创建数据库连接
const db = knex(config.development);

async function runMigrations() {
  try {
    console.log('开始运行数据库迁移...');

    // 运行所有迁移
    await db.migrate.latest();

    console.log('数据库迁移完成');

    // 关闭数据库连接
    await db.destroy();

    process.exit(0);
  } catch (error) {
    console.error('数据库迁移失败:', error);
    process.exit(1);
  }
}

runMigrations();
