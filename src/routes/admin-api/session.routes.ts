import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';
import { errorResponseSchema, idParamSchema } from '../../schemas/index.js';
import { createAuthenticate } from './authenticate.js';
import * as AdminSessionService from '../../services/admin-session.service.js';

function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function adminApiSessionRoutes(fastify: FastifyInstance): Promise<void> {
  const authenticate = createAuthenticate(fastify);

  fastify.post(
    '/api/admin/sessions/batch-release',
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: 'object',
          properties: {
            sessionIds: { type: 'array', items: { type: 'string' } },
          },
          required: ['sessionIds'],
        },
        response: {
          200: zodToJsonSchema(
            z.object({
              success: z.boolean(),
              message: z.string(),
              data: z.object({
                released: z.array(z.string()),
                failed: z.array(
                  z.object({
                    sessionId: z.string(),
                    error: z.string(),
                  })
                ),
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
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as { sessionIds: string[] };

        if (!body.sessionIds || !Array.isArray(body.sessionIds) || body.sessionIds.length === 0) {
          return reply.status(400).send({ success: false, error: '请提供要结束的会话 ID 列表' });
        }

        const { released, failed } = await AdminSessionService.batchReleaseSessions(body.sessionIds);

        return reply.send({
          success: true,
          message: `成功结束 ${released.length} 个会话${failed.length > 0 ? `，${failed.length} 个失败` : ''}`,
          data: { released, failed },
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '批量结束会话失败');
        const message = error instanceof Error ? error.message : '未知错误';
        return reply.status(500).send({ success: false, error: '批量结束会话失败: ' + message });
      }
    }
  );

  fastify.get(
    '/api/admin/users/:id/sessions',
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
                    id: z.string(),
                    user_id: z.number(),
                    machine_id: z.string().nullable(),
                    port: z.number().nullable(),
                    status: z.string(),
                    options: z.any().nullable(),
                    start_time: z.any(),
                    end_time: z.any().nullable(),
                    duration: z.number(),
                    credits_used: z.number(),
                    created_at: z.any(),
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

        const existingUser = await AdminSessionService.findUserById(userId);
        if (!existingUser) {
          return reply.status(404).send({ success: false, error: '用户不存在' });
        }

        const sessions = await AdminSessionService.getUserSessions(userId, {
          page: query.page || '1',
          limit: query.limit || '10',
        });

        return reply.send({
          success: true,
          data: sessions,
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '获取用户会话历史失败');
        const message = error instanceof Error ? error.message : '未知错误';
        return reply.status(500).send({ success: false, error: '获取用户会话历史失败: ' + message });
      }
    }
  );

  fastify.get(
    '/api/admin/sessions',
    {
      preHandler: [authenticate],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'number' },
            limit: { type: 'number' },
            sort: { type: 'string' },
            order: { type: 'string' },
            status: { type: 'string' },
            userId: { type: 'number' },
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
        tags: ['admin', 'sessions'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = request.query as {
          page?: string;
          limit?: string;
          sort?: string;
          order?: string;
          status?: string;
          userId?: string;
          startDate?: string;
          endDate?: string;
          dateRange?: string;
        };

        const result = await AdminSessionService.listSessions({
          page: query.page || '1',
          limit: query.limit || '20',
          sort: query.sort || 'created_at',
          order: query.order || 'desc',
          status: query.status,
          userId: query.userId,
          startDate: query.startDate,
          endDate: query.endDate,
          dateRange: query.dateRange,
        });

        return reply.send({
          success: true,
          data: result,
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '获取会话列表失败');
        return reply.status(500).send({ success: false, error: '获取会话列表失败: ' + getErrorMessage(error) });
      }
    }
  );

  fastify.get(
    '/api/admin/sessions/stats',
    {
      preHandler: [authenticate],
      schema: {
        querystring: {
          type: 'object',
          properties: {
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
                total: z.number(),
                active: z.number(),
                ended: z.number(),
                error: z.number(),
                totalCreditsUsed: z.number(),
                totalDuration: z.number(),
                avgDuration: z.number(),
                byUser: z.array(
                  z.object({
                    user_id: z.number(),
                    username: z.string(),
                    sessionCount: z.number(),
                    creditsUsed: z.number(),
                  })
                ),
              }),
            })
          ),
          400: zodToJsonSchema(errorResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['admin', 'sessions'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = request.query as {
          startDate?: string;
          endDate?: string;
          dateRange?: string;
        };

        const stats = await AdminSessionService.getSessionStats(query);

        return reply.send({
          success: true,
          data: stats,
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '获取会话统计失败');
        return reply.status(500).send({ success: false, error: '获取会话统计失败: ' + getErrorMessage(error) });
      }
    }
  );

  fastify.get(
    '/api/admin/sessions/:id',
    {
      preHandler: [authenticate],
      schema: {
        params: zodToJsonSchema(idParamSchema),
        response: {
          200: zodToJsonSchema(
            z.object({
              success: z.boolean(),
              data: z.object({
                id: z.string(),
                user_id: z.number(),
                username: z.string(),
                machine_id: z.string().nullable(),
                machine_name: z.string().nullable(),
                port: z.number().nullable(),
                status: z.string(),
                options: z.any().nullable(),
                start_time: z.any(),
                end_time: z.any().nullable(),
                duration: z.number(),
                credits_used: z.number(),
                last_activity: z.any().nullable(),
                error_message: z.string().nullable(),
                screenshot_url: z.string().nullable(),
                created_at: z.any(),
                updated_at: z.any(),
              }),
            })
          ),
          400: zodToJsonSchema(errorResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
          404: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['admin', 'sessions'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const params = request.params as { id: string };
        const sessionId = params.id;

        const session = await AdminSessionService.getSessionDetail(sessionId);

        if (!session) {
          return reply.status(404).send({ success: false, error: '会话不存在' });
        }

        return reply.send({
          success: true,
          data: session,
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '获取会话详情失败');
        return reply.status(500).send({ success: false, error: '获取会话详情失败: ' + getErrorMessage(error) });
      }
    }
  );

  fastify.post(
    '/api/admin/sessions/refresh-status',
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: 'object',
          properties: {
            sessionIds: { type: 'array', items: { type: 'string' } },
          },
        },
        response: {
          200: zodToJsonSchema(
            z.object({
              success: z.boolean(),
              data: z.object({
                updated: z.number(),
                sessions: z.array(
                  z.object({
                    id: z.string(),
                    status: z.string(),
                  })
                ),
              }),
            })
          ),
          400: zodToJsonSchema(errorResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['admin', 'sessions'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as { sessionIds?: string[] };

        const sessions = await AdminSessionService.refreshSessionStatus(body.sessionIds);

        return reply.send({
          success: true,
          data: {
            updated: sessions.length,
            sessions,
          },
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '刷新会话状态失败');
        return reply.status(500).send({ success: false, error: '刷新会话状态失败: ' + getErrorMessage(error) });
      }
    }
  );
}
