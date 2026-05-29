import { FastifyInstance } from 'fastify';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import sessionRoutes from './session.routes.js';
import machineRoutes from './machine.routes.js';
import adminRoutes from './admin.routes.js';
import adminApiRoutes from './admin-api/index.js';
import adminApiAuthRoutes from './admin-api-auth.routes.js';
import adminMachineApiRoutes from './admin-machine-api.routes.js';
import fileRoutes from './file.routes.js';
import demoRoutes from './demo.routes.js';
import cdpRoutes from './cdp.routes.js';

export default async function routes(fastify: FastifyInstance) {
  // 注册所有路由
  fastify.register(authRoutes, { prefix: '/api/auth' });
  fastify.register(userRoutes, { prefix: '/api/users' });
  fastify.register(sessionRoutes, { prefix: '/api/sessions' });
  fastify.register(machineRoutes, { prefix: '/api/machines' });
  fastify.register(fileRoutes);

  // 注册管理后台路由
  fastify.register(adminRoutes);
  fastify.register(adminApiRoutes);
  fastify.register(adminApiAuthRoutes);
  fastify.register(adminMachineApiRoutes);
  fastify.register(demoRoutes);

  // CDP 兼容端点（无前缀，路径以 /json 开头）
  fastify.register(cdpRoutes);

  // 健康检查路由
  fastify.get('/health', async () => {
    const { getHealthStatus } = await import('../services/health.service.js');
    const { getSqliteClient } = await import('../config/db-driver.js');

    let wsConnectionCount = 0;
    try {
      const { getWsProxyService } = await import('@manager/app.js');
      const wsProxy = getWsProxyService();
      if (wsProxy) {
        wsConnectionCount = wsProxy.getActiveConnectionCount();
      }
    } catch {
      // manager app not available in machine service context
    }

    let grpcActiveConnections: () => string[] = () => [];
    let registeredMachineCount: () => Promise<number> = async () => 0;
    try {
      const { connectionManager } = await import('../services/machine-grpc/index.js');
      const { MachineModel } = await import('../models/machine.model.js');
      grpcActiveConnections = () => connectionManager.getActiveConnections();
      registeredMachineCount = () => MachineModel.countAll();
    } catch {
      // gRPC not available
    }

    return getHealthStatus({
      getActiveWsConnections: () => wsConnectionCount,
      getGrpcActiveConnections: grpcActiveConnections,
      getRegisteredMachineCount: registeredMachineCount,
      getSqliteClient,
    });
  });

  // Metrics 端点（需要管理员认证）
  fastify.get('/api/health/metrics', { onRequest: [fastify.verifyJWT] }, async () => {
    const { getMetrics } = await import('../services/health.service.js');

    let wsConnectionCount = 0;
    try {
      const { getWsProxyService } = await import('@manager/app.js');
      const wsProxy = getWsProxyService();
      if (wsProxy) {
        wsConnectionCount = wsProxy.getActiveConnectionCount();
      }
    } catch {
      // manager app not available
    }

    return getMetrics({
      getActiveWsConnections: () => wsConnectionCount,
    });
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
