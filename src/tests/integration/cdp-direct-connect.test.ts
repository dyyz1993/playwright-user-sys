import { describe, it, expect } from 'vitest';
import { chromium } from 'playwright';

describe('CDP Direct Connect', () => {
  it('CDP-01: apiKey直连模式应该能通过Playwright连接', async () => {
    const managerUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    const apiKey = process.env.ADMIN_API_KEY || process.env.TEST_API_KEY;

    if (!apiKey) {
      console.log('跳过: 需要ADMIN_API_KEY或TEST_API_KEY环境变量');
      return;
    }

    const wsUrl = managerUrl.replace('http://', 'ws://').replace('https://', 'wss://') + '/ws/connect?apiKey=' + apiKey;

    const browser = await chromium.connectOverCDP(wsUrl, { timeout: 15000 });
    expect(browser).toBeDefined();

    const page = await browser.newPage();
    await page.goto('https://www.baidu.com', { timeout: 10000 });
    const title = await page.title();
    expect(title).toContain('百度');

    await page.close();
    await browser.close();
  });

  it('CDP-02: apiKey直连应该支持viewport参数', async () => {
    const managerUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    const apiKey = process.env.ADMIN_API_KEY || process.env.TEST_API_KEY;

    if (!apiKey) {
      return;
    }

    const wsUrl = managerUrl.replace('http://', 'ws://').replace('https://', 'wss://') + '/ws/connect?apiKey=' + apiKey + '&width=800&height=600';

    const browser = await chromium.connectOverCDP(wsUrl, { timeout: 15000 });
    expect(browser).toBeDefined();

    const page = await browser.newPage();
    const viewport = page.viewportSize();
    expect(viewport?.width).toBe(800);
    expect(viewport?.height).toBe(600);

    await page.close();
    await browser.close();
  });
});
