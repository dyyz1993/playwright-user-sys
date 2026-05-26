# 快速开始

## 环境要求

- **Node.js** >= 18
- **pnpm** (推荐) 或 npm
- **Docker** (可选，用于容器部署)
- **Playwright 浏览器** (运行机器服务时需要)

## 安装

```bash
# 克隆项目
git clone https://github.com/dyyz1993/playwright-user-sys.git
cd playwright-user-sys

# 安装依赖
pnpm install

# 安装 Playwright 浏览器
pnpm exec playwright install chromium
```

## 配置环境变量

复制环境变量模板并编辑：

```bash
cp .env.example .env
```

::: tip 最小配置
默认使用 SQLite，只需设置 `JWT_SECRET` 和 `ADMIN_PASSWORD` 即可启动。
:::

## 启动开发服务器

```bash
# 启动管理服务器
pnpm dev
```

启动后访问 **http://localhost:3000**

## 默认账号

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | admin123 | 管理员 |

::: warning 生产环境
请务必修改默认密码和 JWT Secret！
:::

## 启动机器服务

```bash
# 在另一个终端启动机器服务
pnpm dev:machine
```

## 第一个 API 调用

```bash
# 登录获取 Token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}'

# 响应示例
# {"success": true, "data": {"token": "eyJhbGciOiJIUzI1NiIs...", "user": {...}}}
```

```bash
# 创建浏览器会话
curl -X POST http://localhost:3000/api/sessions \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json"

# 响应示例
# {"success": true, "data": {"id": "session-id", "status": "active", ...}}
```

## 下一步

- 了解[系统架构](/guide/architecture)
- 查看完整的 [REST API 文档](/api/rest-api)
- 阅读 [Client SDK 使用指南](/sdk/client-sdk)
