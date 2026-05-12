import puppeteer from 'puppeteer';

const URL = 'http://192.168.0.29:3011/demo';

const browser = await puppeteer.launch({
  headless: true,
  executablePath: '/Applications/Chromium.app/Contents/MacOS/Chromium',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });

page.on('console', msg => {
  if (msg.type() === 'error') console.log('[JS ERR]', msg.text());
});
page.on('pageerror', err => console.log('[PAGE ERR]', err.message));
page.on('requestfailed', req => console.log('[REQ FAIL]', req.url(), req.failure()?.errorText));

// Navigate and start
console.log('=== Navigate and start ===');
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
await page.waitForSelector('#start-btn:not([disabled])', { timeout: 15000 });
await page.click('#start-btn');
await new Promise(r => setTimeout(r, 12000));

const iframeElement = await page.$('#browser-viewer-frame');
const iframeFrame = await iframeElement.contentFrame();

// === PART 1: Full viewer instance dump ===
console.log('\n=== PART 1: Full window.viewer instance dump ===');
const fullState = await iframeFrame.evaluate(() => {
  const v = window.viewer;
  if (!v) return { error: 'no viewer' };
  
  const r = {};
  
  // Get all own properties with values
  for (const key of Object.keys(v)) {
    try {
      const val = v[key];
      if (val instanceof WebSocket) {
        r[key] = {
          type: 'WebSocket',
          url: val.url,
          readyState: val.readyState,
          stateName: ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][val.readyState],
          protocol: val.protocol,
          extensions: val.extensions,
          bufferedAmount: val.bufferedAmount,
        };
      } else if (typeof val === 'function') {
        r[key] = '[Function]';
      } else if (key === 'img') {
        r[key] = { tag: val?.tagName, id: val?.id, src: val?.src?.substring(0, 100) };
      } else if (key === 'container') {
        r[key] = { tag: val?.tagName, id: val?.id };
      } else if (typeof val === 'object' && val !== null) {
        r[key] = JSON.stringify(val).substring(0, 200);
      } else {
        r[key] = val;
      }
    } catch(e) {
      r[key] = `[Error: ${e.message}]`;
    }
  }
  
  // Also check prototype methods
  const proto = Object.getPrototypeOf(v);
  r._protoMethods = [];
  let p = proto;
  while (p && p !== Object.prototype) {
    for (const k of Object.getOwnPropertyNames(p)) {
      if (typeof p[k] === 'function' && k !== 'constructor') r._protoMethods.push(k);
    }
    p = Object.getPrototypeOf(p);
  }
  
  return r;
});
console.log(JSON.stringify(fullState, null, 2));

// === PART 2: Monitor frame updates over 10 seconds ===
console.log('\n=== PART 2: Monitor frame updates for 10s ===');
const frameLog = await iframeFrame.evaluate(() => {
  return new Promise((resolve) => {
    const v = window.viewer;
    const log = [];
    
    // Record initial state
    log.push({ time: 0, frameCount: v.frameCount, imgSrc: v.img?.src?.substring(0, 80), connected: v.connected });
    
    // Poll every 2 seconds for 10 seconds
    let elapsed = 0;
    const interval = setInterval(() => {
      elapsed += 2000;
      log.push({
        time: elapsed,
        frameCount: v.frameCount,
        imgSrc: v.img?.src?.substring(0, 80),
        connected: v.connected,
        streamWsReady: v.streamWs?.readyState,
        eventsWsReady: v.eventsWs?.readyState,
      });
      
      if (elapsed >= 10000) {
        clearInterval(interval);
        resolve(log);
      }
    }, 2000);
  });
});
frameLog.forEach(entry => console.log(`  t=${entry.time}s | frames=${entry.frameCount} | connected=${entry.connected} | streamWS=${entry.streamWsReady} | eventWS=${entry.eventsWsReady} | imgSrc=${entry.imgSrc}`));

// === PART 3: Check event handlers on the img element ===
console.log('\n=== PART 3: Event handling check ===');
const eventCheck = await iframeFrame.evaluate(() => {
  const v = window.viewer;
  const r = {};
  
  // Check the img element for event listeners
  const img = document.getElementById('bv-screen');
  if (img) {
    // We can't directly inspect addEventListener listeners, but we can check
    // if there are inline handlers or data attributes
    r.imgOnClick = img.onclick ? 'has onclick' : 'no onclick';
    r.imgOnMouseDown = img.onmousedown ? 'has onmousedown' : 'no onmousedown';
    r.imgOnMouseMove = img.onmousemove ? 'has onmousemove' : 'no onmousemove';
    r.imgPointerEvents = window.getComputedStyle(img).pointerEvents;
    r.imgCursor = window.getComputedStyle(img).cursor;
    
    // Check parent container
    const container = document.getElementById('viewer-container');
    if (container) {
      r.containerPointerEvents = window.getComputedStyle(container).pointerEvents;
      r.containerPosition = window.getComputedStyle(container).position;
    }
  }
  
  // Check if viewer has methods for sending input
  if (v) {
    r.hasSendMethod = typeof v.sendMouseEvent === 'function' || 
                       typeof v.sendMouse === 'function' ||
                       typeof v.sendEvent === 'function' ||
                       typeof v.sendInput === 'function' ||
                       typeof v.dispatchMouseEvent === 'function';
    
    // List ALL methods
    const allMethods = [];
    let obj = v;
    while (obj && obj !== Object.prototype) {
      for (const k of Object.getOwnPropertyNames(obj)) {
        if (typeof obj[k] === 'function' && k !== 'constructor') allMethods.push(k);
      }
      obj = Object.getPrototypeOf(obj);
    }
    r.allMethods = allMethods;
  }
  
  return r;
});
console.log(JSON.stringify(eventCheck, null, 2));

// === PART 4: Try calling viewer methods directly ===
console.log('\n=== PART 4: Try direct method calls ===');
if (fullState._protoMethods && fullState._protoMethods.length > 0) {
  console.log('Available methods:', fullState._protoMethods);
  
  // Try to find and call a mouse/event sending method
  const methodTest = await iframeFrame.evaluate(() => {
    const v = window.viewer;
    const r = {};
    
    // Try common method names
    const mouseMethods = ['sendMouseEvent', 'sendMouse', 'sendEvent', 'sendInput', 
                           'dispatchMouseEvent', 'handleMouse', 'onMouseDown',
                           'handlePointerEvent', 'sendPointer'];
    
    for (const m of mouseMethods) {
      r[m] = typeof v[m] === 'function' ? 'exists' : 'N/A';
    }
    
    return r;
  });
  console.log('Mouse methods:', JSON.stringify(methodTest, null, 2));
}

// === PART 5: Take screenshot and check current visual ===
console.log('\n=== PART 5: Final screenshot ===');
await page.screenshot({ path: '/tmp/demo-final.png', fullPage: true });

// Also get the current status text
const statusText = await iframeFrame.evaluate(() => {
  const el = document.getElementById('bv-status');
  return el ? el.innerText : 'no status element';
});
console.log('Status text:', statusText);

const finalImgSrc = await iframeFrame.evaluate(() => {
  const img = document.getElementById('bv-screen');
  return img?.src || 'no img';
});
console.log('Current img src:', finalImgSrc);

await browser.close();
console.log('\n=== Complete ===');
