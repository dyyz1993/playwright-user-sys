# 贡献指南

感谢你对 Playwright User Sys 项目的关注！

## 开发环境搭建

### 前置要求

- **Node.js** >= 20
- **pnpm** >= 10
- **Chromium**（Playwright 浏览器安装）

### 快速开始

```bash
# 克隆仓库
git clone https://github.com/dyyz1993/playwright-user-sys.git
cd playwright-user-sys

# 安装依赖
pnpm install

# 安装 Playwright 浏览器（机器服务需要）
pnpm exec playwright install chromium

# 复制环境变量配置
cp .env.example .env.dev

# 启动开发服务器
pnpm dev
# 访问 http://localhost:3000
```

### 开发常用命令

```bash
# 启动管理服务器（开发模式，热重载）
pnpm dev

# 启动管理服务器（指定环境文件）
pnpm dev:server

# 启动机器服务
pnpm dev:machine

# 构建项目
pnpm build

# 运行单元测试
pnpm test:unit

# 运行 lint 检查
pnpm lint

# 运行完整检查（lint + format + build + test）
pnpm check:all
```

## 项目结构

```
src/
├── manager/                  # 管理服务器
│   ├── server.ts            # 入口文件
│   └── app.ts               # 应用构建 + 启动逻辑
├── machine/                  # 机器服务
│   ├── server.ts             # 入口文件
│   ├── app.ts                # 生命周期管理（MachineServer 类）
│   ├── browser-lifecycle.ts  # 浏览器启动/关闭/清理
│   ├── browser.service.ts    # 浏览器服务（对外接口）
│   ├── browser-connection.ts # 浏览器连接管理
│   ├── browser-utils.ts      # 浏览器工具函数
│   ├── browser-constants.ts  # 浏览器常量配置
│   ├── proxy.service.ts      # 代理服务
│   ├── health.service.ts     # 健康检查
│   └── config.ts             # 机器端配置
├── controllers/              # API 控制器
│   ├── auth.controller.ts    # 认证（登录/当前用户）
│   ├── session.controller.ts # 会话管理
│   ├── user.controller.ts    # 用户管理
│   ├── machine.controller.ts # 机器管理
│   └── file.controller.ts    # 文件上传
├── services/                 # 业务服务层
│   ├── session.service.ts    # 会话逻辑
│   ├── credits-monitor.service.ts  # 积分监控
│   ├── machine-monitor.service.ts  # 机器监控
│   ├── memory-store.service.ts     # 内存存储
│   └── native-websocket-proxy.service.ts  # WebSocket 代理
├── models/                   # 数据模型
│   ├── migrations.ts         # 数据库迁移
│   ├── user.model.ts         # 用户模型
│   ├── session/              # 会话模型（模块化）
│   └── machine.model.ts      # 机器模型
├── routes/                   # 路由定义
├── schemas/                  # Zod 验证 Schema
├── plugins/                  # Fastify 插件
├── sdk/                      # 客户端 SDK
│   ├── client.ts             # Client 类
│   ├── session.ts            # Session 类
│   └── types.ts              # 类型定义
├── shared/                   # 共享模块
│   ├── types/                # 类型定义
│   ├── utils/                # 工具函数
│   └── mappers/              # 数据映射
├── config/                   # 配置
└── tests/                    # 测试
    ├── unit/
    ├── integration/
    └── e2e/
```

## 代码规范

### TypeScript

```bash
# 类型检查
pnpm build:check

# 编译
pnpm build
```

规则：

- 启用 `strict` 模式
- 禁止使用 `any` 类型（除第三方库必需），优先使用 `unknown`
- 所有用户输入必须通过 Zod Schema 验证
- 公共函数必须有显式返回类型
- 错误必须处理，禁止空 `catch`

### ESLint + Prettier

```bash
# 检查代码
pnpm lint

# 自动修复
pnpm lint:fix

# 格式化代码
pnpm format

# 检查格式
pnpm format:check
```

配置在 `package.json` 和 `eslint.config.js` 中。提交前将自动执行 lint-staged。

### 命名规范

| 类型 | 命名方式 | 示例 |
|------|---------|------|
| 类/接口 | PascalCase | `Client`, `SessionManager` |
| 函数/变量 | camelCase | `createSession()`, `handleWebSocketUpgrade` |
| 文件 | kebab-case | `browser-lifecycle.ts`, `auth.controller.ts` |
| 类型文件 | camelCase | `types.ts`, `index.ts` |
| 目录 | kebab-case | `session_handlers/`, `machine-grpc/` |
| 常量 | UPPER_SNAKE_CASE | `MAX_FILE_SIZE`, `CONFIG` |
| 环境变量 | UPPER_SNAKE_CASE | `JWT_SECRET`, `DB_TYPE` |

### 错误处理

```typescript
// ✅ 正确：对不同类型的错误做不同处理
try {
  await doSomething();
} catch (error: unknown) {
  if (error instanceof z.ZodError) {
    // 验证错误
    return sendError(reply, '无效参数', 400);
  }
  // 系统错误
  return logAndSendError(request, reply, error, '操作失败');
}

// ❌ 错误：空 catch
try {
  await doSomething();
} catch {}
```

