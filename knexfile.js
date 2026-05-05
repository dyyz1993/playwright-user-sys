import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

function getSqliteClientFromEnv() {
  return process.env.DB_DRIVER === 'node-sqlite' ? 'better-sqlite3' : 'better-sqlite3';
}

// 加载环境变量
dotenv.config();

// 获取当前文件的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据库配置
const config = {
  development: {
    client: process.env.DB_TYPE === 'mysql' ? 'mysql2' : getSqliteClientFromEnv(),
    connection: process.env.DB_TYPE === 'mysql' ? {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'playwright_user_sys',
    } : {
      filename: process.env.DB_PATH || path.join(__dirname, 'data', 'db.sqlite'),
    },
    migrations: {
      directory: path.join(__dirname, 'migrations'),
    },
    seeds: {
      directory: path.join(__dirname, 'seeds'),
    },
    useNullAsDefault: true,
  },
  
  test: {
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: 'playwright_test_user_sys',
    },
    migrations: {
      directory: path.join(__dirname, 'migrations'),
    },
    seeds: {
      directory: path.join(__dirname, 'seeds'),
    },
    useNullAsDefault: true,
    pool: {
      min: 1,
      max: 5,
    },
  },
  
  production: {
    client: process.env.DB_TYPE === 'mysql' ? 'mysql2' : getSqliteClientFromEnv(),
    connection: process.env.DB_TYPE === 'mysql' ? {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'playwright_user_sys',
    } : {
      filename: process.env.DB_PATH || path.join(__dirname, 'data', 'db.sqlite'),
    },
    migrations: {
      directory: path.join(__dirname, 'migrations'),
    },
    seeds: {
      directory: path.join(__dirname, 'seeds'),
    },
    useNullAsDefault: true,
    pool: {
      min: 2,
      max: 10
    }
  }
};

export default config;
