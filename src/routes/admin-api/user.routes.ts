import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';
import {
  adminCreateUserRequestSchema,
  adminCreateUserResponseSchema,
  adminGetUserResponseSchema,
  adminGetUsersResponseSchema,
  userListQuerySchema,
  adminUpdateUserRequestSchema,
  adminUpdateUserResponseSchema,
  adminDeleteUserResponseSchema,
  adminAddCreditsRequestSchema,
  adminAddCreditsResponseSchema,
  errorResponseSchema,
  idParamSchema,
} from '../../schemas/index.js';
import { BatchRechargeBodyRoute } from '@shared/types/routes.js';
import { createAuthenticate } from './authenticate.js';
import * as UserService from '../../services/user.service.js';
import { sendSuccess, sendError, sendCreated, getSafeErrorMessage } from '../../utils/response.js';

export async function adminApiUserRoutes(fastify: FastifyInstance): Promise<void> {
  const authenticate = createAuthenticate(fastify);

  fastify.post(
    '/api/admin/users',
    {
      preHandler: [authenticate],
      schema: {
        body: zodToJsonSchema(adminCreateUserRequestSchema),
        response: {
          201: zodToJsonSchema(adminCreateUserResponseSchema),
          400: zodToJsonSchema(errorResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
          409: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['admin'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const adminId = request.user?.id;
        const body = request.body as z.infer<typeof adminCreateUserRequestSchema>;

        const user = await UserService.createUser(
          {
            username: body.username,
            email: body.email || '',
            password: body.password,
            role: body.role,
            credits: body.credits,
          },
          adminId
        );

        return sendCreated(
          reply,
          {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            status: user.status,
            credits: user.credits,
            api_key: user.api_key,
          },
          '用户创建成功'
        );
      } catch (error: unknown) {
        request.log.error({ err: error }, '创建用户失败');
        const message = error instanceof Error ? error.message : '未知错误';
        const statusCode = message.includes('已存在') ? 409 : 500;
        const userMessage = statusCode === 409 ? '用户名已存在' : '创建用户失败';
        return sendError(reply, userMessage, statusCode);
      }
    }
  );

  fastify.get(
    '/api/admin/users',
    {
      preHandler: [authenticate],
      schema: {
        querystring: zodToJsonSchema(userListQuerySchema),
        response: {
          200: zodToJsonSchema(adminGetUsersResponseSchema),
          400: zodToJsonSchema(errorResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['admin'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = userListQuerySchema.parse(request.query);

        const users = await UserService.listUsers({
          page: query.page,
          limit: query.limit,
          sort: query.sort || 'created_at',
          order: query.order || 'desc',
          search: query.search,
          role: query.role as import('@shared/types/index.js').UserRole | undefined,
          status: query.status as import('@shared/types/index.js').UserStatus | undefined,
        });

        const sanitizedUsers = users.items.map((user) => ({
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          status: user.status,
          credits: user.credits,
          created_at: user.created_at,
        }));

        return sendSuccess(reply, {
          ...users,
          items: sanitizedUsers,
        });
      } catch (error: unknown) {
        if (error instanceof z.ZodError) {
          return sendError(reply, '无效的查询参数: ' + error.errors.map((e) => e.message).join(', '), 400);
        }
        request.log.error({ err: error }, '获取用户列表失败');
        return sendError(reply, '获取用户列表失败: ' + getSafeErrorMessage(error), 500);
      }
    }
  );

  fastify.get(
    '/api/admin/users/:id',
    {
      preHandler: [authenticate],
      schema: {
        params: zodToJsonSchema(idParamSchema),
        response: {
          200: zodToJsonSchema(adminGetUserResponseSchema),
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

        if (isNaN(userId)) {
          return sendError(reply, '无效的用户 ID', 400);
        }

        const user = await UserService.getUserById(userId);
        if (!user) {
          return sendError(reply, '用户不存在', 404);
        }

        return sendSuccess(reply, {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          status: user.status,
          credits: user.credits,
          webhook_url: user.webhook_url,
          api_key: user.api_key,
          created_at: user.created_at,
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '获取用户信息失败');
        return sendError(reply, '获取用户信息失败: ' + getSafeErrorMessage(error), 500);
      }
    }
  );

  fastify.put(
    '/api/admin/users/:id',
    {
      preHandler: [authenticate],
      schema: {
        params: zodToJsonSchema(idParamSchema),
        body: zodToJsonSchema(adminUpdateUserRequestSchema),
        response: {
          200: zodToJsonSchema(adminUpdateUserResponseSchema),
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
        const adminId = request.user?.id;
        const params = request.params as { id: string };
        const userId = parseInt(params.id, 10);
        const body = request.body as z.infer<typeof adminUpdateUserRequestSchema>;

        if (isNaN(userId)) {
          return sendError(reply, '无效的用户 ID', 400);
        }

        const updatedUser = await UserService.updateUser(
          userId,
          {
            email: body.email,
            role: body.role,
            status: body.status,
            webhook_url: body.webhook_url,
            password: body.password,
          },
          adminId
        );

        if (!updatedUser) {
          return sendError(reply, '用户不存在', 404);
        }

        return sendSuccess(
          reply,
          {
            id: updatedUser.id,
            username: updatedUser.username,
            email: updatedUser.email,
            role: updatedUser.role,
            status: updatedUser.status,
            credits: updatedUser.credits,
            webhook_url: updatedUser.webhook_url,
          },
          '用户更新成功'
        );
      } catch (error: unknown) {
        request.log.error({ err: error }, '更新用户失败');
        return sendError(reply, '更新用户失败: ' + getSafeErrorMessage(error), 500);
      }
    }
  );

  fastify.delete(
    '/api/admin/users/:id',
    {
      preHandler: [authenticate],
      schema: {
        params: zodToJsonSchema(idParamSchema),
        response: {
          200: zodToJsonSchema(adminDeleteUserResponseSchema),
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
        const adminId = request.user?.id;
        const params = request.params as { id: string };
        const userId = parseInt(params.id, 10);

        if (isNaN(userId)) {
          return sendError(reply, '无效的用户 ID', 400);
        }

        await UserService.deleteUser(userId, adminId);

        return sendSuccess(reply, null, '用户删除成功');
      } catch (error: unknown) {
        request.log.error({ err: error }, '删除用户失败');
        const message = error instanceof Error ? error.message : '未知错误';
        if (message.includes('不允许删除管理员')) {
          return sendError(reply, message, 403);
        }
        if (message.includes('不存在')) {
          return sendError(reply, message, 404);
        }
        return sendError(reply, '删除用户失败: ' + message, 500);
      }
    }
  );

  fastify.post(
    '/api/admin/users/:id/credits',
    {
      preHandler: [authenticate],
      schema: {
        params: zodToJsonSchema(idParamSchema),
        body: zodToJsonSchema(adminAddCreditsRequestSchema),
        response: {
          200: zodToJsonSchema(adminAddCreditsResponseSchema),
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
        const adminId = request.user?.id;
        const params = request.params as { id: string };
        const userId = parseInt(params.id, 10);
        const body = request.body as z.infer<typeof adminAddCreditsRequestSchema>;

        if (isNaN(userId)) {
          return sendError(reply, '无效的用户 ID', 400);
        }

        const amount = body.amount;
        if (!amount || amount <= 0) {
          return sendError(reply, '无效的点数金额', 400);
        }

        const updatedUser = await UserService.addCredits(userId, amount, adminId, body.reason);
        if (!updatedUser) {
          return sendError(reply, '用户不存在', 404);
        }

        return sendSuccess(
          reply,
          {
            id: updatedUser.id,
            username: updatedUser.username,
            credits: updatedUser.credits,
          },
          '点数添加成功'
        );
      } catch (error: unknown) {
        request.log.error({ err: error }, '添加点数失败');
        return sendError(reply, '添加点数失败: ' + getSafeErrorMessage(error), 500);
      }
    }
  );

  fastify.post(
    '/api/admin/users/:id/reset-api-key',
    {
      preHandler: [authenticate],
      schema: {
        params: zodToJsonSchema(idParamSchema),
        response: {
          200: zodToJsonSchema(
            z.object({
              success: z.boolean(),
              message: z.string(),
              data: z.object({
                id: z.number(),
                api_key: z.string(),
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
        const adminId = request.user?.id;
        const params = request.params as { id: string };
        const userId = parseInt(params.id, 10);

        if (isNaN(userId)) {
          return sendError(reply, '无效的用户 ID', 400);
        }

        const newApiKey = await UserService.resetApiKey(userId, adminId);

        return sendSuccess(reply, { id: userId, api_key: newApiKey }, 'API Key 重置成功');
      } catch (error: unknown) {
        request.log.error({ err: error }, '重置 API Key 失败');
        const message = error instanceof Error ? error.message : '未知错误';
        if (message.includes('不存在')) {
          return sendError(reply, message, 404);
        }
        return sendError(reply, '重置 API Key 失败: ' + message, 500);
      }
    }
  );

  fastify.get(
    '/api/admin/users/export',
    {
      preHandler: [authenticate],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            search: { type: 'string' },
            role: { type: 'string', enum: ['admin', 'user', ''] },
            status: { type: 'string', enum: ['active', 'inactive', ''] },
          },
        },
        tags: ['admin'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = request.query as { search?: string; role?: string; status?: string };

        const csvContent = await UserService.exportUsersCsv(query);

        const date = new Date().toISOString().split('T')[0];
        const filename = `users_${date}.csv`;

        return reply
          .header('Content-Type', 'text/csv; charset=utf-8')
          .header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
          .send(csvContent);
      } catch (error: unknown) {
        request.log.error({ err: error }, '导出用户列表失败');
        return sendError(reply, '导出用户列表失败: ' + getSafeErrorMessage(error), 500);
      }
    }
  );

  fastify.get(
    '/api/admin/users/:id/session-stats',
    {
      preHandler: [authenticate],
      schema: {
        params: zodToJsonSchema(idParamSchema),
        response: {
          200: zodToJsonSchema(
            z.object({
              success: z.boolean(),
              data: z.object({
                total_sessions: z.number(),
                total_duration: z.number(),
                total_credits_used: z.number(),
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

        if (isNaN(userId)) {
          return sendError(reply, '无效的用户 ID', 400);
        }

        const user = await UserService.getUserById(userId);
        if (!user) {
          return sendError(reply, '用户不存在', 404);
        }

        const stats = await UserService.getUserSessionStats(userId);
        return sendSuccess(reply, stats);
      } catch (error: unknown) {
        request.log.error({ err: error }, '获取用户会话消耗统计失败');
        return sendError(reply, '获取用户会话消耗统计失败: ' + getSafeErrorMessage(error), 500);
      }
    }
  );

  fastify.post(
    '/api/admin/users/batch-delete',
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: 'object',
          properties: {
            userIds: { type: 'array', items: { type: 'number' }, maxItems: 100 },
          },
          required: ['userIds'],
        },
        response: {
          200: zodToJsonSchema(
            z.object({
              success: z.boolean(),
              message: z.string(),
              data: z.object({
                deleted: z.array(z.number()),
                failed: z.array(
                  z.object({
                    userId: z.number(),
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
        const adminId = request.user?.id;
        const body = request.body as { userIds: number[] };

        if (!body.userIds || !Array.isArray(body.userIds) || body.userIds.length === 0) {
          return sendError(reply, '请提供要删除的用户 ID 列表', 400);
        }

        const result = await UserService.batchDeleteUsers(body.userIds, adminId);

        return sendSuccess(
          reply,
          result,
          `成功删除 ${result.deleted.length} 个用户${result.failed.length > 0 ? `，${result.failed.length} 个失败` : ''}`
        );
      } catch (error: unknown) {
        request.log.error({ err: error }, '批量删除用户失败');
        return sendError(reply, '批量删除用户失败: ' + getSafeErrorMessage(error), 500);
      }
    }
  );

  fastify.post(
    '/api/admin/users/batch-recharge',
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: 'object',
          properties: {
            userIds: { type: 'array', items: { type: 'number' }, maxItems: 100 },
            credits: { type: 'number' },
            reason: { type: 'string' },
          },
          required: ['userIds', 'credits'],
        },
        response: {
          200: zodToJsonSchema(
            z.object({
              success: z.boolean(),
              message: z.string(),
              data: z.object({
                recharged: z.array(z.number()),
                failed: z.array(
                  z.object({
                    userId: z.number(),
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
    async (request: FastifyRequest<BatchRechargeBodyRoute>, reply: FastifyReply) => {
      try {
        const adminId = request.user?.id;
        const body = request.body;

        if (!body.userIds || !Array.isArray(body.userIds) || body.userIds.length === 0) {
          return sendError(reply, '请提供要充值的用户 ID 列表', 400);
        }

        const amount = body.credits;
        if (isNaN(amount) || amount <= 0) {
          return sendError(reply, '无效的点数金额', 400);
        }

        const result = await UserService.batchRecharge(body.userIds, amount, adminId, body.reason);

        return sendSuccess(
          reply,
          result,
          `成功为 ${result.recharged.length} 个用户充值${result.failed.length > 0 ? `，${result.failed.length} 个失败` : ''}`
        );
      } catch (error: unknown) {
        request.log.error({ err: error }, '批量充值失败');
        return sendError(reply, '批量充值失败: ' + getSafeErrorMessage(error), 500);
      }
    }
  );
}
