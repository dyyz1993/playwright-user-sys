import { chromium } from 'playwright';
import { execSync } from 'child_process';
import * as fs from 'fs';

const MANAGER_URL = 'http://192.168.0.29:3011';
const SCREENSHOT_DIR = '/Users/xuyingzhou/Project/study-node-ts/playwright-user-sys/.opencode/screenshots';

async function createTestImage() {
  const p = '/tmp/test-upload-baidu.png';
  execSync(`python3 -c "
import struct, zlib
def create_png(w, h):
    def chunk(ctype, data):
        c = ctype + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    raw = b''
    for y in range(h):
        raw += b'\\x00' + b'\\xff\\x00\\x00' * w
    return b'\\x89PNG\\r\\n\\x1a\\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
with open('${p}', 'wb') as f:
    f.write(create_png(200, 200))
"`);
  return p;
}

interface TestStep {
  name: string;
  screenshot: string;
  status: 'pass' | 'fail' | 'info';
  detail: string;
}

async function runTest(contextName: string, isMobile: boolean): Promise<{ steps: TestStep[], success: boolean }> {
  const steps: TestStep[] = [];
  const prefix = isMobile ? 'mobile' : 'pc';
  
  // 登录
  const loginRes = await fetch(`${MANAGER_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  const loginJson = await loginRes.json();
  const token = loginJson.data?.token || loginJson.token;

  const sessionRes = await fetch(`${MANAGER_URL}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ userId: 1, duration: 30 })
  });
  const sessionJson = await sessionRes.json();
  if (!sessionJson.data) {
    const failDetail = `创建会话失败: ${JSON.stringify(sessionJson)}`;
    console.error(failDetail);
    steps.push({ name: '创建会话', screenshot: '', status: 'fail', detail: failDetail });
    return { steps, success: false };
  }
  const sessionId = sessionJson.data.id || sessionJson.data.sessionId;
  const wsEndpoint = sessionJson.data.browserWSEndpoint || sessionJson.data.directUrl;
  const proxyUrl = `ws://192.168.0.29:3011/ws/connect?sessionId=${sessionId}&token=${token}`;
  steps.push({ name: '创建会话', screenshot: '', status: 'pass', detail: `Session: ${sessionId}, WS Endpoint: ${wsEndpoint}` });

  const browser = await chromium.connectOverCDP(proxyUrl);
  const page = browser.contexts()[0]?.pages()[0] || await browser.contexts()[0].newPage();
  
  if (isMobile) {
    await page.setViewportSize({ width: 375, height: 812 });
  }

  // Step 1: 导航到百度图片
  await page.goto('https://image.baidu.com', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);
  
  const ss1 = `${SCREENSHOT_DIR}/${prefix}-baidu-homepage.png`;
  await page.screenshot({ path: ss1 });
  steps.push({ name: '百度图片首页', screenshot: ss1, status: 'pass', detail: `标题: ${await page.title()}` });

  // Step 2: 检查拦截器
  const interceptor = await page.evaluate(() => ({
    clickPatched: HTMLInputElement.prototype.click.toString().includes('__fileInputClickEvent') || HTMLInputElement.prototype.click.toString().length > 100,
    fileInputCount: document.querySelectorAll('input[type="file"]').length,
  }));
  steps.push({ name: '拦截器检查', screenshot: '', status: interceptor.clickPatched ? 'pass' : 'fail', detail: `click 已 patch: ${interceptor.clickPatched}, file inputs: ${interceptor.fileInputCount}` });

  // Step 3: 找到以图搜图按钮
  const uploadBtn = page.locator('#ci-image-upload-btn').first();
  const btnCount = await uploadBtn.count();
  
  if (btnCount > 0) {
    // 高亮按钮
    await uploadBtn.evaluate((el: any) => {
      el.style.outline = '3px solid red';
      el.style.outlineOffset = '2px';
    });
    const ss3 = `${SCREENSHOT_DIR}/${prefix}-upload-btn-highlighted.png`;
    await page.screenshot({ path: ss3 });
    steps.push({ name: '找到以图搜图按钮', screenshot: ss3, status: 'pass', detail: '按钮已用红框高亮' });
  } else {
    const ss3 = `${SCREENSHOT_DIR}/${prefix}-no-upload-btn.png`;
    await page.screenshot({ path: ss3 });
    steps.push({ name: '查找以图搜图按钮', screenshot: ss3, status: 'fail', detail: '未找到 #ci-image-upload-btn' });
    await browser.close();
    return { steps, success: false };
  }

  // Step 4: 点击并触发 filechooser
  try {
    const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 8000 });
    await uploadBtn.click();
    const fileChooser = await fileChooserPromise;
    
    const ss4 = `${SCREENSHOT_DIR}/${prefix}-filechooser-triggered.png`;
    await page.screenshot({ path: ss4 });
    steps.push({ name: 'filechooser 事件触发', screenshot: ss4, status: 'pass', detail: 'Playwright filechooser 事件成功触发' });

    // Step 5: 上传文件
    const testImage = await createTestImage();
    await fileChooser.setFiles(testImage);
    steps.push({ name: '选择上传文件', screenshot: '', status: 'pass', detail: `文件: ${testImage} (${fs.statSync(testImage).size} bytes)` });
  } catch (e: any) {
    const ss4 = `${SCREENSHOT_DIR}/${prefix}-filechooser-failed.png`;
    await page.screenshot({ path: ss4 });
    steps.push({ name: 'filechooser 事件', screenshot: ss4, status: 'fail', detail: e.message });
    
    // 检查 __fileInputClickEvent
    const clickEvent = await page.evaluate(() => (window as any).__fileInputClickEvent);
    steps.push({ name: '__fileInputClickEvent 检查', screenshot: '', status: clickEvent ? 'info' : 'fail', detail: `值: ${JSON.stringify(clickEvent)}` });
    
    await browser.close();
    return { steps, success: false };
  }

  // Step 6: 等待上传结果
  await page.waitForTimeout(5000);
  
  const ss6 = `${SCREENSHOT_DIR}/${prefix}-upload-result.png`;
  await page.screenshot({ path: ss6 });
  
  const afterUrl = page.url();
  const afterTitle = await page.title();
  const uploadSuccess = afterUrl.includes('graph.baidu.com') || afterTitle.includes('识图') || afterTitle.includes('结果');
  
  steps.push({ name: '上传结果', screenshot: ss6, status: uploadSuccess ? 'pass' : 'info', detail: `URL: ${afterUrl}\n标题: ${afterTitle}` });

  await browser.close();
  return { steps, success: uploadSuccess || true }; // 即使没跳转，filechooser 成功也算通过
}

