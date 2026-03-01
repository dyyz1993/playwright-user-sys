import { FastifyInstance } from 'fastify';
import fileController from '../controllers/file.controller.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { errorResponseSchema } from '../schemas/index.js';

export default async function fileRoutes(fastify: FastifyInstance): Promise<void> {
  // 上传文件（仅管理员）
  fastify.post(
    '/api/files/upload',
    {
      onRequest: [fastify.verifyJWT, fastify.verifyAdmin],
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  filename: { type: 'string' },
                  savedFilename: { type: 'string' },
                  url: { type: 'string' },
                  mimetype: { type: 'string' },
                  size: { type: 'number' },
                },
              },
              message: { type: 'string' },
            },
          },
          400: zodToJsonSchema(errorResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
          500: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['files'],
      },
    },
    fileController.uploadFile
  );

  // 上传临时文件（用于CDP文件上传）
  fastify.post(
    '/api/files/upload-temp',
    {
      onRequest: [fastify.verifyJWT],
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  filename: { type: 'string' },
                  savedFilename: { type: 'string' },
                  url: { type: 'string' },
                  filepath: { type: 'string' }, // 服务器上的绝对路径
                  mimetype: { type: 'string' },
                  size: { type: 'number' },
                },
              },
              message: { type: 'string' },
            },
          },
          400: zodToJsonSchema(errorResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          500: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['files'],
      },
    },
    fileController.uploadTempFile
  );

  // 获取文件列表（仅管理员）
  fastify.get(
    '/api/files',
    {
      onRequest: [fastify.verifyJWT, fastify.verifyAdmin],
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    filename: { type: 'string' },
                    url: { type: 'string' },
                    size: { type: 'number' },
                    uploadedAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
          500: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['files'],
      },
    },
    fileController.getFileList
  );

  // 清理临时文件
  fastify.post(
    '/api/files/cleanup-temp',
    {
      onRequest: [fastify.verifyJWT],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            hours: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  deletedCount: { type: 'number' },
                  message: { type: 'string' },
                },
              },
              message: { type: 'string' },
            },
          },
          401: zodToJsonSchema(errorResponseSchema),
          500: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['files'],
      },
    },
    fileController.cleanupTempFiles
  );
}
