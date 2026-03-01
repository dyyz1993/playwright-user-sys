import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { FastifyInstance } from 'fastify';
import fastifyScalar from '@scalar/fastify-api-reference';
import scalarTheme from './scalar-theme.js';
import { env } from '../config/env.js';

export default fp(async function (fastify: FastifyInstance) {
  // 注册 Swagger 插件
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'Playwright 用户管理系统 API',
        description: '用于管理 Playwright 实例的 API 文档',
        version: '1.0.0',
      },
      servers: [
        {
          url: `http://${env.HOST}:${env.PORT}`,
          description: 'HTTP Server',
        },
        {
          url: `https://${env.HOST}:${env.PORT}`,
          description: 'HTTPS Server',
        },
      ],
      tags: [
        { name: 'auth', description: '认证相关接口' },
        { name: 'admin', description: '管理员相关接口' },
        { name: 'user', description: '用户相关接口' },
        { name: 'instance', description: '实例相关接口' },
        { name: 'session', description: '会话相关接口' },
      ],
      components: {
        securitySchemes: {
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
      security: [{ apiKey: [] }, { bearerAuth: [] }],
    },
  });

  // 注册 Swagger UI 插件
  await fastify.register(swaggerUI, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
    staticCSP: true,
  });

  // 注册 Scalar API 参考插件
  await fastify.register(fastifyScalar, {
    routePrefix: '/reference',
    configuration: {
      customCss: scalarTheme,
    },
  });
});
