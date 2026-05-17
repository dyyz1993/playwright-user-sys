import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { UserRole } from '@shared/types/index.js';

export function createAuthenticate(fastify: FastifyInstance) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (reply.sent) return;

    try {
      await fastify.verifyJWT(request, reply);

      if (reply.sent) return;

      if (!request.user) {
        return reply.status(401).send({ success: false, error: '未授权' });
      }

      if (request.user.role !== UserRole.ADMIN) {
        return reply.status(403).send({ success: false, error: '需要管理员权限' });
      }
    } catch (error: unknown) {
      if (reply.sent) return;

      request.log.error({ err: error }, '认证失败');
      return reply.status(401).send({ success: false, error: '认证失败' });
    }
  };
}
