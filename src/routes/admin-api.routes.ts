import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
import { UserModel } from '../models/user.model.js';
import { OperationLogModel } from '../models/operation-log.model.js';
import { UserRole, UserStatus } from '@shared/types/index.js';
import { v4 as uuidv4 } from 'uuid';
import { hashPassword } from '../utils/auth.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';
import { join } from 'path';
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
} from '../schemas/index.js';
import {
  AddMachineBodyRoute,
  BatchRechargeBodyRoute,
  TestSessionBodyRoute,
  TestMachineBodyRoute,
  OperationLogQueryRoute,
  OperationLogStatsQueryRoute,
} from '@shared/types/routes.js';

export default async function adminApiRoutes(fastify: FastifyInstance): Promise<void> {
  // 使用全局验证中间件
  const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
    // 如果请求已经被处理，直接返回
    if (reply.sent) return;

    try {
      // 使用 fastify 的 JWT 验证中间件
      await fastify.verifyJWT(request, reply);

      // 如果返回已经发送，直接返回
      if (reply.sent) return;

      // 验证管理员权限
      if (!request.user) {
        return reply.status(401).send({ success: false, error: '未授权' });
      }

      if (request.user.role !== UserRole.ADMIN) {
        return reply.status(403).send({ success: false, error: '需要管理员权限' });
      }
    } catch (error) {
      // 如果返回已经发送，不再发送新的响应
      if (reply.sent) return;

      request.log.error({ err: error }, '认证失败');
      return reply.status(401).send({ success: false, error: '认证失败' });
    }
  };

  // 创建用户
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

        // 创建用户（使用 SHA256 哈希，与 UserModel 保持一致）
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

        // 记录操作日志 - 异步处理
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

  // 获取用户列表
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

        // 移除敏感信息
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

  // 获取单个用户
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

  // 更新用户
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

        // 检查用户是否存在
        const existingUser = await UserModel.findById(userId);
        if (!existingUser) {
          return reply.status(404).send({ success: false, error: '用户不存在' });
        }

        // 准备更新数据
        const updateData: Record<string, unknown> = {};

        if (body.email) updateData.email = body.email;
        if (body.role) updateData.role = body.role;
        if (body.status) updateData.status = body.status;
        if (body.webhook_url) updateData.webhook_url = body.webhook_url;
        // 更新密码时使用 SHA256 哈希（与 UserModel 保持一致）
        if (body.password) updateData.password = await hashPassword(body.password);

        // 更新用户
        const updatedUser = await UserModel.update(userId, updateData);
        if (!updatedUser) {
          return reply.status(500).send({ success: false, error: '更新用户失败' });
        }

        // 记录操作日志 - 异步处理
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

  // 删除用户
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

        // 检查用户是否存在
        const existingUser = await UserModel.findById(userId);
        if (!existingUser) {
          return reply.status(404).send({ success: false, error: '用户不存在' });
        }

        // 不允许删除管理员
        if (existingUser.role === UserRole.ADMIN) {
          return reply.status(403).send({ success: false, error: '不允许删除管理员账号' });
        }

        // 删除用户
        await UserModel.delete(userId);

        // 记录操作日志 - 异步处理
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

  // 添加点数
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

        // 检查用户是否存在
        const existingUser = await UserModel.findById(userId);
        if (!existingUser) {
          return reply.status(404).send({ success: false, error: '用户不存在' });
        }

        // 添加点数
        const updatedUser = await UserModel.addCredits(userId, amount);
        if (!updatedUser) {
          return reply.status(500).send({ success: false, error: '添加点数失败' });
        }

        // 记录操作日志 - 异步处理，不阻塞主流程
        // 使用 Promise.catch 捕获错误，避免影响主流程
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
          // 错误已捕获，不影响主流程
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

  // 重置用户 API Key
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
              data: z.object({
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

        // 检查用户是否存在
        const existingUser = await UserModel.findById(userId);
        if (!existingUser) {
          return reply.status(404).send({ success: false, error: '用户不存在' });
        }

        // 重置 API Key
        const apiKey = await UserModel.resetApiKey(userId);

        // 记录操作日志 - 异步处理
        OperationLogModel.create({
          admin_id: adminId || 0,
          action: '重置用户 API Key',
          target_user_id: userId,
        }).catch((logError) => {
          request.log.error({ err: logError }, '记录操作日志失败');
        });

        return reply.send({
          success: true,
          data: { api_key: apiKey },
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '重置 API Key 失败');
        const message = error instanceof Error ? error.message : '未知错误';
        return reply.status(500).send({ success: false, error: '重置 API Key 失败: ' + message });
      }
    }
  );

  // 导出用户列表为 CSV
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

        // 构建查询条件
        const filters: Record<string, unknown> = {};

        // 搜索条件（用户名或邮箱）
        if (query.search) {
          filters.search = query.search;
        }

        // 角色筛选
        if (query.role) {
          filters.role = query.role;
        }

        // 状态筛选
        if (query.status) {
          filters.status = query.status;
        }

        // 获取所有用户（不分页，用于导出）
        const result = await UserModel.findAll({ limit: '1000000', ...filters });
        const users = result.items;

        // 生成 CSV 内容
        const headers = ['ID', '用户名', '邮箱', '角色', '积分', '状态', '创建时间'];
        const csvRows = [];

        // 添加表头（添加 UTF-8 BOM 以支持 Excel 正确显示中文）
        csvRows.push('\uFEFF' + headers.map((h) => `"${h}"`).join(','));

        // 添加数据行
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
          // 转义 CSV 中的特殊字符
          csvRows.push(row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','));
        }

        const csvContent = csvRows.join('\n');

        // 生成文件名
        const date = new Date().toISOString().split('T')[0];
        const filename = `users_${date}.csv`;

        // 记录操作日志 - 异步处理
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

        // 返回 CSV 文件
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

  // 注意: 已删除用户路由兼容的添加点数接口，只保留管理员路由

  // 添加新机器（管理员）
  fastify.post(
    '/api/admin/machines',
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: 'object',
          properties: {
            hostname: { type: 'string' },
            ip: { type: 'string' },
            grpcPort: { type: 'number' },
            proxyPort: { type: 'number' },
            maxInstances: { type: 'number', default: 10 },
          },
          required: ['hostname', 'ip'],
        },
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
              data: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  hostname: { type: 'string' },
                  ip: { type: 'string' },
                  grpcPort: { type: 'number' },
                  proxyPort: { type: 'number' },
                  maxInstances: { type: 'number' },
                  status: { type: 'string' },
                },
              },
            },
          },
          400: zodToJsonSchema(errorResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['admin', 'machines'],
      },
    },
    async (request: FastifyRequest<AddMachineBodyRoute>, reply: FastifyReply) => {
      try {
        const adminId = request.user?.id;
        const body = request.body;
        if (!body.hostname || !body.ip) {
          return reply.status(400).send({ success: false, error: '主机名和IP地址不能为空' });
        }

        // 验证IP地址格式
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        if (!ipRegex.test(body.ip)) {
          return reply.status(400).send({ success: false, error: '无效的IP地址格式' });
        }

        // 验证端口范围
        if (body.grpcPort !== undefined && (body.grpcPort < 1 || body.grpcPort > 65535)) {
          return reply.status(400).send({ success: false, error: 'gRPC端口必须在1-65535之间' });
        }
        if (body.proxyPort !== undefined && (body.proxyPort < 1 || body.proxyPort > 65535)) {
          return reply.status(400).send({ success: false, error: '代理端口必须在1-65535之间' });
        }

        // 检查IP是否已存在
        const { MachineModel } = await import('../models/machine.model.js');
        const existingMachines = await MachineModel.getAll();
        const ipExists = existingMachines.some((m) => m.ip === body.ip);
        if (ipExists) {
          return reply.status(409).send({ success: false, error: '该IP地址的机器已存在' });
        }

        // 生成机器ID
        const machineId = uuidv4();

        // 创建机器
        const machineData = {
          id: machineId,
          hostname: body.hostname,
          ip: body.ip,
          grpcPort: body.grpcPort,
          proxyPort: body.proxyPort,
          maxInstances: body.maxInstances || 10,
          instanceCount: 0,
        };

        const machine = await MachineModel.register(machineData);
        if (!machine) {
          return reply.status(500).send({ success: false, error: '创建机器失败' });
        }

        // 记录操作日志 - 异步处理
        OperationLogModel.create({
          admin_id: adminId || 0,
          action: '添加机器',
          details: {
            hostname: machineData.hostname,
            ip: machineData.ip,
            maxInstances: machineData.maxInstances,
          },
        }).catch((logError) => {
          request.log.error({ err: logError }, '记录操作日志失败');
        });

        return reply.status(201).send({
          success: true,
          message: '机器添加成功',
          data: {
            id: machine.id,
            hostname: machine.hostname,
            ip: machine.ip,
            grpcPort: machine.grpcPort,
            proxyPort: machine.proxyPort,
            maxInstances: machine.maxInstances,
            status: machine.status,
          },
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '添加机器失败');
        const message = error instanceof Error ? error.message : '未知错误';
        return reply.status(500).send({ success: false, error: '添加机器失败: ' + message });
      }
    }
  );

  // 获取用户的会话消耗统计
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

        // 检查用户是否存在
        const existingUser = await UserModel.findById(userId);
        if (!existingUser) {
          return reply.status(404).send({ success: false, error: '用户不存在' });
        }

        // 获取用户的会话消耗统计
        const { SessionModel } = await import('../models/session.model.js');
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

  // 批量删除用户
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

            // 检查用户是否存在
            const existingUser = await UserModel.findById(userId);
            if (!existingUser) {
              failed.push({ userId, error: '用户不存在' });
              continue;
            }

            // 不允许删除管理员
            if (existingUser.role === UserRole.ADMIN) {
              failed.push({ userId, error: '不允许删除管理员账号' });
              continue;
            }

            // 删除用户
            await UserModel.delete(userId);
            deleted.push(userId);

            // 记录操作日志 - 异步处理
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

  // 批量充值
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

            // 检查用户是否存在
            const existingUser = await UserModel.findById(userId);
            if (!existingUser) {
              failed.push({ userId, error: '用户不存在' });
              continue;
            }

            // 添加点数
            const updatedUser = await UserModel.addCredits(userId, amount);
            if (!updatedUser) {
              failed.push({ userId, error: '充值失败' });
              continue;
            }

            recharged.push(userId);

            // 记录操作日志 - 异步处理
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

  // 批量结束会话
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

        const { SessionModel } = await import('../models/session.model.js');
        const { MachineModel } = await import('../models/machine.model.js');
        const { connectionManager } = await import('../services/machine-grpc.service.js');
        const { createWebhookEvent } = await import('../utils/webhook.js');
        const { SessionStatus, WebhookEventType } = await import('@shared/types/index.js');

        const released: string[] = [];
        const failed: Array<{ sessionId: string; error: string }> = [];

        for (const sessionId of body.sessionIds) {
          try {
            // 查找会话
            const session = await SessionModel.findById(sessionId);
            if (!session) {
              failed.push({ sessionId, error: '会话不存在' });
              continue;
            }

            // 检查会话状态
            if (session.status === SessionStatus.DISCONNECTED || session.status === SessionStatus.ERROR) {
              released.push(sessionId);
              continue;
            }

            // 检查会话是否有关联的机器
            if (!session.machine_id) {
              // 计算会话持续时间
              const now = new Date();
              const startTime = session.start_time ? new Date(session.start_time) : new Date(session.created_at);
              const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);

              // 使用 markDisconnected 方法更新会话状态并计算点数
              // 注意：markDisconnected 已经自动扣除了用户积分
              await SessionModel.markDisconnected(sessionId, duration);

              released.push(sessionId);
              continue;
            }

            try {
              // 向机器发送关闭浏览器实例的请求
              await connectionManager.closeBrowser(session.machine_id, sessionId);

              // 计算会话持续时间
              const now = new Date();
              const startTime = session.start_time ? new Date(session.start_time) : new Date(session.created_at);
              const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);

              // 使用 markDisconnected 方法更新会话状态
              await SessionModel.markDisconnected(sessionId, duration);

              // 如果会话已分配机器，减少机器的实例计数
              await MachineModel.decrementInstanceCount(session.machine_id);

              // 触发 Webhook 事件
              await createWebhookEvent(session.user_id, WebhookEventType.SESSION_DISCONNECTED, {
                session_id: sessionId,
                disconnected_at: new Date(),
              });

              // 注意：markDisconnected 已经自动扣除了用户积分，这里不需要重复扣费

              released.push(sessionId);
            } catch (_machineError) {
              // 即使关闭失败，也将会话标记为结束
              const now = new Date();
              const startTime = session.start_time ? new Date(session.start_time) : new Date(session.created_at);
              const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);
              await SessionModel.markDisconnected(sessionId, duration);

              // 注意：markDisconnected 已经自动扣除了用户积分，这里不需要重复扣费

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

  // 获取用户操作日志
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

        // 检查用户是否存在
        const existingUser = await UserModel.findById(userId);
        if (!existingUser) {
          return reply.status(404).send({ success: false, error: '用户不存在' });
        }

        const page = query.page || '1';
        const limit = query.limit || '10';

        // 获取用户操作日志
        const logs = await OperationLogModel.findByTargetUserId(userId, { page, limit });

        return reply.send({
          success: true,
          data: logs,
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '获取用户操作日志失败');
        const message = error instanceof Error ? error.message : '未知错误';
        return reply.status(500).send({ success: false, error: '获取用户操作日志失败: ' + message });
      }
    }
  );

  // 获取用户会话历史
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

        // 检查用户是否存在
        const existingUser = await UserModel.findById(userId);
        if (!existingUser) {
          return reply.status(404).send({ success: false, error: '用户不存在' });
        }

        const page = query.page || '1';
        const limit = query.limit || '10';

        // 获取用户会话历史
        const { SessionModel } = await import('../models/session.model.js');
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

  // 批量重启机器
  fastify.post(
    '/api/admin/machines/batch-restart',
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: 'object',
          properties: {
            machineIds: { type: 'array', items: { type: 'string' } },
          },
          required: ['machineIds'],
        },
        response: {
          200: zodToJsonSchema(
            z.object({
              success: z.boolean(),
              message: z.string(),
              data: z.object({
                restarted: z.array(z.string()),
                failed: z.array(
                  z.object({
                    machineId: z.string(),
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
        const body = request.body as { machineIds: string[] };

        if (!body.machineIds || !Array.isArray(body.machineIds) || body.machineIds.length === 0) {
          return reply.status(400).send({ success: false, error: '请提供要重启的机器 ID 列表' });
        }

        const { MachineModel } = await import('../models/machine.model.js');
        const { connectionManager } = await import('../services/machine-grpc.service.js');

        const restarted: string[] = [];
        const failed: Array<{ machineId: string; error: string }> = [];

        for (const machineId of body.machineIds) {
          try {
            // 检查机器是否存在
            const machine = await MachineModel.findById(machineId);
            if (!machine) {
              failed.push({ machineId, error: '机器不存在' });
              continue;
            }

            // 检查机器是否连接
            if (!connectionManager.isConnected(machineId)) {
              failed.push({ machineId, error: '机器未连接，无法发送重启命令' });
              continue;
            }

            // 发送重启命令
            connectionManager.sendRestartCommand(machineId);

            // 更新数据库中的机器状态
            await MachineModel.update(machineId, { status: 'offline' });

            restarted.push(machineId);

            // 记录操作日志 - 异步处理
            OperationLogModel.create({
              admin_id: adminId || 0,
              action: '批量重启机器',
              details: { hostname: machine.hostname },
            }).catch((logError) => {
              request.log.error({ err: logError }, '记录操作日志失败');
            });
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : '重启失败';
            failed.push({ machineId, error: message });
          }
        }

        return reply.send({
          success: true,
          message: `成功重启 ${restarted.length} 台机器${failed.length > 0 ? `，${failed.length} 台失败` : ''}`,
          data: { restarted, failed },
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '批量重启机器失败');
        const message = error instanceof Error ? error.message : '未知错误';
        return reply.status(500).send({ success: false, error: '批量重启机器失败: ' + message });
      }
    }
  );

  // 获取操作日志列表
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

        // 构建筛选条件
        const filters: Record<string, unknown> = {};

        if (query.action) {
          filters.action = query.action;
        }

        // 处理时间范围
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

        // 手动指定日期范围
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

  // 获取操作统计
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

  // 获取会话列表(JSON API) - 支持排序和筛选
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
            sort: { type: 'string' }, // 移除 enum 限制，允许任意值
            order: { type: 'string' }, // 移除 enum 限制，允许任意值
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

        // 构建筛选选项
        const { SessionModel } = await import('../models/session.model.js');
        const filters: { status?: string; userId?: number; startDate?: Date; endDate?: Date } = {};

        // 状态筛选
        if (query.status) {
          filters.status = query.status;
        }

        // 用户筛选
        if (query.userId) {
          filters.userId = parseInt(query.userId);
        }

        // 时间范围筛选
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

        // 手动指定日期范围
        if (query.startDate) {
          filters.startDate = new Date(query.startDate);
        }
        if (query.endDate) {
          filters.endDate = new Date(query.endDate);
        }

        // 使用 paginateSorted 方法获取排序后的会话列表
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

  // 获取会话统计
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

        // 时间范围筛选
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

        // 手动指定日期范围
        if (query.startDate) {
          filters.startDate = new Date(query.startDate);
        }
        if (query.endDate) {
          filters.endDate = new Date(query.endDate);
        }

        const { SessionModel } = await import('../models/session.model.js');
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

  // 获取会话详情
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

        const { SessionModel } = await import('../models/session.model.js');
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

  // 刷新会话状态
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

        const { SessionModel } = await import('../models/session.model.js');
        let sessions: Array<{ id: string; status: string }> = [];

        if (body.sessionIds && body.sessionIds.length > 0) {
          // 获取指定会话的状态
          for (const sessionId of body.sessionIds) {
            const session = await SessionModel.findById(sessionId);
            if (session) {
              sessions.push({ id: session.id, status: session.status });
            }
          }
        } else {
          // 获取所有活跃会话的状态
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

  // ========== 测试数据 API（仅用于测试环境）==========

  // 创建测试会话数据
  fastify.post(
    '/api/admin/test/sessions',
    {
      preHandler: [authenticate],
    },
    async (request: FastifyRequest<TestSessionBodyRoute>, reply: FastifyReply) => {
      try {
        const { SessionModel } = await import('../models/session.model.js');
        const { v4: uuidv4 } = await import('uuid');

        const body = request.body;
        const count = body.count || 1;
        const userId = body.user_id || 1;

        const sessions = [];
        const now = new Date();

        for (let i = 0; i < count; i++) {
          const _sessionId = uuidv4();

          const session = await SessionModel.create({
            user_id: userId,
            machine_id: null,
          });

          if (session) {
            sessions.push(session);
          }
        }

        return reply.send({
          success: true,
          message: `成功创建 ${sessions.length} 个测试会话`,
          data: { sessions },
        });
      } catch (error: unknown) {
        return reply.status(500).send({
          success: false,
          error: '创建测试会话失败: ' + getErrorMessage(error),
        });
      }
    }
  );

  // 创建测试机器数据
  fastify.post(
    '/api/admin/test/machines',
    {
      preHandler: [authenticate],
    },
    async (request: FastifyRequest<TestMachineBodyRoute>, reply: FastifyReply) => {
      try {
        const { MachineModel } = await import('../models/machine.model.js');
        const { v4: uuidv4 } = await import('uuid');

        const body = request.body;
        const count = body.count || 1;

        const machines = [];
        for (let i = 0; i < count; i++) {
          const machineId = uuidv4();
          const machine = await MachineModel.register({
            id: machineId,
            hostname: `test-machine-${Date.now()}-${i}`,
            ip: `192.168.1.${100 + i}`,
            grpcPort: 50051 + i,
            proxyPort: 8080 + i,
            maxInstances: 10,
            instanceCount: 0,
          });

          if (machine) {
            machines.push(machine);
          }
        }

        return reply.send({
          success: true,
          message: `成功创建 ${machines.length} 个测试机器`,
          data: { machines },
        });
      } catch (error: unknown) {
        return reply.status(500).send({
          success: false,
          error: '创建测试机器失败: ' + getErrorMessage(error),
        });
      }
    }
  );

  // ========== 存储管理 API ==========

  // 获取用户存储统计
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

        const { StorageService } = await import('../services/storage.service.js');

        // If userId is specified, get single user stats
        if (query.userId) {
          const { UserModel } = await import('../models/user.model.js');
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
                  isOverLimit: stats.totalSize > 5 * 1024 * 1024 * 1024, // 5GB
                },
              ],
              total: 1,
              page: 1,
              limit: 1,
            },
          });
        }

        // Get all users storage stats
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

  // 清理用户数据
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

        const { StorageService } = await import('../services/storage.service.js');
        const result = await StorageService.adminCleanupUserData(body.userIds, body.type);

        // Record operation log
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

  // 清理所有旧数据
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

        const { StorageService } = await import('../services/storage.service.js');
        const result = await StorageService.adminCleanupAllOldData(body.days);

        // Record operation log
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

  // 获取系统存储统计
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
        const { StorageService } = await import('../services/storage.service.js');
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
