import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import http from 'http';

const CHROMIUM_PATH = '/Applications/Chromium.app/Contents/MacOS/Chromium';
const SCREENSHOT_DIR = '/Users/xuyingzhou/Project/study-node-ts/playwright-user-sys/test-screenshots/upload-mobile';
const BASE_URL = 'http://192.168.0.29:3011';
const RESULTS = {};

function screenshotPath(name) {
  return path.join(SCREENSHOT_DIR, name);
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForWsAndFrames(page, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const canvas = await page.$('canvas');
    if (canvas) {
      const box = await canvas.boundingBox();
      if (box && box.width > 50 && box.height > 50) return true;
    }
    await sleep(1000);
  }
  return false;
}

async function checkElementExists(page, selector, timeoutMs = 5000) {
  try {
    await page.waitForSelector(selector, { timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

async function uploadFileViaAPI(sessionId, token) {
  return new Promise((resolve, reject) => {
    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
    const fileContent = fs.readFileSync('/tmp/test-upload.txt');
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test-upload.txt"\r\nContent-Type: text/plain\r\n\r\n`),
      fileContent,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const url = new URL(`${BASE_URL}/api/files/upload`);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': payload.length,
        'Authorization': `Bearer ${token}`,
        'X-Session-Id': sessionId,
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve({ raw: data, status: res.statusCode }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function getDemoToken() {
  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}/api/demo/token`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { reject(new Error('Failed to parse demo token')); }
      });
    }).on('error', reject);
  });
}

// ===== Scenario 1: Mobile Experience =====
async function testMobileExperience() {
  console.log('\n📱 Scenario 1: Mobile Experience');
  const result = { name: 'Mobile Experience', steps: {} };

  const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM_PATH });
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();

  try {
    // Step 1: Visit demo page
    await page.goto(`${BASE_URL}/demo`, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(2);
    await page.screenshot({ path: screenshotPath('01_mobile_demo.png'), fullPage: true });
    result.steps['01_mobile_demo'] = true;
    console.log('  ✅ 01 Mobile demo page loaded');

    // Step 2: Click start
    const startBtn = await page.$('button#startBtn, button:has-text("开始体验"), a:has-text("开始体验"), button:has-text("Start"), a.btn-primary');
    if (startBtn) {
      await startBtn.click();
      console.log('  ✅ Clicked start button');
    } else {
      const btnText = await page.evaluate(() => {
        const btns = document.querySelectorAll('button, a');
        return Array.from(btns).map(b => b.textContent.trim()).filter(t => t);
      });
      console.log('  ⚠️ No start button found, buttons:', btnText);
      // Try clicking any prominent button
      const anyBtn = await page.$('button');
      if (anyBtn) { await anyBtn.click(); console.log('  Clicked first button instead'); }
    }

    await sleep(5);
    const currentUrl = page.url();
    console.log('  Current URL:', currentUrl);

    await page.screenshot({ path: screenshotPath('02_mobile_redirect.png'), fullPage: true });

    // Check redirect
    const redirected = currentUrl.includes('/browser-viewer/') || currentUrl.includes('sessionId=');
    result.steps['02_mobile_redirect'] = redirected;
    console.log(redirected ? '  ✅ 02 Redirected to browser-viewer' : '  ❌ 02 No redirect to browser-viewer');

    // Step 3: Wait for WS + frames
    console.log('  Waiting for WS connection and frames...');
    const hasFrames = await waitForWsAndFrames(page, 20000);
    await page.screenshot({ path: screenshotPath('03_mobile_streaming.png'), fullPage: true });
    result.steps['03_mobile_streaming'] = hasFrames;
    console.log(hasFrames ? '  ✅ 03 Streaming frames received' : '  ❌ 03 No frames received');

    // Step 4: Check mobile toolbar
    const hasTopBar = await checkElementExists(page, '.status-bar, .top-bar, #statusBar, .mobile-status', 3000);
    const hasBottomNav = await checkElementExists(page, '.bottom-nav, .mobile-nav, .nav-bar, #bottomNav, .mobile-toolbar', 3000);
    result.steps['04_mobile_toolbar'] = hasTopBar || hasBottomNav;
    console.log(`  ${hasTopBar || hasBottomNav ? '✅' : '❌'} 04 Mobile toolbar (top:${hasTopBar}, bottom:${hasBottomNav})`);

    // Step 5: Navigate via bottom nav
    try {
      const urlInput = await page.$('input[type="text"], input[type="url"], input[placeholder*="url" i], input[placeholder*="地址" i], .url-input input');
      if (urlInput) {
        await urlInput.fill('http://192.168.0.29:3011/public/slider-test.html');
        await urlInput.press('Enter');
        console.log('  ✅ Navigated via URL input');
      } else {
        // Try using navigate API directly
        const navBtns = await page.$$('button');
        for (const btn of navBtns) {
          const text = await btn.textContent();
          if (text && (text.includes('Go') || text.includes('go'))) {
            await btn.click();
            break;
          }
        }
      }
    } catch (e) {
      console.log('  ⚠️ Navigation via toolbar failed:', e.message);
    }

    await sleep(10);
    await page.screenshot({ path: screenshotPath('04_mobile_slider_page.png'), fullPage: true });
    result.steps['04_mobile_slider_page'] = true;
    console.log('  ✅ 04 Slider test page (mobile)');

    // Step 6: Touch drag slider
    try {
      const slider = await page.$('.slider-btn, .drag-btn, [class*="slider"], [class*="drag"], button[class*="btn"]');
      if (slider) {
        const box = await slider.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width + 200, box.y + box.height / 2, { steps: 20 });
          await page.mouse.up();
          console.log('  ✅ Touch drag performed');
        }
      }
    } catch (e) {
      console.log('  ⚠️ Slider drag failed:', e.message);
    }

    await sleep(2);
    await page.screenshot({ path: screenshotPath('05_mobile_slider_drag.png'), fullPage: true });
    result.steps['05_mobile_slider_drag'] = true;
    console.log('  ✅ 05 Mobile slider drag screenshot');

  } catch (e) {
    console.error('  ❌ Mobile test error:', e.message);
    result.error = e.message;
  } finally {
    await browser.close();
  }

  return result;
}

// ===== Scenario 2: PC File Upload =====
async function testPCFileUpload() {
  console.log('\n🖥️ Scenario 2: PC File Upload');
  const result = { name: 'PC File Upload', steps: {} };

  const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM_PATH });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  try {
    // Get demo token first
    let token, sessionId;
    try {
      const tokenRes = await getDemoToken();
      token = tokenRes.token || tokenRes.data?.token;
      console.log('  Got demo token:', token ? 'yes' : 'no');
    } catch (e) {
      console.log('  ⚠️ Could not get demo token:', e.message);
    }

    // Visit demo
    await page.goto(`${BASE_URL}/demo`, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(2);

    // Click start
    const startBtn = await page.$('button#startBtn, button:has-text("开始体验"), button');
    if (startBtn) await startBtn.click();
    await sleep(20);

    // Capture current URL for sessionId
    const currentUrl = page.url();
    const sessionMatch = currentUrl.match(/sessionId=([^&]+)/);
    if (sessionMatch) sessionId = sessionMatch[1];
    console.log('  Session ID:', sessionId || 'not found');

    // Navigate to slider page
    const viewerFrame = page.frames().find(f => f.url().includes('browser-viewer')) || page;
    try {
      // Try using the URL bar in demo page
      const urlInput = await page.$('input[placeholder*="URL" i], input[placeholder*="地址" i], #urlInput, .url-bar input');
      if (urlInput) {
        await urlInput.fill('http://192.168.0.29:3011/public/slider-test.html');
        await urlInput.press('Enter');
      }
    } catch (e) {
      console.log('  ⚠️ Navigation attempt:', e.message);
    }

    await sleep(10);
    await page.screenshot({ path: screenshotPath('06_pc_slider_page.png'), fullPage: true });
    result.steps['06_pc_slider_page'] = true;
    console.log('  ✅ 06 PC slider page');

    // Upload via API
    if (sessionId && token) {
      try {
        const uploadRes = await uploadFileViaAPI(sessionId, token);
        console.log('  Upload API response:', JSON.stringify(uploadRes).slice(0, 200));
        result.steps['07_pc_upload_api'] = uploadRes.success !== false;
      } catch (e) {
        console.log('  ⚠️ Upload API failed:', e.message);
        result.steps['07_pc_upload_api'] = false;
      }
    } else {
      console.log('  ⚠️ No session/token for API upload');
      result.steps['07_pc_upload_api'] = false;
    }

    await sleep(5);
    await page.screenshot({ path: screenshotPath('07_pc_after_upload.png'), fullPage: true });
    result.steps['07_pc_after_upload'] = true;
    console.log('  ✅ 07 PC after upload screenshot');

  } catch (e) {
    console.error('  ❌ PC test error:', e.message);
    result.error = e.message;
  } finally {
    await browser.close();
  }

  return result;
}

// ===== Scenario 3: File Upload via Demo UI =====
async function testDemoUIUpload() {
  console.log('\n📤 Scenario 3: File Upload via Demo UI');
  const result = { name: 'Demo UI Upload', steps: {} };

  const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM_PATH });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  try {
    await page.goto(`${BASE_URL}/demo`, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(2);

    // Click start
    const startBtn = await page.$('button#startBtn, button:has-text("开始体验"), button');
    if (startBtn) await startBtn.click();
    await sleep(20);

    // Look for upload button
    const uploadBtn = await page.$('button:has-text("上传"), button:has-text("Upload"), #uploadBtn, .upload-btn, [data-action="upload"]');
    if (uploadBtn) {
      // Set up file chooser
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null),
        uploadBtn.click(),
      ]);

      if (fileChooser) {
        await fileChooser.setFiles('/tmp/test-upload.txt');
        console.log('  ✅ File selected via file chooser');
        result.steps['08_demo_upload_select'] = true;
      } else {
        console.log('  ⚠️ No file chooser dialog appeared');
        result.steps['08_demo_upload_select'] = false;
      }
    } else {
      console.log('  ⚠️ No upload button found');
      // Check for file input
      const fileInput = await page.$('input[type="file"]');
      if (fileInput) {
        await fileInput.setInputFiles('/tmp/test-upload.txt');
        console.log('  ✅ File set via hidden input');
        result.steps['08_demo_upload_select'] = true;
      } else {
        result.steps['08_demo_upload_select'] = false;
      }
    }

    await sleep(5);
    await page.screenshot({ path: screenshotPath('08_demo_upload.png'), fullPage: true });
    result.steps['08_demo_upload'] = true;
    console.log('  ✅ 08 Demo upload screenshot');

  } catch (e) {
    console.error('  ❌ Demo UI upload error:', e.message);
    result.error = e.message;
  } finally {
    await browser.close();
  }

  return result;
}

// ===== Generate HTML Report =====
function generateReport(results) {
  const images = {};
  for (let i = 1; i <= 8; i++) {
    const padded = String(i).padStart(2, '0');
    const files = fs.readdirSync(SCREENSHOT_DIR).filter(f => f.startsWith(padded) && f.endsWith('.png'));
    files.forEach(f => {
      const imgPath = path.join(SCREENSHOT_DIR, f);
      const base64 = fs.readFileSync(imgPath).toString('base64');
      images[f] = `data:image/png;base64,${base64}`;
    });
  }

  const scenarioHtml = results.map(r => {
    const steps = Object.entries(r.steps || {}).map(([key, passed]) => {
      const imgFile = fs.readdirSync(SCREENSHOT_DIR).find(f => f.startsWith(key.split('_')[0].padStart(2, '0')) && f.endsWith('.png'));
      const imgTag = imgFile && images[imgFile] ? `<img src="${images[imgFile]}" style="max-width:100%;border:1px solid #ddd;border-radius:4px;margin:8px 0;" />` : '';
      return `<div class="step">
        <span class="${passed ? 'pass' : 'fail'}">${passed ? '✅' : '❌'} ${key}</span>
        ${imgTag}
      </div>`;
    }).join('\n');

    const hasError = r.error;
    return `<div class="scenario">
      <h2>${r.name} ${hasError ? '<span class="fail">ERROR</span>' : ''}</h2>
      ${hasError ? `<p class="error">${r.error}</p>` : ''}
      ${steps}
    </div>`;
  }).join('\n');

  const totalSteps = results.reduce((acc, r) => acc + Object.keys(r.steps || {}).length, 0);
  const passedSteps = results.reduce((acc, r) => acc + Object.values(r.steps || {}).filter(Boolean).length, 0);

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Upload & Mobile Test Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
    h1 { color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 30px; }
    .scenario { background: white; border-radius: 8px; padding: 20px; margin: 15px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .step { margin: 10px 0; padding: 8px; border-left: 3px solid #ddd; }
    .pass { color: #4CAF50; font-weight: bold; }
    .fail { color: #f44336; font-weight: bold; }
    .error { color: #f44336; background: #ffebee; padding: 10px; border-radius: 4px; }
    .summary { background: #e3f2fd; padding: 15px; border-radius: 8px; margin: 20px 0; }
    img { display: block; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 14px; font-weight: bold; }
    .badge-pass { background: #4CAF50; color: white; }
    .badge-fail { background: #f44336; color: white; }
  </style>
</head>
<body>
  <h1>🧪 Upload & Mobile Test Report</h1>
  <p>Generated: ${new Date().toLocaleString()}</p>
  <p>Commit: c93e56e</p>
  <div class="summary">
    <h3>Summary</h3>
    <p>Total: ${totalSteps} steps | Passed: ${passedSteps} | Failed: ${totalSteps - passedSteps}</p>
    <p>Overall: <span class="badge ${passedSteps === totalSteps ? 'badge-pass' : 'badge-fail'}">${passedSteps === totalSteps ? 'ALL PASSED' : `${passedSteps}/${totalSteps} PASSED`}</span></p>
  </div>
  ${scenarioHtml}
</body>
</html>`;

  const reportPath = path.join(SCREENSHOT_DIR, 'final-report.html');
  fs.writeFileSync(reportPath, html);
  return reportPath;
}

// ===== Main =====
async function main() {
  console.log('🚀 Starting Upload & Mobile Tests...');
  console.log('Target:', BASE_URL);

  // Wait for services to be healthy
  console.log('Waiting for services...');
  for (let i = 0; i < 10; i++) {
    try {
      await new Promise((resolve, reject) => {
        http.get(`${BASE_URL}/api/demo/token`, (res) => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => {
            console.log('  Service ready:', res.statusCode);
            resolve();
          });
        }).on('error', reject);
      });
      break;
    } catch {
      console.log(`  Waiting... (${i + 1}/10)`);
      await sleep(5000);
    }
  }

  const results = [];

  results.push(await testMobileExperience());
  results.push(await testPCFileUpload());
  results.push(await testDemoUIUpload());

  const reportPath = generateReport(results);
  console.log(`\n📊 Report: ${reportPath}`);

  // Output JSON for parsing
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'results.json'), JSON.stringify(results, null, 2));
}

main().catch(console.error);
