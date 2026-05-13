const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const BASE = 'http://192.168.0.29:3011';

  await page.goto(BASE + '/demo', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#start-btn', { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => { document.querySelector('#start-btn, button')?.click(); });

  let info = { sid: null, tk: null };
  for (let i = 0; i < 45; i++) {
    const c = await page.evaluate(() => ({
      sid: typeof sessionId !== 'undefined' && sessionId !== null ? sessionId : null,
      tk: typeof demoApiKey !== 'undefined' && demoApiKey !== null ? demoApiKey : null,
    }));
    if (c.sid) { info = c; break; }
    await new Promise(r => setTimeout(r, 1000));
  }
  if (!info.sid) { console.log('No session'); await browser.close(); return; }

  for (let wait = 0; wait < 60; wait++) {
    if (await page.evaluate(() => !!(document.getElementById('browser-viewer-frame')?.contentWindow?.BrowserViewer?.instance))) break;
    await new Promise(r => setTimeout(r, 1000));
  }

  async function navigateSlider() {
    await page.evaluate((base) => {
      const f = document.getElementById('browser-viewer-frame');
      if (f?.contentWindow?.BrowserViewer?.instance)
        f.contentWindow.BrowserViewer.instance.send({ type: 'navigate', data: { url: base + '/public/slider-test.html' } });
    }, BASE);
    await new Promise(r => setTimeout(r, 15000));
  }

  // === APPROACH 1: Direct page.evaluate on the remote browser ===
  // Inject JS into the remote browser page via the session/inject mechanism
  // Use the demo API to directly call page.evaluate on the remote browser
  async function evalInRemote(jsCode) {
    // This calls the session's page.evaluate via the inject API's evaluate endpoint
    // But there's no such endpoint... We'd need Puppeteer access to the page.
    // Actually the BrowserViewer sends navigate commands, but we need a different approach.
    return null;
  }

  // === APPROACH 2: Send mousedown directly via Puppeteer's CDP ===
  // The session's page is running in the machine service. We can't access it directly.
  
  // === APPROACH 3: Use the inject-file API to inject a script that triggers handleFiles ===
  // And for the slider, send mousedown at the CORRECT coordinates by
  // first checking the actual element positions using the remote browser's JS

  // Let me first check what coordinates would hit the slider thumb
  // by evaluating JS in the remote browser page
  // (via the demo API proxy or the events WebSocket)

  // Actually, let me try approach: send events directly through the events WebSocket
  // with the correct viewport coordinates.
  
  // The key question: what are the actual viewport coordinates of the slider thumb?
  // Let me use a carefully calculated position and debug with screenshots.
  
  // Body: max-width:600px; margin:0 auto; padding:20px; background:#f0f2f5
  // In a 1280px viewport, body starts at (1280-600)/2 = 340px
  // Content area: 340+20=360 to 340+600-20=920 (560px wide)
  
  // h1: font-size:22px, margin-bottom:20px
  // slider-container: padding:24px
  // h2 inside: font-size:16px, margin:20px 0 10px
  // p: font-size:13px, margin-bottom:8px
  // track: margin:16px 0, height:50px
  
  // Total Y from body top to track top:
  // 20(body pt) + 22(h1) + 20(h1 mb) + 24(container pt) + 20(h2 mt) + 16(h2) + 10(h2 mb) + 8(p mb) + 13(p) + 16(track mt)
  // = 169px → track center Y = 169 + 25 = 194
  
  // BUT: the h1 line-height might be different. font-size:22px with default line-height ≈ 28-30px.
  // Let me recalculate: 20(pt) + 28(h1 lh) + 20(mb) + 24(pt) + 20(h2 mt) + 20(h2 lh) + 10(mb) + 8(p mb) + 16(p lh) + 16(track mt)
  // = 182px → thumb center at 182 + 25 = 207
  
  // Let me cast a wider net: try mousedown across the ENTIRE track region
  // at multiple x and y positions in ONE single drag sequence
  
  async function fastDrag(sx, sy, ex, ey, steps, label) {
    await page.evaluate((args) => {
      const v = document.getElementById('browser-viewer-frame')?.contentWindow?.BrowserViewer?.instance;
      if (!v) return;
      const { sx, sy, ex, ey, steps } = args;
      const ssx = (ex - sx) / steps;
      const ssy = (ey - sy) / steps;
      v.send({ type: 'event', event: { type: 'mousedown', data: { x: sx, y: sy, button: 0 } } });
      for (let i = 1; i <= steps; i++)
        v.send({ type: 'event', event: { type: 'mousemove', data: { x: Math.round(sx + ssx * i), y: Math.round(sy + ssy * i), button: 0 } } });
      v.send({ type: 'event', event: { type: 'mouseup', data: { x: ex, y: ey, button: 0 } } });
    }, { sx, sy, ex, ey, steps });
    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({ path: `test-screenshots/quick-verify/${label}.png` });
    console.log(`Drag ${label}: (${sx},${sy})→(${ex},${ey})`);
  }

  // Load slider page
  await navigateSlider();
  await page.screenshot({ path: 'test-screenshots/quick-verify/z0_init.png' });

  // Try: thumb visual area should be around x=384-409, y=180-220
  // Let me try mousedown at the EXACT center of the thumb's visual area
  // and drag far right
  
  // Visual thumb bounds: x=384 to x=409, y=173 to y=223 (matches track)
  // Click center: x=396, y=198
  
  // Try 1: center of visible thumb, drag to viewport right edge
  await fastDrag(396, 198, 1200, 198, 50, 'z1_ctr');
  
  // If slider still doesn't respond, the issue is NOT coordinate-related
  // Let me also check if the injection fix works for file upload
  // by calling the inject-file API
  
  // Upload
  console.log('Uploading...');
  const up = await page.evaluate(async (sid, tk, base) => {
    try {
      const blob = new Blob(['Upload test ' + Date.now()], { type: 'text/plain' });
      const fd = new FormData();
      fd.append('file', blob, 'my-upload.txt');
      fd.append('sessionId', sid);
      const r1 = await fetch(base + '/api/files/upload-session', { method: 'POST', headers: { 'x-api-key': tk }, body: fd });
      const d1 = await r1.json();
      if (!d1.success) return { error: 'upload', detail: d1 };
      const r2 = await fetch(base + '/api/sessions/' + sid + '/inject-file', { method: 'POST', headers: { 'x-api-key': tk, 'content-type': 'application/json' }, body: JSON.stringify({ machineFilePath: d1.data.machineFilePath, selector: '#fileInput' }) });
      const d2 = await r2.json();
      return { upload: d1.success, inject: d2.success, detail: d2 };
    } catch(e) { return { error: e.message }; }
  }, info.sid, info.tk, BASE);
  console.log('Upload:', JSON.stringify(up));
  await new Promise(r => setTimeout(r, 5000));
  await page.screenshot({ path: 'test-screenshots/quick-verify/z2_upload.png' });

  // Open screenshots
  const { execSync } = require('child_process');
  try { execSync('open test-screenshots/quick-verify/z0_init.png'); } catch(e) {}
  try { execSync('open test-screenshots/quick-verify/z1_ctr.png'); } catch(e) {}
  try { execSync('open test-screenshots/quick-verify/z2_upload.png'); } catch(e) {}

  await browser.close();
})();
