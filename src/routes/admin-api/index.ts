import { FastifyInstance } from 'fastify';
import { adminApiUserRoutes } from './user.routes.js';
import { adminApiMachineRoutes } from './machine.routes.js';
import { adminApiSessionRoutes } from './session.routes.js';
import { adminApiOperationLogRoutes } from './operation-log.routes.js';
import { adminApiTestRoutes } from './test.routes.js';
import { adminApiStorageRoutes } from './storage.routes.js';

export default async function adminApiRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.register(adminApiUserRoutes);
  fastify.register(adminApiMachineRoutes);
  fastify.register(adminApiSessionRoutes);
  fastify.register(adminApiOperationLogRoutes);
  fastify.register(adminApiTestRoutes);
  fastify.register(adminApiStorageRoutes);
}
