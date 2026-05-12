import puppeteer from 'puppeteer-core';

const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Chromium.app/Contents/MacOS/Chromium',
  headless: false,
  defaultViewport: { width: 1440, height: 900 }
});

const page = await browser.newPage();

// Step 1: 打开 Demo
console.log('=== Step 1: Opening demo page ===');
await page.goto('http://192.168.0.29:3011/demo', { waitUntil: 'networkidle2', timeout: 30000 });
await page.screenshot({ path: '/tmp/demo-01-initial.png', fullPage: true });
console.log('Saved: demo-01-initial.png');

// 列出所有按钮和关键元素
const elements = await page.evaluate(() => {
  return {
    buttons: Array.from(document.querySelectorAll('button')).map(b => ({ text: b.textContent.trim().substring(0,50), id: b.id, cls: b.className.substring(0,60) })),
    iframes: Array.from(document.querySelectorAll('iframe')).map(f => ({ src: (f.src||'').substring(0,100), w: f.offsetWidth, h: f.offsetHeight })),
    images: Array.from(document.querySelectorAll('img')).map(i => ({ src: (i.src||'').substring(0,80), w: i.offsetWidth, h: i.offsetHeight, id: i.id, cls: i.className.substring(0,40) })),
    bodyText: document.body.innerText.substring(0, 300)
  };
});
console.log('Elements:', JSON.stringify(elements, null, 2));

// Step 2: 点击"开始体验"
console.log('\n=== Step 2: Click start button ===');
try {
  const btn = await page.$('button') || await page.$('[class*="start"]') || await page.$('[class*="btn"]');
  if (btn) {
    const btnText = await btn.evaluate(el => el.textContent.trim());
    console.log('Clicking button:', btnText);
    await btn.click();
  } else {
    console.log('No button found!');
  }
} catch(e) { console.log('Button click error:', e.message); }

await sleep(5000);
await page.screenshot({ path: '/tmp/demo-02-after-start.png', fullPage: true });
console.log('Saved: demo-02-after-start.png');

// Step 3: 等 WS 推流加载（15秒）
console.log('\n=== Step 3: Waiting for WS streaming (15s) ===');
await sleep(15000);
await page.screenshot({ path: '/tmp/demo-03-streaming.png', fullPage: true });
console.log('Saved: demo-03-streaming.png');

// 检查 iframe 和画面状态
const afterStart = await page.evaluate(() => {
  return {
    iframes: Array.from(document.querySelectorAll('iframe')).map(f => ({ src: (f.src||'').substring(0,120), w: f.offsetWidth, h: f.offsetHeight, visible: f.offsetParent !== null })),
    images: Array.from(document.querySelectorAll('img')).map(i => ({ src: (i.src||'').substring(0,100), w: i.offsetWidth, h: i.offsetHeight, id: i.id, naturalWidth: i.naturalWidth, naturalHeight: i.naturalHeight })),
    statusText: (() => { const el = document.querySelector('[id*="status"],[class*="status"]'); return el ? el.textContent.trim() : 'none'; })(),
    errors: Array.from(document.querySelectorAll('[class*="error"]')).map(e => e.textContent.trim())
  };
});
console.log('After start state:', JSON.stringify(afterStart, null, 2));

// Step 4: 再等 10 秒，最终截图
await sleep(10000);
await page.screenshot({ path: '/tmp/demo-04-final.png', fullPage: true });
console.log('\nSaved: demo-04-final.png');

await browser.close();
console.log('\nDone! All screenshots saved to /tmp/demo-*.png');
