# 测试文档目录

本目录包含 playwright-user-sys 项目的所有测试相关文档。

## 快速导航

### 三端架构集成测试 (TIER)

| 文档 | 说明 | 优先级 |
|------|------|--------|
| [三端集成测试规范](./三端集成测试规范.md) | 详细的三端架构集成测试编写规范 | ⭐⭐⭐ |
| [三端架构集成测试流程图](./三端架构集成测试流程图.md) | 可视化的三端架构集成测试完整流程 | ⭐⭐⭐ |

### 传统集成测试

| 文档 | 说明 | 优先级 |
|------|------|--------|
| [集成测试指南](./集成测试指南.md) | 完整的测试编写指南 | ⭐⭐⭐ |
| [集成测试实战指南 - 用户管理示例](./集成测试实战指南-用户管理示例.md) | 实际案例，87个测试用例 | ⭐⭐⭐ |
| [测试数据库初始化](./测试数据库初始化.md) | 数据库初始化步骤 | ⭐⭐ |
| [用户管理 API 测试报告](./user-api-integration-test-report.md) | 用户表字段清单与测试统计 | ⭐⭐ |

### 测试进度跟踪

| 文档 | 说明 |
|------|------|
| [未实现功能清单](./未实现功能清单.md) | 列出所有尚未实现的测试功能 |
| [未实现功能实现计划](./未实现功能实现计划.md) | 未实现功能的详细实现计划 |

---

## 测试目录结构

项目中的测试文件按以下结构组织：

```
tests/
├── integration/                        # 集成测试
│   ├── three-tier-architecture.test.ts # 完整三端架构测试
│   ├── three-tier-template.test.ts     # 测试模板文件 ⭐
│   ├── puppeteer-connection.test.ts    # Puppeteer 连接测试
│   ├── billing-flow.test.ts            # 计费流程测试
│   └── session-lifecycle.test.ts       # 会话生命周期测试
│
├── e2e/                                # 端到端测试 (Playwright)
│   ├── p0-critical.spec.ts            # P0 关键测试
│   ├── p1-important.spec.ts           # P1 重要测试
│   ├── p2-nice-to-have.spec.ts        # P2 增强测试
│   └── views.spec.ts                  # 视图测试
│
├── unit/                               # 单元测试 (Vitest)
│   └── services/                       # 服务单元测试
│       ├── session-state-machine.test.ts
│       ├── session-allocation.test.ts
│       ├── credits-monitor.test.ts
│       └── credits-calculator.test.ts
│
├── helpers/                            # 测试辅助工具
│   ├── ports.ts                        # 端口管理工具 ⭐
│   ├── factories.ts                    # 测试数据工厂 ⭐
│   ├── database.ts                     # 数据库辅助工具
│   ├── app.ts                          # 应用辅助工具
│   └── test-env.ts                     # 测试环境配置
│
└── fixtures.ts                         # 测试夹具
```

---

## 测试类型对比

| 测试类型 | 测试框架 | 测试内容 | 文件位置 | 运行命令 |
|----------|----------|----------|----------|----------|
| 三端架构集成测试 | Vitest | Client-Manager-Machine 完整流程 | `tests/integration/three-tier-*.test.ts` | `pnpm test:unit tests/integration/` |
| 传统集成测试 | Vitest | Fastify 路由 + Controller + Model | `tests/integration/*.test.ts` | `pnpm test:routes` |
| E2E 测试 | Playwright | UI 自动化测试 | `tests/e2e/*.spec.ts` | `npx playwright test` |
| 单元测试 | Vitest | Services/Controllers/Models | `tests/unit/**/*.test.ts` | `pnpm test:unit` |

---

## 测试运行命令

### 三端架构集成测试 (TIER)

```bash
# 运行完整的三端架构测试
pnpm test:unit tests/integration/three-tier-architecture.test.ts

# 运行测试模板（用于验证模板可用性）
pnpm test:unit tests/integration/three-tier-template.test.ts

# 运行特定测试用例（使用 grep）
pnpm test:unit tests/integration/three-tier-architecture.test.ts --grep "TIER-003"
```

### 传统集成测试

```bash
# 运行所有路由集成测试
pnpm test:routes

# 运行单个测试文件
npx vitest run src/tests/integration/routes/user.routes.test.ts

# 监听模式
npx vitest src/tests/integration/routes
```

### E2E 测试

