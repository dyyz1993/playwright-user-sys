import { FastifyInstance } from 'fastify';
import machineController from '../controllers/machine.controller.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  registerMachineRequestSchema,
  registerMachineResponseSchema,
  updateMachineStatusRequestSchema,
  updateMachineStatusResponseSchema,
  getAllMachinesResponseSchema,
  getMachineByIdResponseSchema,
  getMachineSessionsResponseSchema,
  markMachineOfflineResponseSchema,
  errorResponseSchema,
  idParamSchema,
} from '../schemas/index.js';

export default async function machineRoutes(fastify: FastifyInstance): Promise<void> {
  // 注册机器
  fastify.post(
    '/register',
    {
      schema: {
        body: zodToJsonSchema(registerMachineRequestSchema),
        response: {
          201: zodToJsonSchema(registerMachineResponseSchema),
          400: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['machines'],
      },
    },
    machineController.registerMachine
  );

  // 更新机器状态
  fastify.put(
    '/:id/status',
    {
      schema: {
        params: zodToJsonSchema(idParamSchema),
        body: zodToJsonSchema(updateMachineStatusRequestSchema),
        response: {
          200: zodToJsonSchema(updateMachineStatusResponseSchema),
          400: zodToJsonSchema(errorResponseSchema),
          404: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['machines'],
      },
    },
    machineController.updateMachineStatus
  );

  // 获取所有机器（管理员）
  fastify.get(
    '/',
    {
      onRequest: [fastify.verifyJWT, fastify.verifyAdmin],
      schema: {
        response: {
          200: zodToJsonSchema(getAllMachinesResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['machines', 'admin'],
      },
    },
    machineController.getAllMachines
  );

  // 获取单个机器（管理员）
  fastify.get(
    '/:id',
    {
      onRequest: [fastify.verifyJWT, fastify.verifyAdmin],
      schema: {
        params: zodToJsonSchema(idParamSchema),
        response: {
          200: zodToJsonSchema(getMachineByIdResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
          404: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['machines', 'admin'],
      },
    },
    machineController.getMachineById
  );

  // 获取机器上的所有会话（管理员）
  fastify.get(
    '/:id/sessions',
    {
      onRequest: [fastify.verifyJWT, fastify.verifyAdmin],
      schema: {
        params: zodToJsonSchema(idParamSchema),
        response: {
          200: zodToJsonSchema(getMachineSessionsResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
          404: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['machines', 'admin', 'sessions'],
      },
    },
    machineController.getMachineSessions
  );

  // 标记机器离线（管理员）
  fastify.post(
    '/:id/offline',
    {
      onRequest: [fastify.verifyJWT, fastify.verifyAdmin],
      schema: {
        params: zodToJsonSchema(idParamSchema),
        response: {
          200: zodToJsonSchema(markMachineOfflineResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
          404: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['machines', 'admin'],
      },
    },
    machineController.markMachineOffline
  );

  // 强制刷新所有机器状态（管理员）
  fastify.post(
    '/refresh',
    {
      onRequest: [fastify.verifyJWT, fastify.verifyAdmin],
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
              updated: { type: 'number' },
            },
          },
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['machines', 'admin'],
      },
    },
    machineController.refreshMachineStatus
  );

  // 重启机器（管理员）
  fastify.post(
    '/:id/restart',
    {
      onRequest: [fastify.verifyJWT, fastify.verifyAdmin],
      schema: {
        params: zodToJsonSchema(idParamSchema),
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
              id: { type: 'string' },
            },
          },
          400: zodToJsonSchema(errorResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
          404: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['machines', 'admin'],
      },
    },
    machineController.restartMachine
  );

  // 清理长时间未活动的机器（管理员）
  fastify.post(
    '/cleanup',
    {
      onRequest: [fastify.verifyJWT, fastify.verifyAdmin],
      schema: {
        body: {
          type: 'object',
          properties: {
            daysThreshold: { type: 'number', default: 30 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
              deleted: { type: 'number' },
            },
          },
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['machines', 'admin'],
      },
    },
    machineController.cleanupOldMachines
  );

  // 删除机器（管理员）
  fastify.delete(
    '/:id',
    {
      onRequest: [fastify.verifyJWT, fastify.verifyAdmin],
      schema: {
        params: zodToJsonSchema(idParamSchema),
        body: {
          type: 'object',
          properties: {},
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
              id: { type: 'string' },
            },
            required: ['success'],
          },
          400: zodToJsonSchema(errorResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
          404: zodToJsonSchema(errorResponseSchema),
          500: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['machines', 'admin'],
      },
    },
    machineController.deleteMachine
  );
}
