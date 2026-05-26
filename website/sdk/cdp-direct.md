# CDP 直连

## 什么是 CDP 直连

CDP（Chrome DevTools Protocol）是 Chromium 浏览器提供的调试协议。CDP 直连允许客户端通过 WebSocket 代理**直接**连接到浏览器实例，获得原生 Playwright 的全部能力。

## 与 Session 模式的区别

| 特性 | CDP 直连 | Session 模式 |
|------|----------|-------------|
| 连接方式 | `connectOverCDP` | `connect` / 管理服务器中转 |
| 传输效率 | 直接代理，延迟低 | 经过管理服务器转发 |
| API Key | 必需 | 可选（可用 JWT Token） |
| 适用场景 | 高性能、低延迟需求 | 需要管理功能的场景 |
| 文件上传 | Session 实例方法 | 通过管理服务器 API |

## WebSocket URL 格式

```
ws://<machine-host>:8082/ws/connect?apiKey=<API_KEY>
```

参数说明：

| 参数 | 说明 |
|------|------|
| `machine-host` | 机器服务地址 |
| `8082` | 机器服务 WebSocket 端口 |
| `apiKey` | 认证 API Key |

## Playwright 连接示例

### 基础用法

```typescript
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP(
  'ws://localhost:8082/ws/connect?apiKey=pwk_abc123def456'
);

const page = await browser.newPage();
await page.goto('https://news.ycombinator.com');
console.log(await page.title());

await browser.close();
```

### 多页面操作

```typescript
const browser = await chromium.connectOverCDP(
  'ws://localhost:8082/ws/connect?apiKey=pwk_xxx'
);

// 创建多个页面
const page1 = await browser.newPage();
const page2 = await browser.newPage();

await Promise.all([
  page1.goto('https://example.com'),
  page2.goto('https://playwright.dev'),
]);

// context 级别操作
const context = browser.contexts()[0];
const cookies = await context.cookies();
```

### 带参数连接

```typescript
const browser = await chromium.connectOverCDP(
  'ws://localhost:8082/ws/connect?apiKey=pwk_xxx',
  {
    timeout: 30000,
    slowMo: 50,  // 慢速执行，便于观察
  }
);
```

## 使用场景

### 网页截图

```typescript
const browser = await chromium.connectOverCDP(wsUrl);
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('https://example.com');
await page.screenshot({ path: 'fullpage.png', fullPage: true });
await browser.close();
```

### 自动化测试

```typescript
const browser = await chromium.connectOverCDP(wsUrl);
const page = await browser.newPage();

await page.fill('#search', 'playwright');
await page.click('button[type="submit"]');
await page.waitForSelector('.results');
const results = await page.$$eval('.result', els => els.length);

expect(results).toBeGreaterThan(0);
await browser.close();
```

### 数据采集

```typescript
const browser = await chromium.connectOverCDP(wsUrl);
const page = await browser.newPage();

await page.route('**/api/data', route => {
  const response = await route.fetch();
  const json = await response.json();
  console.log('API 响应:', json);
  await route.fulfill({ response });
});

await page.goto('https://example.com/data-page');
```

## 性能优化

::: tip CDP 直连优势
- **零中转延迟**：直接代理到浏览器，不经过管理服务器
- **全双工通信**：WebSocket 原生二进制传输
- **资源隔离**：每个会话独立浏览器上下文
- **自动重连**：连接断开后可重新获取
:::
