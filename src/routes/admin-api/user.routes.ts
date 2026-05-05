import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { UserModel } from '../../models/user.model.js';
import { OperationLogModel } from '../../models/operation-log.model.js';
import { UserRole, UserStatus } from '@shared/types/index.js';
import { v4 as uuidv4 } from 'uuid';
import { hashPassword } from '../../utils/auth.js';
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

function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

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

        const userData = {
          username: body.username,
          email: body.email || '',
          password: await hashPassword(body.password),
          role: body.role || UserRole.USER,
          status: UserStatus.ACTIVE,
          credits: body.credits || 0,
          api_key: uuidv4(),
        };

        const user = await UserModel.create(userData);
        if (!user) {
          return reply.status(500).send({ success: false, error: '创建用户失败' });
        }

        OperationLogModel.create({
          admin_id: adminId || 0,
          action: '创建用户',
          details: {
            username: userData.username,
            role: userData.role,
            credits: userData.credits,
          },
          target_user_id: user.id,
        }).catch((logError) => {
          request.log.error({ err: logError }, '记录操作日志失败');
        });

        return reply.status(201).send({
          success: true,
          message: '用户创建成功',
          data: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            status: user.status,
            credits: user.credits,
            api_key: user.api_key,
          },
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '创建用户失败');
        const message = error instanceof Error ? error.message : '未知错误';
        return reply.status(500).send({ success: false, error: '创建用户失败: ' + message });
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

        const users = await UserModel.findAll({
          page: query.page,
          limit: query.limit,
          sort: query.sort || 'created_at',
          order: query.order || 'desc',
          search: query.search,
          role: query.role as UserRole | undefined,
          status: query.status as UserStatus | undefined,
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

        return reply.send({
          success: true,
          data: {
            ...users,
            items: sanitizedUsers,
          },
        });
      } catch (error: unknown) {
        if (error instanceof z.ZodError) {
          return reply
            .status(400)
            .send({ success: false, error: '无效的查询参数: ' + error.errors.map((e) => e.message).join(', ') });
        }
        request.log.error({ err: error }, '获取用户列表失败');
        return reply.status(500).send({ success: false, error: '获取用户列表失败: ' + getErrorMessage(error) });
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
          return reply.status(400).send({ success: false, error: '无效的用户 ID' });
        }

        const user = await UserModel.findById(userId);
        if (!user) {
          return reply.status(404).send({ success: false, error: '用户不存在' });
        }

        return reply.send({
          success: true,
          data: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            status: user.status,
            credits: user.credits,
            webhook_url: user.webhook_url,
            api_key: user.api_key,
            created_at: user.created_at,
          },
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '获取用户信息失败');
        const message = error instanceof Error ? error.message : '未知错误';
        return reply.status(500).send({ success: false, error: '获取用户信息失败: ' + message });
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
          return reply.status(400).send({ success: false, error: '无效的用户 ID' });
        }

        const existingUser = await UserModel.findById(userId);
        if (!existingUser) {
          return reply.status(404).send({ success: false, error: '用户不存在' });
        }

        const updateData: Record<string, unknown> = {};

        if (body.email) updateData.email = body.email;
        if (body.role) updateData.role = body.role;
        if (body.status) updateData.status = body.status;
        if (body.webhook_url) updateData.webhook_url = body.webhook_url;
        if (body.password) updateData.password = await hashPassword(body.password);

        const updatedUser = await UserModel.update(userId, updateData);
        if (!updatedUser) {
          return reply.status(500).send({ success: false, error: '更新用户失败' });
        }

        OperationLogModel.create({
          admin_id: adminId || 0,
          action: '更新用户',
          details: {
            ...updateData,
            password: body.password ? '已更新' : undefined,
          },
          target_user_id: userId,
        }).catch((logError) => {
          request.log.error({ err: logError }, '记录操作日志失败');
        });

        return reply.send({
          success: true,
          message: '用户更新成功',
          data: {
            id: updatedUser.id,
            username: updatedUser.username,
            email: updatedUser.email,
            role: updatedUser.role,
            status: updatedUser.status,
            credits: updatedUser.credits,
            webhook_url: updatedUser.webhook_url,
          },
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '更新用户失败');
        const message = error instanceof Error ? error.message : '未知错误';
        return reply.status(500).send({ success: false, error: '更新用户失败: ' + message });
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
          return reply.status(400).send({ success: false, error: '无效的用户 ID' });
        }

        const existingUser = await UserModel.findById(userId);
        if (!existingUser) {
          return reply.status(404).send({ success: false, error: '用户不存在' });
        }

        if (existingUser.role === UserRole.ADMIN) {
          return reply.status(403).send({ success: false, error: '不允许删除管理员账号' });
        }

        await UserModel.delete(userId);

        OperationLogModel.create({
          admin_id: adminId || 0,
          action: '删除用户',
          details: { username: existingUser.username },
          target_user_id: userId,
        }).catch((logError) => {
          request.log.error({ err: logError }, '记录操作日志失败');
        });

        return reply.send({
          success: true,
          message: '用户删除成功',
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '删除用户失败');
        const message = error instanceof Error ? error.message : '未知错误';
        return reply.status(500).send({ success: false, error: '删除用户失败: ' + message });
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
          return reply.status(400).send({ success: false, error: '无效的用户 ID' });
        }

        const amount = body.amount;
        if (!amount || amount <= 0) {
          return reply.status(400).send({ success: false, error: '无效的点数金额' });
        }

        const existingUser = await UserModel.findById(userId);
        if (!existingUser) {
          return reply.status(404).send({ success: false, error: '用户不存在' });
        }

        const updatedUser = await UserModel.addCredits(userId, amount);
        if (!updatedUser) {
          return reply.status(500).send({ success: false, error: '添加点数失败' });
        }

        OperationLogModel.create({
          admin_id: adminId || 0,
          action: '添加点数',
          details: {
            amount,
            reason: body.reason || '管理员分配',
            username: existingUser.username,
          },
          target_user_id: userId,
        }).catch((logError) => {
          request.log.error({ err: logError }, '记录操作日志失败');
        });

        return reply.send({
          success: true,
          message: '点数添加成功',
          data: {
            id: updatedUser.id,
            username: updatedUser.username,
            credits: updatedUser.credits,
          },
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '添加点数失败');
        const message = error instanceof Error ? error.message : '未知错误';
        return reply.status(500).send({ success: false, error: '添加点数失败: ' + message });
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
          return reply.status(400).send({ success: false, error: '无效的用户 ID' });
        }

        const existingUser = await UserModel.findById(userId);
        if (!existingUser) {
          return reply.status(404).send({ success: false, error: '用户不存在' });
        }

        const newApiKey = uuidv4();
        await UserModel.update(userId, { api_key: newApiKey });

        OperationLogModel.create({
          admin_id: adminId || 0,
          action: '重置API Key',
          details: { username: existingUser.username },
          target_user_id: userId,
        }).catch((logError) => {
          request.log.error({ err: logError }, '记录操作日志失败');
        });

        return reply.send({
          success: true,
          message: 'API Key 重置成功',
          data: { id: userId, api_key: newApiKey },
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '重置 API Key 失败');
        const message = error instanceof Error ? error.message : '未知错误';
        return reply.status(500).send({ success: false, error: '重置 API Key 失败: ' + message });
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
        const adminId = request.user?.id;
        const query = request.query as { search?: string; role?: string; status?: string };

        const filters: Record<string, unknown> = {};

        if (query.search) {
          filters.search = query.search;
        }

        if (query.role) {
          filters.role = query.role;
        }

        if (query.status) {
          filters.status = query.status;
        }

        const result = await UserModel.findAll({ limit: '1000000', ...filters });
        const users = result.items;

        const headers = ['ID', '用户名', '邮箱', '角色', '积分', '状态', '创建时间'];
        const csvRows: string[] = [];

        csvRows.push('\uFEFF' + headers.map((h) => `"${h}"`).join(','));

        for (const user of users) {
          const row = [
            user.id,
            user.username,
            user.email || '',
            user.role === 'admin' ? '管理员' : '普通用户',
            user.credits,
            user.status === 'active' ? '活跃' : '禁用',
            new Date(user.created_at).toLocaleString('zh-CN'),
          ];
          csvRows.push(row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','));
        }

        const csvContent = csvRows.join('\n');

        const date = new Date().toISOString().split('T')[0];
        const filename = `users_${date}.csv`;

        OperationLogModel.create({
          admin_id: adminId || 0,
          action: '导出用户列表',
          details: {
            count: users.length,
            filters: query,
          },
        }).catch((logError) => {
          request.log.error({ err: logError }, '记录操作日志失败');
        });

        return reply
          .header('Content-Type', 'text/csv; charset=utf-8')
          .header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
          .send(csvContent);
      } catch (error: unknown) {
        request.log.error({ err: error }, '导出用户列表失败');
        const message = error instanceof Error ? error.message : '未知错误';
        return reply.status(500).send({ success: false, error: '导出用户列表失败: ' + message });
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
          return reply.status(400).send({ success: false, error: '无效的用户 ID' });
        }

        const existingUser = await UserModel.findById(userId);
        if (!existingUser) {
          return reply.status(404).send({ success: false, error: '用户不存在' });
        }

        const { SessionModel } = await import('../../models/session.model.js');
        const stats = await SessionModel.getUserSessionStats(userId);

        return reply.send({
          success: true,
          data: stats,
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '获取用户会话消耗统计失败');
        const message = error instanceof Error ? error.message : '未知错误';
        return reply.status(500).send({ success: false, error: '获取用户会话消耗统计失败: ' + message });
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
            userIds: { type: 'array', items: { type: 'number' } },
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
          return reply.status(400).send({ success: false, error: '请提供要删除的用户 ID 列表' });
        }

        const deleted: number[] = [];
        const failed: Array<{ userId: number; error: string }> = [];

        for (const userId of body.userIds) {
          try {
            if (isNaN(userId)) {
              failed.push({ userId, error: '无效的用户 ID' });
              continue;
            }

            const existingUser = await UserModel.findById(userId);
            if (!existingUser) {
              failed.push({ userId, error: '用户不存在' });
              continue;
            }

            if (existingUser.role === UserRole.ADMIN) {
              failed.push({ userId, error: '不允许删除管理员账号' });
              continue;
            }

            await UserModel.delete(userId);
            deleted.push(userId);

            OperationLogModel.create({
              admin_id: adminId || 0,
              action: '批量删除用户',
              details: { username: existingUser.username },
              target_user_id: userId,
            }).catch((logError) => {
              request.log.error({ err: logError }, '记录操作日志失败');
            });
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : '删除失败';
            failed.push({ userId, error: message });
          }
        }

        return reply.send({
          success: true,
          message: `成功删除 ${deleted.length} 个用户${failed.length > 0 ? `，${failed.length} 个失败` : ''}`,
          data: { deleted, failed },
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '批量删除用户失败');
        const message = error instanceof Error ? error.message : '未知错误';
        return reply.status(500).send({ success: false, error: '批量删除用户失败: ' + message });
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
            userIds: { type: 'array', items: { type: 'number' } },
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
          return reply.status(400).send({ success: false, error: '请提供要充值的用户 ID 列表' });
        }

        const amount = body.credits;
        if (isNaN(amount) || amount <= 0) {
          return reply.status(400).send({ success: false, error: '无效的点数金额' });
        }

        const recharged: number[] = [];
        const failed: Array<{ userId: number; error: string }> = [];

        for (const userId of body.userIds) {
          try {
            if (isNaN(userId)) {
              failed.push({ userId, error: '无效的用户 ID' });
              continue;
            }

            const existingUser = await UserModel.findById(userId);
            if (!existingUser) {
              failed.push({ userId, error: '用户不存在' });
              continue;
            }

            const updatedUser = await UserModel.addCredits(userId, amount);
            if (!updatedUser) {
              failed.push({ userId, error: '充值失败' });
              continue;
            }

            recharged.push(userId);

            OperationLogModel.create({
              admin_id: adminId || 0,
              action: '批量充值',
              details: {
                amount,
                reason: body.reason || '管理员批量分配',
                username: existingUser.username,
              },
              target_user_id: userId,
            }).catch((logError) => {
              request.log.error({ err: logError }, '记录操作日志失败');
            });
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : '充值失败';
            failed.push({ userId, error: message });
          }
        }

        return reply.send({
          success: true,
          message: `成功为 ${recharged.length} 个用户充值${failed.length > 0 ? `，${failed.length} 个失败` : ''}`,
          data: { recharged, failed },
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '批量充值失败');
        const message = error instanceof Error ? error.message : '未知错误';
        return reply.status(500).send({ success: false, error: '批量充值失败: ' + message });
      }
    }
  );
}
