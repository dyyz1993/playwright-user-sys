# 交互式 Demo / 教程

## 1. 5 分钟快速体验

从部署到完成第一个截图，只需 5 分钟。

### 步骤 1：启动服务

```bash
# 终端 1：启动管理服务器
pnpm dev

# 终端 2：启动机器服务
pnpm dev:machine
```

### 步骤 2：创建会话并截图

```typescript
// demo-quickstart.ts
import playwright from 'playwright';
import fetch from 'node-fetch';

const API_KEY = process.env.API_KEY || 'YOUR_API_KEY';
const BASE_URL = 'http://localhost:3000/api';

async function quickStart() {
  // 1. 创建会话
  console.log('🔄 创建会话...');
  const res = await fetch(`${BASE_URL}/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({
      viewport: { width: 1280, height: 720 },
    }),
  });
  const { data: session } = await res.json();
  console.log(`✅ 会话创建成功: ${session.id}`);

  // 2. 连接浏览器
  console.log('🔄 连接浏览器...');
  const browser = await playwright.chromium.connectOverCDP(session.directUrl);
  const page = browser.contexts()[0].pages()[0];

  // 3. 访问网页
  console.log('🔄 访问百度首页...');
  await page.goto('https://www.baidu.com', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  // 4. 截图
  console.log('🔄 截图...');
  await page.screenshot({ path: 'baidu-screenshot.png' });
  console.log('✅ 截图已保存: baidu-screenshot.png');

  // 5. 释放会话
  console.log('🔄 释放会话...');
  await fetch(`${BASE_URL}/sessions/${session.id}/release`, {
    method: 'POST',
    headers: { 'x-api-key': API_KEY },
  });
  console.log('✅ 会话已释放');

  await browser.close();
}

quickStart().catch(console.error);
```

```bash
# 运行
API_KEY=your-api-key npx tsx demo-quickstart.ts
```

**预期输出**：

```
🔄 创建会话...
✅ 会话创建成功: abc-123-def
🔄 连接浏览器...
🔄 访问百度首页...
🔄 截图...
✅ 截图已保存: baidu-screenshot.png
🔄 释放会话...
✅ 会话已释放
```

---

## 2. 数据采集实战

爬取电商商品信息（以闲鱼搜索结果为例）。

```typescript
// demo-scraping.ts
import playwright from 'playwright';
import fetch from 'node-fetch';
import * as fs from 'fs';

const API_KEY = process.env.API_KEY!;
const BASE_URL = 'http://localhost:3000/api';

interface Product {
  title: string;
  price: string;
  location: string;
  url: string;
}

async function scrapeProducts(keyword: string): Promise<Product[]> {
  // 1. 创建会话
  const res = await fetch(`${BASE_URL}/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({
      viewport: { width: 1280, height: 800 },
    }),
  });
  const { data: session } = await res.json();
  console.log(`会话已创建: ${session.id}`);

  try {
    // 2. 连接浏览器
    const browser = await playwright.chromium.connectOverCDP(session.directUrl);
    const page = browser.contexts()[0].pages()[0];

    // 3. 模拟用户代理
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'zh-CN,zh;q=0.9',
    });

    // 4. 搜索商品
    console.log(`搜索: ${keyword}`);
    await page.goto(`https://www.goofish.com/search?keyword=${encodeURIComponent(keyword)}`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // 5. 等待商品列表加载
    await page.waitForSelector('[data-role="item-content"]', { timeout: 10000 });

    // 6. 提取商品信息
    const products: Product[] = await page.evaluate(() => {
      const items = document.querySelectorAll('[data-role="item-content"]');
      return Array.from(items).slice(0, 10).map(item => ({
        title: item.querySelector('.title')?.textContent?.trim() || '',
        price: item.querySelector('.price')?.textContent?.trim() || '',
        location: item.querySelector('.location')?.textContent?.trim() || '',
        url: item.querySelector('a')?.href || '',
      }));
    });

    console.log(`找到 ${products.length} 个商品`);
    return products;
  } finally {
    // 7. 释放会话
    await fetch(`${BASE_URL}/sessions/${session.id}/release`, {
      method: 'POST',
      headers: { 'x-api-key': API_KEY },
    });
    console.log('会话已释放');
  }
}

