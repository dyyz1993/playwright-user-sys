const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  
  // === PC 端 ===
  const pc = await browser.newPage();
  await pc.setViewport({ width: 1280, height: 800 });
  await pc.goto('http://192.168.0.29:3011/demo');
  await pc.waitForSelector('#start-btn', { timeout: 10000 }).catch(() => {});
  await pc.evaluate(() => { document.querySelector('#start-btn, button')?.click(); });
  await new Promise(r => setTimeout(r, 25000));
  await pc.screenshot({ path: 'test-screenshots/quick-verify/01_pc_ready.png' });
  
  // Get session info
  const sessionInfo = await pc.evaluate(() => ({ sid: window.sessionId, tk: window.demoApiKey }));
  console.log('Session:', JSON.stringify(sessionInfo));
  
  // Navigate to slider-test via WS
  await pc.evaluate((sid, tk) => {
    const iframe = document.getElementById('browser-viewer-frame');
    if (iframe?.contentWindow?.BrowserViewer?.instance) {
      iframe.contentWindow.BrowserViewer.instance.send({ type: 'navigate', data: { url: 'http://192.168.0.29:3011/public/slider-test.html' } });
    }
  }, sessionInfo.sid, sessionInfo.tk);
  await new Promise(r => setTimeout(r, 12000));
  await pc.screenshot({ path: 'test-screenshots/quick-verify/02_pc_slider.png' });
  
  // PC slider drag
  await pc.evaluate((sid, tk) => {
    const iframe = document.getElementById('browser-viewer-frame');
    if (iframe?.contentWindow?.BrowserViewer?.instance) {
      const v = iframe.contentWindow.BrowserViewer.instance;
      v.send({ type: 'event', event: { type: 'mousedown', data: { x: 80, y: 285, button: 0 } } });
      for (let x = 80; x <= 600; x += 20) {
        v.send({ type: 'event', event: { type: 'mousemove', data: { x, y: 285 } } });
      }
      v.send({ type: 'event', event: { type: 'mouseup', data: { x: 600, y: 285, button: 0 } } });
    }
  }, sessionInfo.sid, sessionInfo.tk);
  await new Promise(r => setTimeout(r, 3000));
  await pc.screenshot({ path: 'test-screenshots/quick-verify/03_pc_slider_drag.png' });
  
  // === Mobile ===
  const mobile = await browser.newPage();
  await mobile.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15' });
  await mobile.goto('http://192.168.0.29:3011/demo');
  await mobile.waitForSelector('#start-btn', { timeout: 10000 }).catch(() => {});
  await mobile.evaluate(() => { document.querySelector('#start-btn, button')?.click(); });
  await new Promise(r => setTimeout(r, 8000));
  console.log('Mobile URL:', mobile.url());
  await new Promise(r => setTimeout(r, 20000));
  await mobile.screenshot({ path: 'test-screenshots/quick-verify/04_mobile_streaming.png' });
  
  // Mobile navigate to slider-test
  await mobile.evaluate(() => {
    const v = window.BrowserViewer && window.BrowserViewer.instance;
    if (v) v.send({ type: 'navigate', data: { url: 'http://192.168.0.29:3011/public/slider-test.html' } });
  });
  await new Promise(r => setTimeout(r, 12000));
  await mobile.screenshot({ path: 'test-screenshots/quick-verify/05_mobile_slider_page.png' });
  
  // Mobile touch slider
  await mobile.evaluate(() => {
    const v = window.BrowserViewer && window.BrowserViewer.instance;
    if (v) {
      v.send({ type: 'event', event: { type: 'mousedown', data: { x: 50, y: 285, button: 0 } } });
      for (let x = 50; x <= 400; x += 15) {
        v.send({ type: 'event', event: { type: 'mousemove', data: { x, y: 285 } } });
      }
      v.send({ type: 'event', event: { type: 'mouseup', data: { x: 400, y: 285, button: 0 } } });
      v.send({ type: 'event', event: { type: 'click', data: { x: 400, y: 285, button: 0 } } });
    }
  });
  await new Promise(r => setTimeout(r, 3000));
  await mobile.screenshot({ path: 'test-screenshots/quick-verify/06_mobile_slider_drag.png' });
  
  // File upload
  const uploadResult = await pc.evaluate(async (sid, tk) => {
    const blob = new Blob(['Final test file ' + Date.now()], { type: 'text/plain' });
    const fd = new FormData();
    fd.append('file', blob, 'my-test-file.txt');
    fd.append('sessionId', sid);
    const r1 = await fetch('/api/files/upload-session', { method: 'POST', headers: { 'x-api-key': tk }, body: fd });
    const d1 = await r1.json();
    if (!d1.success) return { error: d1 };
    
    const r2 = await fetch('/api/sessions/' + sid + '/inject-file', { method: 'POST', headers: { 'x-api-key': tk, 'content-type': 'application/json' }, body: JSON.stringify({ machineFilePath: d1.data.machineFilePath, selector: '#fileInput' }) });
    const d2 = await r2.json();
    return { upload: d1.success, inject: d2.success, path: d1.data?.machineFilePath };
  }, sessionInfo.sid, sessionInfo.tk);
  console.log('Upload result:', JSON.stringify(uploadResult));
  
  await new Promise(r => setTimeout(r, 5000));
  await pc.screenshot({ path: 'test-screenshots/quick-verify/07_pc_upload.png' });
  
  await browser.close();
  
  const { execSync } = require('child_process');
  try { execSync('open test-screenshots/quick-verify/03_pc_slider_drag.png'); } catch(e) {}
  try { execSync('open test-screenshots/quick-verify/06_mobile_slider_drag.png'); } catch(e) {}
  try { execSync('open test-screenshots/quick-verify/07_pc_upload.png'); } catch(e) {}
})();
