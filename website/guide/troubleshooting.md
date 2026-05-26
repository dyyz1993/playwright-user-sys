# 错误排查指南

## 连接问题

### WebSocket connect failed

**症状**：

```
Error: WebSocket.connect failed
    at WebSocket.connect (...)
    at connectOverCDP (...)
```

**可能原因**：

1. 管理服务器未启动
2. 端口错误或防火墙拦截
3. `apiKey` 参数缺失或错误
4. 机器节点未注册

**排查步骤**：

```bash
# 1. 检查管理服务器是否运行
curl http://localhost:3000/api/health
# 预期: 200 OK

# 2. 检查机器节点是否已注册
curl http://localhost:3000/api/machines \
  -H "x-api-key: YOUR_API_KEY"
# 预期: 返回机器列表，非空

# 3. 测试 WebSocket 连通性
node -e "
const WebSocket = require('ws');
const url = 'ws://localhost:3000/ws/connect?apiKey=YOUR_API_KEY&width=800&height=600';
const ws = new WebSocket(url, {
  headers: { 'x-api-key': 'YOUR_API_KEY' }
});
ws.on('open', () => { console.log('✅ WebSocket 连接成功'); ws.close(); });
ws.on('error', (e) => console.error('❌ WebSocket 错误:', e.message));
ws.on('unexpected-response', (req, res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.error('❌ 服务端响应:', res.statusCode, data));
});
"
```

**解决方案**：

```bash
# 确保管理服务和机器服务都在运行
# 终端 1
pnpm dev

# 终端 2
pnpm dev:machine
```

### CDP connection timeout

**症状**：

```
Error: connect ETIMEDOUT <ip>:<port>
    at TCPConnectWrap.afterConnect [as oncomplete] (net.js:1161:16)
```

**原因**：

浏览器实例启动后，客户端无法通过 CDP 端口连接到机器。通常是因为网络不通或防火墙规则。

**解决方案**：

```bash
# 检查机器节点端口连通性
nc -zv <machine_ip> <proxy_port>

# 检查防火墙规则
iptables -L -n | grep <proxy_port>

# 检查管理服务器日志中的机器 IP
# 日志位置: 管理服务器控制台输出
```

如果机器有多个网络接口，确保 `PUBLIC_MACHINE_ENDPOINT` 配置正确：

```bash
# .env
PUBLIC_MACHINE_ENDPOINT=<公网IP>:<端口>
```

### Origin 403 Forbidden

**症状**：

```
HTTP/1.1 403 Forbidden
WebSocket connection to 'ws://...' failed
```

**原因**：

WebSocket 代理服务对 `Origin` 头进行了验证。在 `src/services/native-websocket-proxy.service.ts:92-109` 中：

```typescript
const allowedHosts = ['localhost', '127.0.0.1'];
const originHost = new URL(origin).hostname;
if (!allowedHosts.includes(originHost)) {
  // 非开发环境 Origin 被拒绝
}
```

**解决方案**：

```typescript
// 移除 Origin 头（浏览器扩展中使用）
// 或确保调用方 Origin 在白名单中

// 代码层面：修改 allowedHosts 列表
const allowedHosts = ['localhost', '127.0.0.1', 'yourdomain.com'];
```

### gRPC connection dropped

**症状**：

```
UNAVAILABLE: Connection dropped
```

**原因**：

机器节点与管理服务器的 gRPC 连接断开。

**自动恢复机制**：

系统内置了自动重连逻辑（参考 `src/machine/app.ts`）：

```typescript
// 指数退避重连，最多 10 次
// 重试间隔: 1s → 2s → 4s → ... → 60s
// 重连失败后进入 60s 冷却期
```

**人工排查**：

```bash
# 1. 检查管理服务器状态
curl http://localhost:3000/api/machines

# 2. 检查机器日志
journalctl -u playwright-machine -f

# 3. 检查网络连通性
ping <manager_host>
nc -zv <manager_host> 50051
```

## 认证问题

### Token expired

**症状**：

```
HTTP 401: Token expired
```

**原因**：

JWT Token 已过期（默认有效期 1 天）。

**解决方案**：

```typescript
// 获取新 Token
const loginResponse = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'admin123' }),
});
const { token } = await loginResponse.json();

// 自动刷新 Token
class AuthenticatedClient {
  private token: string;
  private refreshAt: number;

  async ensureToken() {
    if (Date.now() > this.refreshAt) {
      await this.refreshToken();
    }
    return this.token;
  }
}
```

**配置 Token 有效期**：

```bash
# .env
JWT_EXPIRES_IN=7d  # 改为 7 天
```

### Invalid API Key

**症状**：

```
HTTP 401: Invalid API Key
```

**原因**：

1. API Key 错误
2. API Key 已被重置
3. 用户被禁用

**排查**：

