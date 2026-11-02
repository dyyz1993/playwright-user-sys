// #28 验证：浏览器级 autoattach 前置注入 vs 仅 targetcreated handler（PR#31 状态）
// 双探针：parse 期（title = document.title，在 <head> 内联脚本设置）与 post-load（evaluate）。
// 裸奔判据：任一探针读到宿主真值（本机 MacIntel）而非注入值（Win32）。
// 用法：CHROME_PATH=... node scripts/repro-tier101-browserlevel.mjs [trials]
import http from 'node:http';
import puppeteer from 'puppeteer-core';
import { FingerprintInjector } from 'fingerprint-injector';
import { FingerprintGenerator } from 'fingerprint-generator';

const TRIALS = Number(process.argv[2] || 5);
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const fingerprint = new FingerprintGenerator({
  devices: ['desktop'],
  operatingSystems: ['windows'],
  browsers: ['chrome'],
  locales: ['en-US'],
}).getFingerprint();
const injector = new FingerprintInjector();
const fpScript = injector.getInjectableScript(fingerprint);
const WANT_PLATFORM = fingerprint.fingerprint.navigator.platform; // Win32

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(
    '<script>document.title=navigator.platform;window.__parseTimePlatform=navigator.platform;</script><body>x</body>'
  );
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PROBE = `http://127.0.0.1:${server.address().port}/probe`;

const attachStats = { ok: 0, fail: 0, lastErr: '' };
const cdpStats = { attached: 0, sent: 0, sendErr: 0, lastErr: '' };

async function attachFingerprint(page) {
  try {
    await injector.attachFingerprintToPuppeteer(page, fingerprint);
    attachStats.ok++;
    await page.evaluate(fpScript).catch(() => {});
  } catch (e) {
    attachStats.fail++;
    attachStats.lastErr = String(e?.message || e).slice(0, 120);
  }
}

function wireOld(browser) {
  browser.on('targetcreated', async (t) => {
    if (t.type() !== 'page') return;
    const page = await t.page();
    if (page) await attachFingerprint(page);
  });
}

async function wireNew(browser) {
  wireOld(browser);
  const browserCDP = await browser.target().createCDPSession();
  // 监听器必须先于 setAutoAttach 注册，否则首个 target 的 attachedToTarget 会漏掉
  browserCDP.on('Target.attachedToTarget', (event) => {
    if (event.targetInfo.type !== 'page') return;
    cdpStats.attached++;
    const child = browserCDP.connection()?.session(event.sessionId);
    if (!child) {
      cdpStats.sendErr++;
      cdpStats.lastErr = 'child session undefined';
      return;
    }
    child
      .send('Page.enable')
      .then(() => child.send('Runtime.enable'))
      .then(() =>
        child.send('Page.addScriptToEvaluateOnNewDocument', {
          source: "window.__browserLevelInject='yes';" + fpScript,
        })
      )
      .then(() => {
        cdpStats.sent++;
        // 我的 autoattach 持有等待计数，必须放行否则目标永久暂停
        child.send('Runtime.runIfWaitingForDebugger').catch(() => {});
      })
      .catch((e) => {
        cdpStats.sendErr++;
        cdpStats.lastErr = String(e?.message || e).slice(0, 120);
      });
  });
  await browserCDP.send('Target.setAutoAttach', {
    autoAttach: true,
    waitForDebuggerOnStart: true,
    flatten: true,
  });
}

async function runMode(label, wire) {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  wire(browser);
  let bare = 0;
  const samples = [];
  const pages = [];
  for (let i = 0; i < TRIALS; i++) {
    const page = await browser.newPage();
    pages.push(page);
    await page.goto(PROBE, { waitUntil: 'load', timeout: 15000 }).catch(() => {});
    const parseTime = await page.title().catch(() => 'title-err');
    const post = await page
      .evaluate(() => `${navigator.platform}|inject=${window.__browserLevelInject || 'NO'}`)
      .catch(() => 'eval-err');
    const ok = parseTime === WANT_PLATFORM && post.split('|')[0] === WANT_PLATFORM;
    if (!ok) bare++;
    samples.push(`parse:${parseTime} post:${post}`);
  }
  for (const p of pages) await p.close().catch(() => {});
  await browser.close();
  console.log(
    `[${label}] 裸奔 ${bare}/${TRIALS}  attach:${attachStats.ok}ok/${attachStats.fail}fail${
      attachStats.lastErr ? '(' + attachStats.lastErr + ')' : ''
    }${
      label.includes('#28')
        ? `  cdp:${cdpStats.attached}att/${cdpStats.sent}sent/${cdpStats.sendErr}err${
            cdpStats.lastErr ? '(' + cdpStats.lastErr.slice(0, 60) + ')' : ''
          }`
        : ''
    }`
  );
  for (const s of samples.slice(0, TRIALS)) console.log(`    ${s}`);
  attachStats.ok = attachStats.fail = 0;
  cdpStats.attached = cdpStats.sent = cdpStats.sendErr = 0;
  return bare;
}

const oldBare = await runMode('旧(PR#31)', wireOld);
const newBare = await runMode('新(#28)  ', wireNew);
server.close();
console.log(`\n目标 platform: ${WANT_PLATFORM}`);
console.log(
  oldBare > newBare
    ? '✅ 新方案裸奔率下降'
    : newBare === 0 && oldBare === 0
      ? '⚖️ 双方均无裸奔（竞态未触发）'
      : '❌ 无改善'
);
process.exit(0);
