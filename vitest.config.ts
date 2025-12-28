import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@manager': path.resolve(__dirname, './src/manager'),
      '@machine': path.resolve(__dirname, './src/machine'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/tests/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 30000, // 30秒超时
    setupFiles: ['./src/tests/setup.ts'], // 全局设置文件，确保环境变量在模块加载前设置
    fileParallelism: false, // 禁用文件并行执行，避免数据隔离问题
  },
});
