import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';
import { errorResponseSchema, idParamSchema } from '../../schemas/index.js';
import { createAuthenticate } from './authenticate.js';

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

        const { SessionModel } = await import('../../models/session.model.js');
        const { MachineModel } = await import('../../models/machine.model.js');
        const { connectionManager } = await import('../../services/machine-grpc.service.js');
        const { createWebhookEvent } = await import('../../utils/webhook.js');
        const { SessionStatus, WebhookEventType } = await import('@shared/types/index.js');

        const released: string[] = [];
        const failed: Array<{ sessionId: string; error: string }> = [];

        for (const sessionId of body.sessionIds) {
          try {
            const session = await SessionModel.findById(sessionId);
            if (!session) {
              failed.push({ sessionId, error: '会话不存在' });
              continue;
            }

            if (session.status === SessionStatus.DISCONNECTED || session.status === SessionStatus.ERROR) {
              released.push(sessionId);
              continue;
            }

            if (!session.machine_id) {
              const now = new Date();
              const startTime = session.start_time ? new Date(session.start_time) : new Date(session.created_at);
              const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);

              await SessionModel.markDisconnected(sessionId, duration);

              released.push(sessionId);
              continue;
            }

            try {
              await connectionManager.closeBrowser(session.machine_id, sessionId);

              const now = new Date();
              const startTime = session.start_time ? new Date(session.start_time) : new Date(session.created_at);
              const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);

              await SessionModel.markDisconnected(sessionId, duration);

              await MachineModel.decrementInstanceCount(session.machine_id);

              await createWebhookEvent(session.user_id, WebhookEventType.SESSION_DISCONNECTED, {
                session_id: sessionId,
                disconnected_at: new Date(),
              });

              released.push(sessionId);
            } catch (_machineError) {
              const now = new Date();
              const startTime = session.start_time ? new Date(session.start_time) : new Date(session.created_at);
              const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);
              await SessionModel.markDisconnected(sessionId, duration);

              released.push(sessionId);
            }
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : '结束失败';
            failed.push({ sessionId, error: message });
          }
        }

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
        const { UserModel } = await import('../../models/user.model.js');
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

        const { SessionModel } = await import('../../models/session.model.js');
        const sessions = await SessionModel.findByUserId(userId, { page, limit });

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

        const page = parseInt(query.page || '1');
        const limit = parseInt(query.limit || '20');
        const sort = query.sort || 'created_at';
        const order = (query.order || 'desc') as 'asc' | 'desc';

        const { SessionModel } = await import('../../models/session.model.js');
        const filters: { status?: string; userId?: number; startDate?: Date; endDate?: Date } = {};

        if (query.status) {
          filters.status = query.status;
        }

        if (query.userId) {
          filters.userId = parseInt(query.userId);
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

        const result = await SessionModel.paginateSorted(page, limit, {
          sort,
          order,
          filters: Object.keys(filters).length > 0 ? filters : undefined,
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

        const filters: { startDate?: Date; endDate?: Date } = {};

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

        const { SessionModel } = await import('../../models/session.model.js');
        const stats = await SessionModel.getStats(Object.keys(filters).length > 0 ? filters : undefined);

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

        const { SessionModel } = await import('../../models/session.model.js');
        const session = await SessionModel.getDetailById(sessionId);

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

        const { SessionModel } = await import('../../models/session.model.js');
        let sessions: Array<{ id: string; status: string }> = [];

        if (body.sessionIds && body.sessionIds.length > 0) {
          for (const sessionId of body.sessionIds) {
            const session = await SessionModel.findById(sessionId);
            if (session) {
              sessions.push({ id: session.id, status: session.status });
            }
          }
        } else {
          sessions = await SessionModel.findActiveSessions();
          sessions = sessions.map((s) => ({ id: s.id, status: s.status }));
        }

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
