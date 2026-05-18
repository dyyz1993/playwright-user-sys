import type { FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { getSafeErrorMessage } from './response.js';

export function tryCatchWrapper<T extends FastifyRequest = FastifyRequest>(
  handler: (request: T, reply: FastifyReply) => Promise<void>
): (request: T, reply: FastifyReply) => Promise<void> {
  return async (request, reply) => {
    try {
      await handler(request, reply);
    } catch (error) {
      if (error instanceof ZodError) {
        const message = error.issues[0]?.message || '参数验证失败';
        return reply.status(400).send({
          success: false,
          error: message,
        });
      }
      request.log.error({ error }, 'Route handler error');
      return reply.status(500).send({
        success: false,
        error: getSafeErrorMessage(error),
      });
    }
  };
}