```bash
# 检查 API Key 是否有效
curl http://localhost:3000/api/users/me \
  -H "x-api-key: YOUR_API_KEY"

# 管理员：查看用户列表
curl http://localhost:3000/api/admin/users \
  -H "Authorization: Bearer ADMIN_TOKEN"

# 管理员：重置用户 API Key
curl -X POST http://localhost:3000/api/admin/users/1/reset-key \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

### Permission denied

**症状**：

```
HTTP 403: Forbidden / Permission denied
```

**原因**：

当前用户没有执行该操作的权限。

**角色说明**：

| 角色 | 权限 |
|------|------|
| `admin` | 全部权限，包括用户管理、系统配置 |
| `user` | 会话管理、文件上传 |

**解决方案**：

```bash
# 检查当前用户角色
curl http://localhost:3000/api/users/me \
  -H "x-api-key: YOUR_API_KEY"
# 响应中包含 role 字段

# 需要管理员操作的，使用管理员账号的 Token
```

## 会话问题

### Session not found

**症状**：

```
HTTP 404: Session not found
```

**原因**：

1. 会话 ID 错误
2. 会话已被释放
3. 会话属于其他用户（非管理员查看其他用户的会话）

**解决方案**：

```typescript
// 先列出用户的会话
const sessions = await client.sessions.list(1, 100);
console.log('您的会话:', sessions.map(s => s.id));

// 检查会话状态
const session = await client.sessions.get(sessionId);
if (!session) {
  // 创建新会话
  const newSession = await client.sessions.create();
}
```

### Machine unavailable

**症状**：

```
Error: No machine available
HTTP 503: Service Unavailable
```

**原因**：

1. 所有机器节点都已离线
2. 机器节点的最大会话数已满
3. 机器节点正在重启

**排查**：

```bash
# 查看机器列表和状态
curl http://localhost:3000/api/machines \
  -H "x-api-key: YOUR_API_KEY"

# 预期响应:
# {
#   "data": [
#     {
#       "id": "machine-1",
#       "status": "online",
#       "current_sessions": 3,
#       "max_sessions": 10
#     }
#   ]
# }
```

**解决方案**：

```bash
# 1. 检查机器服务是否在运行
# 2. 重启机器服务
pnpm dev:machine

# 3. 增加机器节点
# 4. 调整 maxSessions 配置
```

### No available machines

**症状**：

```
Error: 没有可用的机器节点
```

**原因**：

所有机器都已达到 `maxSessions` 上限。

**解决方案**：

1. 增加更多机器节点
2. 提高单机的 `maxSessions` 配置
3. 等待其他会话释放

```bash
# src/machine/config.ts
export const CONFIG = {
  maxSessions: 20,  // 从 10 提高到 20
};
```

### MAX_SESSIONS_REACHED

**症状**：

```
Error [MAX_SESSIONS_REACHED]: 已达到最大并发会话数上限
```

**原因**：

单机节点并发会话数达到 `CONFIG.maxSessions` 上限。

**参考代码**（`src/machine/browser-lifecycle.ts:31-37`）：

```typescript
if (state.sessions.size >= CONFIG.maxSessions) {
  const error = new Error('已达到最大并发会话数上限');
  error.code = 'MAX_SESSIONS_REACHED';
  throw error;
}
```

**解决方案**：

```bash
# 1. 等待其他会话释放
# 2. 调整 maxSessions 配置
# 3. 增加机器节点
# 4. 确保没有僵尸会话占用资源
```

## 性能问题

### High memory usage

**症状**：

- 机器节点内存使用率超过 90%
- 浏览器实例频繁崩溃
- 系统 OOM（Out of Memory）

**原因**：

1. 并发会话数过多
2. 每个页面加载大量资源
3. 内存泄漏

**排查**：

```bash
# 查看机器内存使用
top -o mem

# 查看 Node.js 进程内存
node -e "
const usage = process.memoryUsage();
console.log('RSS:', Math.round(usage.rss / 1024 / 1024), 'MB');
console.log('Heap:', Math.round(usage.heapUsed / 1024 / 1024), 'MB');
"

# 查看浏览器进程
ps aux | grep chromium
```

**解决方案**：

```typescript
// 1. 限制并发数
export const CONFIG = { maxSessions: 5 };

// 2. 限制浏览器内存
const browser = await puppeteer.launch({
  args: ['--max_old_space_size=512'],
});

// 3. 及时关闭不需要的页面
const pages = await browser.pages();
for (let i = 1; i < pages.length; i++) {
  await pages[i].close();
}
```

### Slow page load

**症状**：

- 页面加载超过 30 秒
- `page.goto()` 超时

**原因**：

1. 网络带宽不足
2. 目标网站响应慢
3. 浏览器正在执行其他任务
4. 未使用优化的等待策略

**解决方案**：

```typescript
// ✅ 使用 DOMContentLoaded 代替 load
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

// ✅ 拦截不必要的资源
await page.route('**/*.{png,jpg,jpeg,gif,svg}', route => route.abort());

