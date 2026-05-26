# 安全加固指南

## 网络安全

### HTTPS 配置

生产环境必须启用 HTTPS。支持两种方式：

**方式 1：Fastify 内置 HTTPS**

```typescript
import Fastify from 'fastify';
import fs from 'fs';
import path from 'path';

const app = Fastify({
  https: {
    key: fs.readFileSync(path.join(__dirname, 'cert', 'privkey.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'cert', 'cert.pem')),
  },
  logger: true,
});
```

**方式 2：反向代理（推荐）**

```nginx
# Nginx 配置
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### CORS 策略

系统使用 `@fastify/cors` 插件。安全配置：

```typescript
// src/plugins/index.ts
app.register(require('@fastify/cors'), {
  origin: [
    'https://your-frontend.com',
    /\.your-domain\.com$/,      // 正则匹配子域名
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  credentials: true,
  maxAge: 86400,                // 预检请求缓存 24 小时
});
```

### CSP 策略

使用 `@fastify/helmet` 配置内容安全策略：

```typescript
app.register(require('@fastify/helmet'), {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],  // 用于 Web UI
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", 'ws://localhost:3000'],  // WebSocket
      frameAncestors: ["'none'"],  // 防止点击劫持
    },
  },
  frameguard: { action: 'deny' },  // 禁止 iframe 嵌套
  noSniff: true,                    // 禁止 MIME 嗅探
  xssFilter: true,                  // XSS 过滤器
});
```

当前 Helmet 已注册（`package.json` 中 `@fastify/helmet: ^13.0.2`）。

### 速率限制

使用 `@fastify/rate-limit` 防暴力破解和 DDoS：

```typescript
app.register(require('@fastify/rate-limit'), {
  max: 100,                    // 每分钟最大请求数
  timeWindow: '1 minute',
  hook: 'onRequest',
  keyGenerator: (request) => {
    return request.ip;         // 按 IP 限流
  },
  errorResponseBuilder: (request, context) => {
    return {
      success: false,
      error: `请求过于频繁，请 ${Math.ceil((context.ttl || 60000) / 1000)} 秒后再试`,
    };
  },
});

// 针对敏感接口更严格的限制
app.register(require('@fastify/rate-limit'), {
  global: false,
  max: 5,                      // 登录接口每分钟 5 次
  timeWindow: '1 minute',
  keyGenerator: (request) => request.ip,
});

app.get('/api/auth/login', /* ... */);
```

### WebSocket Origin 验证

系统内置了 Origin 验证（参考 `src/services/native-websocket-proxy.service.ts`）：

```typescript
// 默认允许 localhost 和 127.0.0.1
// 生产环境放开限制
const allowedHosts = ['localhost', '127.0.0.1'];
const isAllowed = allowedHosts.includes(originHost) ||
  (process.env.NODE_ENV === 'production' && !allowedHosts.includes(originHost));
```

## 认证安全

### JWT 安全配置

```bash
# .env - JWT 配置
JWT_SECRET=your-strong-random-secret-at-least-32-chars-long
JWT_EXPIRES_IN=1d
```

**安全建议**：

1. **密钥强度**：使用至少 32 字符的随机字符串
2. **密钥生成**：`openssl rand -base64 32`
3. **定期轮换**：每 90 天更换一次 JWT_SECRET
4. **过期时间**：建议 24 小时，敏感场景缩短到 1 小时

**Token 验证流程**（参考 `src/controllers/auth.controller.ts`）：

```typescript
// 登录成功后生成 JWT
const token = generateToken({
  id: user.id,
  username: user.username,
  role: user.role,
});

// 后续请求验证 Token
const decoded = jwt.verify(token, jwtSecret);
if (!decoded) {
  return sendError(reply, 'Token 无效或已过期', 401);
}
```

### API Key 轮换

管理员可重置用户 API Key：

```bash
# 管理员重置特定用户的 API Key
curl -X POST http://localhost:3000/api/admin/users/1/reset-key \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

**建议**：
- 新用户首次登录后强制重置 API Key
- 每季度或人员变动时轮换
- 监控 API Key 使用频率，异常活动立即轮换

### 密码策略

