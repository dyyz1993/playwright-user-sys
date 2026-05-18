import { config } from 'dotenv';
import { z } from 'zod';
import path from 'path';
import { fileURLToPath } from 'url';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

const envSchema = z
  .object({
    // ============================================================
    // 数据库配置 (Database)
    // ============================================================
    /** 数据库类型, 可选 'sqlite' | 'mysql', 默认 sqlite */
    DB_TYPE: z.enum(['sqlite', 'mysql']).default('sqlite'),
    /** 数据库名称, 默认 'playwright_user_sys' */
    DB_NAME: z.string().default('playwright_user_sys'),
    /** SQLite 数据库文件路径, 仅 DB_TYPE=sqlite 时生效 */
    DB_PATH: z.string().optional(),
    /** SQLite 驱动选择, 可选 'better-sqlite3' | 'node-sqlite', 默认 better-sqlite3 */
    DB_DRIVER: z.enum(['better-sqlite3', 'node-sqlite']).default('better-sqlite3').optional(),
    /** MySQL 主机地址, 仅 DB_TYPE=mysql 时必填 */
    DB_HOST: z.string().optional(),
    /** MySQL 端口号, 默认 3306 */
    DB_PORT: z.string().optional(),
    /** MySQL 用户名 */
    DB_USER: z.string().optional(),
    /** MySQL 密码 */
    DB_PASSWORD: z.string().optional(),
    /** MySQL 连接池最小连接数 */
    DB_POOL_MIN: z.string().optional(),
    /** MySQL 连接池最大连接数 */
    DB_POOL_MAX: z.string().optional(),

    // ============================================================
    // JWT / 认证配置 (Auth)
    // ============================================================
    /** JWT 签名密钥, 生产环境必填 */
    JWT_SECRET: z.string().optional(),
    /** JWT 过期时间, 支持/ms/lib格式如 '1d'/'24h'/'3600s', 默认 '1d' */
    JWT_EXPIRES_IN: z.string().default('1d'),
    /** 管理员初始用户名, 默认 'admin' */
    ADMIN_USERNAME: z.string().default('admin'),
    /** 管理员初始密码, 最少 8 位字符 */
    ADMIN_PASSWORD: z.string().min(8, 'ADMIN_PASSWORD must be set and at least 8 characters'),

    // ============================================================
    // WebSocket 配置 (WebSocket)
    // ============================================================
    /** 浏览器实例超时时间(毫秒), 默认 60000 (60s) */
    INSTANCE_TIMEOUT: z.string().default('60000'),

    // ============================================================
    // API / 服务器配置 (Server)
    // ============================================================
    /** HTTP 服务监听端口, 默认 3000 */
    PORT: z.string().default('3000'),
    /** HTTP 服务监听主机, 默认 'localhost' */
    HOST: z.string().default('localhost'),
    /** 运行环境, 可选 'development' | 'production' | 'test' */
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    /** 公共访问的 Manager URL, 用于统一流量入口, 例: 'manager.example.com:3000' */
    PUBLIC_MANAGER_URL: z.string().optional(),
    /** 前端 URL, 用于构建 viewer 页面链接 */
    VITE_FRONTEND_URL: z.string().optional(),
    /** 每用户最大同时活跃会话数, 默认 20 */
    MAX_SESSIONS_PER_USER: z.coerce.number().default(20),

    // ============================================================
    // 浏览器 / 机器配置 (Browser/Machine)
    // ============================================================
    /** gRPC 服务端口, Manager 与 Machine 通信使用, 默认 50051 */
    GRPC_PORT: z.string().default('50051'),
    /** WebSocket 代理端口, 浏览器流量代理使用, 默认 8081 */
    PROXY_PORT: z.string().default('8081'),
    /** 机器健康监控轮询间隔(毫秒), 默认 30000 (30s) */
    MACHINE_MONITOR_INTERVAL: z.string().default('30000'),
    /** 公共访问的机器端点, 覆盖机器实际 IP, 例: 'example.com:8082' */
    PUBLIC_MACHINE_ENDPOINT: z.string().optional(),

    // ============================================================
    // 文件 / 存储配置 (Storage)
    // ============================================================
    // (暂无)

    // ============================================================
    // 日志配置 (Logging)
    // ============================================================
    // (暂无)
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production' && !data.JWT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'JWT_SECRET is required in production environment',
        path: ['JWT_SECRET'],
      });
    }
  });

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
  MAX_SESSIONS_PER_USER: _env.data.MAX_SESSIONS_PER_USER,
  JWT_EXPIRES_IN: _env.data.JWT_EXPIRES_IN,
  ROOT_DIR: rootDir,
  IS_DEV: _env.data.NODE_ENV === 'development',
  IS_PROD: _env.data.NODE_ENV === 'production',
  IS_TEST: _env.data.NODE_ENV === 'test',
};

export default env;
