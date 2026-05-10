# 用户使用生命周期

## 总览

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  ① 注册   │ →  │  ② 认证   │ →  │ ③ 创建会话 │ →  │ ④ CDP连接 │ →  │  ⑤ 使用   │ →  │ ⑥ 释放    │
│          │    │          │    │          │    │          │    │          │    │          │
│ POST      │    │ API Key  │    │ SDK →    │    │ WS →     │    │ 上传/截图 │    │ 扣费+清理 │
│ /api/users│    │ 或 JWT   │    │ Manager  │    │ Machine  │    │ 操作     │    │ 全链路   │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
```

## 三层架构

```
  SDK 客户端              Manager 服务器              Machine 服务
 ┌─────────┐         ┌──────────────────┐        ┌───────────────┐
 │ client   │ HTTP/WS │ Fastify API      │  gRPC  │ Puppeteer     │
 │ session  │◄───────►│ 认证/计费/调度    │◄──────►│ 浏览器管理     │
 │ types    │         │ WebSocket 代理   │        │ CDP 代理      │
 └─────────┘         └──────────────────┘        │ 文件服务       │
       │                      │                   └───────┬───────┘
       │    x-api-key         │                          │
       └──────────────────────┘                          │
                                                         │ Puppeteer
                                                         │ launch()
                                                    ┌────▼────┐
                                                    │ Chromium │
                                                    └─────────┘
```

---

## ① 注册阶段

**API**: `POST /api/users` (管理员)

```
管理员 → POST /api/users → UserController.createUser()
  │
  ├─ Zod 验证 (username, password, credits...)
  ├─ UserModel.create()
  │    ├─ bcrypt.hash(password, 10)
  │    ├─ apiKey = uuidv4()              ← 自动生成 API Key
  │    └─ INSERT INTO users (...)
  └─ 返回 { id, username, api_key, credits, ... }
```

### 创建子用户示例

```bash
curl -X POST http://192.168.0.29:3011/api/users \
  -H 'Authorization: Bearer <JWT>' \
  -H 'Content-Type: application/json' \
  -d '{
    "username": "user1",
    "password": "MyPass123",
    "credits": 500
  }'

# 返回
{ "data": { "id": 1, "api_key": "uuid-v4...", "credits": 500 } }
```

---

## ② 认证阶段

两种方式并行：

| 方式 | 适用场景 | Header | 中间件 |
|------|---------|--------|--------|
| **API Key** | SDK 编程调用 | `x-api-key: <key>` | `verifyApiKey` |
| **JWT Token** | 管理后台 | `Authorization: Bearer <jwt>` | `verifyJWT` |
| **混合** | 通用接口 | 二选一 | `verifyJWTOrApiKey` |

```
请求 → auth.plugin.ts
         │
         ├─ 有 Authorization header? → verifyJWT → JWT decode → findByUserId
         │
         ├─ 有 x-api-key header?     → verifyApiKey → findByApiKey
         │
         └─ 都没有?                   → 401 "未提供授权令牌或 API Key"
```

---

## ③ 创建会话

### 完整调用链

```
SDK: client.sessions.createAndConnect()
  │
  │ POST /api/sessions
  │ Header: x-api-key: <key>
  │
  ▼
SessionController.createSession()
  │
  ▼
SessionService.createBrowserSession()
  │
  ├─ ① 检查积分 > 0                    → 402 积分不足
  │
  ├─ ② 检查并发会话限制                 → 429 超过限制
  │
  ├─ ③ MachineModel.findAvailable()    → 500 无可用机器
  │     (选 instance_count < max_instances 的机器)
  │
  ├─ ④ 事务开始:
  │     INSERT sessions (status: CREATED)
  │     UPDATE machines SET instance_count + 1
  │
  ├─ ⑤ connectionManager.launchBrowser(machineId, sessionId)
  │     │  gRPC: LaunchBrowser
  │     ▼
  │   Machine gRPC Handler
  │     │
  │     ▼
  │   BrowserService.launchBrowser()
  │     ├─ 计算 userDataDir (指纹隔离)
  │     ├─ generateFingerprint() (浏览器指纹)
  │     ├─ puppeteer.launch({ headless, args, proxy })
  │     ├─ page.setViewportSize()
  │     ├─ 注入 localStorage/cookies (storageState)
  │     └─ 设置事件监听 (disconnected, targetChanged)
  │
  ├─ ⑥ 构建 WebSocket URL:
  │     ws://{PUBLIC_MANAGER_URL}/ws/connect?sessionId=xxx
  │
  └─ ⑦ 返回 Session 实例
        { id, status, directUrl, viewerUrl }
