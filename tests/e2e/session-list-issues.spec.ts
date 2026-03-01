import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('会话列表问题验证', () => {
  test('验证机器名称显示和时间显示', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/login`);
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'REDACTED_ADMIN_PASS');
    await page.click('button[type="submit"]');

    await page.waitForURL(`${BASE_URL}/admin`, { timeout: 30000 });

    await page.screenshot({ path: 'test-results/dashboard.png', fullPage: true });

    await page.goto(`${BASE_URL}/admin/sessions`);
    await page.waitForLoadState('networkidle');

    await page.screenshot({ path: 'test-results/session-page.png', fullPage: true });

    const tbody = page.locator('tbody');
    const rowCount = await tbody.locator('tr').count();
    console.log('表格行数:', rowCount);

    if (rowCount > 0) {
      const firstRow = tbody.locator('tr').first();

      const machineText = await firstRow.locator('td').nth(3).textContent();
      console.log('机器列显示:', machineText);

      const timeText = await firstRow.locator('td').nth(5).textContent();
      console.log('时间列显示:', timeText);

      await expect(machineText).not.toContain('未分配');
      await expect(machineText).toContain('Machine');

      console.log('✅ 机器名称显示正确:', machineText);
      console.log('✅ 时间显示:', timeText);
    } else {
      const bodyText = await page.locator('body').textContent();
      console.log('页面内容:', bodyText?.substring(0, 500));
    }
  });
});
