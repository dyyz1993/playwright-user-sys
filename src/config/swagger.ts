import { FastifySwaggerOptions } from '@fastify/swagger';
import { env } from './env.js';
import { FastifyApiReferenceOptions } from '@scalar/fastify-api-reference';

// Swagger 配置
export const swaggerOptions: FastifySwaggerOptions = {
  swagger: {
    info: {
      title: 'Playwright 用户管理系统 API',
      description: '用于管理 Playwright 实例的 API 文档',
      version: '1.0.0',
    },
    host: `${env.HOST}:${env.PORT}`,
    schemes: ['http', 'https'],
    consumes: ['application/json'],
    produces: ['application/json'],
    tags: [
      { name: 'auth', description: '认证相关接口' },
      { name: 'admin', description: '管理员相关接口' },
      { name: 'user', description: '用户相关接口' },
      { name: 'instance', description: '实例相关接口' },
      { name: 'session', description: '会话相关接口' },
    ],
    securityDefinitions: {
      apiKey: {
        type: 'apiKey',
        name: 'x-api-key',
        in: 'header',
      },
      bearerAuth: {
        type: 'apiKey',
        name: 'Authorization',
        in: 'header',
      },
    },
  },
};


export default { swaggerOptions };
