/**
 * Playwright E2E 视图渲染测试
 * 测试所有管理后台页面的渲染和功能
 *
 * 使用本地 Chromium: /Applications/Chromium.app/Contents/MacOS/Chromium
 */
import { test, expect } from '@playwright/test';

// 配置使用本地 Chromium
const CHROMIUM_PATH = '/Applications/Chromium.app/Contents/MacOS/Chromium';

// 测试基础 URL
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// 测试用户凭据
const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: 'REDACTED_ADMIN_PASS',
};

test.describe.configure({
  // 所有测试串行执行，避免登录状态冲突
  mode: 'serial',
});

test.describe('管理后台视图渲染测试', () => {
  // 在所有测试前启动开发服务器
  test.beforeAll(async () => {
    console.log('确保开发服务器已启动: pnpm dev');
  });

  test.afterAll(async () => {
    console.log('测试完成');
  });

  test.describe('登录流程', () => {
    test('应该显示登录页面', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/login`);

      // 验证页面标题
      await expect(page).toHaveTitle(/登录/);

      // 验证登录表单元素
      await expect(page.locator('input[name="username"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('应该成功登录并重定向到仪表盘', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/login`);

      // 填写登录表单
      await page.fill('input[name="username"]', ADMIN_CREDENTIALS.username);
      await page.fill('input[name="password"]', ADMIN_CREDENTIALS.password);

      // 提交登录
      await page.click('button[type="submit"]');

      // 验证重定向到仪表盘
      await page.waitForURL(`${BASE_URL}/admin`);
      expect(page.url()).toBe(`${BASE_URL}/admin`);
    });

    test('错误的凭据应该显示错误消息', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/login`);

      await page.fill('input[name="username"]', 'wronguser');
      await page.fill('input[name="password"]', 'wrongpassword');
      await page.click('button[type="submit"]');

      // 验证错误消息
      const errorMessage = page.locator('text=用户名或密码错误');
      await expect(errorMessage).toBeVisible();
    });

    test('应该设置认证 Cookie', async ({ context, page }) => {
      await page.goto(`${BASE_URL}/admin/login`);
      await page.fill('input[name="username"]', ADMIN_CREDENTIALS.username);
      await page.fill('input[name="password"]', ADMIN_CREDENTIALS.password);
      await page.click('button[type="submit"]');

      // 等待重定向
      await page.waitForURL(`${BASE_URL}/admin`);

      // 验证 Cookie 被设置
      const cookies = await context.cookies();
      const tokenCookie = cookies.find(c => c.name === 'token');
      expect(tokenCookie).toBeDefined();
      expect(tokenCookie?.httpOnly).toBe(true);
    });
  });

  test.describe('仪表盘页面', () => {
    // 每个测试前登录
    test.beforeEach(async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/login`);
      await page.fill('input[name="username"]', ADMIN_CREDENTIALS.username);
      await page.fill('input[name="password"]', ADMIN_CREDENTIALS.password);
      await page.click('button[type="submit"]');
      await page.waitForURL(`${BASE_URL}/admin`);
    });

    test('应该显示所有统计卡片', async ({ page }) => {
      // 等待页面加载完成
      await page.waitForLoadState('networkidle');

      // 验证统计卡片存在
      await expect(page.locator('text=活跃会话')).toBeVisible();
      await expect(page.locator('text=在线机器')).toBeVisible();
      await expect(page.locator('text=总用户数')).toBeVisible();
      await expect(page.locator('text=剩余算力')).toBeVisible();
    });

    test('应该显示最近会话数据', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      // 验证"最近会话"标题存在
      const recentSessionsTitle = page.locator('text=最近会话');
      await expect(recentSessionsTitle).toBeVisible();

      // 检查是否有会话表格或"暂无会话记录"消息
      const hasTable = await page.locator('table').count() > 0;
      const hasEmptyMessage = await page.locator('text=暂无会话记录').count() > 0;

      expect(hasTable || hasEmptyMessage).toBe(true);
    });

    test('应该显示系统状态信息', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      await expect(page.locator('text=系统状态')).toBeVisible();
      await expect(page.locator('text=CPU 使用率')).toBeVisible();
      await expect(page.locator('text=内存使用率')).toBeVisible();
      await expect(page.locator('text=磁盘使用率')).toBeVisible();
    });

    test('不应该有 JavaScript 错误', async ({ page }) => {
      const errors: string[] = [];

      // 监听页面错误
      page.on('pageerror', (error) => {
        errors.push(error.message);
      });

      await page.goto(`${BASE_URL}/admin`);
      await page.waitForLoadState('networkidle');

      // 验证没有错误
      expect(errors).toHaveLength(0);

      // 特别检查没有 "is not defined" 错误
      const pageContent = await page.content();
      expect(pageContent).not.toContain('ReferenceError');
      expect(pageContent).not.toContain('is not defined');
      expect(pageContent).not.toContain('Cannot read');
    });

    test('页面 HTML 应该完整', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      const html = await page.content();

      // 验证基本 HTML 结构
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('</html>');
      expect(html).toContain('<head>');
      expect(html).toContain('<body>');
    });
  });

  test.describe('用户管理页面', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/login`);
      await page.fill('input[name="username"]', ADMIN_CREDENTIALS.username);
      await page.fill('input[name="password"]', ADMIN_CREDENTIALS.password);
      await page.click('button[type="submit"]');
      await page.waitForURL(`${BASE_URL}/admin`);
    });

    test('应该显示用户列表页面', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/users`);
      await page.waitForLoadState('networkidle');

      // 验证页面标题
      await expect(page.locator('text=用户管理')).toBeVisible();

      // 验证用户表格存在
      const table = page.locator('table');
      const hasTable = await table.count() > 0;

      if (hasTable) {
        await expect(table.first()).toBeVisible();
      }
    });

    test('不应该有渲染错误', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      await page.goto(`${BASE_URL}/admin/users`);
      await page.waitForLoadState('networkidle');

      expect(errors).toHaveLength(0);
    });
  });

  test.describe('机器管理页面', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/login`);
      await page.fill('input[name="username"]', ADMIN_CREDENTIALS.username);
      await page.fill('input[name="password"]', ADMIN_CREDENTIALS.password);
      await page.click('button[type="submit"]');
      await page.waitForURL(`${BASE_URL}/admin`);
    });

    test('应该显示机器列表页面', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/machines`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('text=机器管理')).toBeVisible();
    });

    test('不应该有渲染错误', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      await page.goto(`${BASE_URL}/admin/machines`);
      await page.waitForLoadState('networkidle');

      expect(errors).toHaveLength(0);
    });
  });

  test.describe('会话管理页面', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/login`);
      await page.fill('input[name="username"]', ADMIN_CREDENTIALS.username);
      await page.fill('input[name="password"]', ADMIN_CREDENTIALS.password);
      await page.click('button[type="submit"]');
      await page.waitForURL(`${BASE_URL}/admin`);
    });

    test('应该显示会话列表页面', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/sessions`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('text=会话管理')).toBeVisible();
    });

    test('不应该有渲染错误', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      await page.goto(`${BASE_URL}/admin/sessions`);
      await page.waitForLoadState('networkidle');

      expect(errors).toHaveLength(0);
    });
  });

  test.describe('系统设置页面', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/login`);
      await page.fill('input[name="username"]', ADMIN_CREDENTIALS.username);
      await page.fill('input[name="password"]', ADMIN_CREDENTIALS.password);
      await page.click('button[type="submit"]');
      await page.waitForURL(`${BASE_URL}/admin`);
    });

    test('应该显示系统设置页面', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/settings`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('text=系统设置')).toBeVisible();
    });

    test('不应该有渲染错误', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      await page.goto(`${BASE_URL}/admin/settings`);
      await page.waitForLoadState('networkidle');

      expect(errors).toHaveLength(0);
    });
  });

  test.describe('文件上传页面', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/login`);
      await page.fill('input[name="username"]', ADMIN_CREDENTIALS.username);
      await page.fill('input[name="password"]', ADMIN_CREDENTIALS.password);
      await page.click('button[type="submit"]');
      await page.waitForURL(`${BASE_URL}/admin`);
    });

    test('应该显示文件上传页面', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/files`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('text=文件上传')).toBeVisible();
    });

    test('不应该有渲染错误', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      await page.goto(`${BASE_URL}/admin/files`);
      await page.waitForLoadState('networkidle');

      expect(errors).toHaveLength(0);
    });
  });

  test.describe('登出功能', () => {
    test('应该成功登出并清除 Cookie', async ({ page, context }) => {
      // 登录
      await page.goto(`${BASE_URL}/admin/login`);
      await page.fill('input[name="username"]', ADMIN_CREDENTIALS.username);
      await page.fill('input[name="password"]', ADMIN_CREDENTIALS.password);
      await page.click('button[type="submit"]');
      await page.waitForURL(`${BASE_URL}/admin`);

      // 验证 Cookie 存在
      let cookies = await context.cookies();
      expect(cookies.find(c => c.name === 'token')).toBeDefined();

      // 登出
      await page.goto(`${BASE_URL}/admin/logout`);
      await page.waitForURL(`${BASE_URL}/admin/login`);

      // 验证 Cookie 被清除
      cookies = await context.cookies();
      expect(cookies.find(c => c.name === 'token')).toBeUndefined();
    });
  });

  test.describe('认证保护', () => {
    test('未登录访问管理页面应该重定向到登录页', async ({ page }) => {
      const protectedPages = [
        '/admin',
        '/admin/users',
        '/admin/machines',
        '/admin/sessions',
        '/admin/settings',
        '/admin/files',
      ];

      for (const path of protectedPages) {
        // 清除所有 cookies
        await page.context().clearCookies();

        await page.goto(`${BASE_URL}${path}`);
        await page.waitForURL(`${BASE_URL}/admin/login`, { timeout: 5000 });

        expect(page.url()).toBe(`${BASE_URL}/admin/login`);
      }
    });
  });
});
