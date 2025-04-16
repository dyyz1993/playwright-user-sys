import { env } from './env.js';
import { FastifyServerOptions } from 'fastify';

// Fastify 服务器配置
export const serverConfig: FastifyServerOptions = {
  logger: {
    level: env.IS_DEV ? 'debug' : 'info',
    transport: env.IS_DEV
      ? {
          target: 'pino-pretty',
          options: {
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  },
  disableRequestLogging: false,
  ignoreTrailingSlash: true,
  trustProxy: true,
};

export default serverConfig;
