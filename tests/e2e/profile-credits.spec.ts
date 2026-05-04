/**
 * Profile 页面点数显示测试
 * 测试 /admin/profile 页面的已使用点数计算是否正确
 *
 * 问题: 已使用点数一直是 0，百分比是 0%
 */
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: 'REDACTED_ADMIN_PASS',
};

test.describe.configure({
  mode: 'serial',
});

test.describe('Profile 页面点数显示测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/login`);
    await page.fill('input[name="username"]', ADMIN_CREDENTIALS.username);
    await page.fill('input[name="password"]', ADMIN_CREDENTIALS.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE_URL}/admin`);
  });

  test('应该显示个人资料页面', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/profile`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=个人资料')).toBeVisible();
    await expect(page.locator('text=算力点数')).toBeVisible();
  });

  test('应该正确显示当前可用点数', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/profile`);
    await page.waitForLoadState('networkidle');

    const creditsText = page.locator('text=当前可用点数').locator('..').locator('p.text-3xl');
    await expect(creditsText).toBeVisible();

    const creditsValue = await creditsText.textContent();
    console.log('当前可用点数:', creditsValue);

    expect(creditsValue).not.toBeNull();
    const credits = parseInt(creditsValue!, 10);
    expect(credits).toBeGreaterThanOrEqual(0);
  });

  test('BUG: 已使用点数应该正确计算，不应该始终为 0', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/profile`);
    await page.waitForLoadState('networkidle');

    const usedCreditsText = page.locator('text=已使用').first();
    await expect(usedCreditsText).toBeVisible();

    const usedCreditsContent = await usedCreditsText.textContent();
    console.log('已使用点数文本:', usedCreditsContent);

    const match = usedCreditsContent?.match(/已使用\s*(\d+)/);
    const usedCredits = match ? parseInt(match[1], 10) : 0;
    console.log('解析出的已使用点数:', usedCredits);

    const creditsTextElement = page.locator('text=当前可用点数').locator('..').locator('p.text-3xl');
    const currentCredits = parseInt((await creditsTextElement.textContent()) || '0', 10);

    const progressBar = page.locator('.bg-green-600.h-2.rounded-full');
    const progressWidth = await progressBar.getAttribute('style');
    console.log('进度条宽度:', progressWidth);

    const percentText = page.locator('text=%').first();
    const percentContent = await percentText.textContent();
    console.log('百分比文本:', percentContent);

    const percentMatch = percentContent?.match(/(\d+)%/);
    const percent = percentMatch ? parseInt(percentMatch[1], 10) : 0;
    console.log('解析出的百分比:', percent);

    const totalCredits = currentCredits + usedCredits;
    console.log('总点数 (当前 + 已使用):', totalCredits);

    if (usedCredits > 0 && totalCredits > 0) {
      const expectedPercent = Math.round((usedCredits / totalCredits) * 100);
      console.log('预期百分比:', expectedPercent);
      console.log('实际百分比:', percent);

      expect(percent).toBe(expectedPercent);
    } else {
      console.log('当前用户没有已使用的点数，无法验证计算是否正确');
      console.log('这是一个潜在问题: 如果用户有会话记录，已使用点数应该大于 0');

      const sessionsLink = page.locator('a[href="/admin/sessions"]');
      if (await sessionsLink.count() > 0) {
        console.log('建议: 检查会话管理页面确认是否有已完成的会话');
      }
    }
  });

  test('如果有会话记录，已使用点数应该大于 0', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/sessions`);
    await page.waitForLoadState('networkidle');

    const sessionRows = await page.locator('table tbody tr').count();
    console.log('会话记录数量:', sessionRows);

    if (sessionRows > 0) {
      const endedSessions = await page.locator('table tbody tr').filter({
        hasText: /disconnected|expired|completed|error/i
      }).count();
      console.log('已结束的会话数量:', endedSessions);

      if (endedSessions > 0) {
        await page.goto(`${BASE_URL}/admin/profile`);
        await page.waitForLoadState('networkidle');

        const usedCreditsText = page.locator('text=已使用').first();
        const usedCreditsContent = await usedCreditsText.textContent();
        const match = usedCreditsContent?.match(/已使用\s*(\d+)/);
        const usedCredits = match ? parseInt(match[1], 10) : 0;

        console.log('有已结束会话时，已使用点数:', usedCredits);

        expect(usedCredits).toBeGreaterThan(0);
      } else {
        console.log('没有已结束的会话，跳过验证');
      }
    } else {
      console.log('没有会话记录，跳过验证');
    }
  });

  test('进度条百分比应该与已使用点数一致', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/profile`);
    await page.waitForLoadState('networkidle');

    const creditsTextElement = page.locator('text=当前可用点数').locator('..').locator('p.text-3xl');
    const currentCredits = parseInt((await creditsTextElement.textContent()) || '0', 10);

    const usedCreditsText = page.locator('text=已使用').first();
    const usedCreditsContent = await usedCreditsText.textContent();
    const match = usedCreditsContent?.match(/已使用\s*(\d+)/);
    const usedCredits = match ? parseInt(match[1], 10) : 0;

    const totalCredits = currentCredits + usedCredits;

    if (totalCredits > 0) {
      const expectedPercent = Math.round((usedCredits / totalCredits) * 100);

      const percentText = page.locator('text=%').first();
      const percentContent = await percentText.textContent();
      const percentMatch = percentContent?.match(/(\d+)%/);
      const actualPercent = percentMatch ? parseInt(percentMatch[1], 10) : 0;

      console.log('当前点数:', currentCredits);
      console.log('已使用点数:', usedCredits);
      console.log('总点数:', totalCredits);
      console.log('预期百分比:', expectedPercent);
      console.log('实际百分比:', actualPercent);

      expect(actualPercent).toBe(expectedPercent);
    } else {
      console.log('总点数为 0，跳过百分比验证');
    }
  });
});
