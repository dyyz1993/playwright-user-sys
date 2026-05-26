# WebSocket API

系统提供两种 WebSocket 连接模式。

## 模式一：CDP 直连

通过 WebSocket 代理直接连接浏览器 CDP（Chrome DevTools Protocol）。

```
ws://<host>:8082/ws/connect?apiKey=<API_KEY>
```

**流程：**

```
客户端                   机器服务                 浏览器
  │                        │                       │
  │── WS Connect ────────► │                       │
  │                        │── 创建浏览器实例 ────► │
  │                        │◄── CDP Endpoint ───── │
  │◄── Proxy URL ──────── │                       │
  │── CDP WebSocket ─────► │ ── 代理转发 ────────► │
  │                        │                       │
```

**连接示例：**

```javascript
const { chromium } = require('playwright');

// 通过 CDP 直连
const browser = await chromium.connectOverCDP(
  'ws://localhost:8082/ws/connect?apiKey=my-api-key'
);

const page = await browser.newPage();
await page.goto('https://example.com');
console.log(await page.title());

await browser.close();
```

## 模式二：会话模式

通过管理服务器分配的会话 ID 连接。

```
ws://<host>:3000/ws/connect?sessionId=<SESSION_ID>&token=<JWT_TOKEN>
```

**流程：**

```
客户端                 管理服务器                 机器服务
  │                        │                        │
  │── API 创建会话 ──────► │                        │
  │                        │── gRPC 分配实例 ──────►│
  │◄── 会话信息 ────────── │◄── Endpoint ────────── │
  │                        │                        │
  │── WS Connect ────────► │── 代理 WebSocket ────► │
  │◄── 双向 CDP 转发 ──── │◄── 双向转发 ────────── │
  │                        │                        │
  │── API 释放会话 ──────► │                        │
  │                        │── gRPC 释放实例 ──────►│
```

## 协议细节

### 消息格式

WebSocket 消息以二进制帧传输 CDP 协议数据，格式为 **WebSocket 二进制消息**。

### 连接状态

| 状态 | 说明 |
|------|------|
| `connecting` | 正在建立连接 |
| `connected` | CDP 连接已建立 |
| `disconnected` | 连接已断开 |
| `error` | 连接出错 |

### 心跳机制

连接建立后，服务端每 30 秒发送心跳帧，客户端需在 60 秒内响应，否则连接将被关闭。

## 错误码

| 错误码 | 说明 |
|--------|------|
| `AUTH_FAILED` | 认证失败，API Key 或 Token 无效 |
| `SESSION_NOT_FOUND` | 会话不存在或已释放 |
| `MACHINE_UNAVAILABLE` | 无可用的机器节点 |
| `CREDITS_INSUFFICIENT` | 积分不足 |
| `CONNECTION_TIMEOUT` | 连接超时 |
| `SESSION_EXPIRED` | 会话已过期 |
| `INTERNAL_ERROR` | 内部错误 |

## 使用 Playwright 连接

### connectOverCDP （推荐）

```typescript
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP(
  'ws://localhost:8082/ws/connect?apiKey=xxx'
);
```

### connect （传统方式）

```typescript
import { chromium } from 'playwright';

const browser = await chromium.connect(
  'ws://localhost:3000/ws/connect?sessionId=xxx&token=yyy'
);
```