// 运行
scrapeProducts('iPhone 15').then(products => {
  fs.writeFileSync('products.json', JSON.stringify(products, null, 2));
  console.log('数据已保存到 products.json');
}).catch(console.error);
```

```bash
# 运行
API_KEY=your-api-key npx tsx demo-scraping.ts
```

**预期输出**：

```
会话已创建: abc-123-def
搜索: iPhone 15
找到 20 个商品
会话已释放
数据已保存到 products.json
```

---

## 3. 自动化测试

使用 Playwright Test 编写 E2E 测试。

```typescript
// demo-e2e.spec.ts
import { test, expect } from '@playwright/test';
import { Client } from './src/sdk/client.js';

test.describe('用户登录流程 E2E 测试', () => {
  let client: Client;
  let session: any;
  let browser: any;

  test.beforeAll(async () => {
    // 创建 SDK 客户端
    client = new Client({
      apiKey: process.env.API_KEY!,
      baseUrl: 'http://localhost:3000',
    });
  });

  test.beforeEach(async () => {
    // 每个测试前创建新会话
    session = await client.sessions.create({
      viewport: { width: 1280, height: 720 },
    });
    browser = await import('playwright').then(p =>
      p.chromium.connectOverCDP(session.directUrl)
    );
  });

  test.afterEach(async () => {
    // 每个测试后释放会话
    await browser?.close();
    await client.sessions.release(session.id);
  });

  test('应成功加载登录页面', async () => {
    const page = await browser.newPage();
    await page.goto('http://localhost:3000/login', {
      waitUntil: 'domcontentloaded',
    });
    const title = await page.title();
    expect(title).toContain('登录');
  });

  test('应使用有效凭据登录成功', async () => {
    const page = await browser.newPage();
    await page.goto('http://localhost:3000/login');

    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin123');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/dashboard');
    const dashboardText = await page.textContent('h1');
    expect(dashboardText).toContain('控制台');
  });

  test('应使用无效凭据登录失败', async () => {
    const page = await browser.newPage();
    await page.goto('http://localhost:3000/login');

    await page.fill('#username', 'admin');
    await page.fill('#password', 'wrong-password');
    await page.click('button[type="submit"]');

    const errorMsg = await page.textContent('.error-message');
    expect(errorMsg).toContain('用户名或密码错误');
  });

  test('会话页面应显示当前会话列表', async () => {
    const page = await browser.newPage();
    await page.goto('http://localhost:3000/sessions');

    // 等待表格加载
    await page.waitForSelector('table');
    const rows = await page.$$('table tbody tr');
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
```

```bash
# 运行 E2E 测试
npx playwright test demo-e2e.spec.ts

# 带 UI 调试
npx playwright test demo-e2e.spec.ts --headed --debug
```

---

## 4. 文件上传处理

上传文件到浏览器会话中的文件输入框。

```typescript
// demo-file-upload.ts
import playwright from 'playwright';
import { Client } from './src/sdk/client.js';

const API_KEY = process.env.API_KEY!;

async function fileUploadDemo() {
  const client = new Client({
    apiKey: API_KEY,
    baseUrl: 'http://localhost:3000',
  });

  // 1. 创建会话
  console.log('🔄 创建会话...');
  const session = await client.sessions.create({
    viewport: { width: 1280, height: 720 },
  });
  console.log(`✅ 会话: ${session.id}`);

  // 2. 创建 Session 实例（支持文件上传）
  const sessionInstance = await client.sessions.createAndConnect();
  console.log(`✅ Session 实例: ${sessionInstance.id}`);

  // 3. 连接浏览器
  const browser = await playwright.chromium.connectOverCDP(session.directUrl);
  const page = browser.contexts()[0].pages()[0];

  // 4. 打开包含文件上传的页面
  await page.goto('https://www.example.com/upload', {
    waitUntil: 'domcontentloaded',
  });

  // 5. 上传本地文件（方式一：从本地路径上传）
  console.log('🔄 上传文件...');
  const uploadResult = await sessionInstance.uploadFile(
    '/path/to/local/file.jpg',  // 本地文件路径
    '#file-input',               // CSS 选择器
    { frameSelector: undefined } // 如果是 iframe 内，指定 frame 选择器
  );

  if (uploadResult.success) {
    console.log(`✅ 上传成功: ${uploadResult.filename}`);
    console.log(`   文件大小: ${uploadResult.size} bytes`);
    console.log(`   机器路径: ${uploadResult.machineFilePath}`);
  } else {
    console.error(`❌ 上传失败: ${uploadResult.error}`);
  }

  // 6. 从 URL 上传文件（方式二：从远程 URL 下载）
  console.log('🔄 从 URL 上传文件...');
  const urlResult = await sessionInstance.uploadFileFromUrl(
    'https://example.com/sample.pdf',
    '#file-input',
    { downloadTimeout: 60000 }
  );

  if (urlResult.success) {
    console.log(`✅ URL 上传成功: ${urlResult.filename}`);
  }

  // 7. 等待确认
  await new Promise(r => setTimeout(r, 2000));

  // 8. 释放
  await sessionInstance.release();
  await browser.close();
  console.log('✅ 完成');
}

fileUploadDemo().catch(console.error);
```

```bash
# 运行
API_KEY=your-api-key npx tsx demo-file-upload.ts
```

---

## 5. 多页面并行

并发执行多个浏览器任务。

```typescript
// demo-concurrent.ts
import playwright from 'playwright';
import { Client } from './src/sdk/client.js';

const API_KEY = process.env.API_KEY!;
const BASE_URL = 'http://localhost:3000';

interface TaskResult {
  url: string;
  title: string;
  duration: number;
  sessionId: string;
}

async function runTask(
  client: Client,
  url: string
): Promise<TaskResult> {
  const start = Date.now();
  const session = await client.sessions.create({
    viewport: { width: 1024, height: 768 },
  });

  try {
    const browser = await playwright.chromium.connectOverCDP(session.directUrl!);
    const page = browser.contexts()[0].pages()[0];

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const title = await page.title();

    await browser.close();
    return {
      url,
      title,
      duration: Date.now() - start,
      sessionId: session.id,
    };
  } finally {
    await client.sessions.release(session.id);
  }
}

async function concurrentDemo() {
  const client = new Client({ apiKey: API_KEY, baseUrl: BASE_URL });

  const urls = [
    'https://www.baidu.com',
    'https://www.qq.com',
    'https://www.taobao.com',
    'https://www.zhihu.com',
    'https://www.bilibili.com',
  ];

  console.log(`🚀 并发访问 ${urls.length} 个网站...`);
  console.log(`URLs: ${urls.join(', ')}\n`);

  const startAll = Date.now();

  // 并发执行所有任务
  const results = await Promise.allSettled(
    urls.map(url => runTask(client, url))
  );

  const elapsed = Date.now() - startAll;

  // 输出结果
  console.log('📊 结果:');
  console.log('=' .repeat(60));

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const r = result.value;
      console.log(`✅ ${r.url}`);
      console.log(`   标题: ${r.title.slice(0, 50)}`);
      console.log(`   耗时: ${r.duration}ms`);
      console.log(`   会话: ${r.sessionId.slice(0, 8)}...`);
    } else {
      console.log(`❌ ${result.reason}`);
    }
    console.log('-'.repeat(40));
  }

  console.log(`\n⏱️ 总耗时: ${elapsed}ms (${(elapsed / 1000).toFixed(1)}秒)`);
  console.log(`📈 平均: ${(elapsed / urls.length).toFixed(0)}ms/任务`);
}

concurrentDemo().catch(console.error);
```

```bash
# 运行
API_KEY=your-api-key npx tsx demo-concurrent.ts
```

**预期输出**（示例）：

```
🚀 并发访问 5 个网站...

📊 结果:
============================================================
✅ https://www.baidu.com
   标题: 百度一下，你就知道
   耗时: 1234ms
   会话: abc12345...
----------------------------------------
✅ https://www.qq.com
   标题: 腾讯网
   耗时: 2345ms
   会话: def67890...
----------------------------------------
...

⏱️ 总耗时: 3456ms (3.5秒)
📈 平均: 691ms/任务
```

---

## 6. 监控告警

实时查看浏览器状态和系统指标。

```typescript
// demo-monitoring.ts
import fetch from 'node-fetch';

const API_KEY = process.env.API_KEY!;
const BASE_URL = 'http://localhost:3000/api';

interface SystemMetrics {
  sessions: { active: number; total: number };
  machines: { online: number; total: number; sessions: number };
  credits: { user: number };
}

async function getSystemMetrics(): Promise<SystemMetrics> {
  const headers = { 'x-api-key': API_KEY };

  // 并行获取所有指标
  const [sessionsRes, machinesRes, userRes] = await Promise.all([
    fetch(`${BASE_URL}/sessions?page=1&limit=100`, { headers }),
    fetch(`${BASE_URL}/machines`, { headers }),
    fetch(`${BASE_URL}/users/me`, { headers }),
  ]);

  const sessions = await sessionsRes.json();
  const machines = await machinesRes.json();
  const user = await userRes.json();

  return {
    sessions: {
      active: sessions.data?.length || 0,
      total: sessions.total || 0,
    },
    machines: {
      online: machines.data?.filter((m: any) => m.status === 'online').length || 0,
      total: machines.data?.length || 0,
      sessions: machines.data?.reduce((sum: number, m: any) =>
        sum + (m.current_sessions || 0), 0) || 0,
    },
    credits: {
      user: user.data?.credits || 0,
    },
  };
}

function renderMetricsTable(metrics: SystemMetrics): string {
  const lines = [
    '📊 系统监控面板',
    '='.repeat(40),
    '  📁 会话',
    `  活跃: ${metrics.sessions.active}`,
    `  总计: ${metrics.sessions.total}`,
    '',
    '  🖥️ 机器',
    `  在线: ${metrics.machines.online}/${metrics.machines.total}`,
    `  总会话: ${metrics.machines.sessions}`,
    '',
    `  💰 积分余额: ${metrics.credits.user}`,
    '',
    `  🕐 更新: ${new Date().toLocaleTimeString()}`,
  ];
  return lines.join('\n');
}

async function startMonitor(intervalMs: number = 5000) {
  console.log('🚀 启动实时监控 (按 Ctrl+C 停止)\n');

  // 每 5 秒刷新一次
  const timer = setInterval(async () => {
    try {
      const metrics = await getSystemMetrics();
      console.clear();
      console.log(renderMetricsTable(metrics));

      // 告警检查
      if (metrics.machines.online < metrics.machines.total) {
        console.warn('⚠️ 警告: 部分机器离线!');
      }
      if (metrics.credits.user < 100) {
        console.warn('⚠️ 警告: 积分不足!');
      }
    } catch (error) {
      console.error('❌ 获取指标失败:', error);
    }
  }, intervalMs);

  // 优雅退出
  process.on('SIGINT', () => {
    clearInterval(timer);
    console.log('\n监控已停止');
    process.exit(0);
  });
}

// 运行监控
startMonitor(5000).catch(console.error);
```

```bash
# 运行（按 Ctrl+C 停止）
API_KEY=your-api-key npx tsx demo-monitoring.ts
```

**预期输出**（实时刷新）：

```
📊 系统监控面板
========================================
  📁 会话
    活跃: 3
    总计: 15

  🖥️ 机器
    在线: 2/2
    总会话: 3

  💰 积分余额: 950

  🕐 更新: 14:30:25
```

---

::: tip 提示
所有 Demo 代码均可在项目 `scripts/` 目录找到预制的运行脚本：

```bash
# 运行完整的客户端 Demo
pnpm client-demo
```

:::

::: warning 注意事项
- 运行 Demo 前请确保管理服务器和机器服务都已启动
- API Key 可通过管理后台或 `scripts/create-test-user.ts` 生成
- 数据采集请遵守目标网站的 robots.txt 和相关法律法规
:::