// ✅ 使用 networkidle 等待网络空闲
await page.waitForLoadState('networkidle', { timeout: 10000 });

// ✅ 设置合理的超时
await page.setDefaultTimeout(15000);
```

### Browser crash

**症状**：

```
Error: Target closed.
Error: Protocol error: Connection closed.
```

**原因**：

1. 浏览器进程被 OOM Killer 终止
2. 触发了 `page.close()` 或 `browser.close()`
3. 会话超时被自动释放

**排查**：

```bash
# 查看系统日志中的 OOM 信息
dmesg | grep -i oom

# 查看浏览器进程日志
tail -f /var/log/syslog | grep chromium
```

**解决方案**：

```typescript
// 监听浏览器断开事件并重连
browser.on('disconnected', async () => {
  console.warn('浏览器已断开，尝试重连...');
  try {
    const newBrowser = await playwright.chromium.connectOverCDP(directUrl);
    console.log('重连成功');
  } catch {
    console.error('重连失败，需要创建新会话');
    // 创建新会话
  }
});
```

## 部署问题

### Docker container exit

**症状**：

```
docker run playwright-user-sys
# 容器立即退出
```

**原因**：

1. 环境变量未配置
2. 缺少依赖
3. 端口冲突

**排查**：

```bash
# 查看容器日志
docker logs <container_id>

# 运行交互式容器检查
docker run -it --entrypoint /bin/sh playwright-user-sys

# 在容器内检查
which node
node --version
ls -la /app/dist/
```

**解决方案**：

```bash
# 确保 .env 配置正确
docker run -d \
  --env-file .env \
  -p 3000:3000 \
  -p 50051:50051 \
  playwright-user-sys
```

### Database connection error

**症状**：

```
Error: ER_ACCESS_DENIED_ERROR: Access denied for user
Error: connect ECONNREFUSED 127.0.0.1:3306
```

**原因**：

- MySQL 连接配置错误
- 数据库服务未启动
- SQLite 文件路径权限问题

**解决方案**：

```bash
# MySQL: 检查连接
mysql -h localhost -u root -p -e "SELECT 1"

# SQLite: 检查文件权限
ls -la ./data/db.sqlite
chmod 644 ./data/db.sqlite

# 检查配置
cat .env | grep DB_
```

### SQLite lock error

**症状**：

```
SQLITE_BUSY: database is locked
```

**原因**：

SQLite 在高并发场景下容易出现锁冲突。

**解决方案**：

```bash
# 1. 生产环境切换 MySQL
DB_TYPE=mysql
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password

# 2. 如果必须使用 SQLite，限制并发
```

## 文件上传问题

### Upload failed

**症状**：

```
Error: 上传失败
HTTP 4xx/5xx
```

**原因**：

1. API Key 无效
2. Session ID 不存在
3. 机器节点不可用

**排查**：

```typescript
try {
  const result = await session.uploadFile('/path/to/file', '#file-input');
  console.log('上传结果:', result);
} catch (error: any) {
  console.error('上传失败状态码:', error.status);
  console.error('错误信息:', error.message);
}
```

### File too large

**症状**：

```
Error: 文件大小 150000000 超过限制 104857600
```

**原因**：

文件超过 `MAX_FILE_SIZE`（默认 100MB）。

**解决方案**：

```typescript
// 客户端检查（src/sdk/session.ts）
const MAX_FILE_SIZE = 100 * 1024 * 1024;

// 分片上传大文件
async function uploadLargeFile(session: any, filePath: string, selector: string) {
  const { createReadStream } = await import('fs');
  const stat = await fs.stat(filePath);

  if (stat.size > MAX_FILE_SIZE) {
    // 需要实现分片逻辑
    // 或调整服务端限制
    throw new Error(`文件过大: ${stat.size}`);
  }

  return await session.uploadFile(filePath, selector);
}
```

### Upload timeout

**症状**：

```
Error: 上传超时
```

**原因**：

文件上传后，注入到浏览器的过程超时（默认 `downloadTimeout: 60000`）。

**解决方案**：

```typescript
// 延长超时时间
const result = await session.uploadFileFromUrl(
  'https://example.com/large-file.zip',
  '#file-input',
  { downloadTimeout: 120000 } // 2 分钟
);
```

---

::: tip 排查速查表
| 错误类别 | 常见 HTTP 状态码 | 优先检查 |
|---------|----------------|---------|
| 认证问题 | 401, 403 | API Key, Token |
| 会话问题 | 404, 410 | sessionId, 会话状态 |
| 机器问题 | 503 | 机器状态, maxSessions |
| 上传问题 | 413, 500 | 文件大小, 网络 |
| 连接问题 | 502, 504 | 防火墙, 端口 |
:::

::: warning 寻求帮助
如果以上方法未能解决你的问题，请在 GitHub Issues 中提供：
- 完整的错误堆栈
- 相关日志（脱敏后）
- 部署环境信息（OS、Node 版本、数据库类型）
:::