```

### 响应

```json
{
  "data": {
    "id": "a1b2c3d4-session-id",
    "status": "created",
    "directUrl": "ws://192.168.0.29:3011/ws/connect?sessionId=a1b2c3d4",
    "viewerUrl": "http://192.168.0.29:3011/viewer?sessionId=a1b2c3d4"
  }
}
```

---

## ④ CDP 连接

Playwright 通过 WebSocket 连接到远程浏览器：

```
Playwright SDK                          Manager                          Machine
     │                                    │                                │
     │  ws://manager/ws/connect           │                                │
     │  ?sessionId=xxx&token=jwt          │                                │
     ├───────────────────────────────────►│                                │
     │                                    │  httpProxy.ws()                │
     │                                    ├───────────────────────────────►│
     │                                    │  ws://machine:port?sid=xxx     │
     │                                    │                                │
     │        ◄─── 双向 CDP 协议代理 ───► │ ◄──── 双向 WebSocket ────►    │
     │                                    │                                │
```

### 连接代码

```typescript
// Playwright 连接远程浏览器
import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP(
  'ws://192.168.0.29:3011/ws/connect?sessionId=a1b2c3d4&token=jwt-token'
)
const page = browser.contexts()[0].pages()[0]
await page.goto('https://example.com')
```

---

## ⑤ 使用阶段

### 5.1 浏览器操作（通过 Playwright）

```typescript
// 用户通过 Playwright 直接操控浏览器
await page.goto('https://example.com')
await page.click('#button')
await page.fill('#input', 'text')
await page.screenshot({ path: 'screenshot.png' })
```

### 5.2 远程文件上传（SDK）

```
场景 A: 本地文件上传

SDK 用户                    Manager                     Machine
  │                           │                           │
  │ ① POST /api/files/upload-session                     │
  │   (multipart: file + sessionId)                       │
  ├──────────────────────────►│                           │
  │                           │ ② gRPC: TransferFile     │
  │                           │   (filename + bytes)      │
  │                           ├──────────────────────────►│
  │                           │                           │ fileService
  │                           │   ③ { machineFilePath }   │ .storeFile()
  │                           │◄──────────────────────────┤
  │  ④ { machineFilePath }    │                           │
  │◄──────────────────────────┤                           │
  │                           │                           │
  │ ⑤ POST /api/sessions/:id/inject-file                 │
  │   { machineFilePath, selector }                       │
  ├──────────────────────────►│                           │
  │                           │ ⑥ gRPC: InjectFile       │
  │                           ├──────────────────────────►│
  │                           │                           │ browserInject
  │                           │   ⑦ { success: true }    │ .injectFile()
  │                           │◄──────────────────────────┤   └─ uploadFile()
  │  ⑧ { success: true }     │                           │   └─ setInputFiles
  │◄──────────────────────────┤                           │
```

```typescript
// SDK 一行代码完成
await session.uploadFile('/path/to/image.png', 'input[type="file"]')
```

### 5.3 URL 下载注入（SDK）

```
场景 B: 远程 URL 文件

SDK 用户                    Manager                     Machine
  │                           │                           │
  │ POST /api/sessions/:id/upload-url                     │
  │ { url, selector }        │                           │
  ├──────────────────────────►│                           │
  │                           │ gRPC: DownloadAndInject   │
  │                           ├──────────────────────────►│
  │                           │                           │ ① fetch(url)
  │                           │                           │ ② fileService
  │                           │                           │    .downloadFromUrl()
  │                           │                           │ ③ browserInject
  │                           │   { success, size }       │    .injectFile()
  │                           │◄──────────────────────────┤
  │ { success, size }         │                           │
  │◄──────────────────────────┤                           │
