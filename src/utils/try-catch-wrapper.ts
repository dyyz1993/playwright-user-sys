import type { FastifyRequest, FastifyReply } from 'fastify';
import { getSafeErrorMessage } from './response.js';

export function tryCatchWrapper<T extends FastifyRequest = FastifyRequest>(
  handler: (request: T, reply: FastifyReply) => Promise<void>
): (request: T, reply: FastifyReply) => Promise<void> {
  return async (request, reply) => {
    try {
      await handler(request, reply);
    } catch (error) {
      request.log.error({ error }, 'Route handler error');
      return reply.status(500).send({
        success: false,
        error: getSafeErrorMessage(error),
      });
    }
  };
}
