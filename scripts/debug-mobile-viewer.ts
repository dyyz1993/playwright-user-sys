import { chromium } from 'playwright';
import * as fs from 'fs';

async function main() {
  const browser = await chromium.launch({
    executablePath: '/Applications/Chromium.app/Contents/MacOS/Chromium',
  });

  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  });

  const page = await context.newPage();

  const logs: string[] = [];
  const errors: string[] = [];

  page.on('console', msg => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', err => {
    errors.push(err.message);
  });
  page.on('requestfailed', req => {
    errors.push(`[REQ_FAIL] ${req.url()}: ${req.failure()?.errorText}`);
  });

  console.log('Navigating to viewer page...');

  await page.goto(
    'http://192.168.0.29:3011/browser-viewer/index.html?sessionId=699ab351-653a-4bdd-adf5-10846f322408&token=0e359c9f-546e-40f4-a2f6-01551b260c9c&wsHost=192.168.0.29:3011',
    { waitUntil: 'domcontentloaded' }
  );

  console.log('Waiting 20s for WS connection and frames...');
  await page.waitForTimeout(20000);

  await page.screenshot({ path: 'mobile-viewer-debug.png', fullPage: true });
  console.log('Screenshot saved to mobile-viewer-debug.png');

  const domInfo = await page.evaluate(() => {
    const img = document.getElementById('bv-screen');
    const container = document.getElementById('viewer-container');

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      container: container ? {
        offsetWidth: container.offsetWidth,
        offsetHeight: container.offsetHeight,
        computedWidth: getComputedStyle(container).width,
        computedHeight: getComputedStyle(container).height,
        marginTop: getComputedStyle(container).marginTop,
        marginBottom: getComputedStyle(container).marginBottom,
        clientHeight: container.clientHeight,
      } : null,
      img: img ? {
        exists: true,
        offsetWidth: img.offsetWidth,
        offsetHeight: img.offsetHeight,
        computedWidth: getComputedStyle(img).width,
        computedHeight: getComputedStyle(img).height,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        src: img.src || null,
        complete: img.complete,
        objectFit: getComputedStyle(img).objectFit,
      } : { exists: false },
      innerDiv: container?.firstElementChild ? {
        offsetWidth: container.firstElementChild.offsetWidth,
        offsetHeight: container.firstElementChild.offsetHeight,
      } : null,
      bodyChildren: Array.from(document.body.children).map(el => ({
        tag: el.tagName,
        id: el.id,
        offsetW: el.offsetWidth,
        offsetH: el.offsetHeight,
        stylePreview: el.getAttribute('style')?.substring(0, 100),
      })),
      viewerInstance: !!(window as any).BrowserViewer?.instance,
      wsState: (window as any).BrowserViewer?.instance ? {
        streamWsReadyState: (window as any).BrowserViewer.instance.streamWs?.readyState,
        eventsWsReadyState: (window as any).BrowserViewer.instance.eventsWs?.readyState,
        frameCount: (window as any).BrowserViewer.instance.frameCount,
        connected: (window as any).BrowserViewer.instance.connected,
        lastBlobUrl: (window as any).BrowserViewer.instance.lastBlobUrl?.substring(0, 80),
      } : null,
    };
  });

  console.log('\n=== DOM INFO ===');
  console.log(JSON.stringify(domInfo, null, 2));

  console.log('\n=== CONSOLE LOGS (' + logs.length + ') ===');
  logs.forEach(l => console.log('  ' + l));

  console.log('\n=== PAGE ERRORS (' + errors.length + ') ===');
  errors.forEach(e => console.log('  ' + e));

  fs.writeFileSync(
    'mobile-viewer-debug-result.json',
    JSON.stringify({ domInfo, logs, errors }, null, 2)
  );
  console.log('\nResults saved to mobile-viewer-debug-result.json');

  await browser.close();
}

main().catch(console.error);
