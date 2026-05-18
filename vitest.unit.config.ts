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
    testTimeout: 60000,
    hookTimeout: 60000,
    globalSetup: ['./src/tests/unit.globalSetup.ts'],
    setupFiles: ['./src/tests/unit.setup.ts'],
    fileParallelism: false,
    maxConcurrency: 1,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/tests/**',
        'src/**/*.d.ts',
        'src/types/**',
        'src/migrations/**',
      ],
    },
  },
});
