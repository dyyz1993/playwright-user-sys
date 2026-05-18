import { FastifyInstance } from 'fastify';
import sessionController from '../controllers/session.controller.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  createSessionRequestSchema,
  createSessionResponseSchema,
  getSessionResponseSchema,
  getUserSessionsResponseSchema,
  releaseSessionResponseSchema,
  getAllSessionsResponseSchema,
  errorResponseSchema,
  idParamSchema,
  getSessionScreenshotResponseSchema,
} from '../schemas/index.js';

export default async function sessionRoutes(fastify: FastifyInstance): Promise<void> {
  // 创建会话
  fastify.post(
    '/',
    {
      config: {
        rateLimit: { max: 20, timeWindow: '1 minute' },
      },
      onRequest: [fastify.verifyJWTOrApiKey],
      schema: {
        body: zodToJsonSchema(createSessionRequestSchema),
        response: {
          201: zodToJsonSchema(createSessionResponseSchema),
          400: zodToJsonSchema(errorResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['sessions'],
      },
    },
    sessionController.createSession
  );

  // 获取会话信息
  fastify.get(
    '/:id',
    {
      onRequest: [fastify.verifyJWTOrApiKey],
      schema: {
        params: zodToJsonSchema(idParamSchema),
        response: {
          200: zodToJsonSchema(getSessionResponseSchema),
          400: zodToJsonSchema(errorResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          404: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['sessions'],
      },
    },
    sessionController.getSession
  );

  // 获取用户的所有会话
  fastify.get(
    '/',
    {
      onRequest: [fastify.verifyJWTOrApiKey],
      schema: {
        response: {
          200: zodToJsonSchema(getUserSessionsResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['sessions'],
      },
    },
    sessionController.getUserSessions
  );

  // 释放会话
  fastify.post(
    '/:id/release',
    {
      onRequest: [fastify.verifyJWTOrApiKey],
      schema: {
        params: zodToJsonSchema(idParamSchema),
        response: {
          200: zodToJsonSchema(releaseSessionResponseSchema),
          400: zodToJsonSchema(errorResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          404: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['sessions'],
      },
    },
    sessionController.releaseSession
  );

  // 关闭会话（管理员）
  fastify.post(
    '/:id/close',
    {
      onRequest: [fastify.verifyJWT, fastify.verifyAdmin],
      schema: {
        params: zodToJsonSchema(idParamSchema),
        response: {
          200: zodToJsonSchema(releaseSessionResponseSchema),
          400: zodToJsonSchema(errorResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
          404: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['sessions', 'admin'],
      },
    },
    sessionController.closeSession
  );

  // 获取所有会话（管理员）
  fastify.get(
    '/admin/all',
    {
      onRequest: [fastify.verifyJWT, fastify.verifyAdmin],
      schema: {
        response: {
          200: zodToJsonSchema(getAllSessionsResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['sessions', 'admin'],
      },
    },
    sessionController.getAllSessions
  );

  // 获取会话截图
  fastify.get(
    '/:id/screenshot',
    {
      onRequest: [fastify.verifyJWTOrApiKey],
      schema: {
        params: zodToJsonSchema(idParamSchema),
        response: {
          200: zodToJsonSchema(getSessionScreenshotResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
          404: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['sessions'],
      },
    },
    sessionController.getSessionScreenshot
  );

  // 注入文件到浏览器
  fastify.post(
    '/:id/inject-file',
    {
      onRequest: [fastify.verifyJWTOrApiKey],
      schema: {
        params: zodToJsonSchema(idParamSchema),
        body: {
          type: 'object',
          required: ['machineFilePath', 'selector'],
          properties: {
            machineFilePath: { type: 'string' },
            selector: { type: 'string' },
            frameSelector: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'object' },
              message: { type: 'string' },
            },
          },
          400: zodToJsonSchema(errorResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          404: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['sessions'],
      },
    },
    sessionController.injectFileToSession
  );

  // URL 文件下载并注入浏览器
  fastify.post(
    '/:id/upload-url',
    {
      onRequest: [fastify.verifyJWTOrApiKey],
      schema: {
        params: zodToJsonSchema(idParamSchema),
        body: {
          type: 'object',
          required: ['url', 'selector'],
          properties: {
            url: { type: 'string' },
            selector: { type: 'string' },
            frameSelector: { type: 'string' },
            filename: { type: 'string' },
            downloadTimeout: { type: 'number' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'object' },
              message: { type: 'string' },
            },
          },
          400: zodToJsonSchema(errorResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          404: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['sessions'],
      },
    },
    sessionController.uploadUrlToSession
  );
}
