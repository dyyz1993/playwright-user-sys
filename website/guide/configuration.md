# 配置说明

## 环境变量

系统通过 `.env` 文件或环境变量进行配置。

### 服务器配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | `3000` |
| `HOST` | 监听地址 | `localhost` |
| `NODE_ENV` | 运行环境 | `development` |

### 数据库配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DB_TYPE` | 数据库类型 (`sqlite`/`mysql`) | `sqlite` |
| `DB_NAME` | 数据库名 | `playwright_user_sys` |
| `DB_PATH` | SQLite 文件路径 | `./data/db.sqlite` |

**MySQL 配置**（当 `DB_TYPE=mysql` 时）：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DB_HOST` | 数据库主机 | `localhost` |
| `DB_PORT` | 数据库端口 | `3306` |
| `DB_USER` | 数据库用户 | `root` |
| `DB_PASSWORD` | 数据库密码 | - |

### JWT 配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `JWT_SECRET` | JWT 签名密钥（最少 32 字符） | - |
| `JWT_EXPIRES_IN` | Token 过期时间 | `1d` |

### 管理员账号

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ADMIN_USERNAME` | 管理员用户名 | `admin` |
| `ADMIN_PASSWORD` | 管理员密码 | - |

### 实例配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `INSTANCE_TIMEOUT` | 实例超时时间（毫秒） | `60000` |
| `MAX_INSTANCES` | 最大实例数 | `10` |

### 机器服务配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `MACHINE_ID` | 机器节点 ID | `machine-1` |
| `MANAGEMENT_SERVER_URL` | 管理服务器地址 | `http://localhost:3000` |
| `STATUS_REPORT_INTERVAL` | 状态上报间隔（毫秒） | `60000` |
| `MANAGER_HOST` | 管理服务器 gRPC 地址 | - |
| `MACHINE_IP` | 机器节点公网 IP | `127.0.0.1` |

## 开发环境配置 (`.env.dev`)

```bash
PORT=3000
HOST=0.0.0.0
DB_TYPE=sqlite
DB_PATH=./data/db.sqlite
JWT_SECRET=dev-secret-key-change-in-production
JWT_EXPIRES_IN=7d
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
INSTANCE_TIMEOUT=60000
MAX_INSTANCES=5
```

## Docker Compose 配置

参考 [`docker-compose.yml`](https://github.com/dyyz1993/playwright-user-sys/blob/main/docker-compose.yml)：

```yaml
services:
  app:
    build: .
    ports:
      - "3011:3000"
      - "50051:50051"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DB_TYPE=sqlite
      - JWT_SECRET=${JWT_SECRET:?required}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD:?required}

  machine-1:
    build:
      context: .
      dockerfile: Dockerfile.machine
    environment:
      - MACHINE_ID=machine-1
      - MANAGEMENT_SERVER_URL=http://app:3000
      - MANAGER_HOST=app:50051
```
