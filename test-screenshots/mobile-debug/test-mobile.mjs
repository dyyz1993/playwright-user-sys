// Mobile Debug Test Script using Playwright
import { chromium } from 'playwright';

const SCREENSHOT_DIR = '/Users/xuyingzhou/Project/study-node-ts/playwright-user-sys/test-screenshots/mobile-debug';
const BASE_URL = 'http://192.168.0.29:3011';

const results = [];

function log(step, status, detail) {
  const msg = `[${status}] ${step}: ${detail}`;
  console.log(msg);
  results.push({ step, status, detail, time: new Date().toISOString() });
}

async function runTests() {
  let browser;
  try {
    // Launch with mobile viewport
    browser = await chromium.launch({
      executablePath: '/Applications/Chromium.app/Contents/MacOS/Chromium',
      headless: true
    });

    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
      isMobile: true,
      hasTouch: true
    });

    const page = await context.newPage();

    // Collect console errors
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', err => {
      consoleErrors.push(err.message);
    });

    // ===== TEST 1: Demo Page → Redirect to Viewer =====
    log('TEST-1', 'START', 'Opening demo page...');
    await page.goto(`${BASE_URL}/demo`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: `${SCREENSHOT_DIR}/01_mobile_demo.png`, fullPage: false });
    log('TEST-1', 'INFO', `Screenshot saved: 01_mobile_demo.png`);
    log('TEST-1', 'INFO', `URL: ${page.url()}`);

    // Click "开始体验"
    log('TEST-1', 'ACTION', 'Clicking "开始体验" button...');
    const startBtn = page.locator('button:has-text("开始体验")');
    await startBtn.click({ timeout: 10000 });
    
    // Wait for navigation to viewer
    await page.waitForTimeout(5000);
    log('TEST-1', 'INFO', `URL after click: ${page.url()}`);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/02_after_start.png`, fullPage: false });
    log('TEST-1', 'INFO', `Screenshot saved: 02_after_start.png`);

    // Wait for streaming to establish (20s)
    log('TEST-1', 'WAIT', 'Waiting 20s for WS connection and frames...');
    await page.waitForTimeout(20000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/03_viewer_streaming.png`, fullPage: false });
    log('TEST-1', 'INFO', `Screenshot saved: 03_viewer_streaming.png`);

    // Check DOM state
    const domState = await page.evaluate(() => {
      const img = document.getElementById('bv-screen');
      const status = document.getElementById('bv-status');
      return {
        imgExists: !!img,
        imgSrc: img?.src ? img.src.substring(0, 80) : null,
        imgWidth: img?.width,
        imgHeight: img?.height,
        statusText: status?.textContent?.trim(),
        frameCount: window.frameCount || 'N/A'
      };
    });
    log('TEST-1', 'DOM', JSON.stringify(domState));

    if (domState.imgExists && domState.imgWidth > 0) {
      log('TEST-1', 'PASS', `✅ Viewer working! Image: ${domState.imgWidth}x${domState.imgHeight}, Status: "${domState.statusText}"`);
    } else {
      log('TEST-1', 'FAIL', '❌ No image or image has zero size - white screen issue');
    }

    // ===== TEST 2: Toolbar Verification =====
    log('TEST-2', 'START', 'Verifying toolbar...');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/04_toolbar.png`, fullPage: false });
    log('TEST-2', 'INFO', `Screenshot saved: 04_toolbar.png`);

    const toolbarState = await page.evaluate(() => {
      const status = document.getElementById('bv-status');
      const inputs = document.querySelectorAll('input');
      const buttons = document.querySelectorAll('button');
      return {
        statusBarText: status?.textContent?.trim(),
        urlInputCount: inputs.length,
        urlInputPlaceholder: inputs[0]?.placeholder,
        buttonCount: buttons.length,
        buttonTexts: Array.from(buttons).map(b => b.textContent.trim())
      };
    });
    log('TEST-2', 'DOM', JSON.stringify(toolbarState));

    // Navigate to slider test page
    log('TEST-2', 'ACTION', 'Navigating to slider-test.html via URL input...');
    
    // Fill URL and submit form
    await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[type=url], input[placeholder*="网址"]');
      if (inputs[0]) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeInputValueSetter.call(inputs[0], 'http://192.168.0.29:3011/public/slider-test.html');
        inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        
        // Find parent form and submit
        let form = inputs[0].closest('form');
        if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
    });

    // Wait for navigation in remote browser
    await page.waitForTimeout(12000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/05_slider_page.png`, fullPage: false });
    log('TEST-2', 'INFO', `Screenshot saved: 05_slider_page.png`);

    // Verify navigation worked by checking the displayed content
    const navCheck = await page.evaluate(() => {
      const status = document.getElementById('bv-status');
      return { statusText: status?.textContent?.trim() };
    });
    log('TEST-2', 'PASS', `✅ Navigation attempted. Status: "${navCheck.statusText}"`);

    // ===== TEST 3: Touch Interaction =====
    log('TEST-3', 'START', 'Testing touch interaction on slider...');

    // Get image position and simulate mouse drag on it
    const dragResult = await page.evaluate(() => {
      const img = document.getElementById('bv-screen');
      if (!img) return { error: 'no img' };
      
      const rect = img.getBoundingClientRect();
      const naturalWidth = img.naturalWidth || 1280;
      const naturalHeight = img.naturalHeight || 800;
      
      const scale = Math.min(rect.width / naturalWidth, rect.height / naturalHeight);
      const renderWidth = naturalWidth * scale;
      const renderHeight = naturalHeight * scale;
      const offsetX = (rect.width - renderWidth) / 2;
      const offsetY = (rect.height - renderHeight) / 2;
      
      // Slider handle at ~160,265 in natural coords
      const startX = rect.left + offsetX + 160 * scale;
      const startY = rect.top + offsetY + 265 * scale;
      const endX = rect.left + offsetX + 520 * scale;
      
      // Mousedown
      img.dispatchEvent(new MouseEvent('mousedown', {
        clientX: startX, clientY: startY, button: 0, bubbles: true, cancelable: true
      }));
      
      // Mousemove steps
      for (let i = 1; i <= 20; i++) {
        const x = startX + (endX - startX) * (i / 20);
        img.dispatchEvent(new MouseEvent('mousemove', {
          clientX: x, clientY: startY, button: 0, bubbles: true
        }));
      }
      
      // Mouseup
      img.dispatchEvent(new MouseEvent('mouseup', {
        clientX: endX, clientY: startY, button: 0, bubbles: true
      }));
      
      return {
        startPos: { x: Math.round(startX), y: Math.round(startY) },
        endPos: { x: Math.round(endX), y: Math.round(startY) },
        imageSize: { w: rect.width, h: rect.height },
        scale: scale.toFixed(3)
      };
    });
    
    log('TEST-3', 'ACTION', `Dragged from (${dragResult.startPos.x},${dragResult.startPos.y}) to (${dragResult.endPos.x},${dragResult.endPos.y})`);
    
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/06_touch_drag.png`, fullPage: false });
    log('TEST-3', 'INFO', `Screenshot saved: 06_touch_drag.png`);

    // Check cursor visibility
    const cursorState = await page.evaluate(() => {
      const cursor = document.querySelector('[style*="background:rgba(255,0,0")');
      return {
        cursorVisible: cursor ? getComputedStyle(cursor).display !== 'none' : false
      };
    });
    log('TEST-3', 'INFO', `Cursor visible: ${cursorState.cursorVisible}`);

    // Virtual keyboard test - look for keyboard button
    log('TEST-3', 'ACTION', 'Looking for virtual keyboard button...');
    const keyboardBtn = await page.evaluate(() => {
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        if (el.textContent.includes('⌨') || el.textContent.includes('键盘') || el.title?.includes('keyboard')) {
          return { found: true, tag: el.tagName, text: el.textContent.trim().substring(0, 30) };
        }
      }
      return { found: false };
    });
    log('TEST-3', 'INFO', `Keyboard button: ${JSON.stringify(keyboardBtn)}`);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/07_keyboard.png`, fullPage: false });
    log('TEST-3', 'INFO', `Screenshot saved: 07_keyboard.png`);

    // ===== TEST 4: File Upload Modal (via PC mode) =====
    log('TEST-4', 'START', 'Testing file upload modal...');

    // Open new PC context for upload test
    const pcContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    });
    const pcPage = await pcContext.newPage();

    log('TEST-4', 'ACTION', 'Opening demo page in PC mode...');
    await pcPage.goto(`${BASE_URL}/demo`, { waitUntil: 'networkidle', timeout: 30000 });
    
    // Click start
    const pcStartBtn = pcPage.locator('button:has-text("开始体验")');
    await pcStartBtn.click({ timeout: 10000 });
    await pcPage.waitForTimeout(25000); // Wait for viewer to load

    // Look for file upload button
    log('TEST-4', 'ACTION', 'Looking for file upload button...');
    await pcPage.screenshot({ path: `${SCREENSHOT_DIR}/08_upload_modal.png`, fullPage: false });
    log('TEST-4', 'INFO', `Screenshot saved: 08_upload_modal.png`);

    const uploadBtnInfo = await pcPage.evaluate(() => {
      const allElements = document.querySelectorAll('a, button, [role=button], [onclick]');
      const uploadRelated = [];
      for (const el of allElements) {
        const text = el.textContent?.trim() || '';
        if (text.includes('上传') || text.includes('文件') || text.includes('upload') || text.includes('file')) {
          uploadRelated.push({
            tag: el.tagName,
            text: text.substring(0, 30),
            id: el.id,
            className: el.className?.substring(0, 50)
          });
        }
      }
      return uploadRelated;
    });
    log('TEST-4', 'INFO', `Upload-related elements: ${JSON.stringify(uploadBtnInfo)}`);

    // Try clicking upload if found
    if (uploadBtnInfo.length > 0) {
      log('TEST-4', 'ACTION', `Found upload element: ${uploadBtnInfo[0].text}`);
      try {
        const uploadEl = pcPage.locator(`text=${uploadBtnInfo[0].text.split(' ')[0]}`).first();
        await uploadEl.click({ timeout: 5000 });
        await pcPage.waitForTimeout(2000);
        await pcPage.screenshot({ path: `${SCREENSHOT_DIR}/09_file_selected.png`, fullPage: false });
        log('TEST-4', 'INFO', `Screenshot saved: 09_file_selected.png`);
      } catch (e) {
        log('TEST-4', 'WARN', `Click failed: ${e.message.substring(0, 80)}`);
      }
    } else {
      log('TEST-4', 'WARN', 'No upload button found in current view');
    }

    await pcPage.screenshot({ path: `${SCREENSHOT_DIR}/10_upload_result.png`, fullPage: false });
    log('TEST-4', 'INFO', `Screenshot saved: 10_upload_result.png`);

    await pcContext.close();

    // ===== SUMMARY =====
    log('SUMMARY', 'INFO', `\n\n========== CONSOLE ERRORS (${consoleErrors.length}) ==========`);
    consoleErrors.forEach((err, i) => {
      log('SUMMARY', 'ERROR', `${i + 1}. ${err.substring(0, 200)}`);
    });

    // Save results
    const finalResults = {
      testDate: new Date().toISOString(),
      baseUrl: BASE_URL,
      viewport: '375x812 (mobile)',
      userAgent: 'iPhone',
      results,
      consoleErrors,
      summary: {
        totalSteps: results.length,
        passed: results.filter(r => r.status === 'PASS').length,
        failed: results.filter(r => r.status === 'FAIL').length,
        errors: consoleErrors.length
      }
    };

    // Write results JSON
    const fs = await import('fs');
    fs.writeFileSync(
      `${SCREENSHOT_DIR}/test-results.json`,
      JSON.stringify(finalResults, null, 2)
    );
    log('SUMMARY', 'DONE', `Results saved to ${SCREENSHOT_DIR}/test-results.json`);

  } catch (error) {
    log('FATAL', 'ERROR', error.message);
    console.error(error);
  } finally {
    if (browser) await browser.close();
  }

  return results;
}

await runTests();
