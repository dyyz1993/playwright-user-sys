import { start } from './index.js';
import { logger } from '../utils/logger.js';

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常:', error);
  process.exit(1);
});

// 处理未处理的 Promise 拒绝
process.on('unhandledRejection', (reason) => {
  logger.error('未处理的 Promise 拒绝:', reason);
});

// 启动机器端
logger.info('启动机器端...');
start().catch((error) => {
  logger.error('启动失败:', error);
  process.exit(1);
});
