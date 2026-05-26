# 性能优化指南

## 系统架构性能

### Manager 瓶颈分析

管理服务器是整个系统的调度中心，主要瓶颈在以下方面：

```
请求路径:
Client → REST/WS → Manager Server → gRPC → Machine Service
                    ↓
               Database (SQLite/MySQL)
                    ↓
            Credits Monitor (5s 间隔)
```

**关键瓶颈**：

| 组件 | 瓶颈 | 影响 |
|------|------|------|
| **Fastify 路由** | 高并发请求 | API 响应延迟 |
| **积分监控** | 5 秒轮询所有活跃会话 | CPU 占用，数据库锁 |
| **gRPC 连接池** | 大量机器节点连接 | 内存占用 |
| **内存存储** | 机器/会话状态缓存 | 查询延迟 |
| **数据库** | SQLite 写锁 | 并发瓶颈 |

**优化建议**：

```typescript
// 1. 积分监控间隔调整（默认 5s）
// src/manager/app.ts:96-98
const creditsMonitorTimer = startCreditsMonitor(10000); // 改为 10 秒

// 2. 数据库连接池配置（MySQL）
// src/config/database.ts
const knexConfig = {
  client: 'mysql2',
  connection: { /* ... */ },
  pool: { min: 2, max: 10 }, // 调整连接池大小
};

// 3. 启用 gRPC 连接复用
// gRPC 默认使用 HTTP/2 长连接，无需额外配置
```

### gRPC 调优

**当前配置**：gRPC 端口 50051，基于 `@grpc/grpc-js`

**优化策略**：

```typescript
// 调整 gRPC 客户端参数
import * as grpc from '@grpc/grpc-js';

const client = new MyServiceClient(
  address,
  grpc.credentials.createInsecure(),
  {
    'grpc.keepalive_time_ms': 10000,       // 10 秒心跳
    'grpc.keepalive_timeout_ms': 5000,      // 5 秒超时
    'grpc.keepalive_permit_without_calls': 1, // 无活动时也发送心跳
    'grpc.max_reconnect_backoff_ms': 30000,  // 最大重连间隔
    'grpc.initial_reconnect_backoff_ms': 1000, // 初始重连间隔
  }
);
```

**机器端重连机制**（参考 `src/machine/app.ts`）：

```typescript
// 指数退避：1s → 2s → 4s → 8s → ... → 60s
// 最多重试 10 次
// 冷却期：60 秒后再次尝试
```

### 数据库优化

#### SQLite → MySQL

开发环境使用 SQLite，生产环境务必切换 MySQL：

```bash
# SQLite (开发)
DB_TYPE=sqlite
DB_PATH=./data/db.sqlite

# MySQL (生产)
DB_TYPE=mysql
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=playwright_user_sys
```

#### MySQL 优化

```sql
-- 1. 会话表索引
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_machine_id ON sessions(machine_id);
CREATE INDEX idx_sessions_created_at ON sessions(created_at);

-- 2. 积分历史表索引
CREATE INDEX idx_credit_history_user_id ON credit_history(user_id);
CREATE INDEX idx_credit_history_created_at ON credit_history(created_at);

-- 3. 操作日志表索引
CREATE INDEX idx_operation_logs_user_id ON operation_logs(user_id);
CREATE INDEX idx_operation_logs_created_at ON operation_logs(created_at);

-- 4. 机器表索引
CREATE INDEX idx_machines_status ON machines(status);
```

#### 事务优化

积分监控使用事务批量更新（参考 `src/services/credits-monitor.service.ts`）：

```typescript
// 使用事务合并多次更新为一次
await db.transaction(async (trx) => {
  // 批量更新会话
  await SessionModel.batchUpdate(sessionUpdates, trx);
  // 一次性扣除用户积分
  await UserModel.deductCredits(userId, totalNewCreditsToDeduct, trx);
});
```

## 浏览器性能

### 实例复用

**共享用户数据模式**：

```typescript
// 共享模式：同一用户复用浏览器数据目录
// 适用于需要保持登录状态的场景
const session = await client.sessions.create({
  sharedUserData: true, // 复用用户数据目录
});
```

优势：
- 减少每次启动新浏览器的开销
- 保持 Cookie/登录状态
- 减少磁盘 I/O

