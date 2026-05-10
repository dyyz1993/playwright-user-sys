import { chromium } from 'playwright-core';

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc3ODM4MjUzNiwiZXhwIjoxNzc4NDY4OTM2fQ.YM1anVuGy38knJjHIV9epVvXqwgP1DR2OQ7dxvHHFPQ';
const wsEndpoint = `ws://192.168.0.29:3011/ws/connect?sessionId=8a6830ec-72cb-481a-a207-57043c4165ab&token=${token}`;
const sessionId = '8a6830ec-72cb-481a-a207-57043c4165ab';

async function test() {
  console.log('Connecting to:', wsEndpoint);
  
  try {
    const browser = await chromium.connectOverCDP(wsEndpoint, {
      timeout: 10000
    });
    console.log('✓ Connected!');
    
    const contexts = browser.contexts();
    console.log('Contexts:', contexts.length);
    
    let page;
    if (contexts.length > 0) {
      const pages = contexts[0].pages();
      console.log('Pages:', pages.length);
      page = pages[0] || await contexts[0].newPage();
    } else {
      const context = await browser.newContext();
      page = await context.newPage();
    }
    
    console.log('Navigating to baidu.com...');
    await page.goto('https://www.baidu.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);
    
    const screenshotPath = `./test-screenshots/session-${sessionId}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log('✓ Screenshot saved:', screenshotPath);
    
    const title = await page.title();
    console.log('✓ Page title:', title);
    
    console.log('\nViewer URL: http://192.168.0.29:3011/viewer?sessionId=' + sessionId);
    
    console.log('\nWaiting 5 seconds before close...');
    await page.waitForTimeout(5000);
    
    await browser.close();
    console.log('✓ Test completed successfully');
  } catch (error) {
    console.error('✗ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

test();
