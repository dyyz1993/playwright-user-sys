// TIER-101 竞态本地复现+修复验证：同一 fingerprint-injector 库 + 本机 Chrome
// A) 旧 handler 顺序（辅助注入在前，指纹最后）→ 预期首个新 tab 裸奔（复现 CI 现象）
// B) 新顺序（指纹最先 + 当前文档即时求值兜底）→ 预期全部 tab 伪装一致
import puppeteer from 'puppeteer-core';
import { FingerprintInjector } from 'fingerprint-injector';
import { FingerprintGenerator } from 'fingerprint-generator';

const fingerprint = new FingerprintGenerator({
  devices: ['desktop'], operatingSystems: ['windows'], browsers: ['chrome'], locales: ['en-US'],
}).getFingerprint();

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROBE = `<!doctype html><meta charset=utf-8><input id=t autofocus>
<script>window.__fp={platform:navigator.platform,hc:navigator.hardwareConcurrency,
cd:screen.colorDepth,webgl:(()=>{try{const g=document.createElement('canvas').getContext('webgl');
const d=g.getExtension('WEBGL_debug_renderer_info');return g.getParameter(d.UNMASKED_RENDERER_WEBGL)}catch(e){return 'n/a'}})()};
document.title='done'</script>`;

async function getFp(page) {
  await page.setContent(PROBE, { waitUntil: 'load' });
  await sleep(150);
  return page.evaluate(() => window.__fp);
}

async function run(mode) {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  try {
    const inj = () => new FingerprintInjector();
    if (mode === 'old') {
      browser.on('targetcreated', async (t) => {
        if (t.type() !== 'page') return;
        const page = await t.page(); if (!page) return;
        // 模拟旧顺序：多步 CDP 往返辅助注入在前
        await page.evaluateOnNewDocument(() => {});
        await page.evaluate(() => 0);
        const cdp = await page.createCDPSession();
        await cdp.send('Browser.grantPermissions', { origin: 'http://localhost', permissions: ['clipboardReadWrite'] }).catch(() => {});
        await page.evaluateOnNewDocument(() => {});
        await page.evaluate(() => 0);
        await page.evaluateOnNewDocument(() => {});
        await inj().attachFingerprintToPuppeteer(page, fingerprint); // 最后才挂指纹
      });
    } else {
      browser.on('targetcreated', async (t) => {
        if (t.type() !== 'page') return;
        const page = await t.page(); if (!page) return;
        // 新顺序：指纹最先 + 即时求值兜底
        const i = inj();
        await i.attachFingerprintToPuppeteer(page, fingerprint);
        await page.evaluate(i.getInjectableScript(fingerprint)).catch(() => {});
        await page.evaluateOnNewDocument(() => {});
        await page.evaluate(() => 0);
      });
    }
    // 与 CI 测试同节奏：连开 3 个 tab 再逐个取指纹
    const tab1 = await browser.newPage();
    const tab2 = await browser.newPage();
    const tab3 = await browser.newPage();
    const f1 = await getFp(tab1), f2 = await getFp(tab2), f3 = await getFp(tab3);
    const want = fingerprint.fingerprint.navigator.platform;
    const fmt = (f) => `${f.platform}/hc${f.hc}/cd${f.cd}/${(f.webgl || '').slice(0, 40)}`;
    console.log(`[${mode}] 目标 platform=${want}`);
    console.log(`[${mode}] tab1: ${fmt(f1)}`);
    console.log(`[${mode}] tab2: ${fmt(f2)}`);
    console.log(`[${mode}] tab3: ${fmt(f3)}`);
    const ok = f1.platform === want && f2.platform === want && f3.platform === want;
    console.log(`[${mode}] 一致伪装: ${ok ? 'PASS ✅' : 'FAIL ❌'}`);
    return ok;
  } finally { await browser.close(); }
}

const a = await run('old');
await sleep(500);
const b = await run('new');
console.log(a === false && b === true ? '\n结论: 复现旧裸奔 + 新修复有效 ✅' : a && b ? '\n结论: 本机未复现旧竞态(时序随机), 但新顺序也 PASS' : '\n结论: 需进一步排查 ⚠️');
process.exit(0);
