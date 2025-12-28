# Vitest + Puppeteer 集成测试方案

> 创建时间: 2025-12-28
> 状态: 设计中
> 目标: 在 Playwright UI 测试之前，先验证 Puppeteer 连接层和服务层逻辑

---

## 一、测试策略概述

### 1.1 为什么先做这些测试？

```
测试金字塔（调整后）：

                    ┌─────────────────┐
                    │  Playwright E2E │  ← 暂不做（UI 层不稳定）
                    │   (用户界面)     │
                    └─────────────────┘
                          ↓ (后期)
            ┌───────────────────────────────┐
            │  Vitest 集成测试               │  ← **优先做这个**
            │  (Puppeteer 连接层)            │
            │  - 真实启动管理端              │
            │  - 真实启动机器服务            │
            │  - 真实启动浏览器              │
            │  - 验证完整调用链              │
            │  - 测试扣费逻辑                │
            └───────────────────────────────┘
                          ↓
            ┌───────────────────────────────┐
            │  Vitest 单元测试               │  ← **并行做这个**
            │  (服务层逻辑)                  │
            │  - 计费算法                    │
            │  - 会话分配                    │
            │  - 数据库 CRUD                 │
            │  - Mock 外部依赖               │
            └───────────────────────────────┘
```

### 1.2 核心发现：扣费逻辑

**系统采用后扣费模式**（非预扣费）

```
创建会话时：
├── 检查积分 > 0（但不扣除）
├── 分配机器实例
├── 启动浏览器
└── 返回 WebSocket 连接

使用过程中：
├── 每 10 秒检查一次积分
├── 如果积分 ≤ 0，立即关闭所有会话
└── 增量扣费（避免重复扣费）

会话结束时：
├── 计算总时长（秒）
├── 转换为积分：Math.max(1, Math.ceil(duration / 60))
└── 扣除积分并更新数据库
```

**扣费示例：**
- 5 秒 → 1 积分（最小计费）
- 30 秒 → 1 积分（不足1分钟）
- 61 秒 → 2 积分（刚过1分钟边界）
- 150 秒 → 3 积分（2分30秒）

### 1.3 系统架构（10步调用链）

```
用户                管理端                  机器端
 │                    │                       │
 │  1. POST /api/sessions                    │
 │ ──────────────────▶                       │
 │                    │                       │
 │                    │  2. gRPC LaunchBrowser │
 │                    │ ──────────────────────▶
 │                    │                       │
 │                    │                       │  3. 启动 Puppeteer
 │                    │                       │ ─▶ chrome.exe
 │                    │                       │
 │                    │  4. 返回 port + path   │
 │                    │ ◀───────────────────── │
 │                    │                       │
 │  5. 返回 WebSocket URL                     │
 │ ◀───────────────── │                       │
 │                                            │
 │  6. WebSocket 连接到浏览器                  │
 │ ──────────────────────────────────────────▶
 │                                            │
 │  7. CDP 消息（跳转百度、截图等）            │
 │ ──────────────────────────────────────────▶
 │                                            │
 │  8. 每10秒检查积分（后台）                  │
 │ ◀───────────────────────────────────────── │
 │                                            │
 │  9. 关闭会话                                │
 │ ──────────────────▶                       │
 │                    │  10. gRPC CloseBrowser │
 │                    │ ──────────────────────▶
 │                    │                       │
 │                    │                       │  11. 关闭浏览器
 │                    │                       │ ─▶ X chrome
```

---

## 二、测试文件结构

```
tests/
├── unit/                                    # Vitest 单元测试
│   ├── services/
│   │   ├── credits-calculator.test.ts      # ✅ 计费算法测试
│   │   ├── session-allocation.test.ts      # ✅ 会话分配算法
│   │   ├── credits-monitor.test.ts         # ✅ 积分监控逻辑
│   │   └── memory-store.test.ts            # ✅ 内存存储测试
│   ├── models/
│   │   ├── user.model.test.ts              # ✅ 用户 CRUD
│   │   ├── session.model.test.ts           # ✅ 会话状态机
│   │   └── machine.model.test.ts           # ✅ 机器注册逻辑
│   └── helpers/
│       ├── factories.ts                    # ✅ 测试数据工厂
│       ├── database.ts                     # ✅ 数据库清理
│       └── ports.ts                        # ✅ 端口管理
│
├── integration/                             # Vitest 集成测试
│   ├── puppeteer-connection.test.ts        # ✅ Puppeteer 连接层（重点）
│   ├── billing-flow.test.ts                # ✅ 完整计费流程
│   ├── session-lifecycle.test.ts           # ✅ 会话生命周期
│   └── machine-failover.test.ts            # ✅ 机器故障转移
│
└── fixtures/
    └── vitest-fixtures.ts                  # Vitest fixtures
```

