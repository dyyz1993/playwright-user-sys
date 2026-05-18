import Fastify, { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import authPlugin from '../../plugins/auth.plugin.js';
import errorHandlerPlugin from '../../plugins/error-handler.plugin.js';
import userRoutes from '../../routes/user.routes.js';
import authRoutes from '../../routes/auth.routes.js';
import adminApiRoutes from '../../routes/admin-api/index.js';
import adminApiAuthRoutes from '../../routes/admin-api-auth.routes.js';
import sessionRoutes from '../../routes/session.routes.js';
import machineRoutes from '../../routes/machine.routes.js';
import adminMachineApiRoutes from '../../routes/admin-machine-api.routes.js';
import fileRoutes from '../../routes/file.routes.js';

/**
 * 构建测试应用实例
 */
export async function build(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
  });

  await app.register(multipart, {
    limits: {
      fileSize: 100 * 1024 * 1024,
      fieldSize: 1024 * 1024,
      files: 5,
      fields: 20,
    },
  });
  await app.register(errorHandlerPlugin);
  await app.register(authPlugin);

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(adminApiRoutes);
  await app.register(adminApiAuthRoutes);
  await app.register(sessionRoutes, { prefix: '/api/sessions' });
  await app.register(machineRoutes, { prefix: '/api/machines' });
  await app.register(adminMachineApiRoutes);
  await app.register(fileRoutes);

  return app;
}