限制：
- 每个用户同时只能有一个共享会话
- 不会自动清理用户数据目录

### 资源限制

在 `src/machine/config.ts` 中配置：

```typescript
export const CONFIG = {
  maxSessions: 10,           // 最大并发会话数
  // 其他配置...
};
```

**估算公式**：

```
最大并发数 = 机器可用内存 / 浏览器实例平均内存 × 安全系数

例如：
- 8GB 内存机器
- 每个实例平均 300MB
- 安全系数 0.7
- 建议 maxSessions ≈ 8 × 1024 / 300 × 0.7 ≈ 19
```

### 内存控制

```typescript
// 限制浏览器内存使用
const browser = await puppeteer.launch({
  args: [
    '--max_old_space_size=512',     // V8 最大堆内存 (MB)
    '--js-flags=--max-old-space-size=512',
    '--disable-dev-shm-usage',      // 禁用共享内存
    '--disable-setuid-sandbox',
    '--no-first-run',
    '--no-sandbox',
    '--no-zygote',
    '--single-process',             // 单进程模式（减少内存但降低稳定性）
  ],
});
```

**用户数据目录清理**：

```typescript
// 独立会话：会话结束后自动清理
// src/machine/browser-lifecycle.ts:355-364
if (userDataDir && !isSharedUserData) {
  fsSync.rmSync(userDataDir, { recursive: true, force: true });
}

// 共享会话：保留用户数据目录
```

### 页面/标签管理

```typescript
// 及时关闭不需要的标签
async function closeExtraTabs(browser: any, keepMain: boolean = true) {
  const pages = await browser.pages();
  for (let i = keepMain ? 1 : 0; i < pages.length; i++) {
    if (!pages[i].isClosed()) {
      await pages[i].close();
    }
  }
}

// 限制最大标签数
const MAX_TABS = 5;
browser.on('targetcreated', async (target: any) => {
  const pages = await browser.pages();
  if (pages.length > MAX_TABS) {
    // 关闭最旧的标签
    await pages[0].close();
  }
});
```

## 网络优化

### CDP 代理性能

WebSocket 代理使用 `http-proxy` 库，实现原始字节流转发：

```
Client CDP ↔ WebSocket ↔ Manager Proxy ↔ Machine Proxy ↔ Browser CDP
```

**优化方向**：

```typescript
// 1. 调整代理超时配置
// src/services/native-websocket-proxy.service.ts:58-63
this.proxy = httpProxy.createProxyServer({
  ws: true,
  timeout: 60000,       // 代理超时 (ms)
  proxyTimeout: 60000,   // 目标超时 (ms)
  ignorePath: true,      // 忽略路径
});

// 2. 限制最大连接数
this.maxConnections = 1000; // 根据服务器配置调整
```

### WebSocket 调优

**心跳检测**：

```typescript
// 每 60 秒检查一次心跳
// 5 分钟无响应则断开连接
// src/services/native-websocket-proxy.service.ts:165-175
const STALE_MS = 5 * 60 * 1000;
const HB_INTERVAL = 60 * 1000;
```

**Viewer WS Bridge**：

Viewer 页面通过 TCP 直连机器端口，绕过 Manager 代理，减少中继延迟：

```
Client (Viewer) → WebSocket → Manager (Bridge) → TCP → Machine
```

### 文件传输优化

```typescript
// 1. 大文件从 URL 下载（避免客户端传输）
const result = await session.uploadFileFromUrl(
  'https://example.com/large-file.zip',
  '#file-input',
  { downloadTimeout: 120000 }
);

// 2. 限制上传文件大小
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
```

## 集群扩展

### 水平扩展策略

```
Layer 1: Load Balancer (Nginx/HAProxy)
             |
Layer 2: Manager Cluster (多个 Manager 实例)
             |
Layer 3:  共享数据库 (MySQL Cluster)
             |
Layer 4: Machine 集群
     ┌──────┼──────┐
 Machine1 Machine2 MachineN
```

**Nginx 反向代理配置**：

