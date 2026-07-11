# 部署指南

本文档是 Playwright User Sys 的统一部署入口，涵盖 Docker 部署和裸机快速部署两种方式。

## 方案对比

| 维度 | Docker 部署（推荐） | 裸机部署 |
|------|-------------------|---------|
| 适用场景 | 生产环境、多机器集群 | 单机试用、资源受限、已有 Node 环境 |
| 系统依赖 | 无需手动安装（镜像已打包） | 需手动安装 libnss3/libatk 等 20+ 个库 |
| 部署速度 | 拉取镜像即用 | 一键脚本 ~5 分钟 |
| 升级方式 | `docker compose pull && up -d` | `git pull && pnpm build && systemctl restart` |
| 浏览器管理 | 宿主机 Chrome 只读挂载 | 系统安装的 Chrome |
| 进程管理 | Docker Compose 自动重启 | systemd 托管 |

---

## 方式一：裸机一键部署（3 分钟）

### 快速开始

```bash
# 一条命令搞定（自动检测发行版，安装 Node + pnpm + Chrome + 系统依赖 + 代码 + 构建）
sudo bash scripts/install.sh
```

脚本支持以下参数：

```bash
# 手动指定发行版（ubuntu | debian | centos | rhel | rocky | fedora）
sudo bash scripts/install.sh --distro=ubuntu

# 自定义安装目录
sudo bash scripts/install.sh --install-dir=/opt/playwright-user-sys

# 已有 Chrome，跳过安装
sudo bash scripts/install.sh --skip-chrome

# 从指定仓库克隆
sudo bash scripts/install.sh --repo-url=https://your-repo.git
```

### 安装后配置

```bash
# 1. 编辑环境变量（数据库、JWT 密钥、管理员密码等）
vi /opt/playwright-user-sys/.env

# 2. 运行数据库迁移
cd /opt/playwright-user-sys && pnpm migrate

# 3. 使用 systemd 托管（生产推荐）
cp scripts/playwright-manager.service /etc/systemd/system/
cp scripts/playwright-machine.service  /etc/systemd/system/

# 编辑其中的路径和用户
vi /etc/systemd/system/playwright-manager.service

systemctl daemon-reload
systemctl enable --now playwright-manager
# 如需机器服务
systemctl enable --now playwright-machine

# 4. 验证
curl http://localhost:3000/health
```

> 详细步骤见 [手动部署文档](./website/deploy/manual.md)

---

## 方式二：Docker 部署

```bash
# 使用生产编排（1 Manager + 2 Machines）
cd docker
cp .env.example .env   # 编辑配置
docker compose -f docker-compose.prod.yml up -d
```

> 详细步骤见 [Docker 部署文档](./website/deploy/docker.md)

---

## 系统要求

### 支持的 Linux 发行版

| 发行版 | 包管理器 | 支持状态 |
|--------|---------|---------|
| Ubuntu 20.04+ | apt | ✅ 完全支持 |
| Debian 11+ | apt | ✅ 完全支持 |
| CentOS 8+ / RHEL 8+ | dnf | ✅ 完全支持 |
| Rocky Linux 8+ | dnf | ✅ 完全支持 |
| Fedora 35+ | dnf | ✅ 完全支持 |
| Amazon Linux 2 | yum | ✅ 完全支持 |

### 软件版本要求

| 组件 | 最低版本 | 推荐版本 |
|------|---------|---------|
| Node.js | 20 | 20 LTS |
| pnpm | 10 | 10.8+ |
| MySQL（生产） | 8.0 | 8.0 |
| Google Chrome | 最新稳定版 | 最新稳定版 |

### 硬件要求

| 资源 | 最低 | 推荐 |
|------|------|------|
| CPU | 2 核 | 4 核+ |
| 内存 | 2 GB | 4 GB+ |
| 磁盘 | 5 GB | 10 GB+ |

---

## 磁盘占用说明

### 首次部署固定占用

