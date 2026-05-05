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
    include: ['src/tests/unit/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ['./src/tests/setup.ts'],
    fileParallelism: false,
    maxConcurrency: 1,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
