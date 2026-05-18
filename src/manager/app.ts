import Fastify, { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';
import { db, initDatabase } from '../config/database.js';
import { runMigrations } from '../models/migrations.js';
import routes from '../routes/index.js';
import plugins from '../plugins/index.js';
import { logger } from '@shared/utils/logger.js';
import { createFastifyLoggerConfig } from '@shared/utils/pino-config.js';
import { NativeWebSocketProxyService } from '../services/native-websocket-proxy.service.js';

/**
 * 重置所有机器状态
 * 在管理端启动时将所有机器标记为离线，防止离线机器被错误标记为在线
 */
async function resetAllMachineStatus(): Promise<void> {
  try {
    // 将所有机器标记为离线
    await db('machines').update({ status: 'offline' });
    logger.info('所有机器已重置为离线状态');
  } catch (error: unknown) {
    logger.error('重置机器状态失败:', error);
  }
}

// 保存服务实例以便于优雅关闭
let wsProxyService: NativeWebSocketProxyService;

/**
 * 构建管理端应用（但不启动）
 */
export async function buildManager(): Promise<FastifyInstance> {
  const app = Fastify({
    bodyLimit: 1048576,
    logger: createFastifyLoggerConfig(),
  });

  // 在注册任何路由之前，初始化原生WebSocket代理服务
  wsProxyService = new NativeWebSocketProxyService(app.server);
  logger.info('✅ 原生WebSocket代理服务已初始化');

  // 注册插件
  logger.info('开始注册插件...');
  await app.register(plugins);
  logger.info('插件注册完成');

  // 注册路由
  logger.info('开始注册路由...');
  await app.register(routes);
  logger.info('路由注册完成');

  // 注册关闭钩子
  app.addHook('onClose', async () => {
    // 关闭WebSocket代理服务
    if (wsProxyService) {
      logger.info('正在关闭WebSocket代理服务...');
      wsProxyService.close();
    }
  });

  return app;
}

/**
 * 启动管理端服务
 */
export async function startManager() {
  try {
    // 先初始化数据库（在迁移之前）
    await initDatabase();

    // 运行数据库迁移
    await runMigrations();

    // 重置所有机器状态
    await resetAllMachineStatus();
    logger.info('所有机器状态已重置为离线');

    // 初始化内存存储服务
    const { memoryStore } = await import('../services/memory-store.service.js');
    await memoryStore.loadInitialData();
    logger.info('内存存储服务已初始化');

    // 启动 gRPC 服务器
    const { startGrpcServer } = await import('../services/machine-grpc/index.js');
    const grpcPort = parseInt(env.GRPC_PORT + '' || '50051', 10);
    startGrpcServer(grpcPort);

    // 注意: 代理服务已移除，使用 SLB 或直接连接机器替代

    // 启动机器监控服务
    const { startMachineMonitor } = await import('../services/machine-monitor.service.js');
    const monitorInterval = parseInt(env.MACHINE_MONITOR_INTERVAL + '' || '30000', 10);
    const machineMonitorTimer = await startMachineMonitor(monitorInterval);

    // 启动点数监控服务
    const { startCreditsMonitor } = await import('../services/credits-monitor.service.js');
    const creditsMonitorTimer = startCreditsMonitor(5000);
    logger.info('✅ 点数监控服务已启动，检查间隔: 5秒');

    // 启动临时文件定时清理（每6小时）
    const tempCleanupInterval = setInterval(
      async () => {
        try {
          const { cleanupExpiredUploads } = await import('../controllers/file.controller.js');
          await cleanupExpiredUploads();
          logger.info('定时清理过期上传文件完成');
        } catch (error: unknown) {
          logger.warn('定时清理过期上传文件失败:', error);
        }
      },
      6 * 60 * 60 * 1000
    );

    // 构建应用
    const fastify = await buildManager();

    // 移除 buildManager 中的 initDatabase 调用，因为已经在上面调用了
    // （通过在 buildManager 之前调用 initDatabase）

    // 在应用关闭时停止监控服务
    fastify.addHook('onClose', async () => {
      const { stopMachineMonitor } = await import('../services/machine-monitor.service.js');
      stopMachineMonitor(machineMonitorTimer);

      const { stopCreditsMonitor } = await import('../services/credits-monitor.service.js');
      stopCreditsMonitor(creditsMonitorTimer);

      clearInterval(tempCleanupInterval);
    });

    // 启动 HTTP 服务器
    await fastify.listen({ port: env.PORT, host: '0.0.0.0' });

    logger.info(`✅ HTTP 服务器已启动: http://${env.HOST}:${env.PORT}`);
    logger.info(`✅ gRPC 服务器已启动: ${env.HOST}:${grpcPort}`);
    logger.info(`📚 API 文档: http://${env.HOST}:${env.PORT}/docs`);
  } catch (error: unknown) {
    logger.error('❌ 启动服务器失败:', error);
    process.exit(1);
  }
}

export function getWsProxyService(): NativeWebSocketProxyService | null {
  return wsProxyService ?? null;
}

export default buildManager;