```bash
# 运行所有 E2E 测试
npx playwright test

# 运行特定优先级测试
npx playwright test tests/e2e/p0-critical.spec.ts
npx playwright test tests/e2e/p1-important.spec.ts

# 运行特定测试用例
npx playwright test --grep "P0-U01"
```

### 单元测试

```bash
# 运行所有单元测试
pnpm test:unit

# 运行特定服务的单元测试
pnpm test:unit tests/unit/services/credits-monitor.test.ts

# 监听模式
pnpm test:unit:watch
```

---

## 三端架构集成测试 (TIER)

### 什么是三端架构？

三端架构包括：

1. **客户端 (Client SDK)**: HTTP API 调用 + WebSocket 连接
2. **管理端 (Manager Server)**: Fastify HTTP API + gRPC Server + MySQL 数据库
3. **机器端 (Machine Service)**: gRPC Client + Chrome 实例管理

### TIER 测试命名规范

所有三端集成测试用例使用 `TIER-XXX` 编号格式：

| 编号范围 | 测试类型 | 说明 |
|----------|----------|------|
| TIER-001 ~ TIER-010 | 核心功能测试 | 客户端SDK、用户登录、会话创建、浏览器操作 |
| TIER-011 ~ TIER-020 | 计费系统测试 | 后扣费模式、积分不足、积分历史、webhook |
| TIER-021 ~ TIER-030 | 机器管理测试 | 机器注册、离线、重连、负载均衡、状态监控 |
| TIER-031 ~ TIER-040 | 并发测试 | 多用户并发、多机器负载均衡、资源竞争 |
| TIER-041 ~ TIER-050 | 异常测试 | 机器故障、网络中断、数据库异常、进程崩溃 |
| TIER-051 ~ TIER-060 | 性能测试 | 压力测试、响应时间、吞吐量、资源占用 |

### 创建新的 TIER 测试

#### 方法 1: 使用模板

1. 复制测试模板：
```bash
cp tests/integration/three-tier-template.test.ts tests/integration/your-test.test.ts
```

2. 修改测试配置：
```typescript
const NUM_USERS = 3;      // 修改用户数量
const NUM_MACHINES = 3;   // 修改机器数量
const INITIAL_CREDITS = 1000; // 修改初始积分
```

3. 添加测试用例：
```typescript
it('TIER-XXX: 你的测试用例名称', { timeout: 60000 }, async () => {
  // 测试代码
});
```

#### 方法 2: 使用 Claude Code Skill

使用 `.claude/skills/test-three-tier-architecture/SKILL.md` Skill：

```bash
# 启动 Claude Code
claude

# 使用以下提示词触发 Skill：
"Create a three-tier integration test for session creation"
"Build a TIER test for billing verification"
"Write an end-to-end test for client-manager-machine"
```

---

## 传统集成测试

### 初始化测试数据库

```bash
# 首次使用或表结构变更后
pnpm test:integration:init
```

### 测试架构

```
测试用例
    ↓
调用 app.inject() → Fastify 路由 → Controller → Model → MySQL
    ↓
验证 HTTP 状态码 + 响应数据 + 数据库状态
```

### 测试模板

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from '../../helpers/app.js';
import { clearAllTables } from '../../helpers/database.js';
import { createTestUser, createTestAdmin } from '../../helpers/factories.js';
import { generateToken } from '../../../utils/auth.js';

describe('功能测试', () => {
  let app: FastifyInstance;
  let user: any;
  let userToken: string;
  let admin: any;
  let adminToken: string;

  beforeAll(async () => {
    await clearAllTables();
    app = await build();
    user = await createTestUser();
    userToken = generateToken(user);
    admin = await createTestAdmin();
    adminToken = generateToken(admin);
  });

  afterAll(async () => {
    await clearAllTables();
    await app.close();
  });

  it('应该成功', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/endpoint',
      headers: { Authorization: `Bearer ${userToken}` },
    });

    expect(response.statusCode).toBe(200);
  });
});
```

---

## 断言标准

### 必须遵守的断言规则

**原则**: 使用具体数值断言，禁止使用 true/false/0/1

```typescript
// ✅ 正确：使用具体数值
expect(machine.instanceCount).toBe(2);
expect(user.credits).toBe(997);
expect(session.duration).toBe(180);
expect(response.data.token.length).toBeGreaterThan(50);

