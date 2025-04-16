import { config } from 'dotenv';
import { z } from 'zod';
import path from 'path';
import { fileURLToPath } from 'url';

// 加载环境变量
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

// 环境变量验证模式
const envSchema = z.object({
  // 服务器配置
  PORT: z.string().default('3000'),
  HOST: z.string().default('localhost'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // 数据库配置
  DB_TYPE: z.enum(['sqlite', 'mysql']).default('sqlite'),
  DB_NAME: z.string().default('playwright_user_sys'),
  DB_PATH: z.string().optional(),

  // MySQL 配置
  DB_HOST: z.string().optional(),
  DB_PORT: z.string().optional(),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),

  // JWT 配置
  JWT_SECRET: z.string(),
  JWT_EXPIRES_IN: z.string().default('1d'),

  // 管理员初始账号
  ADMIN_USERNAME: z.string().default('admin'),
  ADMIN_PASSWORD: z.string().default('REDACTED_ADMIN_PASS'),

  // 实例配置
  INSTANCE_TIMEOUT: z.string().default('60000'),

  // gRPC 服务器配置
  GRPC_PORT: z.string().default('50051'),

  // 代理服务器配置
  PROXY_PORT: z.string().default('8081'),

  // 监控配置
  MACHINE_MONITOR_INTERVAL: z.string().default('30000'),
});

// 验证环境变量
const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ 环境变量验证失败:', _env.error.format());
  throw new Error('环境变量验证失败');
}

export const env = {
  ..._env.data,
  PORT: parseInt(_env.data.PORT, 10),
  DB_PORT: _env.data.DB_PORT ? parseInt(_env.data.DB_PORT, 10) : 3306,
  INSTANCE_TIMEOUT: parseInt(_env.data.INSTANCE_TIMEOUT, 10),
  GRPC_PORT: parseInt(_env.data.GRPC_PORT, 10),
  PROXY_PORT: parseInt(_env.data.PROXY_PORT, 10),
  MACHINE_MONITOR_INTERVAL: parseInt(_env.data.MACHINE_MONITOR_INTERVAL, 10),
  ROOT_DIR: rootDir,
  IS_DEV: _env.data.NODE_ENV === 'development',
  IS_PROD: _env.data.NODE_ENV === 'production',
  IS_TEST: _env.data.NODE_ENV === 'test',
};

export default env;