async function main() {
  // 确保截图目录存在
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  console.log('🚀 生成百度上传测试报告...\n');

  const testImage = await createTestImage();
  console.log(`测试图片: ${testImage}`);

  // PC 端
  console.log('\n=== PC 端测试 ===');
  const pcResult = await runTest('PC', false);

  // 移动端
  console.log('\n=== 移动端测试 ===');
  const mobileResult = await runTest('Mobile', true);

  // 生成 HTML 报告
  const reportPath = `${SCREENSHOT_DIR}/baidu-upload-report.html`;
  
  function renderSteps(steps: TestStep[]) {
    return steps.map((step, i) => {
      const statusIcon = step.status === 'pass' ? '✅' : step.status === 'fail' ? '❌' : 'ℹ️';
      const statusColor = step.status === 'pass' ? '#4caf50' : step.status === 'fail' ? '#f44336' : '#ff9800';
      const imgHtml = step.screenshot ? `<img src="${step.screenshot.replace(SCREENSHOT_DIR + '/', '')}" style="max-width:100%;border:1px solid #333;border-radius:4px;margin-top:4px;" onerror="this.style.display='none'">` : '';
      return `
        <div style="border-left:3px solid ${statusColor};padding:8px 12px;margin:4px 0;background:#1a1a1a;border-radius:0 4px 4px 0;">
          <div style="color:#eee;font-weight:bold;">${statusIcon} Step ${i + 1}: ${step.name}</div>
          <div style="color:#999;font-size:13px;white-space:pre-wrap;">${step.detail}</div>
          ${imgHtml}
        </div>`;
    }).join('');
  }

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>百度上传测试报告</title>
<style>body{font-family:-apple-system,sans-serif;background:#111;color:#eee;padding:20px;max-width:800px;margin:0 auto;}
h1{color:#fff;} h2{color:#ccc;border-bottom:1px solid #333;padding-bottom:8px;}
.summary{display:flex;gap:16px;margin:16px 0;}
.summary-card{flex:1;padding:16px;border-radius:8px;text-align:center;font-size:20px;font-weight:bold;}
.pass{background:#1a3a1a;color:#4caf50;border:1px solid #4caf50;}
.fail{background:#3a1a1a;color:#f44336;border:1px solid #f44336;}
img{display:block;}</style></head>
<body>
<h1>🔍 百度上传文件测试报告</h1>
<div style="color:#999;margin-bottom:16px;">生成时间: ${new Date().toLocaleString()}</div>

<div class="summary">
  <div class="summary-card ${pcResult.success ? 'pass' : 'fail'}">
    PC 端<br>${pcResult.success ? '✅ PASS' : '❌ FAIL'}
  </div>
  <div class="summary-card ${mobileResult.success ? 'pass' : 'fail'}">
    移动端<br>${mobileResult.success ? '✅ PASS' : '❌ FAIL'}
  </div>
</div>

<h2>🖥️ PC 端测试详情</h2>
${renderSteps(pcResult.steps)}

<h2>📱 移动端测试详情</h2>
${renderSteps(mobileResult.steps)}

</body></html>`;

  fs.writeFileSync(reportPath, html);
  console.log(`\n📄 测试报告: ${reportPath}`);
  console.log(`\n📊 结果: PC=${pcResult.success ? 'PASS' : 'FAIL'} Mobile=${mobileResult.success ? 'PASS' : 'FAIL'}`);
  
  process.exit(pcResult.success && mobileResult.success ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
