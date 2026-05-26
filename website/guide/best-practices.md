# 最佳实践

## 1. 会话管理最佳实践

### 1.1 使用连接池

复用 Client 实例，避免重复创建：

```typescript
// ❌ 错误：每次请求都创建新的 Client
async function badPractice() {
  const client = new Client({ apiKey: 'xxx' });
  const session = await client.sessions.create();
  // ... 使用后 client 被丢弃
}

// ✅ 正确：复用 Client 实例
import { Client } from '@playwright-user-sys/sdk';

class SessionPool {
  private client: Client;
  private activeSessions: Set<string> = new Set();

  constructor(apiKey: string) {
    this.client = new Client({ apiKey });
  }

  async acquire(): Promise<string> {
    const session = await this.client.sessions.create();
    this.activeSessions.add(session.id);
    return session.id;
  }

  async release(sessionId: string): Promise<void> {
    await this.client.sessions.release(sessionId);
    this.activeSessions.delete(sessionId);
  }

  async releaseAll(): Promise<void> {
    for (const id of this.activeSessions) {
      await this.client.sessions.release(id).catch(console.error);
    }
  }
}
```

### 1.2 优雅的错误处理

使用 `try-finally` 确保资源释放：

```typescript
async function safeSessionWork(apiKey: string) {
  const client = new Client({ apiKey });
  let sessionId: string | null = null;

  try {
    const session = await client.sessions.create({
      viewport: { width: 1280, height: 720 },
    });
    sessionId = session.id;

    const browser = await playwright.chromium.connectOverCDP(session.directUrl!);
    const page = browser.contexts()[0].pages()[0];
    await page.goto('https://example.com');
    const title = await page.title();
    return title;
  } catch (error) {
    console.error('工作执行失败:', error);
    throw error;
  } finally {
    if (sessionId) {
      await client.sessions.release(sessionId).catch(console.error);
    }
  }
}
```

### 1.3 自动释放超时会话

配置 `INSTANCE_TIMEOUT` 环境变量：

```bash
# .env
INSTANCE_TIMEOUT=120000  # 2 分钟无活动自动释放
```

程序化设置：

```typescript
const session = await client.sessions.create({
  timeout: 120000, // 毫秒
});
```

### 1.4 批量操作

批量释放多个会话：

```typescript
async function batchRelease(sessionIds: string[], apiKey: string) {
  const client = new Client({ apiKey });

  const results = await Promise.allSettled(
    sessionIds.map(id => client.sessions.release(id))
  );

  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length > 0) {
    console.warn(`${failed.length} 个会话释放失败`);
  }
}
```

## 2. 性能优化

### 2.1 页面加载优化

**拦截不必要的资源**：

```typescript
async function optimizePageLoad(page: any) {
  // 拦截图片和字体
  await page.route('**/*.{png,jpg,jpeg,gif,svg,ico,woff,woff2,ttf,eot}', route => {
    route.abort();
  });

  // 拦截广告和分析脚本
  await page.route(/(doubleclick|google-analytics|facebook)\.com/, route => {
    route.abort();
  });

  // 只等待 DOM 就绪，不等待所有资源
  await page.goto('https://example.com', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
}
```

**设置合理的等待策略**：

```typescript
// ✅ 等待特定元素出现
await page.waitForSelector('#content', { timeout: 10000 });

// ✅ 等待网络空闲
await page.waitForLoadState('networkidle', { timeout: 15000 });

// ❌ 避免固定等待
await new Promise(r => setTimeout(r, 5000));
```

### 2.2 网络拦截与修改

```typescript
// 路由拦截 - 修改请求头
await page.route('**/api/**', async (route: Route, request: Request) => {
  const headers = {
    ...request.headers(),
    'Authorization': `Bearer ${customToken}`,
  };
  await route.continue({ headers });
});

// 路由拦截 - 模拟响应
await page.route('**/captcha', async (route: Route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true }),
  });
});
```

### 2.3 缓存策略

```typescript
// 启用磁盘缓存
const browser = await playwright.chromium.launch({
  args: ['--disk-cache-size=104857600'], // 100MB 缓存
});

// 复用已加载的页面
let cachedPage: any = null;

async function getPage(browser: any) {
  if (cachedPage && !cachedPage.isClosed()) {
    return cachedPage;
  }
  const context = browser.contexts()[0] || await browser.createContext();
  cachedPage = await context.newPage();
  return cachedPage;
}
```

### 2.4 并发控制

```typescript
class ConcurrencyController {
  private queue: Array<() => Promise<void>> = [];
  private running = 0;
  private maxConcurrency: number;

  constructor(max = 5) {
    this.maxConcurrency = max;
  }

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const task = async () => {
        try {
          this.running++;
          const result = await fn();
          resolve(result);
        } catch (e) {
          reject(e);
        } finally {
          this.running--;
          this.processNext();
        }
      };
      this.queue.push(task);
      this.processNext();
    });
  }

  private processNext() {
    if (this.running < this.maxConcurrency && this.queue.length > 0) {
      const task = this.queue.shift()!;
      task();
    }
  }
}

// 使用示例
const controller = new ConcurrencyController(3);
const urls = ['https://a.com', 'https://b.com', 'https://c.com'];

const results = await Promise.all(
  urls.map(url =>
    controller.add(async () => {
      const page = await browser.newPage();
      await page.goto(url);
      return await page.title();
    })
  )
);
```

