# Docker 启动指南与环境变量配置

## 环境变量分类

### 管理端环境变量

| 环境变量 | 说明 | 默认值 | 开发/生产区别 |
|---------|------|-------|-------------|
| NODE_ENV | 运行环境 | development | 开发:development, 生产:production |
| PORT | 服务端口 | 3000 | 通常相同 |
| HOST | 服务主机 | localhost | 生产环境使用0.0.0.0以允许外部访问 |
| DB_TYPE | 数据库类型 | sqlite | 通常相同 |
| DB_PATH | SQLite数据库路径 | ./data/db.sqlite | 生产环境通常使用绝对路径 |
| DB_NAME | MySQL数据库名称 | playwright_user_sys | 通常相同 |
| DB_HOST | MySQL主机地址 | - | 开发可能使用localhost，生产使用实际IP |
| DB_PORT | MySQL端口 | 3306 | 通常相同 |
| DB_USER | MySQL用户名 | - | 通常相同 |
| DB_PASSWORD | MySQL密码 | - | 生产环境应使用更强密码 |
| JWT_SECRET | JWT密钥 | your-secret-key | 生产环境必须更改为强随机值 |
| JWT_EXPIRES_IN | JWT过期时间 | 1d | 通常相同 |
| ADMIN_USERNAME | 管理员用户名 | admin | 生产环境应更改 |
| ADMIN_PASSWORD | 管理员密码 | REDACTED_ADMIN_PASS | 生产环境必须更改为强密码 |
| INSTANCE_TIMEOUT | 实例超时时间(毫秒) | 60000 | 通常相同 |
| SESSION_TIMEOUT | 会话超时时间(分钟) | 60 | 通常相同 |
| MAX_SESSIONS_PER_USER | 每用户最大会话数 | 5 | 通常相同 |
| LOG_LEVEL | 日志级别 | info | 开发可能使用debug，生产使用info |
| GRPC_PORT | gRPC服务器端口 | 50051 | 通常相同 |
| MACHINE_MONITOR_INTERVAL | 机器监控间隔(毫秒) | 30000 | 通常相同 |
| PUBLIC_MACHINE_ENDPOINT | 公共访问的机器端点 | - | 生产环境可能需要设置 |

### 机器端环境变量

| 环境变量 | 说明 | 默认值 | 开发/生产区别 |
|---------|------|-------|-------------|
| NODE_ENV | 运行环境 | development | 开发:development, 生产:production |
| MACHINE_ID | 机器唯一标识 | 自动生成UUID | 生产环境应指定固定值 |
| MACHINE_NAME | 机器名称 | 主机名 | 生产环境应指定有意义的名称 |
| MANAGER_HOST | 管理端gRPC地址 | localhost:50051 | 生产环境使用实际IP:端口 |
| MACHINE_GRPC_PORT | 机器端gRPC端口 | 50052 | 通常相同 |
| PROXY_PORT | 代理服务器端口 | 8082  | 通常相同 |
| MAX_SESSIONS | 最大会话数 | 10 | 根据机器性能调整 |
| SESSION_TIMEOUT | 会话超时时间(毫秒) | 300000 | 通常相同 |
| CHROME_PATH | Chrome浏览器路径 | 系统默认 | 生产环境使用容器内路径(/usr/bin/google-chrome-stable) |
| HEARTBEAT_INTERVAL | 心跳间隔(毫秒) | 30000 | 通常相同 |
| DISCONNECTION_TIMEOUT | 断开连接超时(毫秒) | 10000 | 通常相同 |
| ACTIVITY_REPORT_INTERVAL | 活动报告间隔(毫秒) | 3000 | 通常相同 |
| SESSION_ACTIVITY_TIMEOUT | 会话活动超时(毫秒) | 10000 | 通常相同 |
| DATA_DIR | 数据目录 | ./data | 生产环境通常使用绝对路径 |
| MACHINE_IP | 机器IP地址 | 自动检测 | 生产环境必须设置为实际IP |
| MANAGEMENT_SERVER_URL | 管理服务器URL | http://localhost:3000 | 生产环境使用实际URL |
| STATUS_REPORT_INTERVAL | 状态报告间隔(毫秒) | 60000 | 通常相同 |

## Docker启动指南

