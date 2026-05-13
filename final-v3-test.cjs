const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const dir = 'test-screenshots/final-v3';
  const BASE = 'http://192.168.0.29:3011';
  
  // === PC 端 ===
  const pc = await browser.newPage();
  await pc.setViewport({ width: 1280, height: 800 });
  
  console.log('Loading PC demo page...');
  await pc.goto(BASE + '/demo', { waitUntil: 'networkidle2', timeout: 30000 });
  
  console.log('Clicking start...');
  await pc.evaluate(() => {
    const btn = document.querySelector('#start-btn');
    if (btn) btn.click();
  });
  
  // Wait for session creation (check iframe src)
  console.log('Waiting for session and viewer...');
  let info = {};
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    info = await pc.evaluate(() => {
      const frame = document.getElementById('browser-viewer-frame');
      if (frame && frame.src && frame.src.includes('sessionId')) {
        const url = new URL(frame.src);
        return { sid: url.searchParams.get('sessionId'), tk: url.searchParams.get('token'), loaded: true };
      }
      return { sid: null, tk: null, loaded: false };
    });
    if (info.loaded) {
      console.log('Session created:', info.sid?.substring(0, 8));
      break;
    }
    if (i % 5 === 0) console.log(`  [${i * 2}s] waiting...`);
  }
  
  if (!info.sid) {
    console.error('No session created');
    await browser.close();
    process.exit(1);
  }
  
  // Wait for viewer to fully connect
  console.log('Waiting for viewer connection (20s)...');
  await new Promise(r => setTimeout(r, 20000));
  await pc.screenshot({ path: dir + '/pc_00_connected.png' });
  
  // PC: Navigate to slider-test via iframe's BrowserViewer
  console.log('Navigating to slider-test...');
  await pc.evaluate(() => {
    const frame = document.getElementById('browser-viewer-frame');
    if (frame && frame.contentWindow && frame.contentWindow.BrowserViewer && frame.contentWindow.BrowserViewer.instance) {
      frame.contentWindow.BrowserViewer.instance.send({ type: 'navigate', data: { url: 'http://192.168.0.29:3011/public/slider-test.html' } });
    }
  });
  await new Promise(r => setTimeout(r, 12000));
  await pc.screenshot({ path: dir + '/pc_01_slider_page.png' });
  
  // 1. PC Slider drag
  console.log('Test: PC Slider');
  const sliderResult = await pc.evaluate(() => {
    const frame = document.getElementById('browser-viewer-frame');
    const v = frame && frame.contentWindow && frame.contentWindow.BrowserViewer && frame.contentWindow.BrowserViewer.instance;
    if (!v) return 'no viewer instance';
    const y = 130, startX = 350, endX = 920;
    v.send({ type: 'event', event: { type: 'mousedown', data: { x: startX, y, button: 0 } } });
    for (let x = startX; x <= endX; x += 10) v.send({ type: 'event', event: { type: 'mousemove', data: { x, y } } });
    v.send({ type: 'event', event: { type: 'mouseup', data: { x: endX, y, button: 0 } } });
    return 'slider events sent';
  });
  console.log('Slider:', sliderResult);
  await new Promise(r => setTimeout(r, 3000));
  await pc.screenshot({ path: dir + '/pc_02_slider.png' });
  
  // 2. PC File upload
  console.log('Test: PC Upload');
  const uploadResp = await pc.evaluate(async (sid, tk) => {
    try {
      const fd = new FormData();
      fd.append('file', new Blob(['E2E Test ' + Date.now()], { type: 'text/plain' }), 'e2e-file.txt');
      fd.append('sessionId', sid);
      const r1 = await fetch('/api/files/upload-session', { method: 'POST', headers: { 'x-api-key': tk }, body: fd });
      const d1 = await r1.json();
      if (!d1.success) return 'upload_fail: ' + JSON.stringify(d1);
      const r2 = await fetch('/api/sessions/' + sid + '/inject-file', {
        method: 'POST',
        headers: { 'x-api-key': tk, 'content-type': 'application/json' },
        body: JSON.stringify({ machineFilePath: d1.data.machineFilePath, selector: '#fileInput' })
      });
      const d2 = await r2.json();
      return 'inject: success=' + d2.success + ' msg=' + (d2.message || '');
    } catch(e) { return 'error: ' + e.message; }
  }, info.sid, info.tk);
  console.log('Upload:', uploadResp);
  await new Promise(r => setTimeout(r, 5000));
  await pc.screenshot({ path: dir + '/pc_03_upload.png' });
  
  // 3. PC Copy (Ctrl+A, Ctrl+C)
  console.log('Test: PC Copy');
  const copyResult = await pc.evaluate(() => {
    const frame = document.getElementById('browser-viewer-frame');
    const v = frame && frame.contentWindow && frame.contentWindow.BrowserViewer && frame.contentWindow.BrowserViewer.instance;
    if (!v) return 'no viewer';
    v.send({ type: 'event', event: { type: 'keydown', data: { key: 'Control', code: 'ControlLeft' } } });
    v.send({ type: 'event', event: { type: 'keydown', data: { key: 'a', code: 'KeyA', ctrlKey: true } } });
    v.send({ type: 'event', event: { type: 'keyup', data: { key: 'a', code: 'KeyA', ctrlKey: true } } });
    v.send({ type: 'event', event: { type: 'keydown', data: { key: 'c', code: 'KeyC', ctrlKey: true } } });
    v.send({ type: 'event', event: { type: 'keyup', data: { key: 'c', code: 'KeyC', ctrlKey: true } } });
    v.send({ type: 'event', event: { type: 'keyup', data: { key: 'Control', code: 'ControlLeft' } } });
    return 'copy events sent';
  });
  console.log('Copy:', copyResult);
  await new Promise(r => setTimeout(r, 3000));
  await pc.screenshot({ path: dir + '/pc_04_copy.png' });
  
  // Check if page is still alive after Ctrl+C
  const alive = await pc.evaluate(() => document.title);
  console.log('Page still alive:', alive);
  
  // === Mobile ===
  console.log('\n=== Mobile Tests ===');
  const mobile = await browser.newPage();
  await mobile.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
  await mobile.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15');
  
  console.log('Loading mobile demo...');
  await mobile.goto(BASE + '/demo', { waitUntil: 'networkidle2', timeout: 30000 });
  await mobile.evaluate(() => {
    const btn = document.querySelector('#start-btn');
    if (btn) btn.click();
  });
  
  // Mobile should redirect to browser-viewer
  await mobile.waitForFunction(() => window.location.pathname.includes('browser-viewer'), { timeout: 30000 }).catch(() => {});
  const mobileUrl = mobile.url();
  console.log('Mobile URL:', mobileUrl);
  
  let mobileInfo = {};
  try {
    const mUrl = new URL(mobileUrl);
    mobileInfo = { sid: mUrl.searchParams.get('sessionId'), tk: mUrl.searchParams.get('token') };
  } catch(e) {}
  
  if (!mobileInfo.sid) {
    // Maybe same-page mode for mobile too? Try checking for viewer
    console.log('No redirect, checking for in-page viewer...');
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 2000));
      mobileInfo = await mobile.evaluate(() => {
        const v = window.BrowserViewer && window.BrowserViewer.instance;
        if (v) {
          const url = new URL(window.location.href);
          return { sid: url.searchParams.get('sessionId'), tk: url.searchParams.get('token') };
        }
        return {};
      });
      if (mobileInfo.sid) break;
    }
  }
  
  console.log('Mobile session:', mobileInfo.sid?.substring(0, 8) || 'none');
  
  // Wait for mobile viewer
  await new Promise(r => setTimeout(r, 20000));
  await mobile.screenshot({ path: dir + '/mobile_01_streaming.png' });
  
  // Navigate to slider-test on mobile
  const navResult = await mobile.evaluate(() => {
    const v = window.BrowserViewer && window.BrowserViewer.instance;
    if (v) {
      v.send({ type: 'navigate', data: { url: 'http://192.168.0.29:3011/public/slider-test.html' } });
      return 'navigated';
    }
    return 'no viewer';
  });
  console.log('Mobile navigate:', navResult);
  await new Promise(r => setTimeout(r, 12000));
  await mobile.screenshot({ path: dir + '/mobile_02_slider_page.png' });
  
  // Mobile slider
  const mobileSlider = await mobile.evaluate(() => {
    const v = window.BrowserViewer && window.BrowserViewer.instance;
    if (!v) return 'no viewer';
    const y = 130, startX = 350, endX = 920;
    v.send({ type: 'event', event: { type: 'mousedown', data: { x: startX, y, button: 0 } } });
    for (let x = startX; x <= endX; x += 10) v.send({ type: 'event', event: { type: 'mousemove', data: { x, y } } });
    v.send({ type: 'event', event: { type: 'mouseup', data: { x: endX, y, button: 0 } } });
    return 'sent';
  });
  console.log('Mobile slider:', mobileSlider);
  await new Promise(r => setTimeout(r, 3000));
  await mobile.screenshot({ path: dir + '/mobile_03_slider.png' });
  
  // Mobile UI check
  const ui = await mobile.evaluate(() => {
    const text = document.body.textContent || '';
    return {
      connected: text.includes('已连接'),
      fps: text.match(/\d+\s*FPS/)?.[0] || 'N/A',
      tabBar: !!document.getElementById('bv-tab-bar'),
      uploadBtn: text.includes('📁'),
      backLink: text.includes('返回 Demo')
    };
  });
  console.log('Mobile UI:', JSON.stringify(ui));
  
  await browser.close();
  
  console.log('\n=== Opening screenshots ===');
  const { execSync } = require('child_process');
  ['pc_02_slider.png', 'pc_03_upload.png', 'mobile_01_streaming.png', 'mobile_03_slider.png'].forEach(f => {
    try { execSync('open ' + dir + '/' + f); } catch(e) {}
  });
  
  console.log('\n=== ALL TESTS COMPLETE ===');
})().catch(e => { console.error(e); process.exit(1); });
