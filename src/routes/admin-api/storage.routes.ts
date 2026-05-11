import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';
import { errorResponseSchema } from '../../schemas/index.js';
import { createAuthenticate } from './authenticate.js';
import { getSafeErrorMessage } from '../../utils/response.js';
import * as AdminStorageService from '../../services/admin-storage.service.js';

function getErrorMessage(e: unknown): string {
  return getSafeErrorMessage(e);
}

export async function adminApiStorageRoutes(fastify: FastifyInstance): Promise<void> {
  const authenticate = createAuthenticate(fastify);

  fastify.get(
    '/api/admin/storage/stats',
    {
      preHandler: [authenticate],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            userId: { type: 'number' },
            page: { type: 'number', default: 1 },
            limit: { type: 'number', default: 20 },
            search: { type: 'string' },
            sortBy: { type: 'string', enum: ['totalSize', 'username', 'sessionsSize', 'sharedSize'] },
            sortOrder: { type: 'string', enum: ['asc', 'desc'] },
          },
        },
        response: {
          200: zodToJsonSchema(
            z.object({
              success: z.boolean(),
              data: z.object({
                users: z.array(
                  z.object({
                    userId: z.number(),
                    username: z.string(),
                    sessionsSize: z.number(),
                    sharedSize: z.number(),
                    totalSize: z.number(),
                    sessionsCount: z.number(),
                    isOverLimit: z.boolean(),
                  })
                ),
                total: z.number(),
                page: z.number(),
                limit: z.number(),
              }),
            })
          ),
          400: zodToJsonSchema(errorResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['admin', 'storage'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = request.query as {
          userId?: number;
          page?: number;
          limit?: number;
          search?: string;
          sortBy?: 'totalSize' | 'username' | 'sessionsSize' | 'sharedSize';
          sortOrder?: 'asc' | 'desc';
        };

        const result = await AdminStorageService.getStorageStats(query);

        return reply.send({
          success: true,
          data: result,
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '获取存储统计失败');
        if (error instanceof Error && error.message === '用户不存在') {
          return reply.status(404).send({ success: false, error: '用户不存在' });
        }
        return reply.status(500).send({ success: false, error: '获取存储统计失败: ' + getErrorMessage(error) });
      }
    }
  );

  fastify.post(
    '/api/admin/storage/cleanup',
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: 'object',
          properties: {
            userIds: { type: 'array', items: { type: 'number' } },
            type: { type: 'string', enum: ['sessions', 'shared', 'all'] },
          },
          required: ['userIds', 'type'],
        },
        response: {
          200: zodToJsonSchema(
            z.object({
              success: z.boolean(),
              data: z.object({
                cleanedUsers: z.number(),
                freedSpace: z.number(),
                details: z.array(
                  z.object({
                    userId: z.number(),
                    username: z.string(),
                    freedSpace: z.number(),
                  })
                ),
              }),
            })
          ),
          400: zodToJsonSchema(errorResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['admin', 'storage'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const adminId = request.user?.id;
        const body = request.body as {
          userIds: number[];
          type: 'sessions' | 'shared' | 'all';
        };

        if (!body.userIds || !Array.isArray(body.userIds) || body.userIds.length === 0) {
          return reply.status(400).send({ success: false, error: '请提供要清理的用户 ID 列表' });
        }

        if (!['sessions', 'shared', 'all'].includes(body.type)) {
          return reply.status(400).send({ success: false, error: '无效的清理类型' });
        }

        const result = await AdminStorageService.cleanupUserData(body.userIds, body.type, adminId || 0);

        return reply.send({
          success: true,
          data: result,
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '清理用户数据失败');
        return reply.status(500).send({ success: false, error: '清理用户数据失败: ' + getErrorMessage(error) });
      }
    }
  );

  fastify.post(
    '/api/admin/storage/cleanup-all',
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: 'object',
          properties: {
            days: { type: 'number' },
          },
        },
        response: {
          200: zodToJsonSchema(
            z.object({
              success: z.boolean(),
              data: z.object({
                deletedCount: z.number(),
                freedSpace: z.number(),
              }),
            })
          ),
          400: zodToJsonSchema(errorResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['admin', 'storage'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const adminId = request.user?.id;
        const body = request.body as { days?: number };

        const result = await AdminStorageService.cleanupAllOldData(body.days, adminId || 0);

        return reply.send({
          success: true,
          data: result,
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '清理旧数据失败');
        return reply.status(500).send({ success: false, error: '清理旧数据失败: ' + getErrorMessage(error) });
      }
    }
  );

  fastify.get(
    '/api/admin/storage/system-stats',
    {
      preHandler: [authenticate],
      schema: {
        response: {
          200: zodToJsonSchema(
            z.object({
              success: z.boolean(),
              data: z.object({
                totalUsers: z.number(),
                totalStorageSize: z.number(),
                uploadsSize: z.number(),
                screenshotsSize: z.number(),
                tempSize: z.number(),
                userStorageSize: z.number(),
              }),
            })
          ),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['admin', 'storage'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const stats = await AdminStorageService.getSystemStorageStats();

        return reply.send({
          success: true,
          data: stats,
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '获取系统存储统计失败');
        return reply.status(500).send({ success: false, error: '获取系统存储统计失败: ' + getErrorMessage(error) });
      }
    }
  );
}
