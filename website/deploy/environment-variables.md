# 环境变量参考

## Server 服务器配置

| 变量 | 说明 | 必填 | 默认值 |
|------|------|------|--------|
| `PORT` | HTTP 服务端口 | 否 | `3000` |
| `HOST` | 监听地址 | 否 | `localhost` |
| `NODE_ENV` | 运行环境 | 否 | `development` |
| `GRPC_PORT` | gRPC 服务端口 | 否 | `50051` |

## Database 数据库配置

| 变量 | 说明 | 必填 | 默认值 |
|------|------|------|--------|
| `DB_TYPE` | 数据库类型 (`sqlite`/`mysql`) | 否 | `sqlite` |
| `DB_NAME` | 数据库名 | 否 | `playwright_user_sys` |
| `DB_PATH` | SQLite 文件路径 | 仅 SQLite | `./data/db.sqlite` |
| `DB_HOST` | 数据库主机 | 仅 MySQL | `localhost` |
| `DB_PORT` | 数据库端口 | 仅 MySQL | `3306` |
| `DB_USER` | 数据库用户 | 仅 MySQL | `root` |
| `DB_PASSWORD` | 数据库密码 | 仅 MySQL | - |

## Auth 认证配置

| 变量 | 说明 | 必填 | 默认值 |
|------|------|------|--------|
| `JWT_SECRET` | JWT 签名密钥（≥32 字符） | **是** | - |
| `JWT_EXPIRES_IN` | Token 过期时间 | 否 | `1d` |
| `ADMIN_USERNAME` | 管理员用户名 | 否 | `admin` |
| `ADMIN_PASSWORD` | 管理员密码 | **是** | - |

## Credits 积分配置

| 变量 | 说明 | 必填 | 默认值 |
|------|------|------|--------|
| `CREDIT_RATE` | 每秒积分消耗 | 否 | `1` |
| `DEFAULT_CREDITS` | 新用户默认积分 | 否 | `100` |

## Instance 实例配置

| 变量 | 说明 | 必填 | 默认值 |
|------|------|------|--------|
| `INSTANCE_TIMEOUT` | 实例超时（毫秒） | 否 | `60000` |
| `MAX_INSTANCES` | 最大并发实例数 | 否 | `10` |
| `PUBLIC_MACHINE_ENDPOINT` | 公网机器端点 | 否 | - |

## Machine 机器服务配置

| 变量 | 说明 | 必填 | 默认值 |
|------|------|------|--------|
| `MACHINE_ID` | 机器节点唯一标识 | **是** | - |
| `MANAGEMENT_SERVER_URL` | 管理服务器地址 | **是** | `http://localhost:3000` |
| `STATUS_REPORT_INTERVAL` | 状态上报间隔（毫秒） | 否 | `60000` |
| `MANAGER_HOST` | 管理服务器 gRPC 地址 | **是** | - |
| `MACHINE_IP` | 机器公网 IP 或域名 | **是** | - |
| `MACHINE_PORT` | 机器服务 WebSocket 端口 | 否 | `8082` |
| `MAX_INSTANCES` | 本机最大实例数 | 否 | `10` |

## Docker 部署配置

| 变量 | 说明 | 必填 | 默认值 |
|------|------|------|--------|
| `PUBLIC_IP` | 服务器的公网 IP | 是* | `127.0.0.1` |
| `MYSQL_ROOT_PASSWORD` | MySQL root 密码 | 如用 MySQL | - |

\* 如果机器服务需要对外暴露，必须设置正确的公网 IP。

## 完整 `.env` 示例

```bash
# ============ Server ============
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
GRPC_PORT=50051

# ============ Database ============
DB_TYPE=sqlite
DB_PATH=./data/database.sqlite

# DB_TYPE=mysql
# DB_HOST=localhost
# DB_PORT=3306
# DB_USER=playwright
# DB_PASSWORD=your-password

# ============ Auth ============
JWT_SECRET=your-strong-secret-key-at-least-32-characters
JWT_EXPIRES_IN=1d
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-strong-password

# ============ Credits ============
CREDIT_RATE=1
DEFAULT_CREDITS=100

# ============ Instance ============
INSTANCE_TIMEOUT=60000
MAX_INSTANCES=10
```

## 完整机器 `.env` 示例

```bash
# ============ Machine ============
NODE_ENV=production
MACHINE_ID=machine-1
MANAGEMENT_SERVER_URL=http://your-server:3000
STATUS_REPORT_INTERVAL=60000
MANAGER_HOST=your-server:50051
MACHINE_IP=your-server-public-ip
MACHINE_PORT=8082
MAX_INSTANCES=10
```
