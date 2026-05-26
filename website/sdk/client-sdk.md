# Client SDK 使用指南

## 安装

SDK 位于项目 `src/sdk/` 目录下，可直接引用：

```bash
# 通过 npm 安装（发布后）
npm install playwright-user-sys-sdk

# 或直接在项目中引用源码
import { Client } from './src/sdk/client.js';
```

## 初始化

```typescript
import { Client } from 'playwright-user-sys-sdk';

const client = new Client({
  apiKey: 'your-api-key',
  baseUrl: 'http://localhost:3000',  // 可选，默认 localhost:3000
});
```

## 创建会话

```typescript
// 创建基本会话
const sessionData = await client.sessions.create();

// 创建带选项的会话
const sessionData = await client.sessions.create({
  headless: true,
  viewport: { width: 1280, height: 720 },
});

console.log(sessionData);
// {
//   id: 'sess_abc123',
//   status: 'active',
//   browserWSEndpoint: 'ws://...',
//   directUrl: 'ws://...',
//   ...
// }
```

## 创建并连接（使用 Session 实例）

```typescript
// 创建会话并返回 Session 实例（支持文件上传等高级操作）
const session = await client.sessions.createAndConnect();

console.log(session.id);        // 会话 ID
console.log(session.status);    // 当前状态
console.log(session.directUrl); // CDP 直连地址
console.log(session.viewerUrl); // 实时查看器地址
```

## 连接浏览器

使用 `connectOverCDP` 连接到会话：

```typescript
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP(session.directUrl);
const page = await browser.newPage();
await page.goto('https://example.com');
await page.screenshot({ path: 'example.png' });
```

## 文件上传

```typescript
// 上传文件到浏览器
await session.uploadFile('/path/to/file.pdf', 'input[type="file"]');

// 通过 URL 上传
await session.uploadUrl('https://example.com/file.pdf', 'input[type="file"]');
```

## 获取截图

```typescript
const screenshot = await client.sessions.getScreenshot(session.id);
console.log(screenshot.screenshot_url);
```

## 释放会话

```typescript
const result = await client.sessions.release(session.id);
console.log(`会话 ${result.id} 已释放，使用时长: ${result.duration} 秒`);
```

## 完整示例

```typescript
import { Client } from 'playwright-user-sys-sdk';
import { chromium } from 'playwright';

async function main() {
  const client = new Client({ apiKey: 'pwk_xxx' });

  const session = await client.sessions.createAndConnect();
  console.log(`会话已创建: ${session.id}`);

  const browser = await chromium.connectOverCDP(session.directUrl!);
  const page = await browser.newPage();

  await page.goto('https://example.com');
  const title = await page.title();
  console.log(`页面标题: ${title}`);

  await page.screenshot({ path: 'screenshot.png' });
  await session.uploadFile('./screenshot.png', 'input[type="file"]');

  await browser.close();
  await client.sessions.release(session.id);
  console.log('会话已释放');
}

main().catch(console.error);
```
