import { logger } from './shared/utils/logger.js';
import { startManager } from './manager/app.js';

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  logger.error('❌ 未捕获的异常:', error);
  process.exit(1);
});

// 处理未处理的 Promise 拒绝
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// 启动管理端服务 (向后兼容，指向新的管理端入口)
startManager();
