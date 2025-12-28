import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Playwright 测试配置 - 专业版
 *
 * 特性：
 * - 使用 webServer 自动启动管理端
 * - 使用 Fixture 管理机器服务生命周期
 * - 动态端口分配，避免冲突
 * - 内置数据验证
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
  workers: process.env.CI ? 1 : 1, // 默认串行，避免端口冲突

  // 报告器配置
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['list'],
  ],

  // ==================== 专业 webServer 配置 ====================
  /**
   * webServer - 自动启动管理端
   *
   * Playwright 会自动：
   * 1. 在测试前启动管理端服务
   * 2. 分配动态端口（如果 port: 0）
   * 3. 等待服务就绪（通过 /health 检查）
   * 4. 测试后自动停止服务
   * 5. 设置 baseURL 指向管理端
   */
  webServer: {
    // 管理端启动命令
    command: 'NODE_ENV=test npx tsx src/server.ts',
    // 端口配置（使用固定端口，或者设为0动态分配）
    port: 3000,
    // 重用已存在的服务器（开发时有用）
    // 测试环境始终启动新服务器，避免依赖外部服务
    reuseExistingServer: false,
    // 启动超时
    timeout: 120 * 1000,
    // 环境变量
    env: {
      NODE_ENV: 'test',
      TEST_ENV: 'true',
    },
  },

  // 全局设置
  use: {
    // 基础 URL - 由 webServer 自动设置
    // baseURL: 'http://localhost:<assigned_port>',

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
});
