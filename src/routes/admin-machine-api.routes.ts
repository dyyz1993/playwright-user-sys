import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';
import { OperationLogModel } from '../models/operation-log.model.js';
import { errorResponseSchema, idParamSchema } from '../schemas/index.js';

/**
 * 机器管理的额外 API 路由
 * 包含健康检查和编辑配置功能
 */
export default async function adminMachineApiRoutes(fastify: FastifyInstance): Promise<void> {
  // 使用全局验证中间件
  const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
    if (reply.sent) return;

    try {
      await fastify.verifyJWT(request, reply);
      if (reply.sent) return;

      if (!request.user) {
        return reply.status(401).send({ success: false, error: '未授权' });
      }

      if (request.user.role !== 'admin') {
        return reply.status(403).send({ success: false, error: '需要管理员权限' });
      }
    } catch (error) {
      if (reply.sent) return;
      request.log.error('认证失败:', error);
      return reply.status(401).send({ success: false, error: '认证失败' });
    }
  };

  // 获取机器详情
  fastify.get(
    '/api/admin/machines/:id',
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
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const params = request.params as { id: string };
        const machineId = params.id;

        const { MachineModel } = await import('../models/machine.model.js');
        const machine = await MachineModel.getDetailById(machineId);

        if (!machine) {
          return reply.status(404).send({ success: false, error: '机器不存在' });
        }

        return reply.send({ success: true, data: machine });
      } catch (error: any) {
        request.log.error('获取机器详情失败:', error);
        return reply.status(500).send({ success: false, error: '获取机器详情失败: ' + error.message });
      }
    }
  );

  // 更新机器配置
  fastify.put(
    '/api/admin/machines/:id',
    {
      preHandler: [authenticate],
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
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const adminId = request.user?.id;
        const params = request.params as { id: string };
        const machineId = params.id;
        const body = request.body as any;

        const { MachineModel } = await import('../models/machine.model.js');

        // 检查机器是否存在
        const existingMachine = await MachineModel.findById(machineId);
        if (!existingMachine) {
          return reply.status(404).send({ success: false, error: '机器不存在' });
        }

        // 验证 IP 地址格式（如果提供）
        if (body.ip) {
          const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
          if (!ipRegex.test(body.ip)) {
            return reply.status(400).send({ success: false, error: '无效的 IP 地址格式' });
          }
        }

        // 验证端口范围（如果提供）
        if (body.grpcPort !== undefined && (body.grpcPort < 1 || body.grpcPort > 65535)) {
          return reply.status(400).send({ success: false, error: 'gRPC 端口必须在 1-65535 之间' });
        }
        if (body.proxyPort !== undefined && (body.proxyPort < 1 || body.proxyPort > 65535)) {
          return reply.status(400).send({ success: false, error: '代理端口必须在 1-65535 之间' });
        }

        // 更新机器
        const updatedMachine = await MachineModel.update(machineId, body);
        if (!updatedMachine) {
          return reply.status(500).send({ success: false, error: '更新机器失败' });
        }

        // 记录操作日志 - 异步处理
        OperationLogModel.create({
          admin_id: adminId || 0,
          action: '更新机器配置',
          details: {
            hostname: body.hostname,
            ip: body.ip,
            maxInstances: body.maxInstances,
          },
        }).catch((logError) => {
          request.log.error('记录操作日志失败:', logError);
        });

        return reply.send({
          success: true,
          message: '机器配置已更新',
          data: updatedMachine,
        });
      } catch (error: any) {
        request.log.error('更新机器配置失败:', error);
        return reply.status(500).send({ success: false, error: '更新机器配置失败: ' + error.message });
      }
    }
  );

  // 健康检查
  fastify.post(
    '/api/admin/machines/:id/health-check',
    {
      preHandler: [authenticate],
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
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const params = request.params as { id: string };
        const machineId = params.id;

        const { MachineModel } = await import('../models/machine.model.js');
        const result = await MachineModel.healthCheck(machineId);

        return reply.send({ success: true, data: result });
      } catch (error: any) {
        request.log.error('健康检查失败:', error);
        return reply.status(500).send({ success: false, error: '健康检查失败: ' + error.message });
      }
    }
  );

  // 批量健康检查
  fastify.post(
    '/api/admin/machines/health-check/batch',
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
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as { machineIds: string[] };

        if (!body.machineIds || !Array.isArray(body.machineIds) || body.machineIds.length === 0) {
          return reply.status(400).send({ success: false, error: '请提供要检查的机器 ID 列表' });
        }

        const { MachineModel } = await import('../models/machine.model.js');
        const results = await MachineModel.batchHealthCheck(body.machineIds);

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
      } catch (error: any) {
        request.log.error('批量健康检查失败:', error);
        return reply.status(500).send({ success: false, error: '批量健康检查失败: ' + error.message });
      }
    }
  );
}
