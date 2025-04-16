import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { UserModel } from '../models/user.model.js';
import { OperationLogModel } from '../models/operation-log.model.js';
import { UserRole, UserStatus } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';
import { hash } from 'bcryptjs';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  adminCreateUserRequestSchema,
  adminCreateUserResponseSchema,
  adminGetUserResponseSchema,
  adminUpdateUserRequestSchema,
  adminUpdateUserResponseSchema,
  adminDeleteUserResponseSchema,
  adminAddCreditsRequestSchema,
  adminAddCreditsResponseSchema,
  errorResponseSchema,
  idParamSchema
} from '../schemas/index.js';


export default async function adminApiRoutes(fastify: FastifyInstance): Promise<void> {
  // 验证管理员中间件
  const verifyAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({ success: false, message: '未授权' });
    }

    if (request.user.role !== UserRole.ADMIN) {
      return reply.status(403).send({ success: false, message: '需要管理员权限' });
    }
  };

  // 创建用户
  fastify.post('/api/admin/users', {
    preHandler: [verifyAdmin],
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
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const adminId = request.user?.id;
      const body = request.body as any;

      // 验证输入
      if (!body.username || !body.password) {
        return reply.status(400).send({ success: false, message: '用户名和密码不能为空' });
      }

      // 检查用户名是否已存在
      const existingUser = await UserModel.findByUsername(body.username);
      if (existingUser) {
        return reply.status(409).send({ success: false, message: '用户名已存在' });
      }

      // 创建用户
      const userData = {
        username: body.username,
        email: body.email || '',
        password: await hash(body.password, 10),
        role: body.role || UserRole.USER,
        status: UserStatus.ACTIVE,
        credits: parseInt(body.credits) || 0,
        api_key: uuidv4(),
      };

      const user = await UserModel.create(userData);
      if (!user) {
        return reply.status(500).send({ success: false, message: '创建用户失败' });
      }

      // 记录操作日志
      await OperationLogModel.create({
        admin_id: adminId || 0,
        action: '创建用户',
        details: {
          username: userData.username,
          role: userData.role,
          credits: userData.credits,
        },
        target_user_id: user.id,
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
    } catch (error: any) {
      request.log.error('创建用户失败:', error);
      return reply.status(500).send({ success: false, message: '创建用户失败: ' + error.message });
    }
  });

  // 获取单个用户
  fastify.get('/api/admin/users/:id', {
    preHandler: [verifyAdmin],
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
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { id: string };
      const userId = parseInt(params.id, 10);

      if (isNaN(userId)) {
        return reply.status(400).send({ success: false, message: '无效的用户 ID' });
      }

      const user = await UserModel.findById(userId);
      if (!user) {
        return reply.status(404).send({ success: false, message: '用户不存在' });
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
          created_at: user.created_at,
        },
      });
    } catch (error: any) {
      request.log.error('获取用户信息失败:', error);
      return reply.status(500).send({ success: false, message: '获取用户信息失败: ' + error.message });
    }
  });

  // 更新用户
  fastify.put('/api/admin/users/:id', {
    preHandler: [verifyAdmin],
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
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const adminId = request.user?.id;
      const params = request.params as { id: string };
      const userId = parseInt(params.id, 10);
      const body = request.body as any;

      if (isNaN(userId)) {
        return reply.status(400).send({ success: false, message: '无效的用户 ID' });
      }

      // 检查用户是否存在
      const existingUser = await UserModel.findById(userId);
      if (!existingUser) {
        return reply.status(404).send({ success: false, message: '用户不存在' });
      }

      // 准备更新数据
      const updateData: any = {};

      if (body.email) updateData.email = body.email;
      if (body.role) updateData.role = body.role;
      if (body.status) updateData.status = body.status;
      if (body.webhook_url) updateData.webhook_url = body.webhook_url;
      if (body.password) updateData.password = await hash(body.password, 10);

      // 更新用户
      const updatedUser = await UserModel.update(userId, updateData);
      if (!updatedUser) {
        return reply.status(500).send({ success: false, message: '更新用户失败' });
      }

      // 记录操作日志
      await OperationLogModel.create({
        admin_id: adminId || 0,
        action: '更新用户',
        details: {
          ...updateData,
          password: body.password ? '已更新' : undefined,
        },
        target_user_id: userId,
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
    } catch (error: any) {
      request.log.error('更新用户失败:', error);
      return reply.status(500).send({ success: false, message: '更新用户失败: ' + error.message });
    }
  });

  // 删除用户
  fastify.delete('/api/admin/users/:id', {
    preHandler: [verifyAdmin],
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
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const adminId = request.user?.id;
      const params = request.params as { id: string };
      const userId = parseInt(params.id, 10);

      if (isNaN(userId)) {
        return reply.status(400).send({ success: false, message: '无效的用户 ID' });
      }

      // 检查用户是否存在
      const existingUser = await UserModel.findById(userId);
      if (!existingUser) {
        return reply.status(404).send({ success: false, message: '用户不存在' });
      }

      // 不允许删除管理员
      if (existingUser.role === UserRole.ADMIN) {
        return reply.status(403).send({ success: false, message: '不允许删除管理员账号' });
      }

      // 删除用户
      await UserModel.delete(userId);

      // 记录操作日志
      await OperationLogModel.create({
        admin_id: adminId || 0,
        action: '删除用户',
        details: { username: existingUser.username },
        target_user_id: userId,
      });

      return reply.send({
        success: true,
        message: '用户删除成功',
      });
    } catch (error: any) {
      request.log.error('删除用户失败:', error);
      return reply.status(500).send({ success: false, message: '删除用户失败: ' + error.message });
    }
  });

  // 添加点数
  fastify.post('/api/admin/users/:id/credits', {
    preHandler: [verifyAdmin],
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
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const adminId = request.user?.id;
      const params = request.params as { id: string };
      const userId = parseInt(params.id, 10);
      const body = request.body as any;

      if (isNaN(userId)) {
        return reply.status(400).send({ success: false, message: '无效的用户 ID' });
      }

      const amount = parseInt(body.amount);
      if (isNaN(amount) || amount <= 0) {
        return reply.status(400).send({ success: false, message: '无效的点数金额' });
      }

      // 检查用户是否存在
      const existingUser = await UserModel.findById(userId);
      if (!existingUser) {
        return reply.status(404).send({ success: false, message: '用户不存在' });
      }

      // 添加点数
      const updatedUser = await UserModel.addCredits(userId, amount);
      if (!updatedUser) {
        return reply.status(500).send({ success: false, message: '添加点数失败' });
      }

      // 记录操作日志
      await OperationLogModel.create({
        admin_id: adminId || 0,
        action: '添加点数',
        details: {
          amount,
          reason: body.reason || '管理员分配',
          username: existingUser.username
        },
        target_user_id: userId,
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
    } catch (error: any) {
      request.log.error('添加点数失败:', error);
      return reply.status(500).send({ success: false, message: '添加点数失败: ' + error.message });
    }
  });

  // 注意: 已删除用户路由兼容的添加点数接口，只保留管理员路由
}
