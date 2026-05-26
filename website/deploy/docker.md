# Docker 部署

## 前置要求

- Docker >= 20.10
- Docker Compose >= 2.0

## 镜像地址

| 组件 | 镜像 |
|------|------|
| Management Server | `ghcr.io/dyyz1993/playwright-user-sys:manager` |
| Machine Service | `ghcr.io/dyyz1993/playwright-user-sys:machine` |

## docker-compose.yml

```yaml
services:
  manager:
    image: ghcr.io/dyyz1993/playwright-user-sys:manager
    container_name: playwright-manager
    ports:
      - "3000:3000"
      - "50051:50051"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - HOST=0.0.0.0
      - DB_TYPE=sqlite
      - DB_PATH=/app/data/database.sqlite
      - JWT_SECRET=${JWT_SECRET:?required}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD:?required}
      - JWT_EXPIRES_IN=1d
      - GRPC_PORT=50051
    volumes:
      - ./data:/app/data
      - ./uploads:/app/uploads
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    restart: unless-stopped

  machine-1:
    image: ghcr.io/dyyz1993/playwright-user-sys:machine
    container_name: playwright-machine-1
    ports:
      - "8082:8082"
    depends_on:
      manager:
        condition: service_healthy
    environment:
      - NODE_ENV=production
      - MACHINE_ID=machine-1
      - MANAGEMENT_SERVER_URL=http://manager:3000
      - MANAGER_HOST=manager:50051
      - MACHINE_IP=${PUBLIC_IP:-127.0.0.1}
      - STATUS_REPORT_INTERVAL=60000
    volumes:
      - ./machine-data-1:/app/data
    restart: unless-stopped

  machine-2:
    image: ghcr.io/dyyz1993/playwright-user-sys:machine
    container_name: playwright-machine-2
    ports:
      - "8083:8082"
    depends_on:
      manager:
        condition: service_healthy
    environment:
      - NODE_ENV=production
      - MACHINE_ID=machine-2
      - MANAGEMENT_SERVER_URL=http://manager:3000
      - MANAGER_HOST=manager:50051
      - MACHINE_IP=${PUBLIC_IP:-127.0.0.1}
    volumes:
      - ./machine-data-2:/app/data
    restart: unless-stopped
```

## 环境变量文件

创建 `.env` 文件：

```bash
JWT_SECRET=your-strong-secret-key-at-least-32-chars
ADMIN_PASSWORD=your-admin-password
PUBLIC_IP=your-server-public-ip
```

## 启动

```bash
# 启动所有服务
docker compose up -d

# 查看日志
docker compose logs -f

# 查看服务状态
docker compose ps

# 停止所有服务
docker compose down
```

## 验证部署

```bash
# 检查健康状态
curl http://localhost:3000/health

# 登录测试
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-admin-password"}'
```

## 使用 MySQL

取消注释 `docker-compose.yml` 中的 MySQL 配置，并设置：

```bash
DB_TYPE=mysql
DB_HOST=db
DB_USER=playwright
DB_PASSWORD=your-db-password
MYSQL_ROOT_PASSWORD=your-root-password
```
