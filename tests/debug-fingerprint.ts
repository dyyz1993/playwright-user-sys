import puppeteer from 'puppeteer-core';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { URL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const htmlDir = path.join(__dirname, '../html');
const testPagePath = path.join(htmlDir, 'fingerprint-test.html');

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  let filePath = parsedUrl.pathname === '/' ? testPagePath : path.join(htmlDir, parsedUrl.pathname);

  const content = await fs.readFile(filePath);
  const ext = path.extname(filePath);
  const contentType = ext === '.html' ? 'text/html' : 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(content);
});

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/`;
  console.log('Server started:', url);
  console.log('Test page path:', testPagePath);

  // Check if file exists
  try {
    await fs.access(testPagePath);
    console.log('File exists');
  } catch (e) {
    console.log('File does not exist:', e);
  }

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  });

  const page = await browser.newPage();

  // Enable console logging
  page.on('console', msg => console.log('[Browser console]', msg.text()));
  page.on('pageerror', err => console.error('[Browser error]', err.message));

  console.log('Navigating to:', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });

  console.log('Page loaded, waiting for fingerprint...');

  try {
    await page.waitForFunction(() => {
      console.log('Checking window.fingerprintReady:', window.fingerprintReady);
      return window.fingerprintReady === true;
    }, { timeout: 15000, polling: 500 });

    const result = await page.evaluate(() => ({
      ready: window.fingerprintReady,
      hash: window.fingerprintHash,
      hasData: typeof window.fingerprintData !== 'undefined'
    }));

    console.log('SUCCESS! Fingerprint result:', result);
  } catch (e) {
    console.error('FAILED:', e.message);

    const debugInfo = await page.evaluate(() => ({
      ready: window.fingerprintReady,
      hash: window.fingerprintHash,
      hasData: typeof window.fingerprintData !== 'undefined',
      url: document.URL,
      readyState: document.readyState,
      hasInitFunction: typeof window.init === 'function'
    }));
    console.error('Debug info:', debugInfo);
  }

  await browser.close();
  server.close();
});
