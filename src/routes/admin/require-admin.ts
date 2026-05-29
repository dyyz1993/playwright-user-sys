import { FastifyRequest, FastifyReply } from 'fastify';

export function requireAdmin(request: FastifyRequest, _reply: FastifyReply): boolean {
  if (request.user?.role !== 'admin') {
    return false;
  }
  return true;
}
