import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import sensible from '@fastify/sensible';
import gracefulShutdown from 'fastify-graceful-shutdown';
import view from '@fastify/view';
import staticFiles from '@fastify/static';
import cookie from '@fastify/cookie';
import session from '@fastify/session';
import flash from '@fastify/flash';
import formbody from '@fastify/formbody';
import swaggerPlugin from './swagger.plugin.js';
import authPlugin from './auth.plugin.js';
import errorHandlerPlugin from './error-handler.plugin.js';
import contentTypeParserPlugin from './content-type-parser.plugin.js';
import requestLoggerMiddleware from '../middlewares/request-logger.middleware.js';
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';

export default fp(async function (fastify: FastifyInstance) {
  // 注册 CORS 插件
  await fastify.register(cors, {
    origin: true,
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
  await fastify.register(swaggerPlugin);

  // 获取当前文件的目录路径
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const rootDir = path.resolve(__dirname, '../..');

  // 注册 Cookie 插件
  await fastify.register(cookie);

  // 注册 Session 插件
  await fastify.register(session, {
    cookieName: 'sessionId',
    secret: config.jwt.secret,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 天
    }
  });

  // 注册 Flash 插件
  await fastify.register(flash);

  // 注册视图引擎
  await fastify.register(view, {
    engine: {
      ejs: ejs
    },
    root: path.join(rootDir, 'src/views'),
    viewExt: 'ejs',
    layout: 'layouts/main',
    includeViewExtension: true
  });

  // 注册静态文件插件
  await fastify.register(staticFiles, {
    root: path.join(rootDir, 'src/public'),
    prefix: '/public/'
  });

  // 注册截图静态文件插件
  await fastify.register(staticFiles, {
    root: path.join(rootDir, 'data/screenshots'),
    prefix: '/screenshots/',
    decorateReply: false // 避免与上面的静态文件插件冲突
  });
});
