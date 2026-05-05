import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { OperationLogModel } from '../../models/operation-log.model.js';
import { UserModel } from '../../models/user.model.js';
import { v4 as uuidv4 } from 'uuid';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';
import { errorResponseSchema, idParamSchema } from '../../schemas/index.js';
import { AddMachineBodyRoute } from '@shared/types/routes.js';
import { createAuthenticate } from './authenticate.js';

function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function adminApiMachineRoutes(fastify: FastifyInstance): Promise<void> {
  const authenticate = createAuthenticate(fastify);

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

        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        if (!ipRegex.test(body.ip)) {
          return reply.status(400).send({ success: false, error: '无效的IP地址格式' });
        }

        if (body.grpcPort !== undefined && (body.grpcPort < 1 || body.grpcPort > 65535)) {
          return reply.status(400).send({ success: false, error: 'gRPC端口必须在1-65535之间' });
        }
        if (body.proxyPort !== undefined && (body.proxyPort < 1 || body.proxyPort > 65535)) {
          return reply.status(400).send({ success: false, error: '代理端口必须在1-65535之间' });
        }

        const { MachineModel } = await import('../../models/machine.model.js');
        const existingMachines = await MachineModel.getAll();
        const ipExists = existingMachines.some((m) => m.ip === body.ip);
        if (ipExists) {
          return reply.status(409).send({ success: false, error: '该IP地址的机器已存在' });
        }

        const machineId = uuidv4();

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

        OperationLogModel.create({
          admin_id: adminId || 0,
          action: '添加机器',
          details: {
            hostname: body.hostname,
            ip: body.ip,
            grpcPort: body.grpcPort,
            proxyPort: body.proxyPort,
          },
        }).catch((logError) => {
          request.log.error({ err: logError }, '记录操作日志失败');
        });

        return reply.status(201).send({
          success: true,
          message: '机器添加成功',
          data: machine,
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '添加机器失败');
        const message = error instanceof Error ? error.message : '未知错误';
        return reply.status(500).send({ success: false, error: '添加机器失败: ' + message });
      }
    }
  );

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

        const { MachineModel } = await import('../../models/machine.model.js');
        const { connectionManager } = await import('../../services/machine-grpc.service.js');

        const restarted: string[] = [];
        const failed: Array<{ machineId: string; error: string }> = [];

        for (const machineId of body.machineIds) {
          try {
            const machine = await MachineModel.findById(machineId);
            if (!machine) {
              failed.push({ machineId, error: '机器不存在' });
              continue;
            }

            if (!connectionManager.isConnected(machineId)) {
              failed.push({ machineId, error: '机器未连接，无法发送重启命令' });
              continue;
            }

            connectionManager.sendRestartCommand(machineId);

            await MachineModel.update(machineId, { status: 'offline' });

            restarted.push(machineId);

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
}
