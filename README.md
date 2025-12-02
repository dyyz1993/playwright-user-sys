# Playwright User System

一个基于 Playwright 的用户管理系统，支持分布式机器管理和自动化任务执行。

## 功能特性

- 分布式机器管理
- 自动化任务执行
- 用户会话管理
- 实时状态监控

## Docker 镜像

本项目提供三个不同的 Docker 镜像：

- **manager**: 管理服务镜像，包含完整的管理界面和 API
- **machine**: 机器服务镜像，包含 Playwright 和 Chrome 浏览器
- **simple**: 简化版镜像，包含基本的应用程序功能

## 快速开始

### 使用 Docker Compose

```bash
docker-compose up -d
```

### 单独运行镜像

```bash
# 运行管理服务
docker run -p 3000:3000 ghcr.io/dyyz1993/playwright-user-sys-manager:latest

# 运行机器服务
docker run -p 8082:8082 ghcr.io/dyyz1993/playwright-user-sys-machine:latest
```

## 开发

### 本地开发

```bash
# 安装依赖
pnpm install

# 构建项目
pnpm run build

# 运行管理服务
pnpm run dev:manager

# 运行机器服务
pnpm run dev:machine
```

## 许可证

MIT