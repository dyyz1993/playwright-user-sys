import { logger } from '@shared/utils/logger.js';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { UserRole } from '@shared/types/index.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  adminLoginRequestSchema,
  adminLoginResponseSchema,
  dashboardStatsResponseSchema,
  errorResponseSchema,
} from '../schemas/index.js';
import { authenticateUser } from '../services/auth.service.js';
import * as UserService from '../services/user.service.js';
import { sendSuccess, sendError, getSafeErrorMessage } from '../utils/response.js';
import { tryCatchWrapper } from '../utils/try-catch-wrapper.js';

export default async function adminApiAuthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/api/admin/login',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
      schema: {
        body: zodToJsonSchema(adminLoginRequestSchema),
        response: {
          200: zodToJsonSchema(adminLoginResponseSchema),
          400: zodToJsonSchema(errorResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['auth'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as { username: string; password: string };
        const { username, password } = body;

        const result = await authenticateUser(username, password, request.ip);

        return sendSuccess(
          reply,
          {
            id: result.user.id,
            username: result.user.username,
            role: result.user.role,
            token: result.token,
          },
          '登录成功'
        );
      } catch (error: unknown) {
        request.log.error({ err: error }, '登录失败');
        const msg = getSafeErrorMessage(error);
        return sendError(reply, msg, 401);
      }
    }
  );

  fastify.get(
    '/api/admin/dashboard/stats',
    {
      schema: {
        response: {
          200: zodToJsonSchema(dashboardStatsResponseSchema),
          401: zodToJsonSchema(errorResponseSchema),
          403: zodToJsonSchema(errorResponseSchema),
        },
        tags: ['admin'],
      },
      onRequest: [
        async (request, reply) => {
          try {
            await fastify.verifyJWT(request, reply);
            if (reply.sent) return;
            if (!request.user) {
              return sendError(reply, '未授权', 401);
            }
            if (request.user.role !== UserRole.ADMIN) {
              return sendError(reply, '需要管理员权限', 403);
            }
          } catch (error: unknown) {
            if (reply.sent) return;
            request.log.error({ err: error }, '认证失败');
            return sendError(reply, '认证失败', 401);
          }
        },
      ],
    },
    tryCatchWrapper(async (_request: FastifyRequest, reply: FastifyReply) => {
      const { memoryStore } = await import('../services/memory-store.service.js');

      const usersData = await UserService.getUserStats();
      const totalUsers = usersData.total || 0;
      const activeUsers = usersData.active || 0;

      const machineStats = memoryStore.getMachineStats();
      const sessionStats = memoryStore.getSessionStats();

      if (machineStats.total === 0 && sessionStats.total === 0) {
        await memoryStore.loadInitialData();
      }

      logger.info('开始强制刷新内存数据...');
      await memoryStore.loadInitialData();
      logger.info('内存数据刷新完成');

      const allMachines = memoryStore.getAllMachines();
      logger.info('内存中的机器详细状态:');
      for (const machine of allMachines) {
        logger.info(
          `- 机器 ${machine.machine_id}: 状态=${machine.online ? '在线' : '离线'}, 活跃会话=${machine.active_sessions}`
        );
      }

      const updatedMachineStats = memoryStore.getMachineStats();
      const updatedSessionStats = memoryStore.getSessionStats();

      logger.info(`当前在线机器数量: ${updatedMachineStats.online}/${updatedMachineStats.total}`);
      logger.info(`当前活跃会话数量: ${updatedSessionStats.active}/${updatedSessionStats.total}`);

      const creditsData = await UserService.getCreditsStats();
      const totalCredits = creditsData.total || 0;
      const usedCredits = creditsData.used || 0;

      return sendSuccess(reply, {
        totalUsers,
        activeUsers,
        totalMachines: updatedMachineStats.total,
        onlineMachines: updatedMachineStats.online,
        totalSessions: updatedSessionStats.total,
        activeSessions: updatedSessionStats.active,
        totalCredits,
        usedCredits,
      });
    })
  );
}