| 组件 | 大小 | 说明 |
|------|------|------|
| 代码 + 依赖 + 构建产物 | ~450 MB | `pnpm install --prod` 后 |
| Google Chrome | ~300 MB | 系统安装，单份共享 |
| 系统依赖库 | ~200 MB | libnss3/Xvfb/字体等 |
| **合计** | **~1 GB** | |

> Docker 部署首次占用更大（~2.5-3 GB），因为包含完整基础镜像和 X11 依赖。

### 运行时持续增长的数据

以下数据随使用增长，系统已内置自动清理：

| 数据目录 | 清理策略 | 配置项 |
|---------|---------|--------|
| `data/screenshots/` | 超过 7 天自动删除 | `SCREENSHOT_MAX_AGE_DAYS` |
| `data/user-data/**/sessions/` | 孤儿目录（崩溃残留）超过 24 小时自动删除 | `ORPHAN_USERDATA_MAX_AGE_HOURS` |
| `data/user-data/**/shared/` | 超过 30 天自动删除 | `SHARED_CLEANUP_AGE_DAYS` |
| `logs/*.log` | 超过 30 天自动删除 | `LOG_RETENTION_DAYS` |
| `data/temp/` | 超过 24 小时自动删除 | 已有 |
| `data/uploads/` | 超过 7 天自动删除 | 已有 |

清理频率：
- 截图/孤儿 user-data/temp：每 1 小时（Machine 端）
- 共享 user-data：每 24 小时（Manager 端）
- 日志：每天凌晨轮转时清理

---

## 端口说明

| 服务 | 端口 | 环境变量 | 说明 |
|------|------|---------|------|
| Manager HTTP API | 3000 | `PORT` | REST API + Web 界面 |
| Manager gRPC | 50051 | `GRPC_PORT` | 与 Machine 通信 |
| Machine gRPC | 50052 | `MACHINE_GRPC_PORT` | 每台 Machine 递增 |
| Machine WebSocket 代理 | 8082 | `PROXY_PORT` | 浏览器远程控制，每台递增 |
| Machine 健康检查 | 9100 | `MACHINE_HEALTH_PORT` | HTTP 健康端点 |

> **关于 PROXY_PORT**：Machine 端默认 8082（实际 WebSocket 代理端口）。Manager 端代码中有一个独立的 `PROXY_PORT` 默认 8081，仅用于 Manager 管理界面的 profile 页面展示，两者是不同服务的端口，非 bug。

---

## 多机器集群部署

### Docker 方式

编辑 `docker/docker-compose.prod.yml`，复制 machine-1 服务段为 machine-3，修改端口：

```yaml
machine-3:
  image: ghcr.io/dyyz1993/playwright-user-sys-machine:latest
  ports:
    - "50054:50052"   # gRPC
    - "8084:8082"     # WebSocket 代理
  environment:
    - MACHINE_ID=machine-3
  # ... 其他配置同 machine-1
```

### 裸机方式

为每台 Machine 复制 systemd 服务，修改 `MACHINE_ID` 和端口：

```bash
# 在 .env 中设置
MACHINE_ID=machine-2
MACHINE_GRPC_PORT=50053
PROXY_PORT=8083
```

---

## 故障排查

详见 [故障排查文档](./website/guide/troubleshooting.md)

### 常见问题

**Chrome 启动失败：缺少系统库**

```bash
# Ubuntu/Debian
sudo apt-get install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxext6 libxfixes3 \
  libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2

# 或使用 Playwright 自动安装
npx playwright install-deps chromium
```

**端口被占用**

```bash
# 检查端口占用
lsof -i :3000
lsof -i :8082
```

**数据库连接失败**

```bash
# 检查 MySQL 连接
mysql -u playwright -p -h localhost playwright_user_sys
```

---

## 更多文档

- [环境变量参考](./website/deploy/environment-variables.md)
- [Docker 部署详情](./website/deploy/docker.md)
- [手动部署详情](./website/deploy/manual.md)
- [故障排查](./website/guide/troubleshooting.md)
