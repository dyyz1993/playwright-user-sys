// 设置测试环境变量
process.env.NODE_ENV = 'test';
process.env.DATABASE_TYPE = 'sqlite';
process.env.DATABASE_PATH = ':memory:';

// 从 Jest 导入必要的函数
import { jest, afterAll } from '@jest/globals';

// 设置超时时间
jest.setTimeout(30000); // 30秒

// 全局清理
afterAll(async () => {
  // 确保所有异步操作完成
  await new Promise(resolve => setTimeout(resolve, 500));
});
