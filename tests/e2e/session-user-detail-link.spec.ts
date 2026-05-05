import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: 'REDACTED_ADMIN_PASS',
};

async function login(
  page: import('@playwright/test').Page,
  username = ADMIN_CREDENTIALS.username,
  password = ADMIN_CREDENTIALS.password
) {
  await page.goto(`${BASE_URL}/admin/login`, { timeout: 30000 });
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForURL(`${BASE_URL}/admin`, { timeout: 15000 }).catch(() => {});
}

test.describe('会话详情页面 - 查看用户详情链接测试', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('点击"查看用户详情"链接应该跳转到用户详情页面，而不是404', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/sessions`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const detailLink = page.locator('a[href*="/admin/sessions/"]').first();

    if ((await detailLink.count()) > 0 && (await detailLink.isVisible())) {
      await detailLink.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      const currentUrl = page.url();
      expect(currentUrl).toMatch(/\/admin\/sessions\/[a-f0-9-]+/);

      const viewUserDetailLink = page.locator('a:has-text("查看用户详情")');

      if ((await viewUserDetailLink.count()) > 0 && (await viewUserDetailLink.isVisible())) {
        const href = await viewUserDetailLink.getAttribute('href');
        console.log('查看用户详情链接 href:', href);

        expect(href).toMatch(/\/admin\/users\/\d+\/edit/);

        const response = await page.request.get(`${BASE_URL}${href}`);
        console.log('响应状态:', response.status());

        if (response.status() === 404) {
          console.log('错误: 用户详情页面返回 404');
          expect(response.status()).not.toBe(404);
        }

        await viewUserDetailLink.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        const newUrl = page.url();
        console.log('点击后的 URL:', newUrl);

        const has404InContent = (await page.locator('text=/404|Not Found|页面不存在/').count()) > 0;
        expect(has404InContent).toBe(false);

        expect(newUrl).not.toContain('/404');
      } else {
        console.log('未找到"查看用户详情"链接，可能该会话没有关联用户');
        test.skip();
      }
    } else {
      console.log('未找到会话详情链接，跳过测试');
      test.skip();
    }
  });

  test('直接访问 /admin/users/:id/edit 路由应该返回正确的响应', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/users`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const userEditLink = page.locator('a[href*="/admin/users/"][href*="/edit"]').first();

    if ((await userEditLink.count()) > 0 && (await userEditLink.isVisible())) {
      const href = await userEditLink.getAttribute('href');
      console.log('用户编辑链接 href:', href);

      const userIdMatch = href?.match(/\/admin\/users\/(\d+)\/edit/);
      if (userIdMatch) {
        const userId = userIdMatch[1];
        console.log('提取的用户 ID:', userId);

        const userEditUrl = `${BASE_URL}/admin/users/${userId}/edit`;
        console.log('测试用户编辑 URL:', userEditUrl);

        const response = await page.request.get(userEditUrl);
        console.log('响应状态:', response.status());

        expect(response.status()).not.toBe(404);

        await page.goto(userEditUrl);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        const has404InContent = (await page.locator('text=/404|Not Found|页面不存在/').count()) > 0;
        expect(has404InContent).toBe(false);
      }
    } else {
      console.log('未找到用户编辑链接');
      test.skip();
    }
  });
});
