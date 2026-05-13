const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const saveDir = 'test-screenshots/final-verify';

  // ===== PC =====
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  page.on('console', msg => {
    const t = msg.text();
    if (t.includes('[BV]') || t.includes('error') || t.includes('navigate') || t.includes('frame')) {
      console.log('[PC]', t.substring(0, 150));
    }
  });

  console.log('=== PC: Opening Demo ===');
  await page.goto('http://192.168.0.29:3011/demo', { waitUntil: 'networkidle2', timeout: 30000 });
  await page.evaluate(() => document.querySelector('#start-btn, button')?.click());
  await new Promise(r => setTimeout(r, 25000));

  const info = await page.evaluate(() => ({ sessionId: window.sessionId, demoApiKey: window.demoApiKey }));
  console.log('Session:', info.sessionId?.substring(0, 8));

  await page.screenshot({ path: path.join(saveDir, 'pc_01_initial.png') });

  console.log('=== PC: Navigate to slider-test ===');
  await page.evaluate(() => {
    const f = document.getElementById('browser-viewer-frame');
    if (f?.contentWindow?.BrowserViewer?.instance) {
      f.contentWindow.BrowserViewer.instance.send({ type: 'navigate', data: { url: 'http://192.168.0.29:3011/public/slider-test.html' } });
    }
  });
  await new Promise(r => setTimeout(r, 15000));
  await page.screenshot({ path: path.join(saveDir, 'pc_02_slider_page.png') });

  console.log('=== PC: Slider drag (y sweep) ===');

  // y=130
  await page.evaluate(() => {
    const v = document.getElementById('browser-viewer-frame')?.contentWindow?.BrowserViewer?.instance;
    if (!v) return;
    const y = 130;
    const startX = 350;
    const endX = 920;
    v.send({ type: 'event', event: { type: 'mousedown', data: { x: startX, y, button: 0 } } });
    for (let x = startX; x <= endX; x += 10) {
      v.send({ type: 'event', event: { type: 'mousemove', data: { x, y } } });
    }
    v.send({ type: 'event', event: { type: 'mouseup', data: { x: endX, y, button: 0 } } });
  });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(saveDir, 'pc_03_slider_y130.png') });

  // y=160
  await page.evaluate(() => {
    const v = document.getElementById('browser-viewer-frame')?.contentWindow?.BrowserViewer?.instance;
    if (!v) return;
    const y = 160;
    const startX = 350;
    const endX = 920;
    v.send({ type: 'event', event: { type: 'mousedown', data: { x: startX, y, button: 0 } } });
    for (let x = startX; x <= endX; x += 10) {
      v.send({ type: 'event', event: { type: 'mousemove', data: { x, y } } });
    }
    v.send({ type: 'event', event: { type: 'mouseup', data: { x: endX, y, button: 0 } } });
  });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(saveDir, 'pc_04_slider_y160.png') });

  // y=100
  await page.evaluate(() => {
    const v = document.getElementById('browser-viewer-frame')?.contentWindow?.BrowserViewer?.instance;
    if (!v) return;
    const y = 100;
    const startX = 350;
    const endX = 920;
    v.send({ type: 'event', event: { type: 'mousedown', data: { x: startX, y, button: 0 } } });
    for (let x = startX; x <= endX; x += 10) {
      v.send({ type: 'event', event: { type: 'mousemove', data: { x, y } } });
    }
    v.send({ type: 'event', event: { type: 'mouseup', data: { x: endX, y, button: 0 } } });
  });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(saveDir, 'pc_05_slider_y100.png') });

  // Scroll test
  console.log('=== PC: Scroll ===');
  await page.evaluate(() => {
    const v = document.getElementById('browser-viewer-frame')?.contentWindow?.BrowserViewer?.instance;
    if (!v) return;
    for (let i = 0; i < 10; i++) {
      v.send({ type: 'event', event: { type: 'wheel', data: { deltaX: 0, deltaY: 300 } } });
    }
  });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(saveDir, 'pc_06_scroll.png') });

  // File upload test
  console.log('=== PC: File upload ===');
  const uploadResult = await page.evaluate(async (sid, tk) => {
    const blob = new Blob(['Final upload test ' + Date.now()], { type: 'text/plain' });
    const fd = new FormData();
    fd.append('file', blob, 'final-test.txt');
    fd.append('sessionId', sid);
    const r1 = await fetch('/api/files/upload-session', { method: 'POST', headers: { 'x-api-key': tk }, body: fd });
    const d1 = await r1.json();
    if (!d1.success) return { step: 'upload', error: d1.message };
    const r2 = await fetch('/api/sessions/' + sid + '/inject-file', {
      method: 'POST',
      headers: { 'x-api-key': tk, 'content-type': 'application/json' },
      body: JSON.stringify({ machineFilePath: d1.data.machineFilePath, selector: '#fileInput' })
    });
    const d2 = await r2.json();
    return { step: 'inject', success: d2.success, message: d2.message };
  }, info.sessionId, info.demoApiKey);
  console.log('Upload:', JSON.stringify(uploadResult));
  await new Promise(r => setTimeout(r, 5000));
  await page.screenshot({ path: path.join(saveDir, 'pc_07_upload.png') });

  // Copy test (Ctrl+A then Ctrl+C)
  console.log('=== PC: Copy (Ctrl+A, Ctrl+C) ===');
  await page.evaluate(() => {
    const v = document.getElementById('browser-viewer-frame')?.contentWindow?.BrowserViewer?.instance;
    if (!v) return;
    v.send({ type: 'event', event: { type: 'keydown', data: { key: 'a', code: 'KeyA' } } });
    v.send({ type: 'event', event: { type: 'keydown', data: { key: 'c', code: 'KeyC' } } });
  });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(saveDir, 'pc_08_copy.png') });

  // ===== Mobile =====
  console.log('\n=== Mobile ===');
  const mobile = await browser.newPage();
  await mobile.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)' });

  mobile.on('console', msg => {
    const t = msg.text();
    if (t.includes('[BV]') || t.includes('error') || t.includes('navigate')) {
      console.log('[MOBILE]', t.substring(0, 150));
    }
  });

  await mobile.goto('http://192.168.0.29:3011/demo', { waitUntil: 'networkidle2', timeout: 30000 });
  await mobile.evaluate(() => document.querySelector('#start-btn, button')?.click());
  await new Promise(r => setTimeout(r, 8000));
  console.log('Mobile URL after start:', mobile.url());

  await new Promise(r => setTimeout(r, 20000));
  await mobile.screenshot({ path: path.join(saveDir, 'mobile_01_streaming.png') });

  await mobile.evaluate(() => {
    const v = window.BrowserViewer?.instance;
    if (v) v.send({ type: 'navigate', data: { url: 'http://192.168.0.29:3011/public/slider-test.html' } });
  });
  await new Promise(r => setTimeout(r, 15000));
  await mobile.screenshot({ path: path.join(saveDir, 'mobile_02_slider_page.png') });

  await mobile.evaluate(() => {
    const v = window.BrowserViewer?.instance;
    if (!v) return;
    const y = 130;
    const startX = 350;
    const endX = 920;
    v.send({ type: 'event', event: { type: 'mousedown', data: { x: startX, y, button: 0 } } });
    for (let x = startX; x <= endX; x += 10) {
      v.send({ type: 'event', event: { type: 'mousemove', data: { x, y } } });
    }
    v.send({ type: 'event', event: { type: 'mouseup', data: { x: endX, y, button: 0 } } });
  });
  await new Promise(r => setTimeout(r, 3000));
  await mobile.screenshot({ path: path.join(saveDir, 'mobile_03_slider.png') });

  await mobile.evaluate(() => {
    const v = window.BrowserViewer?.instance;
    if (v) {
      for (let i = 0; i < 8; i++) {
        v.send({ type: 'event', event: { type: 'wheel', data: { deltaX: 0, deltaY: 300 } } });
      }
    }
  });
  await new Promise(r => setTimeout(r, 2000));
  await mobile.screenshot({ path: path.join(saveDir, 'mobile_04_scroll.png') });

  const uiElements = await mobile.evaluate(() => ({
    tab: !!document.getElementById('bv-tab-bar'),
    notif: !!document.querySelector('[style*="🔔"]') || document.body.textContent.includes('🔔'),
    upload: !!document.querySelector('[style*="📁"]') || document.body.textContent.includes('📁'),
    status: document.body.textContent.match(/已连接.*FPS/)?.[0] || 'N/A'
  }));
  console.log('Mobile UI:', JSON.stringify(uiElements));

  await browser.close();
  console.log('\nAll screenshots saved to', saveDir);
})();
