import Fastify, { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import authPlugin from '../../plugins/auth.plugin.js';
// 简化测试，移除不必要的插件
// import corsPlugin from '../../plugins/cors.plugin.js';
// import swaggerPlugin from '../../plugins/swagger.plugin.js';
// import sensiblePlugin from '../../plugins/sensible.plugin.js';
import userRoutes from '../../routes/user.routes.js';
import authRoutes from '../../routes/auth.routes.js';
import adminApiRoutes from '../../routes/admin-api.routes.js';
import sessionRoutes from '../../routes/session.routes.js';
import machineRoutes from '../../routes/machine.routes.js';

/**
 * 构建测试应用实例
 */
export async function build(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // 测试时禁用日志
  });

  // 注册插件
  // 简化测试，只注册必要的插件
  // await app.register(corsPlugin);
  // await app.register(sensiblePlugin);
  await app.register(authPlugin);

  // 注册路由
  await app.register(authRoutes);
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(adminApiRoutes);
  await app.register(sessionRoutes, { prefix: '/api/sessions' });
  await app.register(machineRoutes, { prefix: '/api/machines' });

  return app;
}