```typescript
// bcryptjs 哈希密码
import { hash, compare } from 'bcryptjs';

// 注册时加密
const hashedPassword = await hash(password, 10); // salt rounds = 10

// 登录时验证
const { valid, needsMigration } = await verifyPasswordWithMigration(
  password, user.password
);

// 密码迁移支持（SHA-256 → bcrypt）
if (needsMigration) {
  const newHash = await hashPassword(password);
  await UserModel.update(user.id, { password: newHash });
}
```

密码要求建议（需在注册接口中实现）：
- 最少 8 个字符
- 包含大小写字母和数字
- 可选：特殊字符要求

### 多因素认证（2FA）

系统当前使用 API Key + JWT 的双重认证模式：

```
第一因素：API Key（用于 API 调用）
第二因素：JWT Token（用于 Web UI 登录）
```

对于更高安全要求，可集成 TOTP（基于时间的一次性密码）：

```typescript
import { authenticator } from 'otplib';

// 生成密钥
const secret = authenticator.generateSecret();
const otpauth = authenticator.keyuri(user.email, 'PlaywrightUserSys', secret);

// 验证一次性密码
const isValid = authenticator.verify({ token: userInput, secret });
```

## 数据安全

### 数据库加密

**SQLite 加密**：

```bash
# 使用 sqlcipher（加密版 SQLite）
# 安装
brew install sqlcipher

# 创建加密数据库
sqlcipher ./data/db.sqlite
sqlite> PRAGMA key = 'your-encryption-key';
```

**MySQL 加密**：

```sql
-- 使用 AES 加密敏感字段
CREATE TABLE sensitive_data (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  encrypted_value VARBINARY(512) NOT NULL
);

-- 加密存储
INSERT INTO sensitive_data (user_id, encrypted_value)
VALUES (1, AES_ENCRYPT('sensitive-value', 'encryption-key'));
```

### 敏感数据脱敏

系统在日志中自动脱敏 API Key（参考 `native-websocket-proxy.service.ts`）：

```typescript
const safeParams = { ...validatedParams, apiKey: '***REDACTED***' };
logger.info(`WebSocket连接参数: ${JSON.stringify(safeParams)}`);
```

扩展示例：

```typescript
function sanitizeForLog(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ['apiKey', 'password', 'token', 'secret', 'authorization'];
  const sanitized = { ...obj };

  for (const key of sensitiveKeys) {
    if (typeof sanitized[key] === 'string') {
      sanitized[key] = '***REDACTED***';
    }
  }

  return sanitized;
}
```

### 日志安全

系统使用 pino 日志库，遵循安全实践：

```typescript
// pino 配置
const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: ['req.headers.authorization', 'req.headers["x-api-key"]'],
    censor: '***REDACTED***',
  },
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty' }
    : undefined,
});
```

## 浏览器安全

### Sandbox 配置

浏览器实例的安全沙箱配置：

```typescript
const browser = await puppeteer.launch({
  args: [
    '--no-sandbox',              // Docker 环境必须
    '--disable-setuid-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--disable-webgl',
    '--no-first-run',
    '--no-default-browser-check',
  ],
  // 更多安全配置
  ignoreHTTPSErrors: false,     // 不忽略 HTTPS 错误
  handleSIGINT: true,           // 允许系统信号关闭
});
```

### 反检测与指纹管理

系统使用 `puppeteer-extra` + `puppeteer-extra-plugin-stealth` 进行反检测：

```typescript
import puppeteerStealth from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// 使用 stealth 插件
puppeteerStealth.use(StealthPlugin());
```

**指纹自定义**：

```typescript
// src/machine/browser-lifecycle.ts:70-76
const fingerprint = generateFingerprint(options);
if (fingerprint && !options.userAgent) {
  options.userAgent = fingerprint.fingerprint.navigator.userAgent;
}
```

指纹生成使用 `fingerprint-generator` 库，可自定义：

```typescript
const { FingerprintGenerator } = require('fingerprint-generator');

const generator = new FingerprintGenerator();
const fingerprint = generator.getFingerprint({
  devices: ['desktop'],
  browsers: ['chrome'],
  operatingSystems: ['windows', 'macos'],
  locales: ['zh-CN'],
});
```

