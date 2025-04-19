import knex from 'knex';
import config from '../knexfile.js';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 创建数据库连接
const db = knex(config.development);

async function runProxyPortMigration() {
  try {
    console.log('开始添加 proxy_port 列到 machines 表...');

    // 检查 proxy_port 列是否已存在
    const hasProxyPort = await db.schema.hasColumn('machines', 'proxy_port');
    
    if (hasProxyPort) {
      console.log('proxy_port 列已存在，无需添加');
    } else {
      // 手动添加 proxy_port 列
      await db.schema.alterTable('machines', table => {
        table.integer('proxy_port').nullable();
      });
      console.log('proxy_port 列添加成功');
    }

    console.log('迁移完成');

    // 关闭数据库连接
    await db.destroy();

    process.exit(0);
  } catch (error) {
    console.error('迁移失败:', error);
    process.exit(1);
  }
}

runProxyPortMigration();
