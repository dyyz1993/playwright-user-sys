import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright 测试配置
 */
export default defineConfig({
  testDir: './tests/e2e',

  // 全局超时设置
  timeout: 60 * 1000, // 60秒

  // 每个测试的超时
  expect: {
    timeout: 10 * 1000, // 10秒
  },

  // 测试失败时重试
  retries: process.env.CI ? 2 : 0,

  // 并行执行（串行模式在测试文件中定义）
  workers: process.env.CI ? 1 : undefined,

  // 报告器配置
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['list'],
  ],

  // 全局设置
  use: {
    // 基础 URL
    baseURL: process.env.BASE_URL || 'http://localhost:3000',

    // 操作超时
    actionTimeout: 10 * 1000,
    navigationTimeout: 30 * 1000,

    // 截图配置 - 启用全页面截图
    screenshot: 'retain-on-failure',
    video: 'retain-on-failure',

    // 追踪配置
    trace: 'retain-on-failure',

    // 浏览器选项
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  },

  // 测试项目
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // 使用本地 Chromium
        channel: undefined,
        launchOptions: {
          executablePath: '/Applications/Chromium.app/Contents/MacOS/Chromium',
        },
      },
    },

    // 如果需要测试其他浏览器，可以取消注释
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },

    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },

    // 移动端测试
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },
  ],

  // 开发服务器（可选）
  // webServer: {
  //   command: 'pnpm dev',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120 * 1000,
  // },
});