### 构建Docker镜像

#### 管理端镜像构建

```bash
# 使用buildx进行多平台构建
docker buildx build --platform linux/amd64,linux/arm64 -t playwright-user-sys:latest -f Dockerfile .
```

#### 机器端镜像构建

```bash
# 使用buildx进行多平台构建
docker buildx build --platform linux/amd64,linux/arm64 -t playwright-machine:latest -f Dockerfile.machine .
```

### 启动管理端容器

```bash
docker run -d \
  --name playwright-user-sys \
  -p 3000:3000 \
  -p 50051:50051 \
  -v $(pwd)/data:/app/data \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e HOST=0.0.0.0 \
  -e DB_TYPE=sqlite \
  -e DB_PATH=/app/data/database.sqlite \
  -e JWT_SECRET=your-secure-secret-key \
  -e JWT_EXPIRES_IN=1d \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=secure-admin-password \
  -e INSTANCE_TIMEOUT=60000 \
  -e GRPC_PORT=50051 \
  -e MACHINE_MONITOR_INTERVAL=30000 \
  -e PUBLIC_MACHINE_ENDPOINT=example.com:8082 \
  --restart unless-stopped \
  playwright-user-sys:latest
```

### 启动机器端容器

```bash
docker run -d \
  --name playwright-machine-1 \
  -e NODE_ENV=production \
  -e MACHINE_ID=machine-1 \
  -e MACHINE_NAME=machine-1 \
  -e MANAGEMENT_SERVER_URL=http://管理端IP:3000 \
  -e STATUS_REPORT_INTERVAL=60000 \
  -e MANAGER_HOST=管理端IP:50051 \
  -e MACHINE_IP=本机IP地址 \
  -e MACHINE_GRPC_PORT=50052 \
  -e HTTP_PORT=8082 \
  -e PROXY_PORT=8082 \
  -e MAX_SESSIONS=10 \
  -e SESSION_TIMEOUT=300000 \
  -e HEARTBEAT_INTERVAL=30000 \
  -e CHROME_PATH=/usr/bin/google-chrome-stable \
  -v $(pwd)/machine-data-1:/app/data \
  --restart unless-stopped \
  playwright-machine:latest
```

## 开发环境与生产环境的主要区别

1. **环境变量**:
   - 开发环境: `NODE_ENV=development`
   - 生产环境: `NODE_ENV=production`

2. **主机绑定**:
   - 开发环境: `HOST=localhost`
   - 生产环境: `HOST=0.0.0.0`

3. **安全凭证**:
   - 开发环境: 可使用简单密码和密钥
   - 生产环境: 必须使用强密码和随机生成的密钥

4. **日志配置**:
   - 开发环境: 通常使用更详细的日志级别(debug)和美化输出
   - 生产环境: 使用更简洁的日志级别(info/warn)和标准输出格式

5. **网络配置**:
   - 开发环境: 通常使用localhost或127.0.0.1
   - 生产环境: 使用实际IP地址和域名

6. **数据持久化**:
   - 开发环境: 通常使用相对路径
   - 生产环境: 使用Docker卷和绝对路径

## 使用SQLite与MySQL的区别

当使用SQLite时:
- 设置 `DB_TYPE=sqlite`
- 设置 `DB_PATH=/app/data/database.sqlite`
- 确保数据目录已挂载到容器

