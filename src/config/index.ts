import dotenv from 'dotenv';
import { SignOptions } from 'jsonwebtoken';

// 加载环境变量
dotenv.config();

// 配置对象
export const config = {
  // 服务器配置
  server: {
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
    host: process.env.HOST || '0.0.0.0',
  },

  // 数据库配置
  database: {
    client: process.env.DB_TYPE === 'mysql' ? 'mysql2' : 'better-sqlite3',
    connection: process.env.DB_TYPE === 'mysql' ? {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    } : {
      filename: process.env.DB_FILENAME || './data/playwright-user-sys.sqlite',
    },
    useNullAsDefault: true,
  },

  // JWT 配置
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn'],
  },

  // 会话配置
  session: {
    timeout: process.env.SESSION_TIMEOUT ? parseInt(process.env.SESSION_TIMEOUT) : 60, // 分钟
    maxPerUser: process.env.MAX_SESSIONS_PER_USER ? parseInt(process.env.MAX_SESSIONS_PER_USER) : 5,
  },

  // 日志配置
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    prettyPrint: process.env.NODE_ENV !== 'production',
  },
};
