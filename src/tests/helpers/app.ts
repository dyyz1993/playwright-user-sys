import Fastify, { FastifyInstance } from 'fastify';
import authPlugin from '../../plugins/auth.plugin.js';
import errorHandlerPlugin from '../../plugins/error-handler.plugin.js';
import userRoutes from '../../routes/user.routes.js';
import authRoutes from '../../routes/auth.routes.js';
import adminApiRoutes from '../../routes/admin-api.routes.js';
import adminApiAuthRoutes from '../../routes/admin-api-auth.routes.js';
import sessionRoutes from '../../routes/session.routes.js';
import machineRoutes from '../../routes/machine.routes.js';
import adminMachineApiRoutes from '../../routes/admin-machine-api.routes.js';

/**
 * 构建测试应用实例
 */
export async function build(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // 测试时禁用日志
  });

  // 注册插件
  await app.register(errorHandlerPlugin); // 注册错误处理插件，确保验证错误正确返回
  await app.register(authPlugin);

  // 注册路由
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(adminApiRoutes);
  await app.register(adminApiAuthRoutes);
  await app.register(sessionRoutes, { prefix: '/api/sessions' });
  await app.register(machineRoutes, { prefix: '/api/machines' });
  await app.register(adminMachineApiRoutes); // 添加机器管理API路由

  return app;
}
