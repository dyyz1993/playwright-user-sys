import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  testDir: './tests/e2e',

  timeout: 60 * 1000,

  expect: {
    timeout: 10 * 1000,
  },

  retries: process.env.CI ? 2 : 0,

  workers: process.env.CI ? 1 : 1,

  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['list'],
  ],

  webServer: {
    command: 'npx tsx src/server.ts',
    port: 3000,
    reuseExistingServer: false,
    timeout: 120 * 1000,
    env: {
      NODE_ENV: 'test',
      TEST_ENV: 'true',
      DB_TYPE: 'mysql',
      DB_HOST: 'REDACTED_INTERNAL_HOST',
      DB_USER: 'root',
      DB_PASSWORD: 'REDACTED_PASSWORD',
      DB_NAME: 'playwright_user_sys',
    },
  },

  use: {
    actionTimeout: 10 * 1000,
    navigationTimeout: 30 * 1000,
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: undefined,
        launchOptions: {
          executablePath: '/Applications/Chromium.app/Contents/MacOS/Chromium',
        },
      },
    },
  ],
});
