import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { OperationLogModel } from '../../models/operation-log.model.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';
import { join } from 'path';
import { errorResponseSchema } from '../../schemas/index.js';
import { createAuthenticate } from './authenticate.js';

function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
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

        const { StorageService } = await import('../../services/storage.service.js');

        if (query.userId) {
          const { UserModel } = await import('../../models/user.model.js');
          const user = await UserModel.findById(query.userId);

          if (!user) {
            return reply.status(404).send({ success: false, error: '用户不存在' });
          }

          const stats = await StorageService.getUserStorageStats(query.userId);
          const sessionsPath = join(process.cwd(), 'data', 'user-data', String(query.userId), 'sessions');
          let sessionsCount = 0;
          try {
            const { readdirSync, existsSync } = await import('fs');
            if (existsSync(sessionsPath)) {
              const entries = readdirSync(sessionsPath, { withFileTypes: true });
              sessionsCount = entries.filter((e: { isDirectory: () => boolean }) => e.isDirectory()).length;
            }
          } catch (error) {
            request.log.error({ err: error }, '读取用户 sessions 目录失败');
          }

          return reply.send({
            success: true,
            data: {
              users: [
                {
                  userId: user.id,
                  username: user.username,
                  sessionsSize: stats.sessionsSize,
                  sharedSize: stats.sharedSize,
                  totalSize: stats.totalSize,
                  sessionsCount,
                  isOverLimit: stats.totalSize > 5 * 1024 * 1024 * 1024,
                },
              ],
              total: 1,
              page: 1,
              limit: 1,
            },
          });
        }

        const result = await StorageService.getAdminStorageStats({
          page: query.page,
          limit: query.limit,
          search: query.search,
          sortBy: query.sortBy,
          sortOrder: query.sortOrder,
        });

        return reply.send({
          success: true,
          data: result,
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '获取存储统计失败');
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

        const { StorageService } = await import('../../services/storage.service.js');
        const result = await StorageService.adminCleanupUserData(body.userIds, body.type);

        OperationLogModel.create({
          admin_id: adminId || 0,
          action: '清理用户存储',
          details: {
            type: body.type,
            userIds: body.userIds,
            cleanedUsers: result.cleanedUsers,
            freedSpace: result.freedSpace,
          },
        }).catch((logError) => {
          request.log.error({ err: logError }, '记录操作日志失败');
        });

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

        const { StorageService } = await import('../../services/storage.service.js');
        const result = await StorageService.adminCleanupAllOldData(body.days);

        OperationLogModel.create({
          admin_id: adminId || 0,
          action: '清理旧数据',
          details: {
            days: body.days,
            deletedCount: result.deletedCount,
            freedSpace: result.freedSpace,
          },
        }).catch((logError) => {
          request.log.error({ err: logError }, '记录操作日志失败');
        });

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
        const { StorageService } = await import('../../services/storage.service.js');
        const stats = await StorageService.getSystemStorageStats();

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
