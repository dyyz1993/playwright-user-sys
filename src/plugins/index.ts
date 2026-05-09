import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import sensible from '@fastify/sensible';
import gracefulShutdown from 'fastify-graceful-shutdown';
import view from '@fastify/view';
import staticFiles from '@fastify/static';
import cookie from '@fastify/cookie';
import session from '@fastify/session';
import flash from '@fastify/flash';
import formbody from '@fastify/formbody';
import swagger from './swagger.plugin.js';
import authPlugin from './auth.plugin.js';
import errorHandlerPlugin from './error-handler.plugin.js';
import contentTypeParserPlugin from './content-type-parser.plugin.js';
import requestLoggerMiddleware from '../middlewares/request-logger.middleware.js';
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';
import { logger } from '@shared/utils/logger.js';

export default fp(async function (fastify: FastifyInstance) {
  logger.info('开始注册所有插件...');

  // 注册 Rate Limit 插件（测试环境跳过，避免干扰安全测试）
  if (process.env.NODE_ENV !== 'test') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await fastify.register(rateLimit as any, {
      max: 100,
      timeWindow: '1 minute',
      keyGenerator: (request: { ip: string }) => request.ip,
    });
  }

  // 注册 CORS 插件
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim())
    : ['http://localhost:3000', 'http://localhost:5173'];

  // @ts-ignore — cors origin callback type mismatch with fastify-cors typings
  await fastify.register(cors, {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      try {
        const originHost = new URL(origin).host;
        for (const allowed of allowedOrigins) {
          try {
            if (new URL(allowed).host === originHost) {
              return callback(null, true);
            }
          } catch {
            /* skip invalid URL */
          }
        }
      } catch {
        /* skip invalid origin */
      }
      callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
  });

  // 注册 Multipart 插件
  await fastify.register(multipart);

  // 注册表单处理插件
  await fastify.register(formbody);

  // 注册 Sensible 插件
  await fastify.register(sensible);

  // 注册优雅关闭插件
  await fastify.register(gracefulShutdown);

  // 注册内容类型解析器插件
  await fastify.register(contentTypeParserPlugin);

  // 注册错误处理插件
  await fastify.register(errorHandlerPlugin);

  // 注册认证插件
  await fastify.register(authPlugin);

  // 注册请求日志中间件
  await fastify.register(requestLoggerMiddleware);

  // 注册 Swagger 插件
  await fastify.register(swagger);

  // 获取当前文件的目录路径
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const rootDir = path.resolve(__dirname, '../..');

  // 注册 Cookie 插件
  // 不设置 secret，因为 JWT token 本身已经签名了
  await fastify.register(cookie);

  // @ts-ignore — @fastify/session option type mismatch
  await fastify.register(session, {
    cookieName: 'sessionId',
    secret: config.jwt.secret,
    cookie: {
      secure: false,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    },
  });

  // 注册 Flash 插件
  await fastify.register(flash);

  // 注册视图引擎
  await fastify.register(view, {
    engine: {
      ejs: ejs,
    },
    root: path.join(rootDir, 'src/views'),
    viewExt: 'ejs',
    layout: 'layouts/main',
    includeViewExtension: true,
  });

  // 注册静态文件插件
  await fastify.register(staticFiles, {
    root: path.join(rootDir, 'src/public'),
    prefix: '/public/',
  });

  // 注册截图静态文件插件
  await fastify.register(staticFiles, {
    root: path.join(rootDir, 'data/screenshots'),
    prefix: '/screenshots/',
    decorateReply: false, // 避免与上面的静态文件插件冲突
  });

  // 注册上传文件静态文件插件
  await fastify.register(staticFiles, {
    root: path.join(rootDir, 'data/uploads'),
    prefix: '/uploads/',
    decorateReply: false, // 避免与其他静态文件插件冲突
  });

  // 注册临时文件静态文件插件
  await fastify.register(staticFiles, {
    root: path.join(rootDir, 'data/temp'),
    prefix: '/temp/',
    decorateReply: false, // 避免与其他静态文件插件冲突
  });

  logger.info('所有插件注册完成');
});