当使用MySQL时:
- 设置 `DB_TYPE=mysql`
- 设置 `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- 确保MySQL服务器已启动并可访问

## 注意事项

1. 在生产环境中，务必更改所有默认密码和密钥。
2. 确保机器端能够正确连接到管理端，检查网络连接和防火墙设置。
3. 对于机器端，确保设置正确的`MACHINE_IP`，这应该是机器的实际IP地址，而不是容器内部IP。
4. 数据目录应该正确挂载，以确保数据持久化。
5. 在生产环境中，考虑使用Docker网络来隔离和保护服务。
6. 定期备份数据库，特别是使用SQLite时。
7. 机器端的`CHROME_PATH`在Docker容器中应设置为`/usr/bin/google-chrome-stable`。
8. 确保`MANAGER_HOST`指向管理端的正确 IP 和端口，这对于机器端连接到管理端至关重要。
9. 开发环境下可以使用`.env.dev`文件进行配置，而生产环境应该直接在Docker启动命令中指定环境变量。
10. 对于机器端，`ACTIVITY_REPORT_INTERVAL`和`SESSION_ACTIVITY_TIMEOUT`参数影响会话活动监控的频率和超时判断，可根据网络状况调整。
11. 如果使用负载均衡或反向代理，可以设置`PUBLIC_MACHINE_ENDPOINT`环境变量，使客户端通过公共域名或IP访问机器端。

## 在服务器上配置环境变量并启动Docker容器

在服务器上拿到Docker镜像后，您需要配置环境变量并启动容器。以下是详细的操作步骤：

### 1. 准备环境变量文件

首先，您可以创建一个环境变量文件，这样可以更方便地管理所有配置：

```bash
# 为管理端创建环境变量文件
cat > management.env << EOF
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
DB_TYPE=sqlite
DB_PATH=/app/data/database.sqlite
JWT_SECRET=your-secure-secret-key-change-this
JWT_EXPIRES_IN=1d
ADMIN_USERNAME=admin
ADMIN_PASSWORD=secure-admin-password
INSTANCE_TIMEOUT=60000
GRPC_PORT=50051
MACHINE_MONITOR_INTERVAL=30000
# 如果使用域名或公共IP访问机器端，设置这个变量
PUBLIC_MACHINE_ENDPOINT=example.com:8082
EOF

# 为机器端创建环境变量文件
cat > machine.env << EOF
NODE_ENV=production
MACHINE_ID=machine-1
MACHINE_NAME=machine-1
MANAGEMENT_SERVER_URL=http://管理端IP:3000
STATUS_REPORT_INTERVAL=60000
MANAGER_HOST=管理端IP:50051
MACHINE_IP=本机IP地址
MACHINE_GRPC_PORT=50052
HTTP_PORT=8082
PROXY_PORT=8082
MAX_SESSIONS=10
SESSION_TIMEOUT=300000
HEARTBEAT_INTERVAL=30000
CHROME_PATH=/usr/bin/google-chrome-stable
EOF
```

请确保将上述文件中的`管理端IP`和`本机IP地址`替换为实际的IP地址。

### 2. 创建数据目录

```bash
# 为管理端创建数据目录
mkdir -p ./data

# 为机器端创建数据目录
mkdir -p ./machine-data-1
```

### 3. 启动管理端容器

使用环境变量文件启动管理端容器：

```bash
docker run -d \
  --name playwright-user-sys \
  -p 3000:3000 \
  -p 50051:50051 \
  -v $(pwd)/data:/app/data \
  --env-file management.env \
  --restart unless-stopped \
  playwright-user-sys:latest
```

### 4. 启动机器端容器

使用环境变量文件启动机器端容器：

```bash
docker run -d \
  --name playwright-machine-1 \
  -v $(pwd)/machine-data-1:/app/data \
  --env-file machine.env \
  --restart unless-stopped \
  playwright-machine:latest
```

### 5. 检查容器运行状态

```bash
# 查看所有运行中的容器
docker ps

# 查看容器日志
docker logs playwright-user-sys
docker logs playwright-machine-1
```

### 6. 访问管理界面

启动成功后，您可以通过浏览器访问管理界面：

```
http://服务器IP:3000
```

使用您在环境变量中设置的管理员用户名和密码登录。

### 7. 使用Docker网络（可选）

在生产环境中，建议使用Docker网络来隔离和保护服务：

```bash
# 创建Docker网络
docker network create playwright-network

# 启动管理端容器并连接到网络
docker run -d \
  --name playwright-user-sys \
  --network playwright-network \
  -p 3000:3000 \
  -p 50051:50051 \
  -v $(pwd)/data:/app/data \
  --env-file management.env \
  --restart unless-stopped \
  playwright-user-sys:latest

# 启动机器端容器并连接到网络
docker run -d \
  --name playwright-machine-1 \
  --network playwright-network \
  -v $(pwd)/machine-data-1:/app/data \
  --env-file machine.env \
  --restart unless-stopped \
  playwright-machine:latest
```

当使用Docker网络时，机器端的`MANAGER_HOST`可以直接使用容器名称：`playwright-user-sys:50051`。
