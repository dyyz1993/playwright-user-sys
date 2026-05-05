import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { OperationLogModel } from '../../models/operation-log.model.js';
import { UserModel } from '../../models/user.model.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';
import { errorResponseSchema, idParamSchema } from '../../schemas/index.js';
import { OperationLogQueryRoute, OperationLogStatsQueryRoute } from '@shared/types/routes.js';
import { createAuthenticate } from './authenticate.js';

function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function adminApiOperationLogRoutes(fastify: FastifyInstance): Promise<void> {
  const authenticate = createAuthenticate(fastify);

  fastify.get(
    '/api/admin/users/:id/logs',
    {
      preHandler: [authenticate],
      schema: {
        params: zodToJsonSchema(idParamSchema),
        response: {
          200: zodToJsonSchema(
            z.object({
              success: z.boolean(),
              data: z.object({
                items: z.array(
                  z.object({
                    id: z.number(),
                    admin_id: z.number(),
                    action: z.string(),
                    details: z.any().optional(),
                    target_user_id: z.number().nullable(),
                    created_at: z.any(),
                    updated_at: z.any(),
                  })
                ),
                total: z.number(),
                page: z.number(),
                limit: z.number(),
                totalPages: z.number(),
              }),
            })
          ),
          400: zodToJsonSchema(errorResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
          404: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['admin'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const params = request.params as { id: string };
        const userId = parseInt(params.id, 10);
        const query = request.query as { page?: string; limit?: string };

        if (isNaN(userId)) {
          return reply.status(400).send({ success: false, error: '无效的用户 ID' });
        }

        const existingUser = await UserModel.findById(userId);
        if (!existingUser) {
          return reply.status(404).send({ success: false, error: '用户不存在' });
        }

        const page = query.page || '1';
        const limit = query.limit || '10';

        const result = await OperationLogModel.findByTargetUserId(userId, { page, limit });

        return reply.send({
          success: true,
          data: result,
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '获取用户操作日志失败');
        const message = error instanceof Error ? error.message : '未知错误';
        return reply.status(500).send({ success: false, error: '获取用户操作日志失败: ' + message });
      }
    }
  );

  fastify.get(
    '/api/admin/operation-logs',
    {
      preHandler: [authenticate],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'number', default: 1 },
            limit: { type: 'number', default: 20 },
            action: { type: 'string' },
            startDate: { type: 'string' },
            endDate: { type: 'string' },
            dateRange: { type: 'string', enum: ['all', 'today', 'yesterday', 'week', 'month'] },
          },
        },
        response: {
          200: zodToJsonSchema(
            z.object({
              success: z.boolean(),
              data: z.object({
                items: z.array(z.any()),
                total: z.number(),
                page: z.number(),
                limit: z.number(),
                totalPages: z.number(),
              }),
            })
          ),
          400: zodToJsonSchema(errorResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['admin'],
      },
    },
    async (request: FastifyRequest<OperationLogQueryRoute>, reply: FastifyReply) => {
      try {
        const query = request.query;
        const page = parseInt(query.page || '1') || 1;
        const limit = parseInt(query.limit || '20') || 20;

        const filters: Record<string, unknown> = {};

        if (query.action) {
          filters.action = query.action;
        }

        if (query.dateRange && query.dateRange !== 'all') {
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

          if (query.dateRange === 'today') {
            filters.startDate = today;
          } else if (query.dateRange === 'yesterday') {
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            filters.startDate = yesterday;
            filters.endDate = yesterday;
          } else if (query.dateRange === 'week') {
            const startOfWeek = new Date(today);
            startOfWeek.setDate(today.getDate() - today.getDay());
            filters.startDate = startOfWeek;
          } else if (query.dateRange === 'month') {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            filters.startDate = startOfMonth;
          }
        }

        if (query.startDate) {
          filters.startDate = new Date(query.startDate);
        }
        if (query.endDate) {
          filters.endDate = new Date(query.endDate);
        }

        const result = await OperationLogModel.paginate(page, limit, filters);

        return reply.send({
          success: true,
          data: result,
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '认证失败');
        return reply.status(401).send({ success: false, error: '认证失败' });
      }
    }
  );

  fastify.get(
    '/api/admin/operation-logs/stats',
    {
      preHandler: [authenticate],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            dateRange: { type: 'string', enum: ['all', 'today', 'week', 'month'] },
          },
        },
        response: {
          200: zodToJsonSchema(
            z.object({
              success: z.boolean(),
              data: z.object({
                total: z.number(),
                byAction: z.record(z.number()),
              }),
            })
          ),
          400: zodToJsonSchema(errorResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['admin'],
      },
    },
    async (request: FastifyRequest<OperationLogStatsQueryRoute>, reply: FastifyReply) => {
      try {
        const query = request.query;
        const filters: Record<string, unknown> = {};

        if (query.dateRange && query.dateRange !== 'all') {
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

          if (query.dateRange === 'today') {
            filters.startDate = today;
          } else if (query.dateRange === 'week') {
            const startOfWeek = new Date(today);
            startOfWeek.setDate(today.getDate() - today.getDay());
            filters.startDate = startOfWeek;
          } else if (query.dateRange === 'month') {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            filters.startDate = startOfMonth;
          }
        }

        const stats = await OperationLogModel.getStats(filters);

        return reply.send({ success: true, data: stats });
      } catch (error: unknown) {
        request.log.error({ err: error }, '获取操作统计失败');
        return reply.status(500).send({ success: false, error: '获取操作统计失败' });
      }
    }
  );
}