### 资源隔离

**用户数据目录隔离**：

```typescript
// 独立模式：每个会话独立的用户数据目录
// 共享模式：同一用户复用目录

// 独立模式目录示例
userDataDir: `/tmp/playwright-data/session-${sessionId}/`

// 共享模式目录示例
userDataDir: `/tmp/playwright-data/user-${userId}/`
```

**进程隔离**：

每个浏览器实例运行在独立的 Puppeteer 进程中，通过 `browser.close()` 完全销毁。

## 容器安全

### Docker 安全配置

```dockerfile
# Dockerfile 安全配置
FROM node:20-slim

# 创建非 root 用户
RUN useradd -m -u 1001 -s /bin/bash playwright

# 安装 Playwright 依赖（最小化）
RUN npx playwright install-deps chromium

# 设置工作目录
WORKDIR /app

# 复制源代码
COPY --chown=playwright:playwright . .

# 切换非 root 用户
USER playwright

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost:3000/health || exit 1

EXPOSE 3000 50051
```

### 镜像扫描

```bash
# 使用 Trivy 扫描镜像
trivy image playwright-user-sys:latest

# 使用 Docker Scout
docker scout quickview playwright-user-sys:latest
```

### 权限最小化

```bash
# 不要在容器内使用 root 用户
# 配置 capabilities
docker run \
  --cap-drop=ALL \
  --cap-add=NET_BIND_SERVICE \
  --security-opt=no-new-privileges:true \
  --read-only-root-filesystem \
  -v /path/to/data:/app/data \
  playwright-user-sys
```

## 审计日志

### 操作日志

系统记录所有重要操作到 `operation_logs` 表：

```sql
CREATE TABLE operation_logs (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  user_id INTEGER NOT NULL,
  action VARCHAR(50) NOT NULL,    -- 操作类型
  resource VARCHAR(50) NOT NULL,  -- 资源类型 (session/user/machine)
  resource_id VARCHAR(100),       -- 资源 ID
  details JSON,                   -- 操作详情
  ip_address VARCHAR(45),         -- 请求 IP
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**建议监控的操作**：

| 操作 | 说明 | 告警 |
|------|------|------|
| `user.login` | 用户登录 | 失败 5 次告警 |
| `user.create` | 创建用户 | 通知管理员 |
| `session.create` | 创建会话 | 异常频率告警 |
| `session.release` | 释放会话 | - |
| `credits.deduct` | 扣除积分 | 大额扣费通知 |
| `api_key.reset` | 重置 API Key | 通知用户 |
| `machine.offline` | 机器下线 | 紧急告警 |

### 异常检测

```typescript
class AnomalyDetector {
  private thresholds: Map<string, number> = new Map();

  constructor() {
    this.thresholds.set('login_per_minute', 5);
    this.thresholds.set('session_per_minute', 20);
    this.thresholds.set('credits_per_hour', 1000);
  }

  async check(operation: string, userId: number): Promise<boolean> {
    // 查询最近 1 分钟的操作次数
    const recentCount = await db('operation_logs')
      .where('user_id', userId)
      .where('action', operation)
      .where('created_at', '>', new Date(Date.now() - 60000))
      .count('* as count')
      .first();

    const threshold = this.thresholds.get(operation);
    if (threshold && recentCount?.count > threshold) {
      logger.warn(`异常操作检测: ${operation} (userId: ${userId}, count: ${recentCount.count})`);
      return false;
    }

    return true;
  }
}
```

### 日志管理

```bash
# 日志轮转（logrotate 配置）
# /etc/logrotate.d/playwright-user-sys
/var/log/playwright-user-sys/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
```

---

::: tip 安全自检清单
- [ ] HTTPS 已启用
- [ ] JWT Secret 已修改为强随机字符串
- [ ] 管理员默认密码已修改
- [ ] CORS 已配置为白名单
- [ ] 速率限制已启用
- [ ] 日志脱敏已配置
- [ ] 数据库已切换到 MySQL
- [ ] Docker 容器以非 root 用户运行
- [ ] API Key 定期轮换
- [ ] 审计日志已启用
:::
