# FAQ 常见问题

## 基础问题

### 适用什么场景？

Playwright User Sys 适用于以下场景：

- **数据采集**：大规模网页数据抓取，需要管理多个浏览器实例
- **自动化测试**：Web 应用的端到端（E2E）测试
- **浏览器集群管理**：多台机器统一管理 Playwright 浏览器实例
- **SaaS 浏览器服务**：对外提供浏览器自动化服务，按量计费
- **反爬研究**：模拟真实用户行为，测试站点安全性

### 和 Puppeteer 有什么区别？

两者面向不同层次：

| 对比维度 | Playwright User Sys | Puppeteer |
|---------|-------------------|-----------|
| **定位** | 浏览器集群管理系统 | 浏览器自动化库 |
| **多用户** | 原生支持，含 RBAC | 需自建 |
| **计费** | 内置积分系统 | 无 |
| **集群** | 支持多机器节点 | 单机 |
| **连接方式** | WebSocket CDP 代理 | 直接 CDP |
| **并发控制** | 内置，含队列和限流 | 需自己实现 |

::: tip
Puppeteer 是浏览器操作工具，Playwright User Sys 是基于 Puppeteer 的管理系统。你可以用 Puppeteer/Playwright 编写脚本，通过本系统管理运行环境。
:::

### 支持哪些浏览器？

当前使用 **Chromium**（通过 Puppeteer 驱动）。Playwright 本身支持 Chromium、Firefox、WebKit，后续版本将扩展支持。

### 和管理浏览器有什么不同？

Playwright User Sys 解决的是**多用户、多机器、可计费**的浏览器管理问题，而非单纯的浏览器自动化库：

- ✅ 用户注册/登录/权限管理
- ✅ API Key 鉴权
- ✅ 积分计费系统
- ✅ 机器节点注册/健康检查
- ✅ 会话生命周期管理
- ✅ 文件上传/分发

### 需要编写代码才能使用吗？

不必须。系统提供：

1. **Web UI**：管理员后台，在线管理用户和会话
2. **REST API**：通过 HTTP 调用所有功能
3. **Client SDK**（TypeScript）：封装好的客户端库
4. **命令行工具**：快速测试和管理

## 部署问题

### 最低配置要求？

| 组件 | 配置 | 用途 |
|------|------|------|
| 管理服务器 | 1核 CPU / 1GB 内存 / 10GB 磁盘 | 运行 API 和数据库 |
| 机器服务 | 2核+ CPU / 4GB+ 内存 / 20GB 磁盘 | 运行浏览器实例 |
| 数据库 | SQLite（开发）/ MySQL 8.0+（生产） | 持久化存储 |
| 网络 | 机器节点需能被管理服务器访问 | gRPC 通信 |

::: tip 注意事项
- 每增加一个浏览器实例约需 200-500MB 内存
- 磁盘建议使用 SSD，尤其是使用 SQLite 时
- 生产环境建议管理服务器和机器服务分部署
:::

### 单机可以部署吗？

可以。在开发环境或小规模使用场景，可以在单台机器上同时运行管理服务器和机器服务：

```bash
# 终端 1：启动管理服务器
pnpm dev

# 终端 2：启动机器服务
pnpm dev:machine
```

单机可支持 5-10 个并发浏览器实例（取决于机器配置）。

### 如何扩容？

系统天然支持水平扩展：

```
                        ┌──────────────┐
                        │   Manager    │
                        │   Server     │
                        └──────┬───────┘
                     ┌─────────┼──────────┐
                     ▼         ▼          ▼
               ┌────────┐ ┌────────┐ ┌────────┐
               │Machine1│ │Machine2│ │MachineN│
               │ 4C/8G  │ │ 4C/8G  │ │ 8C/16G │
               └────────┘ └────────┘ └────────┘
```

扩展步骤：

1. **增加机器节点**：在新的服务器上启动 `pnpm dev:machine`
2. **配置管理地址**：设置 `MANAGER_HOST` 指向管理服务器
3. **自动注册**：机器启动后自动注册到管理服务器

无需修改管理服务器配置或重启。

### 管理服务器会是瓶颈吗？

在单机部署时，管理服务器可能成为瓶颈。建议：

- 生产环境分离部署
- 使用 MySQL 替代 SQLite
- 配置 `@fastify/rate-limit` 限制请求频率
- 监控 gRPC 连接池状态

### 支持 Docker 部署吗？

支持。提供完整 Dockerfile 和 docker-compose 配置：

```bash
# 构建镜像
docker build -t playwright-user-sys .

# 启动
docker-compose up -d
```

详见 [Docker 部署](/deploy/docker)。

## 使用问题

### 如何同时运行多个会话？

通过 SDK 并发创建：

```typescript
import { Client } from './sdk/client.js';

const client = new Client({ apiKey: 'your-api-key' });

// 并发创建 5 个会话
const sessions = await Promise.all(
  Array.from({ length: 5 }, () => client.sessions.create())
);

console.log(`创建了 ${sessions.length} 个会话`);
```

