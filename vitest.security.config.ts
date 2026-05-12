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
    include: ['src/tests/unit/security/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
  },
});
