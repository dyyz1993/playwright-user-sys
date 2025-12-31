/**
 * 创建测试数据库表结构
 */
import { createTables } from '../src/models/migrations.js';
import { initDatabase } from '../src/config/database.js';

async function main() {
  try {
    console.log('开始创建数据库表...');

    // 先初始化数据库连接
    await initDatabase();

    // 创建表结构
    await createTables();

    console.log('✅ 数据库表创建完成');
    process.exit(0);
  } catch (error) {
    console.error('❌ 创建表失败:', error);
    process.exit(1);
  }
}

main();