::: warning 并发限制
单个机器节点有 `maxSessions` 上限（默认配置）。超过上限会收到 `MAX_SESSIONS_REACHED` 错误。
:::

### 如何处理验证码？

推荐方案：

1. **第三方打码平台**：将验证码截图发送到打码服务
2. **手动介入**：使用 WebSocket 实时查看浏览器画面
3. **机器学习**：使用 OCR 模型自动识别

示例：集成打码服务

```typescript
import { Client } from './sdk/client.js';

const client = new Client({ apiKey: 'your-api-key' });
const session = await client.sessions.createAndConnect();

// 获取页面截图
const screenshotUrl = await session.screenshot();

// 发送到打码服务处理
const captchaResult = await solveCaptcha(screenshotUrl);

// 填入验证码
await page.fill('#captcha-input', captchaResult);
```

### 如何设置代理？

创建会话时指定代理：

```typescript
const session = await client.sessions.create({
  proxy: 'http://user:password@proxy-host:8080',
  viewport: { width: 1280, height: 720 }
});
```

WebSocket 直连方式：

```bash
# URL 格式
ws://localhost:3000/ws/connect?apiKey=xxx&proxy=http://user:pass@proxy-host:8080
```

或通过 REST API：

```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"proxy": "http://user:pass@proxy-host:8080"}'
```

::: tip
代理支持 `proxyBypass` 参数，跳过特定域名的代理：
```json
{
  "proxy": "http://proxy:8080",
  "proxyBypass": ".local.com,10.0.0.0/8"
}
```
:::

### 如何在已有会话中执行 JavaScript？

通过 CDP 连接后直接使用 Playwright/Puppeteer API：

```typescript
const browser = await playwright.chromium.connectOverCDP(directUrl);
const page = browser.contexts()[0].pages()[0];

// 执行 JS
const title = await page.evaluate(() => document.title);
const html = await page.evaluate(() => document.body.innerHTML);
```

### 如何设置浏览器语言和时区？

```typescript
const session = await client.sessions.create({
  timezone: 'Asia/Shanghai',
  userAgent: 'Mozilla/5.0...',
  viewport: { width: 1920, height: 1080 }
});
```

支持的所有时区可通过 `Intl.supportedValuesOf('timeZone')` 获取。

### 可以共享浏览器数据吗？

可以，使用 `sharedUserData` 参数：

```typescript
// 创建共享数据会话
const session1 = await client.sessions.create({
  sharedUserData: true
});

// 同一个用户再次创建共享会话会提示冲突
```

::: warning
共享模式使用固定的用户数据目录，不会在会话结束时清理。适用于需要保持登录状态的场景。
:::

## 计费问题

### 积分怎么算？

积分按 **浏览器运行时间** 计算：

| 计费项 | 费率 | 说明 |
|--------|------|------|
| 浏览器运行 | 1 积分/分钟 | 不足 1 分钟按 1 分钟算 |
| 文件上传 | 免费 | 不计积分 |
| API 调用 | 免费 | REST API 不计费 |

::: tip
系统每 5 秒检查一次积分使用情况。积分耗尽时会自动关闭浏览器并释放会话。
:::

### 如何查看积分消耗？

```bash
# 通过 API 查看用户信息
curl http://localhost:3000/api/users/me \
  -H "x-api-key: YOUR_API_KEY"

# 响应
# {"success":true,"data":{"credits":950,"credits_used":50,"sessions_count":3}}
```

### 如何为账号充值？

管理员通过 API 充值：

```bash
curl -X POST http://localhost:3000/api/admin/users/1/credits \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount": 1000}'
```

### 如何降低成本？

1. **及时释放会话**：使用完后立即调用 `session.release()`
2. **复用会话**：避免反复创建销毁
3. **使用共享模式**：多个任务共享一个浏览器实例
4. **选择合适的 viewport**：更小的 viewport 占用更少内存
5. **避免空闲连接**：设置 `INSTANCE_TIMEOUT` 自动释放超时会话

### 有免费额度吗？

系统本身不限制，由部署者自行配置初始积分。管理员创建用户时可设置初始积分值。

### 积分耗尽后的数据会丢失吗？

不会。积分耗尽后系统会：

1. 自动关闭浏览器实例
2. 释放会话但保留会话记录
3. 用户数据目录会被清理（独立模式）
4. 用户充值后可重新创建会话

## 连接问题

### CDP 连接断开怎么办？

CDP 连接可能因网络波动、机器重启等原因断开。

**自动重连策略**：

```typescript
import retry from 'async-retry';

async function connectWithRetry(directUrl: string) {
  return retry(
    async () => {
      return await playwright.chromium.connectOverCDP(directUrl);
    },
    {
      retries: 3,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 5000,
    }
  );
}
```

::: warning
如果浏览器进程已终止，重连会失败，需要创建新的会话。
:::

### WebSocket 连接超时？

**可能原因**：

1. 管理服务器未启动或端口不对
2. 防火墙阻止了 WebSocket 连接
3. 机器服务未注册
4. 代理服务器连接目标机器失败

**排查步骤**：