### 2.5 Viewport 优化

```typescript
// ✅ 按需设置 viewport，避免过大
const session = await client.sessions.create({
  viewport: {
    width: 1024,  // 桌面端常用宽度
    height: 768,
  },
});

// ✅ 移动端模拟使用更小 viewport
const mobileSession = await client.sessions.create({
  viewport: {
    width: 375,
    height: 812,
  },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)...',
});
```

## 3. 成本控制

### 3.1 积分使用策略

**按需创建会话**：

```typescript
// ❌ 提前创建多个会话
const sessions = await Promise.all(
  Array(5).fill(null).map(() => client.sessions.create())
);

// ✅ 需要时才创建
async function createSessionWhenNeeded() {
  // 先检查当前活跃会话数
  const existing = await client.sessions.list(1, 100);
  if (existing.length < 3) {
    return await client.sessions.create();
  }
  // 复用最早的会话
  const oldest = existing[0];
  return oldest;
}
```

### 3.2 自动释放策略

```typescript
// 定时检查并释放空闲会话
class IdleSessionReaper {
  private client: Client;
  private timer: NodeJS.Timeout | null = null;
  private readonly idleThreshold: number;

  constructor(apiKey: string, idleMinutes: number = 5) {
    this.client = new Client({ apiKey });
    this.idleThreshold = idleMinutes * 60 * 1000;
  }

  start() {
    this.timer = setInterval(async () => {
      const sessions = await this.client.sessions.list(1, 50);
      const now = Date.now();

      for (const session of sessions) {
        if (session.status !== 'active') continue;

        const idle = now - new Date(session.updated_at || session.created_at).getTime();
        if (idle > this.idleThreshold) {
          console.log(`释放空闲会话: ${session.id}`);
          await this.client.sessions.release(session.id);
        }
      }
    }, 60000); // 每分钟检查一次
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
```

### 3.3 按需启动浏览器

```typescript
// 只在需要时连接浏览器，避免占用机器资源
async function lazyConnect(sessionId: string, apiKey: string) {
  const client = new Client({ apiKey });

  // 先查询会话信息
  const info = await client.sessions.get(sessionId);

  // 检查状态
  if (info.status !== 'active') {
    throw new Error('会话已过期');
  }

  // 需要操作时才连接
  if (info.directUrl) {
    const browser = await playwright.chromium.connectOverCDP(info.directUrl);
    return browser;
  }

  return null;
}
```

### 3.4 批量操作降低成本

```typescript
// 在同一个会话中完成多个任务
async function batchTasks(apiKey: string) {
  const client = new Client({ apiKey });
  const session = await client.sessions.create();
  const browser = await playwright.chromium.connectOverCDP(session.directUrl!);

  const tasks = [
    { url: 'https://a.com', selector: 'h1' },
    { url: 'https://b.com', selector: '.title' },
    { url: 'https://c.com', selector: '#header' },
  ];

  const results = [];
  for (const task of tasks) {
    const page = await browser.newPage();
    await page.goto(task.url, { waitUntil: 'domcontentloaded' });
    const text = await page.textContent(task.selector);
    results.push({ url: task.url, text });
    await page.close();
  }

  // 只创建了 1 个会话，完成了 3 个任务
  await session.release();
  return results;
}
```

## 4. 安全实践

### 4.1 API Key 管理

```typescript
// ❌ 错误：硬编码
const client = new Client({ apiKey: 'sk-1234567890abcdef' });

// ✅ 正确：环境变量
const client = new Client({
  apiKey: process.env.PLAYWRIGHT_API_KEY!,
});

// ✅ 高级：使用密钥管理服务
import { SecretsManager } from '@aws-sdk/client-secrets-manager';

async function getApiKey(): Promise<string> {
  const client = new SecretsManager({ region: 'us-east-1' });
  const secret = await client.getSecretValue({ SecretId: 'playwright/api-key' });
  return JSON.parse(secret.SecretString!).apiKey;
}
```

### 4.2 HTTPS 配置

```typescript
import Fastify from 'fastify';
import fs from 'fs';

const app = Fastify({
  https: {
    key: fs.readFileSync('/etc/ssl/private/key.pem'),
    cert: fs.readFileSync('/etc/ssl/certs/cert.pem'),
  },
});

// 强制重定向 HTTP → HTTPS
app.addHook('onRequest', async (request, reply) => {
  if (request.headers['x-forwarded-proto'] === 'http') {
    return reply.redirect(301, `https://${request.host}${request.url}`);
  }
});
```

### 4.3 输入验证

所有用户输入必须经过 Zod Schema 验证：

```typescript
import { z } from 'zod';