---

## 三、关键测试点

### 3.1 计费逻辑验证

**文件位置**: `src/models/session.model.ts:230`
```typescript
const creditsUsed = Math.max(1, Math.ceil(finalDuration / 60));
```

**需要验证的点**:
- ✅ 最小计费：1积分（即使只使用几秒）
- ✅ 计费单位：1分钟/积分
- ✅ 向上取整：61秒 = 2积分
- ✅ 后扣费模式：创建会话时不扣费
- ✅ 增量扣费：每10秒检查，避免重复扣费

### 3.2 扣费时机验证

**文件位置**: `src/services/credits-monitor.service.ts:222-238`

**时间线**:
```
T0 (0秒):    创建会话，积分 100 → 100 (未扣费)
T1 (10秒):   第一次检查，积分 100 → 100 (未到1分钟)
T2 (70秒):   第二次检查，积分 100 → 98 (扣2分，1分10秒)
T3 (150秒):  用户关闭，积分 98 → 97 (再扣1分，总计3分)
```

### 3.3 状态机验证

**有效状态转换**:
```
CREATED → CONNECTED → ACTIVE → DISCONNECTED → CLOSED
         ↘ ERROR ↙                     ↑
           └─────────────────────────────┘
```

### 3.4 性能指标

| 指标 | 预期值 | 测量点 |
|------|--------|--------|
| API 响应时间 | < 500ms | 调用 → 返回 WebSocket URL |
| 浏览器启动 | < 3秒 | API调用 → 浏览器可用 |
| WebSocket 连接 | < 500ms | 连接请求 → 握手完成 |
| 页面加载（百度） | < 3秒 | 开始跳转 → load 事件 |
| 总启动时间 | < 5秒 | 创建会话 → 可执行操作 |

---

## 四、实施计划

### Week 1: 核心测试（优先）

| 优先级 | 测试文件 | 工作量 | 状态 |
|--------|---------|--------|------|
| P0 | `tests/helpers/ports.ts` | 1h | ⏸️ 待开始 |
| P0 | `tests/helpers/database.ts` | 2h | ⏸️ 待开始 |
| P0 | `tests/helpers/factories.ts` | 2h | ⏸️ 待开始 |
| P0 | `tests/unit/services/credits-calculator.test.ts` | 2h | ⏸️ 待开始 |
| P0 | `tests/unit/services/session-state-machine.test.ts` | 2h | ⏸️ 待开始 |
| P0 | `tests/integration/puppeteer-connection.test.ts` | 1天 | ⏸️ 待开始 |

### Week 2: 扩展测试

| 优先级 | 测试文件 | 工作量 | 状态 |
|--------|---------|--------|------|
| P1 | `tests/integration/billing-flow.test.ts` | 4h | ⏸️ 待开始 |
| P1 | `tests/integration/session-lifecycle.test.ts` | 4h | ⏸️ 待开始 |
| P1 | `tests/unit/services/session-allocation.test.ts` | 3h | ⏸️ 待开始 |

---

## 五、测试辅助工具设计

### 5.1 端口管理 (`tests/helpers/ports.ts`)

```typescript
import { createServer } from 'net';

export async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, () => {
      const port = server.address()?.port;
      server.close(() => resolve(port!));
    });
    server.on('error', reject);
  });
}

export async function getFreePorts(count: number): Promise<number[]> {
  return Promise.all(Array.from({ length: count }, () => getFreePort()));
}
```

### 5.2 数据库管理 (`tests/helpers/database.ts`)

