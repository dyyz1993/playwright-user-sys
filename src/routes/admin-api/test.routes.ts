import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { TestSessionBodyRoute, TestMachineBodyRoute } from '@shared/types/routes.js';
import { createAuthenticate } from './authenticate.js';

function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function adminApiTestRoutes(fastify: FastifyInstance): Promise<void> {
  const authenticate = createAuthenticate(fastify);

  fastify.post(
    '/api/admin/test/sessions',
    {
      preHandler: [authenticate],
    },
    async (request: FastifyRequest<TestSessionBodyRoute>, reply: FastifyReply) => {
      try {
        const { SessionModel } = await import('../../models/session.model.js');
        const { v4: uuidv4 } = await import('uuid');

        const body = request.body;
        const count = body.count || 1;
        const userId = body.user_id || 1;

        const sessions: Awaited<ReturnType<typeof SessionModel.create>>[] = [];
        const now = new Date();

        for (let i = 0; i < count; i++) {
          const _sessionId = uuidv4();

          const session = await SessionModel.create({
            user_id: userId,
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

  fastify.post(
    '/api/admin/test/machines',
    {
      preHandler: [authenticate],
    },
    async (request: FastifyRequest<TestMachineBodyRoute>, reply: FastifyReply) => {
      try {
        const { MachineModel } = await import('../../models/machine.model.js');
        const { v4: uuidv4 } = await import('uuid');

        const body = request.body;
        const count = body.count || 1;

        const machines: Awaited<ReturnType<typeof MachineModel.register>>[] = [];
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
}