const createSessionSchema = z.object({
  viewport: z.object({
    width: z.number().min(320).max(7680),
    height: z.number().min(240).max(4320),
  }).optional(),
  proxy: z.string().url().optional(),
  userAgent: z.string().max(512).optional(),
  timezone: z.string().max(64).optional(),
  sharedUserData: z.boolean().optional(),
});

// 验证输入
const validated = createSessionSchema.parse(request.body);
```

### 4.4 日志脱敏

```typescript
function sanitizeLog(obj: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...obj };

  // 脱敏 API Key
  if (typeof sanitized.apiKey === 'string') {
    sanitized.apiKey = '***REDACTED***';
  }

  // 脱敏密码
  if (typeof sanitized.password === 'string') {
    sanitized.password = '***REDACTED***';
  }

  // 脱敏 Token
  if (typeof sanitized.token === 'string' && sanitized.token.length > 10) {
    sanitized.token = sanitized.token.slice(0, 8) + '...';
  }

  return sanitized;
}

// 使用
logger.info('请求参数:', sanitizeLog(params));
```

## 5. 错误处理

### 5.1 重试策略

使用 `async-retry` 库实现指数退避重试：

```typescript
import retry from 'async-retry';

async function createSessionWithRetry(client: Client) {
  return retry(
    async (bail, attempt) => {
      console.log(`尝试创建会话 (第 ${attempt} 次)`);

      try {
        return await client.sessions.create();
      } catch (error: any) {
        // 不可重试的错误，直接抛出
        if (error.message.includes('MAX_SESSIONS_REACHED')) {
          bail(error);
          return;
        }
        // 其他错误继续重试
        throw error;
      }
    },
    {
      retries: 3,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 10000,
      randomize: true,
    }
  );
}
```

### 5.2 优雅降级

```typescript
async function fetchWithDegradation(url: string, client: Client) {
  let browser: any = null;

  try {
    const session = await client.sessions.create();
    browser = await playwright.chromium.connectOverCDP(session.directUrl!);
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    return await page.content();
  } catch (error) {
    // 降级：直接 HTTP 请求
    console.warn('浏览器获取失败，降级到 HTTP 请求:', error);
    const response = await fetch(url);
    return await response.text();
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
```

### 5.3 日志记录

```typescript
class SessionLogger {
  private logDir: string;

  constructor(logDir: string = './logs') {
    this.logDir = logDir;
    fs.mkdirSync(logDir, { recursive: true });
  }

  logSessionEvent(event: string, data: Record<string, unknown>) {
    const entry = {
      timestamp: new Date().toISOString(),
      event,
      ...sanitizeLog(data),
    };
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(
      path.join(this.logDir, `session-${new Date().toISOString().slice(0, 10)}.log`),
      line
    );
  }

  logError(context: string, error: Error, sessionId?: string) {
    this.logSessionEvent('error', {
      context,
      sessionId,
      error: error.message,
      stack: error.stack?.slice(0, 500), // 限制堆栈长度
    });
  }
}

// 使用
const logger = new SessionLogger();
try {
  const session = await client.sessions.create();
  logger.logSessionEvent('session_created', { sessionId: session.id });
} catch (error: any) {
  logger.logError('创建会话', error);
}
```

### 5.4 告警配置

```typescript
class AlertManager {
  private webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  async sendAlert(level: 'warning' | 'critical', message: string, details?: Record<string, unknown>) {
    await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level,
        message,
        details,
        timestamp: new Date().toISOString(),
      }),
    });
  }

  // 活跃会话过多告警
  async checkSessionCount(client: Client, threshold: number) {
    const sessions = await client.sessions.list(1, 100);
    if (sessions.length > threshold) {
      await this.sendAlert('warning', `活跃会话数超过阈值: ${sessions.length}`, {
        threshold,
        current: sessions.length,
      });
    }
  }

  // 积分不足告警
  async checkCredits(client: Client, userId: string, minCredits: number) {
    const user = await fetch(`http://localhost:3000/api/users/${userId}`, {
      headers: { 'x-api-key': client['apiKey'] },
    }).then(r => r.json());

    if (user.data?.credits < minCredits) {
      await this.sendAlert('critical', `用户 ${userId} 积分不足`, {
        credits: user.data?.credits,
        minCredits,
      });
    }
  }
}
```

### 5.5 全局错误处理

参考 `src/manager/server.ts` 中的处理方式：

```typescript
// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常:', error);
  // 记录到文件
  fs.appendFileSync('crash.log',
    `[${new Date().toISOString()}] FATAL: ${error.stack}\n`
  );
  process.exit(1);
});

// 处理未处理的 Promise 拒绝
process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的 Promise 拒绝:', promise, 'reason:', reason);
});
```

---

::: tip 持续更新
本最佳实践会根据社区反馈和项目发展持续更新。如有建议，欢迎通过 GitHub Issues 提出。
:::
