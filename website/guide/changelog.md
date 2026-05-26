# 更新日志

## v1.0.0 (2025-01-15)

初始正式发布。

### feat: 核心功能

- **多用户管理系统**：完整的 JWT 认证 + API Key 鉴权，支持 `admin`/`user` 双角色 RBAC
- **Session 完整生命周期管理**：创建 → 分配 → 连接 → 释放，状态机驱动
- **分布式机器节点**：gRPC 通信协议，机器自动注册/心跳/摘除
- **WebSocket CDP 代理**：原生 `http-proxy` 实现，支持新会话建立和已有会话重连
- **积分计费系统**：按分钟计费（1积分/分钟），5秒间隔自动检测，积分不足自动关停会话
- **文件上传系统**：双重机制 - 标准上传（管理服务器中转） + 分布式上传（WebSocket 直传机器）
- **Client SDK**：TypeScript 封装，支持 `createAndConnect`、`uploadFile`、`screenshot` 等方法
- **Viewer 页面**：WebSocket 桥接，实时查看浏览器画面和事件流
- **RESTful API**：基于 Fastify v5，Zod Schema 验证，Swagger 文档 + Scalar API Reference
- **数据库支持**：SQLite（开发）/ MySQL 8.0+（生产），Knex.js ORM

### feat: 浏览器管理

- **Puppeteer + puppeteer-extra-stealth**：浏览器自动化 + 反检测指纹注入
- **指纹管理**：基于 `fingerprint-generator` + `fingerprint-injector`，支持动态 User-Agent
- **共享/独立用户数据**：`sharedUserData` 模式保持登录状态，独立模式会话隔离
- **浏览器进程守护**：异常断开自动清理，超时进程 SIGKILL 兜底
- **Viewport/时区/语言自定义**：精细化模拟配置
- **代理支持**：`proxy-chain` 匿名化代理，支持 `proxyBypass`

### feat: 安全加固

- **密码加密**：bcryptjs 哈希存储，支持从 SHA-256 自动迁移
- **Helmet 安全头**：`@fastify/helmet` 防常见 Web 攻击
- **速率限制**：`@fastify/rate-limit` 防暴力破解
- **CORS 配置**：`@fastify/cors` 可控跨域策略
- **日志脱敏**：API Key 自动替换为 `***REDACTED***`
- **输入验证**：Zod Schema 全覆盖，拒绝无效请求

### feat: 运维

- **Docker 支持**：多阶段构建镜像，docker-compose 编排
- **健康检查**：HTTP `/health` 端点，机器状态监控
- **优雅关闭**：SIGINT/SIGTERM 处理，资源自动释放
- **定时清理**：6小时清理过期上传文件，1小时清理过期临时文件
- **环境变量配置**：`dotenv` 加载，开发/生产环境分离

### refactor

- 分离 Session Model 为独立模块（`src/models/session/`）
- 提取 Puppeteer 配置为独立模块（`src/machine/session_handlers/puppeteer-config.ts`）
- 提取剪贴板常量为独立模块（`src/machine/session_handlers/clipboard-constants.ts`）
- 内聚事件处理逻辑到独立 handler 文件

### fix

- 修复 WebSocket 代理中的 Origin 验证逻辑，支持生产环境所有域名
- 修复浏览器启动超时后的孤儿进程清理
- 修复文件上传注入到 iframe 场景
- 修复共享数据会话冲突提示
- 修复机器启动时负载不均衡问题
- 修复 session release 后用户数据目录残留

### perf

- 优化 Builder 模式构建参数，减少验证轮次
- 优化内存存储（memoryStore）查询性能
- 优化 WebSocket 心跳检测机制，减少无效连接
- 优化积分监控批量处理，使用事务一次性更新

### docs

- 完整的中文文档站点（VitePress）
- API 参考文档（REST + WebSocket）
- Client SDK 使用指南
- 部署指南（Docker + 手动 + 环境变量）
- 架构说明文档
- 配置说明文档

### chore

- 迁移到 pnpm workspace 管理依赖
- 配置 ESLint + Prettier + Husky 提交前检查
- Vitest 单元测试框架
- Playwright E2E 测试框架
- 依赖安全审计（pnpm overrides）

---

## v0.9.0 (2024-11-20)

Beta 版本。

### feat

- 初始 MVC 架构实现：Controller → Service → Model 三层
- Fastify 基础框架搭建，插件化路由注册
- 用户注册/登录/API Key 基础功能
- 基本 Session CRUD 操作
- 机器注册/心跳/列表
- 基础积分扣除逻辑（不含定时监控）
- 基础文件上传功能
- HTML 模板页面（EJS）

### fix

- 修复 Fastify 类型定义兼容性问题
- 修复数据库迁移在 SQLite 下的执行顺序
- 修复密码验证的编码问题

### refactor

- 从单一文件重构为模块化目录结构
- 分离路由定义和控制器逻辑

### docs

- README 基础说明
- API 基础文档

---

## v0.1.0 (2024-09-01)

项目初始化。

### feat

- 项目骨架搭建（TypeScript + Node.js）
- 依赖管理体系（pnpm）
- 基础开发配置（tsconfig, eslint）
- Playwright 集成验证 POC

---

::: tip 版本号说明
版本号遵循 [SemVer](https://semver.org/) 规范：`主版本.次版本.修订号`
- 主版本：不兼容的 API 修改
- 次版本：向下兼容的功能新增
- 修订号：向下兼容的问题修正
:::
