import { FastifyInstance } from 'fastify';
import { FastifyReply, FastifyRequest } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import authController from '../controllers/auth.controller.js';
import {
  loginRequestSchema,
  loginResponseSchema,
  currentUserResponseSchema,
  errorResponseSchema
} from '../schemas/index.js';

export default async function authRoutes(fastify: FastifyInstance) {
  // 登录
  fastify.post('/login', {
    schema: {
      body: zodToJsonSchema(loginRequestSchema),
      response: {
        200: zodToJsonSchema(loginResponseSchema),
        400: zodToJsonSchema(errorResponseSchema),
        401: zodToJsonSchema(errorResponseSchema),
      },
      tags: ['auth'],
    },
  }, authController.login);

  // 获取当前用户信息
  fastify.get('/me', {
    onRequest: [fastify.verifyJWT],
    schema: {
      response: {
        200: zodToJsonSchema(currentUserResponseSchema),
        401: zodToJsonSchema(errorResponseSchema),
      },
      tags: ['auth'],
      security: [{ bearerAuth: [] }],
    },
  }, authController.getCurrentUser);
}