// ❌ 错误：使用 true/false/0/1
expect(machine.instanceCount).toBeGreaterThan(0);
expect(user.credits).toBeTruthy();
expect(sessions.length).toBe(1);
```

### 多层验证要求

每个测试用例必须验证至少两层：

| 层级 | 验证方法 | 示例 |
|------|----------|------|
| 数据库层 | `Model.findById()` | 验证数据库记录正确 |
| API响应层 | HTTP status code, response body | 验证HTTP响应正确 |
| gRPC通信层 | connectionManager状态 | 验证机器端调用成功 |
| 浏览器层 | puppeteer操作 | 验证Chrome操作成功 |

---

## 测试环境配置

### .env.test 配置

```bash
# Node.js 环境
NODE_ENV=test

# 数据库配置
DB_TYPE=mysql
DB_NAME=playwright_test_user_sys
DB_HOST=REDACTED_INTERNAL_HOST
DB_PORT=3306
DB_USER=root
DB_PASSWORD=

# 服务端口
PORT=3000
GRPC_PORT=50051

# JWT 配置
JWT_SECRET=test_secret_key_for_testing_only
JWT_EXPIRES_IN=24h

# Chrome 路径
CHROME_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome

# 实例配置
INSTANCE_TIMEOUT=60000
MACHINE_MONITOR_INTERVAL=30000

# 日志级别
LOG_LEVEL=error
```

---

## 常见问题

### 1. 端口冲突

**问题**: 端口已被占用

**解决**: 使用 `getFreePort()` 动态分配端口

```typescript
import { getFreePort } from '../helpers/ports.js';

const port = await getFreePort();
```

### 2. 数据库连接失败

**问题**: 无法连接到 MySQL

**解决**:
1. 检查 `.env.test` 配置
2. 确保 MySQL 服务运行
3. 验证数据库权限

### 3. Chrome 未找到

**问题**: Chrome 路径不正确

**解决**: 在 `.env.test` 中设置正确的 `CHROME_PATH`

```bash
# macOS
CHROME_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome

# Linux
CHROME_PATH=/usr/bin/google-chrome

# Windows
CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

### 4. 机器注册超时

**问题**: 机器未能成功注册

**解决**:
1. 增加等待时间
2. 检查 gRPC 连接
3. 验证机器端配置

---

## 最佳实践

### 1. 测试隔离

- 每个测试用例独立运行
- 使用 `beforeEach` 重置数据
- 不依赖测试用例执行顺序

### 2. 测试可读性

- 使用清晰的步骤说明
- 添加详细的注释
- 使用有意义的变量名

### 3. 测试稳定性

- 使用动态端口避免冲突
- 设置合理的超时时间
- 添加适当的等待时间

### 4. 测试覆盖

- 覆盖正常流程
- 覆盖异常场景
- 验证边界条件

---

## 相关资源

### Claude Code Skill

使用 `.claude/skills/test-three-tier-architecture/SKILL.md` Skill 可以自动创建三端集成测试。

触发方式：
- "create a three-tier architecture test"
- "build a TIER test"
- "write integration test for client-manager-machine"

### 辅助工具

| 文件 | 说明 |
|------|------|
| `tests/helpers/ports.ts` | 端口管理工具 |
| `tests/helpers/factories.ts` | 测试数据工厂 |
| `tests/helpers/database.ts` | 数据库辅助工具 |
| `tests/helpers/app.ts` | 应用辅助工具 |

### 示例测试

| 文件 | 说明 |
|------|------|
| `tests/integration/three-tier-architecture.test.ts` | 完整的三端架构测试 |
| `tests/integration/three-tier-template.test.ts` | 可复用的测试模板 |
| `tests/integration/billing-flow.test.ts` | 计费流程测试示例 |
| `tests/integration/session-lifecycle.test.ts` | 会话生命周期测试示例 |

---

## 检查清单

创建新的三端集成测试前，确认：

- [ ] 使用 TIER-XXX 编号
- [ ] 添加完整的 JSDoc 注释
- [ ] 使用 beforeAll/afterAll 模板
- [ ] 遵循断言标准（不使用 true/false/0/1）
- [ ] 验证至少两层（数据库 + API/浏览器）
- [ ] 使用 `getFreePort()` 分配端口
- [ ] 设置合理的超时时间
- [ ] 添加清晰的日志输出
- [ ] 验证后扣费模式（如涉及计费）
- [ ] 清理测试资源

---

## 版本历史

| 版本 | 日期 | 修改内容 |
|------|------|----------|
| 1.0.0 | 2025-12-28 | 初始版本，包含完整的测试文档结构 |
| 2.0.0 | 2025-12-28 | 添加三端架构集成测试文档 |
