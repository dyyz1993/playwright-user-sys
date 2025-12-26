# Docker 构建与部署指南

## 文档信息

- **文档**: Docker构建与部署指南.md
- **版本**: 2.0.0
- **更新日期**: 2024-12-26
- **用途**: 分布式 Playwright 系统的 Docker 构建和部署完整指南

---

## 目录

1. [架构概述](#1-架构概述)
2. [现有方案分析](#2-现有方案分析)
3. [新方案设计](#3-新方案设计)
4. [快速开始](#4-快速开始)
5. [开发环境部署](#5-开发环境部署)
6. [生产环境部署](#6-生产环境部署)
7. [配置说明](#7-配置说明)
8. [运维管理](#8-运维管理)
9. [故障排查](#9-故障排查)
10. [最佳实践](#10-最佳实践)

---

## 1. 架构概述

### 1.1 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                  Docker Compose 部署架构                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐         ┌──────────────────┐         │
│  │  Nginx           │         │   MySQL 8.0      │         │
│  │  (Reverse Proxy) │         │   (Database)     │         │
│  │                  │         │                  │         │
│  │  - Port 80/443   │         │  - Port 3306     │         │
│  └──────────────────┘         └──────────────────┘         │
│         │                              ▲                    │
│         │                              │                    │
│         ▼                              │                    │
│  ┌──────────────────┐                  │                    │
│  │  Manager Server  │                  │                    │
│  │  (Management)    │                  │                    │
│  │                  │                  │                    │
│  │  - HTTP: 3000    │──────────────────┘                    │
│  │  - gRPC: 50051   │                                       │
│  └──────────────────┘                                       │
│         ▲                                                    │
│         │ gRPC                                               │
│         │                                                    │
│  ┌──────┴──────┐     ┌──────────────┐                       │
│  │             │     │              │                       │
│  │ Machine 1   │     │  Machine 2   │  (可扩展)             │
│  │             │     │              │                       │
│  │ gRPC:50052  │     │ gRPC:50053   │                       │
│  │ WS:  8082   │     │ WS:  8083    │                       │
│  └─────────────┘     └──────────────┘                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 容器说明

| 容器 | 镜像 | 端口 | 说明 |
|------|------|------|------|
| Nginx | nginx:alpine | 80, 443 | 反向代理和负载均衡 |
| Manager | playwright-manager | 3000, 50051 | 管理服务器 |
| Machine 1 | playwright-machine | 50052, 8082 | 浏览器服务实例 1 |
| Machine 2 | playwright-machine | 50053, 8083 | 浏览器服务实例 2 |
| MySQL | mysql:8.0 | 3306 | 数据库服务 |

### 1.3 网络架构

```
Network: playwright-prod-network (172.20.0.0/16)

┌─────────────────────────────────────────────────┐
│  External Network (Internet)                    │
│  │                                              │
│  │  ┌──────────────────────────────────────┐   │
│  │  │ Nginx (Public Ports: 80, 443)        │   │
│  │  │                                      │   │
│  │  │ ┌────────────────────────────────┐  │   │
│  │  │ │ Manager (Internal: 3000)       │  │   │
│  │  │ │ gRPC Server (Internal: 50051)  │  │   │
│  │  │ └────────────────────────────────┘  │   │
│  │  │            ▲                        │   │
│  │  │            │ gRPC                   │   │
│  │  │ ┌──────────┴──────────┐            │   │
│  │  │ │                     │            │   │
│  │  │ │ Machine 1           │            │   │
│  │  │ │ gRPC: 50052         │            │   │
│  │  │ │ WS: 8082            │            │   │
│  │  │ │                     │            │   │
│  │  │ │ Machine 2           │            │   │
│  │  │ │ gRPC: 50053         │            │   │
│  │  │ │ WS: 8083            │            │   │
│  │  │ └─────────────────────┘            │   │
│  │  └──────────────────────────────────────┘   │
│  │                                              │
│  └──────────────────────────────────────────────┘
│                                                  │
│  ┌──────────────────────────────────────┐       │
│  │ MySQL (Internal: 3306)              │       │
│  │                                      │       │
│  └──────────────────────────────────────┘       │
└─────────────────────────────────────────────────┘
```

---

## 2. 现有方案分析

### 2.1 现有 Docker 文件

项目根目录下存在多个 Dockerfile 变体：

| 文件 | 说明 | 问题 |
|------|------|------|
| `Dockerfile` | 管理端基础构建 | 重复编译 better-sqlite3，缺少优化 |
| `Dockerfile.simple` | 简化版本 | 功能不完整 |
| `Dockerfile.optimized` | 优化版本 | 使用 Alpine 但兼容性问题 |
| `Dockerfile.machine` | 机器端构建 | Chrome 挂载方式复杂 |
| `Dockerfile.machine.optimized` | 机器端优化 | Alpine 包名不兼容 |
| `docker-compose.yml` | 基础编排 | 配置简单，缺少生产特性 |
| `docker-compose.full.yml` | 完整编排 | 缺少资源限制和监控 |

### 2.2 主要问题

#### 2.2.1 多阶段构建不完整
- 依赖安装和构建未完全分离
- 最终镜像包含不必要的构建工具
- better-sqlite3 重复编译

#### 2.2.2 Playwright 依赖问题
- Chrome 浏览器需要外部挂载
- 缺少完整的 Playwright 依赖库
- Alpine Linux 包兼容性问题

#### 2.2.3 生产就绪度不足
- 缺少资源限制配置
- 健康检查不够完善
- 日志管理未配置
- 缺少监控和可观测性

#### 2.2.4 可扩展性限制
- 机器服务扩展不便利
- 缺少服务发现机制
- 没有负载均衡配置

#### 2.2.5 安全性考虑
- 使用 root 用户运行应用
- 缺少网络隔离
- 敏感信息管理不规范

---

## 3. 新方案设计

### 3.1 设计原则

1. **多阶段构建**: 分离依赖、构建、运行阶段
2. **安全加固**: 非 root 用户运行，最小权限原则
3. **资源优化**: 镜像大小优化，构建缓存利用
4. **生产就绪**: 健康检查、资源限制、日志管理
5. **可扩展性**: 支持水平扩展，服务发现
6. **可维护性**: 配置集中管理，文档完善

### 3.2 目录结构

```
playwright-user-sys/
├── docker/
│   ├── manager/
│   │   └── Dockerfile              # 管理端镜像
│   ├── machine/
│   │   └── Dockerfile              # 机器端镜像
│   ├── mysql/
│   │   ├── my.cnf                  # MySQL 配置
│   │   └── init/                   # 初始化脚本
│   ├── nginx/
│   │   ├── nginx.conf              # Nginx 主配置
│   │   └── conf.d/
│   │       └── default.conf        # 站点配置
│   ├── .dockerignore               # Docker 排除文件
│   ├── .env.example                # 环境变量模板
│   ├── docker-compose.dev.yml      # 开发环境编排
│   └── docker-compose.prod.yml     # 生产环境编排
├── docs/开发/
│   └── Docker构建与部署指南.md    # 本文档
```

### 3.3 多阶段构建架构

#### 3.3.1 管理端 Dockerfile

```
Stage 1: dependencies
  ├─ 基础镜像: node:22-alpine
  ├─ 安装构建依赖
  └─ 安装 npm 依赖

Stage 2: build
  ├─ 复制依赖
  ├─ 设置路径映射
  └─ 编译 TypeScript

Stage 3: production
  ├─ 基础镜像: node:22-alpine
  ├─ 安装运行时依赖
  ├─ 创建非 root 用户
  ├─ 复制构建产物
  └─ 配置健康检查
```

#### 3.3.2 机器端 Dockerfile

```
Stage 1: dependencies
  ├─ 基础镜像: node:22-alpine
  ├─ 安装构建依赖
  └─ 安装 npm 依赖

Stage 2: build
  ├─ 复制依赖
  ├─ 设置路径映射
  └─ 编译 TypeScript

Stage 3: production
  ├─ 基础镜像: node:22-alpine
  ├─ 安装 Playwright 依赖
  ├─ 安装 Chromium
  ├─ 创建启动脚本
  ├─ 配置 Xvfb 和 dbus
  ├─ 复制构建产物
  └─ 配置健康检查
```

### 3.4 网络设计

#### 3.4.1 开发环境网络

```
playwright-dev-network (bridge)
  ├── mysql:3300 (暴露 3306)
  ├── manager:3000,50051 (暴露)
  ├── machine-1:50052,8082 (暴露)
  └── machine-2:50053,8083 (暴露)
```

#### 3.4.2 生产环境网络

```
playwright-prod-network (bridge, 172.20.0.0/16)
  ├── nginx:80,443 (外部访问)
  │   └── 代理到 manager
  ├── manager:3000,50051 (内部)
  ├── machine-1:50052,8082 (内部)
  ├── machine-2:50053,8083 (内部)
  └── mysql:3306 (内部)
```

### 3.5 数据持久化

| Volume | 用途 | 备份建议 |
|--------|------|---------|
| mysql-prod-data | MySQL 数据 | 每日备份 |
| manager-prod-data | 管理端数据 | 每日备份 |
| manager-prod-files | 上传文件 | 定期同步 |
| machine-*-prod-data | 机器端数据 | 可选 |
| machine-*-screenshots | 截图数据 | 定期清理 |

---

## 4. 快速开始

### 4.1 前置条件

- Docker Engine 20.10+
- Docker Compose 2.0+
- 至少 4GB 可用内存
- 至少 10GB 可用磁盘空间

### 4.2 克隆项目

```bash
git clone <repository-url>
cd playwright-user-sys
```

### 4.3 配置环境变量

```bash
# 开发环境（使用默认配置）
cd docker
cp .env.example .env

# 生产环境（必须修改敏感配置）
cd docker
cp .env.example .env
# 编辑 .env 文件，修改以下关键配置：
# - MYSQL_ROOT_PASSWORD
# - MYSQL_PASSWORD
# - JWT_SECRET
# - ADMIN_PASSWORD
```

### 4.4 启动服务

#### 4.4.1 开发环境

```bash
# 启动所有服务
docker-compose -f docker/docker-compose.dev.yml up -d

# 查看日志
docker-compose -f docker/docker-compose.dev.yml logs -f

# 停止服务
docker-compose -f docker/docker-compose.dev.yml down
```

#### 4.4.2 生产环境

```bash
# 启动所有服务
docker-compose -f docker/docker-compose.prod.yml --env-file docker/.env up -d

# 查看服务状态
docker-compose -f docker/docker-compose.prod.yml ps

# 查看日志
docker-compose -f docker/docker-compose.prod.yml logs -f manager
docker-compose -f docker/docker-compose.prod.yml logs -f machine-1

# 停止服务
docker-compose -f docker/docker-compose.prod.yml down
```

### 4.5 验证部署

```bash
# 检查容器状态
docker ps

# 检查健康状态
docker inspect playwright-manager-prod | grep -A 10 Health

# 测试 API
curl http://localhost:3000/api/health

# 检查机器注册（需要管理员 token）
curl http://localhost:3000/api/machines \
  -H "Authorization: Bearer <token>"
```

---

## 5. 开发环境部署

### 5.1 开发环境特点

- 使用开发构建目标
- 支持热重载
- 挂载源代码卷
- 使用 SQLite 或 MySQL
- 详细的调试日志

### 5.2 配置文件

`docker/docker-compose.dev.yml`:

```yaml
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    container_name: playwright-mysql-dev
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: playwright_user_sys
    volumes:
      - mysql-dev-data:/var/lib/mysql

  manager:
    build:
      target: dependencies  # 使用依赖阶段，保留开发工具
    volumes:
      - ..:/app:cached      # 挂载源代码
      - node-modules:/app/node_modules  # 独立 node_modules
    command: ["pnpm", "dev:server"]  # 使用 tsx watch

  machine-1:
    build:
      target: dependencies
    volumes:
      - ..:/app:cached
    command: ["pnpm", "dev:machine"]
```

### 5.3 启动开发环境

```bash
# 1. 启动 MySQL 和 Manager
docker-compose -f docker/docker-compose.dev.yml up -d mysql manager

# 2. 等待 Manager 启动完成
docker-compose -f docker/docker-compose.dev.yml logs -f manager

# 3. 启动 Machine 服务
docker-compose -f docker/docker-compose.dev.yml up -d machine-1

# 4. 启动第二个 Machine (可选，用于测试扩展)
docker-compose -f docker/docker-compose.dev.yml --profile scaling up -d machine-2
```

### 5.4 开发工作流

```bash
# 1. 编辑代码
vim src/manager/server.ts

# 2. 容器内自动重启（tsx watch）

# 3. 查看日志
docker-compose -f docker/docker-compose.dev.yml logs -f manager

# 4. 重新构建（如果修改了依赖）
docker-compose -f docker/docker-compose.dev.yml build manager
docker-compose -f docker/docker-compose.dev.yml up -d manager
```

### 5.5 调试技巧

```bash
# 进入容器调试
docker exec -it playwright-manager-dev sh

# 查看环境变量
docker exec playwright-manager-dev env

# 检查端口监听
docker exec playwright-manager-dev netstat -tulpn

# 查看 TypeScript 路径映射
docker exec playwright-manager-dev ls -la /app/node_modules/@shared

# 运行测试
docker exec playwright-manager-dev pnpm test:unit
```

---

## 6. 生产环境部署

### 6.1 生产环境特点

- 使用生产构建目标
- 优化的镜像大小
- 资源限制和配额
- 完整的健康检查
- 日志轮转和管理
- 支持水平扩展

### 6.2 构建生产镜像

```bash
# 构建管理端镜像
docker build \
  -f docker/manager/Dockerfile \
  --target production \
  -t playwright-manager:v1.0.0 \
  .

# 构建机器端镜像
docker build \
  -f docker/machine/Dockerfile \
  --target production \
  -t playwright-machine:v1.0.0 \
  .

# 查看镜像大小
docker images | grep playwright
```

### 6.3 配置生产环境

#### 6.3.1 环境变量配置

创建 `docker/.env`:

```bash
# 复制模板
cp docker/.env.example docker/.env

# 编辑配置
vim docker/.env
```

**关键配置项**:

```bash
# 安全配置（必须修改）
JWT_SECRET=<生成强随机字符串>
ADMIN_PASSWORD=<设置强密码>
MYSQL_ROOT_PASSWORD=<设置强密码>
MYSQL_PASSWORD=<设置强密码>

# 资源限制
MANAGER_CPU_LIMIT=2
MANAGER_MEMORY_LIMIT=2G
MACHINE_CPU_LIMIT=4
MACHINE_MEMORY_LIMIT=4G

# 扩展配置
MAX_SESSIONS=20
SESSION_TIMEOUT=600000
```

#### 6.3.2 生成安全密钥

```bash
# 生成 JWT Secret
openssl rand -base64 64

# 生成管理员密码
openssl rand -base64 32

# 生成数据库密码
openssl rand -base64 32
```

### 6.4 部署生产环境

#### 6.4.1 基础部署

```bash
# 1. 启动基础服务（MySQL + Manager + 1个 Machine）
docker-compose -f docker/docker-compose.prod.yml --env-file docker/.env up -d mysql manager machine-1

# 2. 查看启动状态
docker-compose -f docker/docker-compose.prod.yml ps

# 3. 查看日志
docker-compose -f docker/docker-compose.prod.yml logs -f
```

#### 6.4.2 扩展部署

```bash
# 启动第二个 Machine
docker-compose -f docker/docker-compose.prod.yml --profile scaling --env-file docker/.env up -d machine-2

# 启动 Nginx 反向代理
docker-compose -f docker/docker-compose.prod.yml --profile with-nginx --env-file docker/.env up -d nginx
```

#### 6.4.3 滚动更新

```bash
# 1. 构建新镜像
docker build -f docker/manager/Dockerfile --target production -t playwright-manager:v1.1.0 .

# 2. 更新 .env 中的镜像版本
echo "IMAGE_TAG=v1.1.0" >> docker/.env

# 3. 逐个更新服务
docker-compose -f docker/docker-compose.prod.yml --env-file docker/.env up -d manager

# 4. 等待健康检查通过
docker-compose -f docker/docker-compose.prod.yml ps

# 5. 更新机器服务
docker-compose -f docker/docker-compose.prod.yml --env-file docker/.env up -d machine-1
docker-compose -f docker/docker-compose.prod.yml --env-file docker/.env up -d machine-2
```

### 6.5 生产环境检查清单

#### 6.5.1 部署前检查

- [ ] 所有密码已更改为强密码
- [ ] JWT_SECRET 已设置为随机字符串
- [ ] MySQL 数据卷已备份
- [ ] 资源限制已根据服务器配置调整
- [ ] 日志配置已审核
- [ ] 网络配置已确认

#### 6.5.2 部署后验证

- [ ] 所有容器状态为 healthy
- [ ] API 健康检查返回 200
- [ ] 管理员可以登录
- [ ] 机器服务成功注册
- [ ] 可以创建浏览器会话
- [ ] 日志正常输出

#### 6.5.3 功能测试

```bash
# 1. 测试 API 健康检查
curl http://localhost:3000/api/health

# 2. 测试管理员登录
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<your-password>"}'

# 3. 测试机器注册
TOKEN=<from-login>
curl http://localhost:3000/api/machines \
  -H "Authorization: Bearer $TOKEN"

# 4. 测试会话创建
curl -X POST http://localhost:3000/api/sessions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"options":{"headless":true}}'
```

---

## 7. 配置说明

### 7.1 环境变量

#### 7.1.1 管理端配置

| 变量 | 默认值 | 说明 | 生产建议 |
|------|--------|------|---------|
| `NODE_ENV` | development | 运行环境 | production |
| `PORT` | 3000 | HTTP 端口 | 3000 |
| `HOST` | localhost | 监听地址 | 0.0.0.0 |
| `DB_TYPE` | sqlite | 数据库类型 | mysql |
| `DB_NAME` | playwright_user_sys | 数据库名 | 自定义 |
| `DB_HOST` | localhost | MySQL 主机 | mysql |
| `DB_PORT` | 3306 | MySQL 端口 | 3306 |
| `DB_USER` | root | MySQL 用户 | 专用账号 |
| `DB_PASSWORD` | - | MySQL 密码 | 强密码 |
| `JWT_SECRET` | - | JWT 密钥 | 64位随机 |
| `JWT_EXPIRES_IN` | 1d | Token 有效期 | 1d 或更短 |
| `ADMIN_USERNAME` | admin | 管理员用户名 | 自定义 |
| `ADMIN_PASSWORD` | REDACTED_ADMIN_PASS | 管理员密码 | 强密码 |
| `GRPC_PORT` | 50051 | gRPC 端口 | 50051 |

#### 7.1.2 机器端配置

| 变量 | 默认值 | 说明 | 生产建议 |
|------|--------|------|---------|
| `MACHINE_ID` | - | 机器唯一ID | 自动生成或指定 |
| `MACHINE_NAME` | - | 机器名称 | 描述性名称 |
| `MANAGER_HOST` | localhost:50051 | 管理端地址 | manager:50051 |
| `MACHINE_GRPC_PORT` | 50052 | gRPC 端口 | 50052 |
| `PROXY_PORT` | 8082 | 代理端口 | 8082 |
| `MAX_SESSIONS` | 10 | 最大会话数 | 根据资源调整 |
| `SESSION_TIMEOUT` | 300000 | 会话超时(ms) | 根据需求调整 |
| `HEARTBEAT_INTERVAL` | 30000 | 心跳间隔(ms) | 30000 |

#### 7.1.3 资源限制配置

| 变量 | 默认值 | 说明 | 建议值 |
|------|--------|------|---------|
| `MANAGER_CPU_LIMIT` | 2 | CPU 核心数限制 | 2-4 |
| `MANAGER_MEMORY_LIMIT` | 2G | 内存限制 | 2-4G |
| `MACHINE_CPU_LIMIT` | 4 | CPU 核心数限制 | 4-8 |
| `MACHINE_MEMORY_LIMIT` | 4G | 内存限制 | 4-8G |
| `MYSQL_CPU_LIMIT` | - | CPU 核心数限制 | 2-4 |
| `MYSQL_MEMORY_LIMIT` | - | 内存限制 | 2-4G |

### 7.2 Docker Compose 配置

#### 7.2.1 开发环境配置

`docker/docker-compose.dev.yml` 关键配置:

```yaml
volumes:
  # 源代码挂载
  - ..:/app:cached

  # node_modules 独立卷（避免覆盖）
  - node-modules:/app/node_modules

  # 数据持久化
  - manager-dev-data:/app/data

environment:
  # 开发环境变量
  - NODE_ENV=development

command:
  # 使用 tsx watch 支持热重载
  ["pnpm", "dev:server"]
```

#### 7.2.2 生产环境配置

`docker/docker-compose.prod.yml` 关键配置:

```yaml
restart: always

deploy:
  resources:
    limits:
      cpus: ${MANAGER_CPU_LIMIT}
      memory: ${MANAGER_MEMORY_LIMIT}
    reservations:
      cpus: ${MANAGER_CPU_RESERVATION}
      memory: ${MANAGER_MEMORY_RESERVATION}

healthcheck:
  test: ["CMD", "node", "-e", "..."]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 60s

logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

### 7.3 MySQL 配置

`docker/mysql/my.cnf` 关键配置:

```ini
[mysqld]
# 性能优化
max_connections=200
innodb_buffer_pool_size=512M

# 慢查询日志
slow_query_log=1
long_query_time=2

# 二进制日志（用于备份）
log_bin=/var/log/mysql/mysql-bin.log
expire_logs_days=7
```

### 7.4 Nginx 配置

`docker/nginx/conf.d/default.conf` 关键配置:

```nginx
# 上传大小限制
client_max_body_size 100M;

# 超时设置
proxy_connect_timeout 300s;
proxy_send_timeout 300s;
proxy_read_timeout 300s;

# WebSocket 支持
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";

# 速率限制
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
```

---

## 8. 运维管理

### 8.1 日常操作

#### 8.1.1 服务管理

```bash
# 查看服务状态
docker-compose -f docker/docker-compose.prod.yml ps

# 查看资源使用
docker stats

# 查看日志
docker-compose -f docker/docker-compose.prod.yml logs -f [service]

# 重启服务
docker-compose -f docker/docker-compose.prod.yml restart [service]

# 停止服务
docker-compose -f docker/docker-compose.prod.yml stop [service]

# 启动服务
docker-compose -f docker/docker-compose.prod.yml start [service]
```

#### 8.1.2 扩缩容

```bash
# 扩展机器服务
docker-compose -f docker/docker-compose.prod.yml --profile scaling up -d machine-2

# 缩减机器服务
docker-compose -f docker/docker-compose.prod.yml stop machine-2
docker-compose -f docker/docker-compose.prod.yml rm -f machine-2
```

#### 8.1.3 数据备份

```bash
# MySQL 备份
docker exec playwright-mysql-prod \
  mysqldump -u root -p${MYSQL_ROOT_PASSWORD} \
  playwright_user_sys > backup-$(date +%Y%m%d).sql

# 恢复备份
docker exec -i playwright-mysql-prod \
  mysql -u root -p${MYSQL_ROOT_PASSWORD} \
  playwright_user_sys < backup-20241226.sql

# 文件数据备份
docker run --rm -v playwright-manager-prod-files:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/files-backup-$(date +%Y%m%d).tar.gz -C /data .
```

### 8.2 监控和日志

#### 8.2.1 日志管理

```bash
# 查看实时日志
docker-compose -f docker/docker-compose.prod.yml logs -f

# 查看最近 100 行日志
docker-compose -f docker/docker-compose.prod.yml logs --tail=100

# 查看特定时间段日志
docker logs --since=2024-12-26T00:00:00 playwright-manager-prod

# 导出日志
docker logs playwright-manager-prod > manager-logs-$(date +%Y%m%d).log
```

#### 8.2.2 性能监控

```bash
# 容器资源使用
docker stats --no-stream

# 详细资源使用
docker stats --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"

# 进入容器检查
docker exec -it playwright-manager-prod sh
```

#### 8.2.3 健康检查

```bash
# 检查健康状态
docker inspect --format='{{.State.Health.Status}}' playwright-manager-prod

# 查看健康检查日志
docker inspect --format='{{json .State.Health}}' playwright-manager-prod | jq

# API 健康检查
curl http://localhost:3000/api/health
curl http://localhost:8082/health
```

### 8.3 故障恢复

#### 8.3.1 容器重启

```bash
# 自动重启（配置了 restart: always）
# 手动重启
docker-compose -f docker/docker-compose.prod.yml restart manager
```

#### 8.3.2 数据恢复

```bash
# 从备份恢复 MySQL
docker-compose -f docker/docker-compose.prod.yml stop mysql
docker-compose -f docker/docker-compose.prod.yml rm -f mysql
docker volume rm playwright-prod-mysql-data
docker-compose -f docker/docker-compose.prod.yml up -d mysql
# 等待 MySQL 启动
sleep 30
docker exec -i playwright-mysql-prod mysql -u root -p${MYSQL_ROOT_PASSWORD} < backup.sql
```

#### 8.3.3 灾难恢复

```bash
# 完整系统恢复流程
# 1. 停止所有服务
docker-compose -f docker/docker-compose.prod.yml down

# 2. 恢复数据卷
docker volume restore < backup-volume.tar

# 3. 重新启动服务
docker-compose -f docker/docker-compose.prod.yml --env-file docker/.env up -d
```

---

## 9. 故障排查

### 9.1 常见问题

#### 9.1.1 启动失败

**症状**: 容器无法启动或反复重启

**排查步骤**:

```bash
# 1. 查看容器状态
docker ps -a

# 2. 查看日志
docker logs playwright-manager-prod

# 3. 检查配置
docker inspect playwright-manager-prod

# 4. 进入容器调试
docker run -it --rm \
  -v $(pwd)/docker/.env:/app/.env \
  playwright-manager:latest sh
```

**常见原因**:

1. 环境变量配置错误
2. 数据库连接失败
3. 端口冲突
4. 资源不足

#### 9.1.2 数据库连接失败

**症状**: 管理端无法连接到 MySQL

**排查步骤**:

```bash
# 1. 检查 MySQL 容器
docker ps | grep mysql

# 2. 检查 MySQL 日志
docker logs playwright-mysql-prod

# 3. 测试连接
docker exec playwright-manager-prod \
  nc -zv mysql 3306

# 4. 进入管理端容器测试
docker exec -it playwright-manager-prod sh
nc -zv mysql 3306
```

**解决方案**:

1. 确保 MySQL 容器先启动
2. 检查网络配置
3. 验证数据库凭据
4. 等待 MySQL 健康检查通过

#### 9.1.3 机器注册失败

**症状**: 机器服务无法注册到管理端

**排查步骤**:

```bash
# 1. 检查管理端 gRPC 服务
docker exec playwright-manager-prod netstat -tulpn | grep 50051

# 2. 检查机器日志
docker logs playwright-machine-1-prod

# 3. 检查网络连通性
docker exec playwright-machine-1-prod \
  nc -zv manager 50051

# 4. 检查环境变量
docker exec playwright-machine-1-prod env | grep MANAGER
```

**解决方案**:

1. 确认 MANAGER_HOST 正确
2. 检查 gRPC 端口配置
3. 验证网络连接
4. 查看管理端日志中的错误

#### 9.1.4 Playwright 浏览器启动失败

**症状**: 无法创建浏览器会话

**排查步骤**:

```bash
# 1. 检查 Playwright 安装
docker exec playwright-machine-1-prod npx playwright --version

# 2. 测试 Chromium
docker exec playwright-machine-1-prod \
  npx playwright install --dry-run chromium

# 3. 检查 Xvfb
docker exec playwright-machine-1-prod ps aux | grep Xvfb

# 4. 查看详细错误
docker logs playwright-machine-1-prod | tail -100
```

**解决方案**:

1. 重新构建机器镜像
2. 检查 DISPLAY 环境变量
3. 验证 Xvfb 正在运行
4. 增加容器内存限制

### 9.2 性能问题

#### 9.2.1 内存占用高

**排查**:

```bash
# 查看内存使用
docker stats --no-stream | grep playwright

# 查看容器内进程
docker exec playwright-manager-prod ps aux

# Node.js 内存分析
docker exec playwright-manager-prod \
  node --heap-prof
```

**优化方案**:

1. 调整资源限制
2. 限制会话数量
3. 定期清理空闲会话
4. 启用会话复用

#### 9.2.2 响应慢

**排查**:

```bash
# 检查数据库查询
docker logs playwright-mysql-prod | grep slow-query

# 检查网络延迟
docker exec playwright-manager-prod \
  ping -c 5 mysql

# API 响应时间
time curl http://localhost:3000/api/health
```

**优化方案**:

1. 优化数据库查询
2. 添加数据库索引
3. 启用查询缓存
4. 调整连接池大小

### 9.3 调试技巧

#### 9.3.1 启用调试模式

```bash
# 设置调试环境变量
echo "DEBUG=*" >> docker/.env

# 重启服务
docker-compose -f docker/docker-compose.prod.yml restart manager

# 查看详细日志
docker-compose -f docker/docker-compose.prod.yml logs -f manager
```

#### 9.3.2 进入容器调试

```bash
# 管理端容器
docker exec -it playwright-manager-prod sh

# 机器端容器
docker exec -it playwright-machine-1-prod sh

# MySQL 容器
docker exec -it playwright-mysql-prod mysql -u root -p
```

#### 9.3.3 网络调试

```bash
# 查看网络配置
docker network inspect playwright-prod-network

# 测试容器间连接
docker exec playwright-manager-prod ping machine-1

# 查看端口监听
docker exec playwright-manager-prod netstat -tulpn
```

---

## 10. 最佳实践

### 10.1 镜像构建

#### 10.1.1 版本管理

```bash
# 使用语义化版本
docker build -t playwright-manager:v1.0.0 .
docker build -t playwright-manager:v1.0.1 .
docker build -t playwright-manager:latest .

# 使用 Git Commit Hash
VERSION=$(git rev-parse --short HEAD)
docker build -t playwright-manager:$VERSION .
```

#### 10.1.2 构建缓存优化

```dockerfile
# 1. 先复制依赖文件
COPY package.json pnpm-lock.yaml* ./

# 2. 安装依赖（这一层会被缓存）
RUN pnpm install --frozen-lockfile

# 3. 后复制源代码（代码变化不影响依赖层）
COPY . .
```

#### 10.1.3 多架构构建

```bash
# 使用 buildx 构建多架构镜像
docker buildx create --use
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f docker/manager/Dockerfile \
  -t playwright-manager:latest \
  --push \
  .
```

### 10.2 安全加固

#### 10.2.1 最小权限原则

```dockerfile
# 使用非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs
```

#### 10.2.2 密钥管理

```bash
# 使用 Docker Secrets (Swarm mode)
echo "your-secret-key" | docker secret create jwt_secret -

# 使用环境文件（不提交到 Git）
echo "docker/.env" >> .gitignore

# 使用密钥管理服务（如 Vault）
```

#### 10.2.3 网络隔离

```yaml
# 生产环境不暴露内部端口
services:
  manager:
    # 不暴露 gRPC 端口到宿主机
    ports:
      - "3000:3000"  # 只暴露 HTTP
      # 50051 不暴露，仅在内部网络访问
```

### 10.3 数据备份

#### 10.3.1 备份策略

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d_%H%M%S)

# 1. MySQL 备份
docker exec playwright-mysql-prod \
  mysqldump -u root -p${MYSQL_ROOT_PASSWORD} \
  --all-databases \
  --single-transaction \
  --quick \
  --lock-tables=false \
  > backup/mysql_${DATE}.sql

# 2. 文件备份
docker run --rm \
  -v playwright-manager-prod-files:/data \
  -v $(pwd)/backup:/backup \
  alpine tar czf /backup/files_${DATE}.tar.gz -C /data .

# 3. Docker 卷备份
docker run --rm \
  -v playwright-prod-mysql-data:/data \
  -v $(pwd)/backup:/backup \
  alpine tar czf /backup/volume_mysql_${DATE}.tar.gz -C /data .

# 4. 清理旧备份（保留 7 天）
find backup -type f -mtime +7 -delete
```

#### 10.3.2 自动备份

```yaml
# 添加到 docker-compose.yml
services:
  backup:
    image: alpine:latest
    container_name: playwright-backup
    volumes:
      - ./scripts/backup.sh:/backup.sh:ro
      - backup-data:/backup
    environment:
      - MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD}
    command: sh /backup.sh
    restart: "no"
    profiles:
      - backup
```

### 10.4 性能优化

#### 10.4.1 资源调优

```yaml
# 根据实际负载调整
deploy:
  resources:
    limits:
      cpus: '4.0'      # 根据监控数据调整
      memory: 4G       # 根据使用情况调整
    reservations:
      cpus: '1.0'      # 保证基本性能
      memory: 1G       # 防止 OOM
```

#### 10.4.2 连接池优化

```javascript
// Knex 连接池配置
const knex = require('knex')({
  pool: {
    min: 2,
    max: 20,          // 根据并发调整
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
  }
});
```

#### 10.4.3 日志优化

```yaml
# 减少日志量，提升性能
logging:
  driver: "json-file"
  options:
    max-size: "10m"    # 限制单文件大小
    max-file: "3"      # 限制文件数量
    labels: "production"
```

### 10.5 监控和告警

#### 10.5.1 Prometheus 集成

```yaml
# 添加 Prometheus 服务
services:
  prometheus:
    image: prom/prometheus:latest
    container_name: playwright-prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./docker/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
```

#### 10.5.2 Grafana 面板

```yaml
services:
  grafana:
    image: grafana/grafana:latest
    container_name: playwright-grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
    volumes:
      - grafana-data:/var/lib/grafana
      - ./docker/grafana/dashboards:/etc/grafana/provisioning/dashboards
```

---

## 附录

### A. 快速参考

#### A.1 常用命令

```bash
# 构建
docker build -f docker/manager/Dockerfile -t playwright-manager:latest .
docker build -f docker/machine/Dockerfile -t playwright-machine:latest .

# 启动开发环境
docker-compose -f docker/docker-compose.dev.yml up -d

# 启动生产环境
docker-compose -f docker/docker-compose.prod.yml --env-file docker/.env up -d

# 查看日志
docker-compose -f docker/docker-compose.prod.yml logs -f

# 停止服务
docker-compose -f docker/docker-compose.prod.yml down

# 重启服务
docker-compose -f docker/docker-compose.prod.yml restart

# 扩展服务
docker-compose -f docker/docker-compose.prod.yml --profile scaling up -d machine-2
```

#### A.2 端口映射

| 服务 | 内部端口 | 外部端口 | 说明 |
|------|---------|---------|------|
| Nginx | 80, 443 | 80, 443 | 反向代理 |
| Manager | 3000 | 3000 | HTTP API |
| Manager | 50051 | - | gRPC（内部） |
| Machine 1 | 50052 | - | gRPC（内部） |
| Machine 1 | 8082 | 8082 | WebSocket 代理 |
| MySQL | 3306 | - | 数据库（内部） |

### B. 故障排查检查清单

- [ ] 容器状态是否为 Up
- [ ] 健康检查是否通过
- [ ] 日志是否有错误
- [ ] 端口是否正确监听
- [ ] 环境变量是否正确
- [ ] 网络连接是否正常
- [ ] 数据库是否可访问
- [ ] 磁盘空间是否充足
- [ ] 内存是否充足
- [ ] CPU 负载是否正常

### C. 联系和支持

- 项目文档: `README.md`
- 架构文档: `docs/architecture-improvement.md`
- 启动指南: `docs/开发/项目启动与验证指南.md`
- 问题反馈: GitHub Issues

---

**文档版本**: 2.0.0
**最后更新**: 2024-12-26
**维护者**: DevOps 团队
