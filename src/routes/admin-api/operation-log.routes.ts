import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';
import { errorResponseSchema, idParamSchema, numericIdParamSchema } from '../../schemas/index.js';
import { OperationLogQueryRoute, OperationLogStatsQueryRoute } from '@shared/types/routes.js';
import { createAuthenticate } from './authenticate.js';
import { getSafeErrorMessage } from '../../utils/response.js';
import { tryCatchWrapper } from '../../utils/try-catch-wrapper.js';
import * as AdminOpLogService from '../../services/admin-operation-log.service.js';

export async function adminApiOperationLogRoutes(fastify: FastifyInstance): Promise<void> {
  const authenticate = createAuthenticate(fastify);

  fastify.get(
    '/api/admin/users/:id/logs',
    {
      onRequest: [authenticate],
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
        const { id: userId } = numericIdParamSchema.parse(request.params);
        const query = request.query as { page?: string; limit?: string };

        const result = await AdminOpLogService.getUserOperationLogs(userId, {
          page: query.page || '1',
          limit: query.limit || '10',
        });

        return reply.send({
          success: true,
          data: result,
        });
      } catch (error: unknown) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ success: false, error: '无效的用户 ID' });
        }
        request.log.error({ err: error }, '获取用户操作日志失败');
        if (error instanceof Error && error.message === '用户不存在') {
          return reply.status(404).send({ success: false, error: '用户不存在' });
        }
        return reply.status(500).send({ success: false, error: '获取用户操作日志失败: ' + getSafeErrorMessage(error) });
      }
    }
  );

  fastify.get(
    '/api/admin/operation-logs',
    {
      onRequest: [authenticate],
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
        const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10) || 20));

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

        const result = await AdminOpLogService.listOperationLogs(page, limit, filters);

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
      onRequest: [authenticate],
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
    tryCatchWrapper(async (request: FastifyRequest<OperationLogStatsQueryRoute>, reply: FastifyReply) => {
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

      const stats = await AdminOpLogService.getOperationLogStats(filters);

      return reply.send({ success: true, data: stats });
    })
  );
}