```

```typescript
// SDK 一行代码
await session.uploadFileFromUrl('https://example.com/image.png', '#upload')
```

### 5.4 截图

```
GET /api/sessions/:id/screenshot → 返回截图 URL
```

---

## ⑥ 释放会话

### 触发方式

| 触发 | 方式 |
|------|------|
| SDK 主动释放 | `session.release()` → `DELETE /api/sessions/:id` |
| WebSocket 断开 | WS close 事件 → 自动触发 |
| 积分耗尽 | 定时监控检测 → 强制关闭 |
| 超时无活动 | Machine 检测 → 延迟关闭 |
| 管理员强制 | `POST /api/sessions/:id/close` (force: true) |
| Machine 断连 | gRPC 流断开 → 标记离线 |

### 完整清理链

```
releaseSession()
  │
  ├─ ① 结算费用 (事务)
  │     duration = (now - start_time) / 1000
  │     creditsUsed = max(1, ceil(duration / 60))
  │     UPDATE sessions SET status=DISCONNECTED, credits_used
  │     UPDATE users SET credits = credits - creditsUsed
  │     INSERT credit_history
  │     UPDATE machines SET instance_count - 1
  │
  ├─ ② gRPC: CloseBrowser → Machine
  │     └─ BrowserService.closeBrowser()
  │          ├─ browser.close()           (关闭 Chromium)
  │          ├─ 等待 500ms                 (OS 释放文件锁)
  │          ├─ 删除 userDataDir           (清理指纹数据)
  │          ├─ 清理 sessions Map
  │          └─ fileService.cleanupSessionFiles()  (清理上传的临时文件)
  │
  └─ ③ Webhook 通知
       POST user.webhook_url { event: SESSION_DISCONNECTED }
```

---

## 积分计费

### 规则

```
计费单位: 1 点/分钟 (不足1分钟按1分钟计)
计费频率: 每10秒批量结算
最低消耗: 每次会话至少 1 点

余额 <= 0 → 关闭所有会话 + Webhook 通知
余额 < 阈值 → 低余额警告 Webhook
```

### 扣费时机

```
创建会话 → 检查积分 > 0
              │
              ├─ 每10秒定时扣费 ◄─── credits-monitor
              ├─ 释放时结算    ◄─── releaseSession
              └─ 积分耗尽立即关闭 ◄─── credits-monitor
```

---

## Session 状态机

```
                        createBrowserSession()
                               │
                               ▼
                         ┌──────────┐
                 ┌──────│  CREATED  │──────┐
                 │      └──────────┘      │
                 │ (WS连接成功)            │ (创建失败)
                 │ Machine上报'connected'  │ 浏览器启动失败
                 ▼                         ▼
           ┌───────────┐            ┌─────────┐
           │ CONNECTED │            │  ERROR  │
           └─────┬─────┘            └─────────┘
                 │
     ┌───────────┼───────────┬──────────────┐
     │           │           │              │
     ▼           ▼           ▼              ▼
┌──────────┐ ┌────────┐ ┌─────────┐ ┌──────────┐
│DISCONNEC-│ │COMPLETED│ │  ERROR  │ │  EXPIRED │
│   TED    │ │(主动释放)│ │(浏览器崩溃)│ │(超时)    │
└──────────┘ └────────┘ └─────────┘ └──────────┘
     ▲
     │ 所有终态都会触发:
     │  - 积分结算
     │  - instance_count--
     │  - 临时文件清理
     │  - Webhook 通知
```

---

## 异常场景

| 场景 | 检测方 | 处理 |
|------|--------|------|
| 积分耗尽 | credits-monitor (每10s) | 关闭所有会话 + Webhook |
| 浏览器崩溃 | browser 'disconnected' | 清理代理 + 标记 ERROR |
| WebSocket 断开 | WS close 事件 | 延迟关闭 (给重连机会) |
| Machine 离线 | gRPC 流断开 | 标记所有会话 DISCONNECTED |
| 超时无活动 | Machine 定时器 | disconnectionTimeout 后关闭 |
| 网络抖动 | WS 断连重连 | 延迟窗口内可重连 |

---

## 完整 SDK 调用示例

```typescript
import { Client } from './sdk/client.js'

// 1. 创建客户端
const client = new Client({
  apiKey: '0e29ce3f-1a22-4f1e-8fb5-ffb3bf781880',
  baseUrl: 'http://192.168.0.29:3011'
})

// 2. 创建会话 (自动分配 Machine + 启动浏览器)
const session = await client.sessions.createAndConnect({
  // 可选: width, height, proxy, timezone, etc.
})

// 3. Playwright 连接
const { chromium } = require('playwright')
const browser = await chromium.connectOverCDP(session.directUrl)
const page = browser.contexts()[0].pages()[0]

// 4. 浏览器操作
await page.goto('https://example.com/upload')

// 5. 远程文件上传 (一行搞定!)
await session.uploadFile('/local/path/image.png', 'input[type="file"]')

// 或者上传远程 URL 文件
await session.uploadFileFromUrl('https://cdn.example.com/doc.pdf', '#file-input')

// 6. 释放会话 (自动扣费 + 清理)
await session.release()
```
