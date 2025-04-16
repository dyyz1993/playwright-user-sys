import { FastifyInstance } from 'fastify';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import sessionRoutes from './session.routes.js';
import machineRoutes from './machine.routes.js';
import adminRoutes from './admin.routes.js';
import adminApiRoutes from './admin-api.routes.js';
import adminApiAuthRoutes from './admin-api-auth.routes.js';

export default async function routes(fastify: FastifyInstance) {
  // 注册所有路由
  fastify.register(authRoutes, { prefix: '/api/auth' });
  fastify.register(userRoutes, { prefix: '/api/users' });
  fastify.register(sessionRoutes, { prefix: '/api/sessions' });
  fastify.register(machineRoutes, { prefix: '/api/machines' });

  // 注册管理后台路由
  fastify.register(adminRoutes);
  fastify.register(adminApiRoutes);
  fastify.register(adminApiAuthRoutes);

  // 健康检查路由
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date() };
  });

  // API 根路由
  fastify.get('/api', async () => {
    return {
      name: 'Playwright 用户管理系统 API',
      version: '1.0.0',
      docs: '/docs',
    };
  });

  // 根路由重定向到管理后台
  fastify.get('/', async (_, reply) => {
    return reply.redirect('/admin');
  });
}
