import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';
import { errorResponseSchema, idParamSchema } from '../schemas/index.js';
import { UpdateMachineBodyRoute } from '@shared/types/routes.js';
import { createAuthenticate } from './admin-api/authenticate.js';
import * as AdminMachineService from '../services/admin-machine.service.js';
import { tryCatchWrapper } from '../utils/try-catch-wrapper.js';

export default async function adminMachineApiRoutes(fastify: FastifyInstance): Promise<void> {
  const authenticate = createAuthenticate(fastify);

  fastify.get(
    '/api/admin/machines/:id',
    {
      onRequest: [authenticate],
      schema: {
        params: zodToJsonSchema(idParamSchema),
        response: {
          200: zodToJsonSchema(
            z.object({
              success: z.boolean(),
              data: z.object({
                id: z.string(),
                hostname: z.string(),
                ip: z.string(),
                grpcPort: z.number().optional(),
                proxyPort: z.number().optional(),
                cpuUsage: z.number().optional(),
                memoryUsage: z.number().optional(),
                diskUsage: z.number().optional(),
                instanceCount: z.number(),
                maxInstances: z.number(),
                status: z.string(),
                lastSeen: z.any(),
                activeSessions: z.number(),
                healthStatus: z.string().optional(),
              }),
            })
          ),
          400: zodToJsonSchema(errorResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
          404: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['admin', 'machines'],
      },
    },
    tryCatchWrapper(async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as { id: string };
      const machineId = params.id;

      const machine = await AdminMachineService.getMachineDetail(machineId);

      if (!machine) {
        return reply.status(404).send({ success: false, error: '机器不存在' });
      }

      return reply.send({ success: true, data: machine });
    })
  );

  fastify.put(
    '/api/admin/machines/:id',
    {
      onRequest: [authenticate],
      schema: {
        params: zodToJsonSchema(idParamSchema),
        body: {
          type: 'object',
          properties: {
            hostname: { type: 'string' },
            ip: { type: 'string' },
            grpcPort: { type: 'number' },
            proxyPort: { type: 'number' },
            maxInstances: { type: 'number' },
          },
        },
        response: {
          200: zodToJsonSchema(
            z.object({
              success: z.boolean(),
              message: z.string().optional(),
              data: z.object({
                id: z.string(),
                hostname: z.string(),
                ip: z.string(),
                grpcPort: z.number().optional(),
                proxyPort: z.number().optional(),
                maxInstances: z.number(),
                status: z.string(),
              }),
            })
          ),
          400: zodToJsonSchema(errorResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
          404: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['admin', 'machines'],
      },
    },
    async (request: FastifyRequest<UpdateMachineBodyRoute>, reply: FastifyReply) => {
      try {
        const adminId = request.user?.id;
        const machineId = request.params.id;
        const body = request.body;

        if (body.ip) {
          const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
          if (!ipRegex.test(body.ip)) {
            return reply.status(400).send({ success: false, error: '无效的 IP 地址格式' });
          }
        }

        if (body.grpcPort !== undefined && (body.grpcPort < 1 || body.grpcPort > 65535)) {
          return reply.status(400).send({ success: false, error: 'gRPC 端口必须在 1-65535 之间' });
        }
        if (body.proxyPort !== undefined && (body.proxyPort < 1 || body.proxyPort > 65535)) {
          return reply.status(400).send({ success: false, error: '代理端口必须在 1-65535 之间' });
        }

        const updatedMachine = await AdminMachineService.updateMachineConfig(machineId, body, adminId || 0);

        return reply.send({
          success: true,
          message: '机器配置已更新',
          data: updatedMachine,
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '更新机器配置失败');
        const message = error instanceof Error ? error.message : '未知错误';
        if (message === '机器不存在') {
          return reply.status(404).send({ success: false, error: message });
        }
        return reply.status(500).send({ success: false, error: '更新机器配置失败: ' + message });
      }
    }
  );

  fastify.post(
    '/api/admin/machines/:id/health-check',
    {
      onRequest: [authenticate],
      schema: {
        params: zodToJsonSchema(idParamSchema),
        response: {
          200: zodToJsonSchema(
            z.object({
              success: z.boolean(),
              data: z.object({
                machineId: z.string(),
                status: z.enum(['healthy', 'unhealthy']),
                grpcConnected: z.boolean(),
                responseTime: z.number().optional(),
                activeInstances: z.number().optional(),
                systemInfo: z
                  .object({
                    cpuUsage: z.number(),
                    memoryUsage: z.number(),
                    diskUsage: z.number(),
                    uptime: z.number().optional(),
                  })
                  .optional(),
                error: z.string().optional(),
                checkedAt: z.any(),
              }),
            })
          ),
          400: zodToJsonSchema(errorResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
          404: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['admin', 'machines'],
      },
    },
    tryCatchWrapper(async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as { id: string };
      const machineId = params.id;

      const result = await AdminMachineService.healthCheckMachine(machineId);

      return reply.send({ success: true, data: result });
    })
  );

  fastify.post(
    '/api/admin/machines/health-check/batch',
    {
      onRequest: [authenticate],
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
              data: z.object({
                total: z.number(),
                healthy: z.number(),
                unhealthy: z.number(),
                results: z.array(
                  z.object({
                    machineId: z.string(),
                    status: z.enum(['healthy', 'unhealthy']),
                    error: z.string().optional(),
                  })
                ),
              }),
            })
          ),
          400: zodToJsonSchema(errorResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['admin', 'machines'],
      },
    },
    tryCatchWrapper(async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as { machineIds: string[] };

      if (!body.machineIds || !Array.isArray(body.machineIds) || body.machineIds.length === 0) {
        return reply.status(400).send({ success: false, error: '请提供要检查的机器 ID 列表' });
      }

      const results = await AdminMachineService.batchHealthCheck(body.machineIds);

      const healthy = results.filter((r) => r.status === 'healthy').length;
      const unhealthy = results.filter((r) => r.status === 'unhealthy').length;

      return reply.send({
        success: true,
        data: {
          total: results.length,
          healthy,
          unhealthy,
          results,
        },
      });
    })
  );
}
