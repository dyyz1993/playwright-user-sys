import { SignOptions } from 'jsonwebtoken';
import { env } from './env.js';
import { getJwtSecret } from '../utils/auth.js';

export const config = {
  server: {
    port: env.PORT,
    host: env.HOST,
  },

  database: {
    client: env.DB_TYPE === 'mysql' ? 'mysql2' : 'better-sqlite3',
    connection:
      env.DB_TYPE === 'mysql'
        ? {
            host: env.DB_HOST,
            port: env.DB_PORT,
            user: env.DB_USER,
            password: env.DB_PASSWORD,
            database: env.DB_NAME,
          }
        : {
            filename: process.env.DB_FILENAME || './data/playwright-user-sys.sqlite',
          },
    useNullAsDefault: true,
  },

  jwt: {
    secret: getJwtSecret(),
    expiresIn: (env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn'],
  },

  session: {
    timeout: process.env.SESSION_TIMEOUT ? parseInt(process.env.SESSION_TIMEOUT) : 60,
    maxPerUser: env.MAX_SESSIONS_PER_USER,
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    prettyPrint: !env.IS_PROD,
  },
};