```typescript
import knex from 'knex';

let testDbConnection: any;

export async function createTestDatabase() {
  const dbName = `test_${Date.now()}`;
  const connection = knex({
    client: 'mysql2',
    connection: {
      host: 'localhost',
      user: 'root',
      password: '',
      database: dbName,
    },
  });

  await connection.raw(`CREATE DATABASE ${dbName}`);
  return dbName;
}

export async function dropTestDatabase(dbName: string) {
  const connection = knex({
    client: 'mysql2',
    connection: {
      host: 'localhost',
      user: 'root',
      password: '',
    },
  });

  await connection.raw(`DROP DATABASE IF EXISTS ${dbName}`);
  await connection.destroy();
}

export async function clearAllTables() {
  const tables = ['sessions', 'machines', 'users', 'credit_history'];
  for (const table of tables) {
    await dbConnection(table).truncate();
  }
}

export async function waitForServer(port: number, timeout = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(`http://localhost:${port}/health`);
      if (response.ok) return;
    } catch {
      // 继续等待
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Server on port ${port} not ready`);
}
```

### 5.3 测试数据工厂 (`tests/helpers/factories.ts`)

```typescript
import { UserModel } from '../../models/user.model.js';
import { MachineModel } from '../../models/machine.model.js';
import { getFreePort } from './ports.js';

export async function createTestUser(overrides = {}) {
  return await UserModel.create({
    username: `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    password: 'password123',
    role: 'user',
    credits: 100,
    ...overrides,
  });
}

export async function createTestMachine(overrides = {}) {
  return await MachineModel.register({
    id: `test-machine-${Date.now()}`,
    name: '测试机器',
    ip_address: '127.0.0.1',
    grpc_port: await getFreePort(),
    proxy_port: await getFreePort(),
    max_sessions: 5,
    ...overrides,
  });
}

export async function createTestSession(userId: number, machineId: string, overrides = {}) {
  return await SessionModel.create({
    user_id: userId,
    machine_id: machineId,
    status: SessionStatus.CREATED,
    start_time: new Date(),
    ...overrides,
  });
}
```

---

## 六、预期输出示例

```bash
$ npm test tests/integration/puppeteer-connection.test.ts

✅ 创建测试数据库: test_1766850000000
✅ 创建测试用户: test_1766850000001, 积分: 100
✅ 创建测试机器: test-machine-1766850000002
📌 管理端端口: 54321
📌 机器 gRPC 端口: 54322
📌 机器代理端口: 54323
✅ 管理端已启动: http://localhost:54321
✅ 机器服务已启动

  ✓ P0-CONN-01: 创建会话并连接浏览器

    📝 登录成功, token: eyJhbGciOiJIUzI1...
    💰 初始积分: 100
    ✅ 会话创建成功: 9ae97c66-2d94-4958-984d-1fb749bf641f
    📡 WebSocket URL: ws://localhost:54323/ws/9ae97c66-...
    🌐 Browser URL: ws://localhost:9222/devtools/page/...
    💰 创建后积分: 100 (未扣除)
    ✅ Puppeteer 连接成功
    🌐 正在访问百度...
    ✅ 页面标题: 百度一下，你就知道
    ⏳ 等待 70 秒触发扣费...
    💰 使用后积分: 98 (扣除 2 分)
    ✅ 浏览器已关闭
    ✅ 会话已释放
    💰 最终积分: 98

🧹 清理完成

 Test Files  1 passed (1)
     Tests  1 passed (1)
  Duration  95.32s (transform 0ms, setup 0ms, collect 0ms, tests 0ms, tests 95.32s)
```

---

## 七、参考文档

- 原始调研 1: Vitest 单元测试调研 (agent acfec26)
- 原始调研 2: Puppeteer 连接层调研 (agent a595cc4)
- 计费逻辑: `src/models/session.model.ts:199-280`
- 积分监控: `src/services/credits-monitor.service.ts:154-209`
- 会话创建: `src/services/session.service.ts:27-30`

---

## 八、更新日志

| 日期 | 版本 | 更新内容 |
|------|------|----------|
| 2025-12-28 | 1.0 | 初始版本，保存测试方案 |