## Git 工作流

### 分支命名

| 分支 | 用途 | 命名示例 |
|------|------|---------|
| `main` | 生产代码 | 受保护 |
| `develop` | 开发集成分支 | 受保护 |
| `feat/*` | 新功能 | `feat/add-session-export` |
| `fix/*` | 修复 | `fix/websocket-timeout` |
| `docs/*` | 文档 | `docs/api-reference` |
| `refactor/*` | 重构 | `refactor/session-model` |
| `test/*` | 测试 | `test/concurrency-edge-cases` |

### Commit 规范

使用 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>(<scope>): <subject>

<body>

<footer>
```

| 类型 | 含义 |
|------|------|
| `feat` | 新功能 |
| `fix` | 修复 Bug |
| `docs` | 文档变更 |
| `refactor` | 代码重构 |
| `perf` | 性能优化 |
| `test` | 测试相关 |
| `chore` | 构建/工具变更 |

示例：

```
feat(session): add batch release API

支持一次性释放多个会话，减少 API 调用次数。

Closes #123
```

### 开发流程

```bash
# 1. 更新 main 分支
git checkout main
git pull origin main

# 2. 创建功能分支
git checkout -b feat/amazing-feature

# 3. 开发并提交
git add .
git commit -m 'feat: add amazing feature'

# 4. 推送分支
git push origin feat/amazing-feature

# 5. 创建 Pull Request
# 在 GitHub 上创建 PR

# 6. 等待 Review 和 CI 通过
```

### PR 检查清单

提交 PR 前检查：

- [ ] 代码通过 lint 和类型检查（`pnpm lint && pnpm build:check`）
- [ ] 新功能有对应测试（`pnpm test:unit` 通过）
- [ ] 没有引入新的 `any` 类型
- [ ] 提交信息遵循 Conventional Commits
- [ ] 文档已更新（如适用）
- [ ] 变更日志已更新

## 测试规范

### 单元测试

使用 Vitest，与源文件同目录，命名 `*.test.ts`：

```bash
# 运行所有单元测试
pnpm test:unit

# 运行特定模块测试
pnpm test:models
pnpm test:model:user
pnpm test:services
pnpm test:controllers

# 带覆盖率
pnpm test:coverage
```

**AAA 模式**：

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Client } from './client.js';

describe('Client', () => {
  let client: Client;

  beforeEach(() => {
    // Arrange: 准备测试数据
    client = new Client({ apiKey: 'test-key', baseUrl: 'http://localhost:3000' });
  });

  it('should create session successfully', async () => {
    // Act: 执行被测试的功能
    const session = await client.sessions.create();

    // Assert: 验证结果
    expect(session.id).toBeDefined();
    expect(session.status).toBe('active');
  });
});
```

### 集成测试

```bash
# 运行集成测试
pnpm test:integration

# 运行 API 测试
pnpm test:api

# 三层架构集成测试
pnpm test:tier
```

### E2E 测试

使用 Playwright Test，配置在 `playwright.config.ts`：

```bash
# 运行所有 E2E 测试
pnpm test:e2e

# 按优先级运行
pnpm test:e2e:p0  # 关键路径
pnpm test:e2e:p1  # 重要功能
pnpm test:e2e:p2  # 辅助功能

# 带 UI 界面调试
pnpm test:e2e:headed
pnpm test:e2e:debug
```

E2E 测试配置要求：

```typescript
// playwrite.config.ts
{
  workers: 3,           // 最多3个浏览器实例
  headless: true,       // 无头模式
  // 指定 Chromium 路径
  executablePath: '/Applications/Chromium.app/Contents/MacOS/Chromium',
}
```

## 文档贡献

### 文档位置

文档位于 `website/` 目录，使用 VitePress 构建：

```
website/
├── .vitepress/config.ts  # 站点配置
├── index.md              # 首页
├── guide/                # 指南
├── api/                  # API 文档
├── sdk/                  # SDK 文档
├── deploy/               # 部署指南
└── public/               # 静态资源
```

### 本地预览

```bash
# 启动文档开发服务器
pnpm docs:dev

# 构建文档
pnpm docs:build

# 预览构建结果
pnpm docs:preview
```

### 文档规范

1. 中英文混排时，英文单词两侧加空格
2. 代码示例必须完整可运行
3. 使用 VitePress 容器：
   - `::: tip` 提示
   - `::: warning` 警告
   - `::: danger` 危险
   - `::: details` 折叠详情
   - `::: code-group` 多语言代码示例

## 问题反馈

- 使用 [GitHub Issues](https://github.com/dyyz1993/playwright-user-sys/issues) 报告 Bug
- 提供完整的复现步骤和环境信息
- 标记合适的标签（bug / feature / question）
- 敏感信息请先脱敏

---

::: tip 第一次贡献？
欢迎查看 [good first issue](https://github.com/dyyz1993/playwright-user-sys/labels/good%20first%20issue) 标签，这些 issue 适合新贡献者上手。
:::