```bash
# 1. 检查管理服务器是否运行
curl http://localhost:3000/api/sessions \
  -H "x-api-key: YOUR_KEY"

# 2. 检查机器是否已注册
curl http://localhost:3000/api/machines \
  -H "x-api-key: YOUR_KEY"

# 3. 测试 WebSocket 连通性
node -e "
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3000/ws/connect?apiKey=YOUR_KEY');
ws.on('open', () => { console.log('连接成功'); ws.close(); });
ws.on('error', (e) => { console.error('连接失败:', e.message); });
"
```

### 收到 Origin 403 错误？

WebSocket 代理服务对 Origin 头进行了验证：

```
HTTP/1.1 403 Forbidden
```

**解决方案**：

1. 检查请求的 `Origin` 头是否为白名单域名
2. 开发环境下，确保 NODE_ENV 正确设置
3. 生产环境下，如有自定义域名，需要修改 Origin 验证逻辑

参考 `src/services/native-websocket-proxy.service.ts:92-109`：

```typescript
const allowedHosts = ['localhost', '127.0.0.1'];
// 生产环境下放行所有 Origin
```

### 跨域问题如何解决？

系统使用 `@fastify/cors` 插件，默认允许跨域。如需自定义：

```typescript
// src/plugins/index.ts
app.register(require('@fastify/cors'), {
  origin: ['https://yourdomain.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
});
```

## 安全问题

### 如何保护 API Key？

1. **使用环境变量**：不要硬编码 API Key
2. **定期轮换**：管理员可定期重置用户的 API Key
3. **最小权限**：只给用户必要的权限
4. **HTTPS**：生产环境启用 HTTPS 加密传输

### API Key 泄露了怎么办？

1. **立即重置**：管理员在后台重置该用户的 API Key
2. **检查日志**：查看 `operation_logs` 表是否有异常操作
3. **通知用户**：告知用户 API Key 已更换

### 数据安全如何保障？

1. **密码加密**：使用 bcryptjs 哈希存储，支持从 SHA-256 自动迁移
2. **JWT 加密**：使用 `HS256` 算法签名，Secret 需妥善保管
3. **数据库加密**：生产环境建议启用数据库加密
4. **日志脱敏**：API Key 在日志中自动替换为 `***REDACTED***`
5. **会话隔离**：每个浏览器实例运行在独立进程中

### 需要配置 HTTPS 吗？

生产环境强烈建议配置 HTTPS：

```typescript
import fs from 'fs';
import path from 'path';

const app = Fastify({
  https: {
    key: fs.readFileSync(path.join(__dirname, 'cert', 'key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'cert', 'cert.pem')),
  },
  logger: true,
});
```

或者使用反向代理（Nginx/Caddy）终止 HTTPS。

## 性能问题

### 单机最大并发量？

取决于机器配置和浏览器负载。参考数据：

| 机器配置 | 并发会话数 | 平均内存 |
|---------|-----------|---------|
| 2核 / 4GB | 5-8 | 300-400MB/实例 |
| 4核 / 8GB | 10-15 | 250-350MB/实例 |
| 8核 / 16GB | 20-30 | 200-300MB/实例 |
| 16核 / 32GB | 40-50 | 200-250MB/实例 |

### 内存占用过高怎么办？

1. **调整 maxSessions**：限制每台机器的最大并发数

```typescript
// src/machine/config.ts
export const CONFIG = {
  maxSessions: 10, // 根据机器内存调整
  // ...
};
```

2. **开启内存优化**：在浏览器启动参数中限制内存

```typescript
const puppeteerOptions = {
  args: [
    '--max_old_space_size=512', // 限制 512MB
    '--js-flags=--max-old-space-size=512',
  ],
};
```

3. **使用共享数据模式**：减少重复的用户数据目录

### 如何优化页面加载速度？

1. **设置合理的 viewport**：避免加载高分辨率图片
2. **拦截不必要的资源**：图片、字体等

```typescript
await page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2}', route => route.abort());
```

3. **启用缓存**：复用已加载资源
4. **使用 DOMContentLoaded**：不等所有资源加载完毕

```typescript
await page.goto(url, { waitUntil: 'domcontentloaded' });
```

### gRPC 连接延迟高？

- 确保机器节点与管理服务器在同一网络（尽可能同一内网）
- 检查防火墙是否限制了 gRPC 端口（默认 50051）
- 使用长连接避免频繁握手
- 系统使用 `@grpc/grpc-js` 自动管理连接池

### 如何评估系统负载？

系统内置了多项监控指标：

1. **活跃连接数**：通过 `getActiveConnectionCount()` 获取
2. **积分消耗速度**：通过 `credits-monitor.service.ts` 的日志
3. **机器状态**：通过 gRPC 健康检查
4. **会话持续时间**：每个会话都有 start_time 和 duration

建议配合 Grafana + Prometheus 搭建完整监控体系。

---

::: tip 更多问题
如果你有本文档未覆盖的问题，欢迎在 [GitHub Issues](https://github.com/dyyz1993/playwright-user-sys/issues) 提出。
:::
