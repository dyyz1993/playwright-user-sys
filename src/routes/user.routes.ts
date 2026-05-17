import { FastifyInstance, RouteHandlerMethod } from 'fastify';
import userController from '../controllers/user.controller.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { userDetailSchema } from '../schemas/index.js';
import {
  createUserRequestSchema,
  createUserResponseSchema,
  paginationQuerySchema,
  paginatedResponseSchema,
  userListItemSchema,
  idParamSchema,
  updateUserRequestSchema,
  updateUserResponseSchema,
  resetApiKeyResponseSchema,
  errorResponseSchema,
  nullSchema,
  successResponseSchema,
} from '../schemas/index.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import * as UserService from '../services/user.service.js';
import { verifyPasswordWithMigration, hashPassword } from '../utils/auth.js';

function toISO(v: Date | string | null | undefined): string | null {
  if (v === undefined) return null;
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

export default async function userRoutes(fastify: FastifyInstance) {
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

        const user = await UserService.getUserById(userId);
        if (!user) {
          return sendError(reply, '用户不存在', 404);
        }

        return sendSuccess(reply, {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          credits: user.credits,
          webhook_url: user.webhook_url,
          api_key: user.api_key,
          created_at: toISO(user.created_at),
        });
      } catch (error: unknown) {
        request.log.error(error);
        return sendError(reply, '获取用户信息失败', 500);
      }
    }
  );

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

        const user = await UserService.getUserById(userId);
        if (!user) {
          return sendError(reply, '用户不存在', 404);
        }

        const apiKey = await UserService.resetApiKey(userId);

        return sendSuccess(reply, { api_key: apiKey });
      } catch (error: unknown) {
        request.log.error(error);
        return sendError(reply, '重新生成 API Key 失败', 500);
      }
    }
  );

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

        const updateData: Record<string, unknown> = {};
        if (body.email !== undefined) updateData.email = body.email;
        if (body.webhook_url !== undefined) updateData.webhook_url = body.webhook_url;

        const updatedUser = await UserService.updateUser(userId, updateData);
        if (!updatedUser) {
          return sendError(reply, '更新用户信息失败', 500);
        }

        return sendSuccess(reply, {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email,
          role: updatedUser.role,
          credits: updatedUser.credits,
          webhook_url: updatedUser.webhook_url,
          api_key: updatedUser.api_key,
          created_at: toISO(updatedUser.created_at),
        });
      } catch (error: unknown) {
        request.log.error(error);
        return sendError(reply, '更新用户信息失败', 500);
      }
    }
  );

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

        const user = await UserService.getUserById(userId);
        if (!user) {
          return sendError(reply, '用户不存在', 404);
        }

        const { valid: isPasswordValid, needsMigration } = await verifyPasswordWithMigration(
          body.current_password,
          user.password
        );

        if (!isPasswordValid) {
          return sendError(reply, '当前密码错误', 401);
        }

        if (needsMigration) {
          request.log.info({ userId: user.id }, 'Password migrated from SHA-256 to bcrypt during password change');
        }

        const hashedPassword = await hashPassword(body.new_password);

        await UserService.updateUser(userId, { password: hashedPassword });

        return sendSuccess(reply, { message: '密码修改成功' });
      } catch (error: unknown) {
        request.log.error(error);
        return sendError(reply, '修改密码失败', 500);
      }
    }
  );

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
    userController.createUser as RouteHandlerMethod
  );

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
    userController.getAllUsers as RouteHandlerMethod
  );

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
    userController.getUserById as RouteHandlerMethod
  );

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
    userController.updateUser as RouteHandlerMethod
  );

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
    userController.resetApiKey as RouteHandlerMethod
  );

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
    userController.deleteUser as RouteHandlerMethod
  );
}
