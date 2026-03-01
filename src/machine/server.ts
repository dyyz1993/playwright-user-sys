import { startMachine } from './app.js';

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  process.exit(1);
});

// 处理未处理的 Promise 拒绝
process.on('unhandledRejection', (reason) => {
  console.error('未处理的 Promise 拒绝:', reason);
});

// 启动机器端服务
startMachine().catch((error) => {
  console.error('启动机器端失败:', error);
  process.exit(1);
});
