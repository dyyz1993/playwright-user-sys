# Playwright 用户管理系统

[![Code Quality](https://github.com/dyyz1993/playwright-user-sys/actions/workflows/code-quality.yml/badge.svg)](https://github.com/dyyz1993/playwright-user-sys/actions/workflows/code-quality.yml)
[![Integration Tests](https://github.com/dyyz1993/playwright-user-sys/actions/workflows/test-integration.yml/badge.svg)](https://github.com/dyyz1993/playwright-user-sys/actions/workflows/test-integration.yml)
[![E2E Tests](https://github.com/dyyz1993/playwright-user-sys/actions/workflows/e2e-smoke-test.yml/badge.svg)](https://github.com/dyyz1993/playwright-user-sys/actions/workflows/e2e-smoke-test.yml)
[![Coverage](https://img.shields.io/badge/coverage-coming__soon-yellow)]()
[![Docker Build](https://github.com/dyyz1993/playwright-user-sys/actions/workflows/docker-build.yml/badge.svg)](https://github.com/dyyz1993/playwright-user-sys/actions/workflows/docker-build.yml)
[![License: Apache 2.0 with Commons Clause](https://img.shields.io/badge/License-Apache%202.0%20with%20Commons%20Clause-red.svg)](LICENSE)

一个用于管理 Playwright 实例的系统，包含用户管理、点数计费和实例集群管理功能。

## 系统架构

系统由以下三个主要部分组成：

| 组件 | 说明 |
| --- | --- |
| **管理服务器** (`src/manager/`) | API 和管理界面，负责用户管理、点数计费、实例分配 |
| **实例机器** (`src/machine/`) | 运行 Playwright 实例，可部署多台组成集群 |
| **用户端 SDK** (`src/sdk/`) | 客户端库，用于创建和管理 Playwright 会话 |

工作流程：用户通过 SDK 创建会话 → 管理服务器分配实例机器 → WebSocket 连接浏览器 → 按时长扣费。

### 目录结构

```
src/
├── manager/          # 管理服务器入口和配置
├── machine/          # 实例机器服务（浏览器实例、gRPC、代理）
├── sdk/              # 客户端 SDK
├── controllers/      # API 请求处理
├── services/         # 业务逻辑（计费、会话、gRPC 通信）
├── models/           # 数据库模型（user、session、machine 等）
├── routes/           # Fastify 路由和中间件
├── schemas/          # Zod 请求验证
├── plugins/          # Fastify 插件（认证、错误处理、Swagger）
├── middlewares/      # 请求中间件
├── utils/            # 工具函数
├── config/           # 配置文件
├── shared/           # 共享类型和常量
├── types/            # TypeScript 类型定义
├── public/           # 静态资源
└── views/            # EJS 模板
```

## 本地开发

### 前置要求

- Node.js 20+
- pnpm 10+

### 安装步骤

```bash
# 克隆仓库
git clone https://github.com/yourusername/playwright-user-sys.git
cd playwright-user-sys

# 安装依赖
pnpm install

# 配置环境变量
cp .env.dev .env.dev.local
# 编辑 .env.dev.local，填入你的配置（参考下方配置说明）

# 启动管理服务器
pnpm dev

# 或启动实例机器
pnpm dev:machine
```

启动成功后访问 http://localhost:3000 即可。

### 数据库

默认使用 SQLite，零配置即可运行。如需 MySQL：

```bash
# 在 .env.dev.local 中设置
DB_TYPE=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=playwright_user_sys
DB_USER=root
DB_PASSWORD=your-password-here

# 运行数据库迁移
pnpm migrate
```

### 配置说明

在 `.env.dev.local` 中配置，主要配置项：

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `PORT` | 管理服务器端口 | `3000` |
| `NODE_ENV` | 运行环境 | `development` |
| `DB_TYPE` | 数据库类型 `sqlite` / `mysql` | — |
| `DB_PATH` | SQLite 数据库文件路径（SQLite 时使用） | — |
| `DB_HOST` / `DB_PORT` | MySQL 地址和端口 | — |
| `DB_NAME` | 数据库名 | `playwright_user_sys` |
| `DB_USER` / `DB_PASSWORD` | MySQL 用户名和密码 | — |
| `JWT_SECRET` | JWT 签名密钥 | — |
| `JWT_EXPIRES_IN` | Token 有效期 | `1d` |
| `ADMIN_USERNAME` | 初始管理员用户名 | `admin` |
| `ADMIN_PASSWORD` | 初始管理员密码 | — |
| `GRPC_PORT` | gRPC 服务端口 | `50051` |
| `PROXY_PORT` | 代理服务端口 | `8082` |
| `MACHINE_ID` | 实例机器标识 | `machine-1` |
| `MANAGER_HOST` | 管理服务器地址（实例机器用） | `localhost:50051` |

> 生产环境务必修改 `JWT_SECRET` 和 `ADMIN_PASSWORD`。

## 常用命令

```bash
pnpm dev              # 启动开发服务器（热重载）
pnpm dev:machine      # 启动实例机器开发服务器
pnpm build            # TypeScript 类型检查（tsc --noEmit）
pnpm test:unit        # 单元测试（Vitest）
pnpm dev:test         # 快捷单元测试
pnpm test:all         # 运行所有测试
pnpm lint             # ESLint 检查
pnpm format           # Prettier 格式化
pnpm check:all        # 全量检查（lint + format + build + types + test）
```

更多测试命令：

```bash
pnpm test:unit:watch  # 单元测试监听模式
pnpm test:integration # 集成测试
pnpm test:e2e         # E2E 测试（Playwright）
pnpm test:coverage    # 测试覆盖率
```

## 功能特点

- 管理员和普通用户角色区分
- 用户点数计费系统
- 实例机器集群管理
- WebSocket 代理连接
- Webhook 事件通知
- API 文档（Swagger 和 Scalar）
- Docker 部署支持
- SQLite/MySQL 数据库支持
- 文件上传和管理功能
- CDP 文件上传支持
- 分布式文件上传支持

## 技术栈

- TypeScript + Fastify
- Knex.js + SQLite / MySQL
- Playwright + WebSocket
- gRPC（服务间通信）
- Zod（请求验证）

## Docker 部署

```bash
# 仅部署管理服务器
docker-compose up -d

# 部署完整系统（管理服务器 + 实例机器）
docker-compose -f docker-compose.full.yml up -d
```

### Chrome 文件配置

对于实例机器（Dockerfile.machine），需要提供 Chrome 浏览器文件：

```bash
# 准备 Chrome 文件目录
mkdir -p ./chrome

# 运行容器时映射 Chrome 目录
docker run -d \
  --name playwright-machine \
  -v /path/to/your/chrome:/opt/chrome \
  -e MANAGEMENT_SERVER_URL=http://your-management-server:3000 \
  -p 8082:8082 \
  your-registry/playwright-user-sys:machine
```

**注意**：Chrome 目录必须包含名为 `chrome` 的可执行文件，否则容器会在 30 秒后退出。

## API 文档

启动服务器后，可以通过以下地址访问 API 文档：

- Swagger UI: http://localhost:3000/docs
- Scalar API 参考: http://localhost:3000/reference

## 文件上传功能

系统支持文件上传功能，管理员可以通过以下方式上传和管理文件：

### 通过管理界面上传

1. 登录管理后台
2. 点击左侧菜单的"文件上传"
3. 选择要上传的文件
4. 点击"上传文件"按钮

### 通过 API 上传

```bash
# 使用 curl 上传文件
curl -X POST http://localhost:3000/api/files/upload \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -F "file=@/path/to/your/file.txt"
```

### 访问上传的文件

上传的文件可以通过以下 URL 访问：
```
http://localhost:3000/uploads/filename.ext
```

## CDP 文件上传支持

当在云端部署浏览器实例时，本地文件上传需要特殊处理。系统提供了专门的机制来支持通过 Chrome DevTools Protocol (CDP) 进行文件上传：

### 工作原理

1. **文件上传**：本地文件首先通过 API 上传到云端服务器的临时目录
2. **路径映射**：服务器返回文件在云端的绝对路径
3. **CDP 操作**：使用 CDP 的 `DOM.setFileInputFiles` 方法设置文件输入
4. **文件访问**：云端浏览器可以直接访问服务器上的文件

### 使用示例

```javascript
// 1. 上传本地文件到服务器
const formData = new FormData()
formData.append('file', fileInput.files[0])

const uploadResponse = await fetch('/api/files/upload-temp', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
  },
  body: formData,
})

const uploadData = await uploadResponse.json()
const serverFilePath = uploadData.data.filepath

// 2. 使用 CDP 设置文件输入
const cdp = await page.target().createCDPSession()
await cdp.send('DOM.setFileInputFiles', {
  objectId: fileInputElementId,
  files: [serverFilePath]  // 服务器上的文件路径
})
```

### API 端点

- `POST /api/files/upload-temp` - 上传临时文件用于 CDP 操作
- `POST /api/files/cleanup-temp` - 清理临时文件

## 分布式文件上传支持

在分布式架构中，管理端和机器端运行在不同的物理机器上。传统的文件上传方式在这种架构下无法正常工作，因为文件存储在管理端机器上，机器端无法直接访问。

系统提供了通过 WebSocket 直接将文件从客户端传输到机器端的解决方案：

### 工作原理

1. **直接传输**：客户端通过 WebSocket 将文件直接传输到机器端
2. **本地存储**：机器端将文件存储在本地临时目录
3. **CDP 操作**：使用 CDP 的 `DOM.setFileInputFiles` 方法设置文件输入
4. **无需管理端**：完全绕过管理端的文件存储

### 使用示例

```javascript
import DistributedFileUploader from './examples/complete-distributed-file-upload.js'

// 1. 连接到机器端
const uploader = new DistributedFileUploader('ws://machine-endpoint:8082')
await uploader.connect()

// 2. 创建会话
await uploader.createSession()

// 3. 上传文件（直接传输到机器端）
const uploadResult = await uploader.uploadFile('./local-file.txt', 'remote-file.txt')

// 4. 设置文件输入（可选）
await uploader.setFileInput('input[type="file"]', uploadResult.filepath)

// 5. 关闭会话
await uploader.closeSession()
```

详细文档请参考 [分布式文件上传文档](./docs/distributed-file-upload.md)