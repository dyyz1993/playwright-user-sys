import Fastify, { FastifyInstance } from 'fastify';
import { env } from './config/env.js';
import { db, initDatabase } from './config/database.js';
import { runMigrations } from './models/migrations.js';
import routes from './routes/index.js';
import plugins from './plugins/index.js';
import { logger } from './utils/logger.js';

/**
 * 重置所有机器状态
 * 在管理端启动时将所有机器标记为离线，防止离线机器被错误标记为在线
 */
async function resetAllMachineStatus(): Promise<void> {
  try {
    // 将所有机器标记为离线
    await db('machines').update({ status: 'offline' });
    logger.info('所有机器已重置为离线状态');
  } catch (error) {
    logger.error('重置机器状态失败:', error);
  }
}

// 构建应用但不启动
export async function build(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test' ? {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    } : false,
  });

  // 初始化数据库
  if (process.env.NODE_ENV === 'test') {
    await initDatabase();
  }

  // 注册插件和路由
  await app.register(plugins);
  await app.register(routes);

  return app;
}

// 创建 Fastify 实例
const fastify = await build();

// Swagger 插件已在 plugins/swagger.plugin.js 中注册

// 路由已在 routes/index.js 中注册

// 启动服务器
export async function start() {
  try {
    // 运行数据库迁移
    await runMigrations();

    // 重置所有机器状态
    await resetAllMachineStatus();
    logger.info('所有机器状态已重置为离线');

    // 初始化内存存储服务
    const { memoryStore } = await import('./services/memory-store.service.js');
    await memoryStore.loadInitialData();
    logger.info('内存存储服务已初始化');

    // 启动 gRPC 服务器
    const { startGrpcServer } = await import('./services/machine-grpc.service.js');
    const grpcPort = parseInt(env.GRPC_PORT+'' || '50051', 10);
    startGrpcServer(grpcPort);

    // 注意: 代理服务已移除，使用 SLB 或直接连接机器替代

    // 启动机器监控服务
    const { startMachineMonitor } = await import('./services/machine-monitor.service.js');
    const monitorInterval = parseInt(env.MACHINE_MONITOR_INTERVAL+'' || '30000', 10);
    const machineMonitorTimer = await startMachineMonitor(monitorInterval);

    // 启动点数监控服务
    const { startCreditsMonitor } = await import('./services/credits-monitor.service.js');
    const creditsMonitorTimer = startCreditsMonitor(5000); // 每5秒检查一次
    logger.info('✅ 点数监控服务已启动，检查间隔: 5秒');

    // 在应用关闭时停止监控服务
    fastify.addHook('onClose', async () => {
      const { stopMachineMonitor } = await import('./services/machine-monitor.service.js');
      stopMachineMonitor(machineMonitorTimer);

      const { stopCreditsMonitor } = await import('./services/credits-monitor.service.js');
      stopCreditsMonitor(creditsMonitorTimer);
    });

    // 启动 HTTP 服务器
    await fastify.listen({ port: env.PORT, host: env.HOST });

    logger.info(`✅ HTTP 服务器已启动: http://${env.HOST}:${env.PORT}`);
    logger.info(`✅ gRPC 服务器已启动: ${env.HOST}:${grpcPort}`);
    logger.info(`📚 API 文档: http://${env.HOST}:${env.PORT}/docs`);
  } catch (error) {
    logger.error('❌ 启动服务器失败:', error);
    process.exit(1);
  }
}

export default fastify;
