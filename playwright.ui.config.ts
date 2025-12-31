/**
 * Playwright UI 测试配置
 *
 * 用于管理后台 UI 自动化测试
 * - 不需要启动机器端服务
 * - 使用现有服务器或自动启动管理端
 * - 专注于页面交互和功能验证
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // 测试目录
  testDir: './tests/ui',

  // 全局超时设置
  timeout: 60 * 1000, // 60秒

  // 每个测试的超时
  expect: {
    timeout: 10 * 1000, // 10秒
  },

  // 测试失败时重试
  retries: process.env.CI ? 2 : 0,

  // 并行执行（串行模式在测试文件中定义）
  workers: process.env.CI ? 1 : 1, // 默认串行，避免登录状态冲突

  // 报告器配置
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['list'],
  ],

  // 自动启动管理端服务器
  webServer: {
    command: 'NODE_ENV=test npx tsx src/server.ts',
    port: 3000,
    reuseExistingServer: !process.env.CI, // 开发环境重用现有服务器
    timeout: 120 * 1000,
    env: {
      NODE_ENV: 'test',
      TEST_ENV: 'true',
    },
  },

  // 全局设置
  use: {
    // 操作超时
    actionTimeout: 10 * 1000,
    navigationTimeout: 30 * 1000,

    // 截图配置 - 保存所有截图
    screenshot: 'only-on-failure',
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
        channel: undefined,
        launchOptions: {
          executablePath: '/Applications/Chromium.app/Contents/MacOS/Chromium',
        },
      },
    },
  ],
});
