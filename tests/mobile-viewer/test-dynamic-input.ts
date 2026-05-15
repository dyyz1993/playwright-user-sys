import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MANAGER_URL = 'http://192.168.0.29:3011';

async function main() {
  // 0. 登录获取 token
  console.log('📋 Step 0: 登录获取认证令牌...');
  const loginRes = await fetch(`${MANAGER_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const loginData = await loginRes.json();
  const token = loginData.data.token;
  console.log(`  Token: ${token.substring(0, 30)}...`);

  // 1. 创建会话
  console.log('\n📋 Step 1: 创建远程浏览器会话...');
  const sessionRes = await fetch(`${MANAGER_URL}/api/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ userId: 1, duration: 30 }),
  });
  const sessionData = await sessionRes.json();
  if (!sessionData.success) {
    throw new Error(`创建会话失败: ${sessionData.error || JSON.stringify(sessionData)}`);
  }
  const { id: sessionId, browserWSEndpoint: wsUrl } = sessionData.data;
  // 通过 Manager WebSocket 代理连接（manager 会转发到机器实例的 CDP 端点）
  const proxyUrl = `ws://192.168.0.29:3011/ws/connect?sessionId=${sessionId}&token=${token}`;
  console.log(`  Session: ${sessionId}`);
  console.log(`  WS URL: ${wsUrl}`);
  console.log(`  Proxy URL: ${proxyUrl.substring(0, 80)}...`);

  // 2. 连接到远程浏览器
  console.log('\n📋 Step 2: 连接到远程浏览器...');
  const browser = await chromium.connectOverCDP(proxyUrl);
  const contexts = browser.contexts();
  const page = contexts[0]?.pages()[0] || (await contexts[0].newPage());

  // 3. 加载测试页面（通过 data URI 注入，避免 Docker 容器无法访问外部网络）
  console.log('\n📋 Step 3: 加载测试页面...');
  const htmlContent = fs.readFileSync(path.join(__dirname, '../../public/test-interactive.html'), 'utf-8');
  const dataUri = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent);
  await page.goto(dataUri, { waitUntil: 'load', timeout: 15000 });
  console.log('  测试页面已加载');

  // 等待动态搜索框创建（500ms）
  await page.waitForTimeout(1000);

  let passed = 0;
  let failed = 0;

  // === 测试 1: React 风格受控组件 ===
  console.log('\n🧪 Test 1: React 风格受控组件 - 中文输入');
  try {
    const reactInput = page.locator('#dynamic-input-react');
    await reactInput.click();
    await page.keyboard.type('你好世界', { delay: 80 });
    await page.waitForTimeout(500);

    const reactValue = await reactInput.inputValue();
    const reactDisplay = await page.locator('#dynamic-react-value').textContent();
    const reactStatus = await page.locator('#dynamic-react-status').textContent();

    console.log(`  input.value = "${reactValue}"`);
    console.log(`  显示值 = "${reactDisplay}"`);
    console.log(`  状态 = "${reactStatus}"`);

    if (reactValue === '你好世界' && reactDisplay === '你好世界' && reactStatus === '✓') {
      console.log('  ✅ PASS: React 受控组件中文输入成功');
      passed++;
    } else {
      console.log('  ❌ FAIL: 回填不完整');
      failed++;
    }
  } catch (e: any) {
    console.log(`  ❌ FAIL: ${e.message}`);
    failed++;
  }

  // === 测试 2: 动态搜索框 ===
  console.log('\n🧪 Test 2: 动态搜索框 - 中文输入');
  try {
    const searchInput = page.locator('#dynamic-input-search');
    await searchInput.waitFor({ state: 'visible', timeout: 5000 });
    await searchInput.click();
    await page.keyboard.type('天气', { delay: 80 });
    await page.waitForTimeout(500);

    const searchValue = await searchInput.inputValue();
    const searchDisplay = await page.locator('#dynamic-search-value').textContent();
    const searchStatus = await page.locator('#dynamic-search-status').textContent();

    console.log(`  input.value = "${searchValue}"`);
    console.log(`  显示值 = "${searchDisplay}"`);
    console.log(`  状态 = "${searchStatus}"`);

    // 检查搜索建议
    const suggestions = await page.locator('#dynamic-search-suggestions > div').count();
    console.log(`  搜索建议数: ${suggestions}`);

    if (searchValue === '天气' && searchDisplay === '天气' && searchStatus === '✓') {
      console.log('  ✅ PASS: 动态搜索框中文输入成功');
      passed++;
    } else {
      console.log('  ❌ FAIL: 回填不完整');
      failed++;
    }
  } catch (e: any) {
    console.log(`  ❌ FAIL: ${e.message}`);
    failed++;
  }

  // === 测试 3: ContentEditable 输入框 ===
  console.log('\n🧪 Test 3: ContentEditable - 中文输入');
  try {
    const ceInput = page.locator('#dynamic-input-contenteditable');
    await ceInput.click();
    await page.waitForTimeout(300);
    // 清除占位符文字
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);
    await page.keyboard.type('测试内容', { delay: 80 });
    await page.waitForTimeout(500);

    const ceText = await ceInput.textContent();
    const ceDisplay = await page.locator('#dynamic-ce-value').textContent();
    const ceStatus = await page.locator('#dynamic-ce-status').textContent();
    const ceCharCount = await page.locator('#dynamic-ce-charcount').textContent();

    console.log(`  contentEditable text = "${ceText}"`);
    console.log(`  显示值 = "${ceDisplay}"`);
    console.log(`  状态 = "${ceStatus}"`);
    console.log(`  字符数 = ${ceCharCount}`);

    if (ceText?.includes('测试内容') && ceDisplay === '测试内容' && ceStatus === '✓') {
      console.log('  ✅ PASS: ContentEditable 中文输入成功');
      passed++;
    } else {
      console.log('  ❌ FAIL: 回填不完整');
      failed++;
    }
  } catch (e: any) {
    console.log(`  ❌ FAIL: ${e.message}`);
    failed++;
  }

  // === 测试 4: 连续输入多段文字 ===
  console.log('\n🧪 Test 4: React 受控组件 - 连续输入多段文字');
  try {
    const reactInput = page.locator('#dynamic-input-react');
    await reactInput.click();
    await reactInput.fill('');
    await page.keyboard.type('第一段', { delay: 60 });
    await page.keyboard.press('Enter');
    await page.keyboard.type('第二段', { delay: 60 });
    await page.waitForTimeout(500);

    const reactValue = await reactInput.inputValue();
    console.log(`  input.value = "${reactValue}"`);

    if (reactValue.includes('第一段') && reactValue.includes('第二段')) {
      console.log('  ✅ PASS: 连续多段输入成功');
      passed++;
    } else {
      console.log('  ❌ FAIL: 连续输入不完整');
      failed++;
    }
  } catch (e: any) {
    console.log(`  ❌ FAIL: ${e.message}`);
    failed++;
  }

  // === 测试 5: 删除和修改 ===
  console.log('\n🧪 Test 5: React 受控组件 - 删除和修改');
  try {
    const reactInput = page.locator('#dynamic-input-react');
    await reactInput.click();
    await reactInput.fill('ABCDE');
    await page.waitForTimeout(300);
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(300);
    await page.keyboard.type('你好', { delay: 60 });
    await page.waitForTimeout(500);

    const reactValue = await reactInput.inputValue();
    console.log(`  input.value = "${reactValue}" (expected: "ABC你好")`);

    if (reactValue === 'ABC你好') {
      console.log('  ✅ PASS: 删除+修改成功');
      passed++;
    } else {
      console.log('  ❌ FAIL: 删除+修改结果不正确');
      failed++;
    }
  } catch (e: any) {
    console.log(`  ❌ FAIL: ${e.message}`);
    failed++;
  }

  // === 测试 6: 动态搜索框 - 搜索建议交互 ===
  console.log('\n🧪 Test 6: 动态搜索框 - 搜索建议交互');
  try {
    const searchInput = page.locator('#dynamic-input-search');
    await searchInput.click();
    await searchInput.fill('');
    await page.keyboard.type('热', { delay: 80 });
    await page.waitForTimeout(500);

    const searchValue = await searchInput.inputValue();
    const sugCount = await page.locator('#dynamic-search-suggestions > div').count();

    console.log(`  input.value = "${searchValue}"`);
    console.log(`  匹配建议数: ${sugCount}`);

    if (searchValue === '热' && sugCount > 0) {
      console.log('  ✅ PASS: 搜索建议交互成功');
      passed++;
    } else {
      console.log('  ❌ FAIL: 搜索建议交互失败');
      failed++;
    }
  } catch (e: any) {
    console.log(`  ❌ FAIL: ${e.message}`);
    failed++;
  }

  // === 汇总 ===
  console.log('\n' + '='.repeat(50));
  console.log(`📊 动态 Input 测试结果: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('='.repeat(50));

  // 清理：断开连接
  await browser.close();
  console.log('\n🔌 已断开远程浏览器连接');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
