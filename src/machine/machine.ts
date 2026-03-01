import { startMachine } from './index.js';
import { logger } from '@shared/utils/logger.js';
import { existsSync } from 'fs';

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常:', error);
  process.exit(1);
});

// 处理未处理的 Promise 拒绝
process.on('unhandledRejection', (reason) => {
  logger.error('未处理的 Promise 拒绝:', reason);
});

/**
 * 检查是否存在机器删除标记文件
 */
async function checkMachineDeletedFlag() {
  const deletedFlagPath = '.machine_deleted';

  // 检查标记文件是否存在
  if (existsSync(deletedFlagPath)) {
    logger.warn('检测到机器删除标记文件，该机器已被管理端删除，不会启动');
    logger.warn('如需重新启用该机器，请删除 .machine_deleted 文件并重新启动');
    process.exit(0);
    // 下面的代码不会执行，但为了类型检查，保留返回值
    return true;
  }

  return false;
}

// 启动机器端
async function main() {
  logger.info('启动机器端...');

  // 检查机器删除标记
  const isDeleted = await checkMachineDeletedFlag();
  if (isDeleted) {
    return;
  }

  // 启动机器服务
  try {
    await startMachine();
  } catch (error) {
    logger.error('启动失败:', error);
    process.exit(1);
  }
}

// 执行主函数
main();
