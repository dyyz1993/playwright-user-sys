import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TestSessionBodyRoute, TestMachineBodyRoute } from '@shared/types/routes.js';
import { createAuthenticate } from './authenticate.js';
import { getSafeErrorMessage } from '../../utils/response.js';
import * as AdminTestService from '../../services/admin-test.service.js';

export async function adminApiTestRoutes(fastify: FastifyInstance): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  const authenticate = createAuthenticate(fastify);

  fastify.post(
    '/api/admin/test/sessions',
    {
      preHandler: [authenticate],
    },
    async (request: FastifyRequest<TestSessionBodyRoute>, reply: FastifyReply) => {
      try {
        const body = request.body;
        const count = body.count || 1;
        const userId = body.user_id || 1;

        const sessions = await AdminTestService.createTestSessions(count, userId);

        return reply.send({
          success: true,
          message: `成功创建 ${sessions.length} 个测试会话`,
          data: { sessions },
        });
      } catch (error: unknown) {
        return reply.status(500).send({
          success: false,
          error: '创建测试会话失败: ' + getSafeErrorMessage(error),
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
        const body = request.body;
        const count = body.count || 1;

        const machines = await AdminTestService.createTestMachines(count);

        return reply.send({
          success: true,
          message: `成功创建 ${machines.length} 个测试机器`,
          data: { machines },
        });
      } catch (error: unknown) {
        return reply.status(500).send({
          success: false,
          error: '创建测试机器失败: ' + getSafeErrorMessage(error),
        });
      }
    }
  );
}