```nginx
upstream manager_cluster {
    least_conn;                # 最少连接算法
    server 10.0.0.1:3000;
    server 10.0.0.2:3000;
    server 10.0.0.3:3000;
}

server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://manager_cluster;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;

        # WebSocket 超时
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

### 负载均衡

机器选择策略（当前实现基于 `memoryStore`）：

```typescript
// 选择负载最低的机器
function selectMachine(machines: MachineInfo[]): MachineInfo | null {
  return machines
    .filter(m => m.status === 'online')
    .sort((a, b) => a.currentSessions - b.currentSessions)[0] || null;
}
```

### 自动伸缩

**基于会话数的扩缩容策略**：

```bash
# 扩缩容规则
- 当机器节点平均负载 > 80% 时，自动扩容
- 当机器节点平均负载 < 30% 且持续 5 分钟，自动缩容
- 单机会话数接近 maxSessions 时，拒绝新会话
```

## 监控指标

### 关键 Metrics

| 指标 | 采集点 | 意义 |
|------|--------|------|
| `active_sessions` | SessionModel.count() | 当前活跃会话数 |
| `active_connections` | wsProxyService.getActiveConnectionCount() | WebSocket 连接数 |
| `connected_machines` | connectionManager.getActiveConnections() | 在线机器数 |
| `machine_sessions` | 各机器 currentSessions | 单机负载 |
| `user_credits` | UserModel.findById() | 用户积分余量 |
| `session_duration` | Session.duration | 平均会话时长 |
| `credits_consumption` | CreditHistory | 积分消耗速率 |
| `api_response_time` | Fastify 日志 | API 响应时间 |

### 告警阈值

| 指标 | 警告阈值 | 严重阈值 | 处理 |
|------|---------|---------|------|
| 活跃连接数 | > 800 | > 1000 | 增加机器节点 |
| 机器在线数 | < 2 | = 0 | 检查机器服务 |
| 单机内存使用 | > 80% | > 95% | 限制会话数 |
| API 响应时间 | > 2s | > 5s | 检查数据库 |
| gRPC 断连次数 | > 5/小时 | > 20/小时 | 检查网络 |
| 积分监控失败 | > 10% | > 30% | 检查数据库 |

### 日志监控

系统使用 pino 日志库，可通过 `pino-pretty` 格式化输出：

```bash
# 开发环境格式化的日志
NODE_ENV=development pnpm dev

# 生产环境 JSON 格式日志（推荐用于日志收集）
NODE_ENV=production pnpm start:server

# 使用 jq 分析日志
tail -f logs/app.log | jq '.level'  # 查看日志级别分布
tail -f logs/app.log | jq 'select(.msg | contains("点数监控"))'  # 过滤积分监控日志
```

## Benchmark 数据

以下是基于 4 核 8GB 机器的参考数据（实际性能因场景而异）：

| 场景 | 并发数 | 平均响应时间 | 成功率 | 备注 |
|------|--------|-------------|--------|------|
| 创建会话 | 10 并发 | 1.2s | 100% | 浏览器启动时间主导 |
| 加载百度首页 | 5 并发 | 1.8s | 100% | 含网络延迟 |
| 加载电商首页 | 5 并发 | 3.5s | 95% | 含大量静态资源 |
| 页面截图 | 10 并发 | 0.5s | 100% | CDP 指令 |
| 文件上传(1MB) | 5 并发 | 1.0s | 100% | 依赖于网络 |
| 释放会话 | 10 并发 | 0.3s | 100% | 轻量操作 |

**单机吞吐量估算**：

| 机器配置 | 预估最大并发 | 日均处理请求 | 内存需求 |
|---------|------------|-------------|---------|
| 2 核 / 4GB | 5-8 | ~10,000 | 2-3GB |
| 4 核 / 8GB | 10-15 | ~25,000 | 4-6GB |
| 8 核 / 16GB | 20-30 | ~50,000 | 8-12GB |
| 16 核 / 32GB | 40-50 | ~100,000 | 16-24GB |

::: tip 性能调优 Step by Step
1. **观察**：通过监控指标了解当前瓶颈
2. **分析**：确定是 CPU、内存、网络还是 I/O 瓶颈
3. **优化**：针对性地调整配置
4. **验证**：对比优化前后的指标
5. **循环**：持续观察和优化
:::

::: warning 性能基准测试
建议在生产环境使用前，用 `scripts/client-demo.ts` 进行基准测试，了解实际部署环境的性能基线。
:::
