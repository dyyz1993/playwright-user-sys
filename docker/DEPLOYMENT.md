# 部署指南

## 目录

- [部署指南](#部署指南)
  - [目录](#目录)
  - [自动构建与部署](#自动构建与部署)
    - [GitHub Actions 工作流](#github-actions-工作流)
    - [镜像推送](#镜像推送)
  - [手动部署](#手动部署)
    - [环境配置](#环境配置)
    - [生产环境部署](#生产环境部署)
    - [开发环境部署](#开发环境部署)
  - [部署后验证](#部署后验证)
  - [常见问题](#常见问题)

## 自动构建与部署

### GitHub Actions 工作流

项目配置了 GitHub Actions 工作流，自动构建 Docker 镜像并推送到 GitHub Container Registry。

工作流文件：`.github/workflows/docker-deploy.yml`

**触发条件：**
- 推送到 `main` 或 `master` 分支
- Pull Request
- 手动触发 (workflow_dispatch)

**构建内容：**
- 管理端镜像 (`ghcr.io/{username}/{repository}-manager:latest`)
- 机器端镜像 (`ghcr.io/{username}/{repository}-machine:latest`)

**平台支持：**
- Linux AMD64
- Linux ARM64

### 镜像推送

构建的镜像将推送到 GitHub Container Registry (GHCR)，地址为：

```
ghcr.io/{username}/{repository}-manager:latest
ghcr.io/{username}/{repository}-machine:latest
```

## 手动部署

### 环境配置

1. **复制环境配置文件**
   ```bash
   cd docker
   cp .env.example .env
   ```

2. **编辑环境变量**
   ```bash
   vim .env  # 或使用你喜欢的编辑器
   ```

   **重要配置项：**
   - `MYSQL_ROOT_PASSWORD`: MySQL root 密码（必须修改）
   - `MYSQL_PASSWORD`: MySQL 用户密码（必须修改）
   - `JWT_SECRET`: JWT 密钥（必须修改）
   - `ADMIN_PASSWORD`: 管理员密码（必须修改）
   - `IMAGE_TAG`: 镜像标签（默认 latest）

3. **生成安全密钥**
   ```bash
   # 生成 JWT Secret
   openssl rand -base64 64
   
   # 生成管理员密码
   openssl rand -base64 32
   
   # 生成数据库密码
   openssl rand -base64 32
   ```

### 生产环境部署

#### 使用部署脚本（推荐）

```bash
# 给脚本执行权限
chmod +x docker/scripts/deploy.sh

# 部署到生产环境
./docker/scripts/deploy.sh prod
```

#### 手动部署

```bash
# 部署生产环境
docker-compose -f docker/docker-compose.prod.yml --env-file docker/.env up -d

# 查看服务状态
docker-compose -f docker/docker-compose.prod.yml --env-file docker/.env ps

# 查看日志
docker-compose -f docker/docker-compose.prod.yml --env-file docker/.env logs -f
```

### 开发环境部署

#### 使用部署脚本

```bash
# 部署到开发环境
./docker/scripts/deploy.sh dev
```

#### 手动部署

```bash
# 部署开发环境
docker-compose -f docker/docker-compose.dev.yml up -d

# 查看服务状态
docker-compose -f docker/docker-compose.dev.yml ps

# 查看日志
docker-compose -f docker/docker-compose.dev.yml logs -f
```

## 部署后验证

### 检查服务状态

```bash
# 查看所有服务状态
docker-compose -f docker/docker-compose.prod.yml --env-file docker/.env ps

# 检查健康状态
docker inspect --format='{{json .State.Health}}' playwright-manager-prod
docker inspect --format='{{json .State.Health}}' playwright-machine-1-prod
```

### API 测试

```bash
# 健康检查
curl http://localhost:3000/api/health

# 管理员登录（需要先设置 ADMIN_PASSWORD）
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<your-admin-password>"}'
```

### 服务验证

1. **管理端服务** (端口 3000)
   - API 文档: `http://localhost:3000/docs`
   - 健康检查: `http://localhost:3000/api/health`

2. **机器端服务** (端口 50052, 8082)
   - gRPC 服务: `localhost:50052`
   - WebSocket 代理: `localhost:8082`

## 常见问题

### 1. 容器启动失败

**检查步骤：**
```bash
# 查看容器日志
docker logs playwright-manager-prod
docker logs playwright-mysql-prod

# 检查容器状态
docker ps -a

# 检查配置
docker inspect playwright-manager-prod
```

**常见原因：**
- 环境变量配置错误
- 数据库连接失败
- 端口冲突
- 资源不足

### 2. 机器端无法注册到管理端

**检查步骤：**
```bash
# 检查管理端 gRPC 服务
docker exec playwright-manager-prod netstat -tulpn | grep 50051

# 检查机器端日志
docker logs playwright-machine-1-prod

# 检查网络连通性
docker exec playwright-machine-1-prod nc -zv manager 50051
```

### 3. 数据库连接失败

**检查步骤：**
```bash
# 检查 MySQL 容器
docker ps | grep mysql

# 检查 MySQL 日志
docker logs playwright-mysql-prod

# 测试连接
docker exec -it playwright-manager-prod sh
nc -zv mysql 3306
```

### 4. 镜像构建失败

**解决方案：**
```bash
# 清理构建缓存
docker builder prune

# 重新构建
docker-compose -f docker/docker-compose.prod.yml build --no-cache
```