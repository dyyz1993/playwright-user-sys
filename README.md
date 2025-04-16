# Playwright 用户管理系统

一个用于管理 Playwright 实例的系统，包含用户管理、点数计费和实例集群管理功能。

## 系统架构

系统由以下三个主要部分组成：

1. **管理服务器**：提供 API 和管理界面，负责用户管理、点数计费和实例分配。

2. **实例机器**：运行 Playwright 实例，可以部署多台实例机器组成集群。

3. **用户端 SDK**：提供给用户使用的客户端库，用于创建和管理 Playwright 会话。

系统工作流程：

1. 用户通过 SDK 创建会话并获取 sessionId
2. 管理服务器在可用的实例机器上启动 Playwright 实例
3. 用户通过 WebSocket 连接到 Playwright 实例
4. 管理服务器计算使用时长并扣除点数

## 功能特点

- 管理员和普通用户角色区分
- 用户点数计费系统
- 实例机器集群管理
- WebSocket 代理连接
- Webhook 事件通知
- API 文档（Swagger 和 Scalar）
- Docker 部署支持
- SQLite/MySQL 数据库支持

## 技术栈

- TypeScript
- Fastify
- Knex.js (SQL 查询构建器)
- SQLite/MySQL
- Playwright
- WebSocket
- Docker

## 快速开始

### 环境要求

- Node.js 18+
- pnpm 8+
- SQLite 或 MySQL

### 安装

```bash
# 克隆仓库
git clone https://github.com/yourusername/playwright-user-sys.git
cd playwright-user-sys

# 安装依赖
pnpm install

# 复制环境变量配置
cp .env.example .env
```

### 开发

```bash
# 启动开发服务器
pnpm dev
```

### 构建

```bash
# 构建生产版本
pnpm build

# 启动生产服务器
pnpm start
```

### 实例机器

```bash
# 启动实例机器开发服务器
pnpm dev:machine

# 构建并启动实例机器生产服务器
pnpm build
pnpm start:machine
```

### Docker 部署

```bash
# 仅部署管理服务器
docker-compose up -d

# 部署完整系统（管理服务器 + 实例机器）
docker-compose -f docker-compose.full.yml up -d
```

## API 文档

启动服务器后，可以通过以下地址访问 API 文档：

- Swagger UI: http://localhost:3000/docs
- Scalar API 参考: http://localhost:3000/reference

## 测试

系统包含了一系列测试脚本，位于 `tests` 目录下：

```bash
# 测试登录流程
pnpm test:login

# 测试会话管理
pnpm test:sessions

# 测试点数管理
pnpm test:credits

# 完整 API 测试
pnpm test:api

# 运行所有测试
pnpm test:all
```

测试结果将保存在 `logs` 目录中。更多测试相关信息请参考 [tests/TEST-README.md](tests/TEST-README.md)。

## 配置

通过 `.env` 文件配置系统：

```
# 服务器配置
PORT=3000
HOST=localhost
NODE_ENV=development

# 数据库配置
DB_TYPE=sqlite # 或 mysql
DB_NAME=playwright_user_sys
DB_PATH=./data/db.sqlite # 仅 SQLite 使用

# MySQL 配置 (仅在 DB_TYPE=mysql 时使用)
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=password

# JWT 配置
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=1d

# 管理员初始账号
ADMIN_USERNAME=admin
ADMIN_PASSWORD=REDACTED_ADMIN_PASS

# 实例配置
INSTANCE_TIMEOUT=60000 # 毫秒，实例超时时间
```

## 用户端 SDK 使用示例

```javascript
const client = new Client({
    APIKey: process.env.API_KEY,
});

// 创建会话
const session = await client.sessions.create({
    // 可选参数
    userAgent: 'Mozilla/5.0 ...',
    proxy: 'http://proxy.example.com:8080',
    cookies: { key: 'value' },
    localStorage: { key: 'value' },
    viewport: { width: 1920, height: 1080 }
});

// 连接到浏览器
const browser = await puppeteer.connect({
    browserWSEndpoint: `wss://connect.server.dev?apiKey=${process.env.API_KEY}&sessionId=${session.id}`,
});

// 使用浏览器...

// 释放会话
await client.sessions.release(session.id);
```

## 许可证

ISC
