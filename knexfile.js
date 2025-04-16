// 数据库配置文件
import dotenv from 'dotenv';
dotenv.config();

const config = {
  client: 'mysql2',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'playwright_user_sys',
  },
  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations',
  },
  useNullAsDefault: process.env.DB_CLIENT === 'sqlite3',
};

export default {
  development: config,
  production: config,
};
