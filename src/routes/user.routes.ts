import { FastifyInstance } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import userController from '../controllers/user.controller.js';
import { UserModel } from '../models/user.model.js';
import { sendSuccess, sendError } from '../utils/response.js';
import {
  createUserRequestSchema,
  createUserResponseSchema,
  paginationQuerySchema,
  paginatedResponseSchema,
  userListItemSchema,
  idParamSchema,
  userDetailSchema,
  updateUserRequestSchema,
  updateUserResponseSchema,
  resetApiKeyResponseSchema,
  errorResponseSchema,
  nullSchema,
  successResponseSchema,
} from '../schemas/index.js';

export default async function userRoutes(fastify: FastifyInstance) {
  // 获取当前用户信息（通过 API Key）
  fastify.get(
    '/me',
    {
      onRequest: [fastify.verifyApiKey],
      schema: {
        response: {
          200: zodToJsonSchema(successResponseSchema(userDetailSchema.omit({ status: true }))),
          401: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['users'],
      },
    },
    async (request, reply) => {
      try {
        const userId = request.user?.id;
        if (!userId) {
          return sendError(reply, '用户未认证', 401);
        }

        // 查找用户
        const user = await UserModel.findById(userId);
        if (!user) {
          return sendError(reply, '用户不存在', 404);
        }

        // 返回用户信息
        return sendSuccess(reply, {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          credits: user.credits,
          webhook_url: user.webhook_url,
          api_key: user.api_key,
          created_at: user.created_at,
        });
      } catch (error) {
        request.log.error(error);
        return sendError(reply, '获取用户信息失败', 500);
      }
    }
  );

  // 重新生成当前用户的 API Key
  fastify.post(
    '/me/apikey/regenerate',
    {
      onRequest: [fastify.verifyJWT],
      schema: {
        response: {
          200: zodToJsonSchema(resetApiKeyResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          404: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['users'],
      },
    },
    async (request, reply) => {
      try {
        const userId = request.user?.id;
        if (!userId) {
          return sendError(reply, '用户未认证', 401);
        }

        // 查找用户
        const user = await UserModel.findById(userId);
        if (!user) {
          return sendError(reply, '用户不存在', 404);
        }

        // 重置 API Key
        const apiKey = await UserModel.resetApiKey(userId);

        // 返回新的 API Key
        return sendSuccess(reply, { api_key: apiKey });
      } catch (error) {
        request.log.error(error);
        return sendError(reply, '重新生成 API Key 失败', 500);
      }
    }
  );

  // 更新当前用户信息
  fastify.put(
    '/me',
    {
      onRequest: [fastify.verifyJWT],
      schema: {
        body: {
          type: 'object',
          properties: {
            email: { type: 'string' },
            webhook_url: { type: 'string' },
          },
        },
        response: {
          200: zodToJsonSchema(successResponseSchema(userDetailSchema.omit({ status: true }))),
          401: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['users'],
      },
    },
    async (request, reply) => {
      try {
        const userId = request.user?.id;
        if (!userId) {
          return sendError(reply, '用户未认证', 401);
        }

        const body = request.body as { email?: string; webhook_url?: string };

        // 准备更新数据
        const updateData: any = {};
        if (body.email !== undefined) updateData.email = body.email;
        if (body.webhook_url !== undefined) updateData.webhook_url = body.webhook_url;

        // 更新用户
        const updatedUser = await UserModel.update(userId, updateData);
        if (!updatedUser) {
          return sendError(reply, '更新用户信息失败', 500);
        }

        // 返回更新后的用户信息
        return sendSuccess(reply, {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email,
          role: updatedUser.role,
          credits: updatedUser.credits,
          webhook_url: updatedUser.webhook_url,
          api_key: updatedUser.api_key,
          created_at: updatedUser.created_at,
        });
      } catch (error) {
        request.log.error(error);
        return sendError(reply, '更新用户信息失败', 500);
      }
    }
  );

  // 修改当前用户密码
  fastify.put(
    '/me/password',
    {
      onRequest: [fastify.verifyJWT],
      schema: {
        body: {
          type: 'object',
          properties: {
            current_password: { type: 'string' },
            new_password: { type: 'string' },
          },
          required: ['current_password', 'new_password'],
        },
        response: {
          200: zodToJsonSchema(successResponseSchema(nullSchema)),
          401: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['users'],
      },
    },
    async (request, reply) => {
      try {
        const userId = request.user?.id;
        if (!userId) {
          return sendError(reply, '用户未认证', 401);
        }

        const body = request.body as { current_password: string; new_password: string };

        // 查找用户
        const user = await UserModel.findById(userId);
        if (!user) {
          return sendError(reply, '用户不存在', 404);
        }

        // 验证当前密码
        const { comparePassword } = await import('../utils/auth.js');
        const isPasswordValid = await comparePassword(body.current_password, user.password);

        if (!isPasswordValid) {
          return sendError(reply, '当前密码错误', 401);
        }

        // 哈希新密码
        const { hashPassword } = await import('../utils/auth.js');
        const hashedPassword = await hashPassword(body.new_password);

        // 更新密码
        await UserModel.update(userId, { password: hashedPassword });

        return sendSuccess(reply, { message: '密码修改成功' });
      } catch (error) {
        request.log.error(error);
        return sendError(reply, '修改密码失败', 500);
      }
    }
  );

  // 创建用户（仅管理员）
  fastify.post(
    '/',
    {
      onRequest: [fastify.verifyJWT, fastify.verifyAdmin],
      schema: {
        body: zodToJsonSchema(createUserRequestSchema),
        response: {
          201: zodToJsonSchema(createUserResponseSchema),
          400: zodToJsonSchema(errorResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
          409: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['users'],

        security: [{ bearerAuth: [] }],
      },
    },
    userController.createUser
  );

  // 获取所有用户（仅管理员）
  fastify.get(
    '/',
    {
      onRequest: [fastify.verifyJWT, fastify.verifyAdmin],
      schema: {
        querystring: zodToJsonSchema(paginationQuerySchema),
        response: {
          200: zodToJsonSchema(paginatedResponseSchema(userListItemSchema)),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['users'],
        security: [{ bearerAuth: [] }],
      },
    },
    userController.getAllUsers
  );

  // 获取单个用户（仅管理员）
  fastify.get(
    '/:id',
    {
      onRequest: [fastify.verifyJWT, fastify.verifyAdmin],
      schema: {
        params: zodToJsonSchema(idParamSchema),
        response: {
          200: zodToJsonSchema(successResponseSchema(userDetailSchema)),
          400: zodToJsonSchema(errorResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
          404: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['users'],
        security: [{ bearerAuth: [] }],
      },
    },
    userController.getUserById
  );

  // 更新用户（仅管理员）
  fastify.put(
    '/:id',
    {
      onRequest: [fastify.verifyJWT, fastify.verifyAdmin],
      schema: {
        params: zodToJsonSchema(idParamSchema),
        body: zodToJsonSchema(updateUserRequestSchema),
        response: {
          200: zodToJsonSchema(updateUserResponseSchema),
          400: zodToJsonSchema(errorResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
          404: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['users'],
        security: [{ bearerAuth: [] }],
      },
    },
    userController.updateUser
  );

  // 重置用户 API Key（仅管理员）
  fastify.post(
    '/:id/reset-api-key',
    {
      onRequest: [fastify.verifyJWT, fastify.verifyAdmin],
      schema: {
        params: zodToJsonSchema(idParamSchema),
        response: {
          200: zodToJsonSchema(resetApiKeyResponseSchema),
          400: zodToJsonSchema(errorResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
          404: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['users'],
        security: [{ bearerAuth: [] }],
      },
    },
    userController.resetApiKey
  );

  // 注意：添加点数功能已移至管理员API路由

  // 删除用户（仅管理员）
  fastify.delete(
    '/:id',
    {
      onRequest: [fastify.verifyJWT, fastify.verifyAdmin],
      schema: {
        params: zodToJsonSchema(idParamSchema),
        response: {
          204: zodToJsonSchema(nullSchema),
          400: zodToJsonSchema(errorResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
          404: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['users'],
        security: [{ bearerAuth: [] }],
      },
    },
    userController.deleteUser
  );
}
