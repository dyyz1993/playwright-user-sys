# 机器端 Docker 部署指南

本文档提供了关于机器端 Docker 镜像的构建、配置和部署的详细说明。

## 镜像优化说明

最新版本的 `Dockerfile.machine` 包含以下优化：

1. **基础镜像升级**：使用 Node.js 22 作为基础镜像，提供更好的性能和安全性
2. **缓存优化**：使用 Docker BuildKit 的缓存机制加速构建过程
3. **多语言字体支持**：添加了多种语言的字体支持，包括中文、日文、泰文等
4. **Xvfb 支持**：添加了 Xvfb 虚拟显示服务器，支持无头浏览器的截图功能
5. **启动脚本优化**：使用自定义启动脚本确保 Xvfb 和 dbus 服务正确启动
6. **环境变量配置**：预设了常用的环境变量默认值

## 构建镜像

使用以下命令构建机器端镜像：

```bash
# 使用 Docker BuildKit 构建
DOCKER_BUILDKIT=1 docker build -t playwright-machine:latest -f Dockerfile.machine .

# 或使用 buildx (推荐)
docker buildx build --platform linux/amd64 -t playwright-machine:latest -f Dockerfile.machine .
```

## 环境变量配置

机器端容器支持以下环境变量配置：

| 环境变量 | 说明 | 默认值 | 是否必须 |
|---------|------|-------|---------|
| MACHINE_ID | 机器唯一标识 | 自动生成UUID | 生产环境建议指定 |
| MACHINE_NAME | 机器名称 | 主机名 | 否 |
| MANAGEMENT_SERVER_URL | 管理服务器URL | http://localhost:3000 | 是 |
| MANAGER_HOST | 管理端gRPC地址 | localhost:50051 | 是 |
| MACHINE_GRPC_PORT | 机器端gRPC端口 | 50052 | 否 |
| PROXY_PORT | 代理服务器端口 | 8082 | 否 |
| MAX_SESSIONS | 最大会话数 | 10 | 否 |
| SESSION_TIMEOUT | 会话超时时间(毫秒) | 300000 | 否 |
| CHROME_PATH | Chrome浏览器路径 | /usr/bin/google-chrome-stable | 否 |
| HEARTBEAT_INTERVAL | 心跳间隔(毫秒) | 30000 | 否 |
| DISCONNECTION_TIMEOUT | 断开连接超时(毫秒) | 10000 | 否 |
| ACTIVITY_REPORT_INTERVAL | 活动报告间隔(毫秒) | 3000 | 否 |
| SESSION_ACTIVITY_TIMEOUT | 会话活动超时(毫秒) | 10000 | 否 |
| DATA_DIR | 数据目录 | /app/data | 否 |
| MACHINE_IP | 机器IP地址 | 自动检测 | 生产环境必须设置 |
| STATUS_REPORT_INTERVAL | 状态报告间隔(毫秒) | 60000 | 否 |

## 目录挂载

在部署时，建议挂载以下目录：

1. **数据目录**：`/app/data` - 存储会话数据、截图等
2. **文件目录**：`/files` - 用于文件上传和下载

示例：

```bash
docker run -d \
  --name playwright-machine-1 \
  -v $(pwd)/machine-data:/app/data \
  -v $(pwd)/files:/files \
  -e MACHINE_ID=machine-1 \
  -e MANAGEMENT_SERVER_URL=http://管理端IP:3000 \
  -e MANAGER_HOST=管理端IP:50051 \
  -e MACHINE_IP=本机IP地址 \
  playwright-machine:latest
```

## 生产环境部署

在生产环境中，必须设置以下环境变量：

1. `MACHINE_ID` - 为每台机器设置唯一的ID
2. `MACHINE_IP` - 设置为机器的实际IP地址，确保管理端可以访问
3. `MANAGEMENT_SERVER_URL` - 设置为管理端的URL
4. `MANAGER_HOST` - 设置为管理端的gRPC地址

示例配置文件 `machine.env`：

```
NODE_ENV=production
MACHINE_ID=machine-1
MACHINE_NAME=production-machine-1
MANAGEMENT_SERVER_URL=http://管理端IP:3000
MANAGER_HOST=管理端IP:50051
MACHINE_IP=本机IP地址
MAX_SESSIONS=20
SESSION_TIMEOUT=300000
```

使用配置文件启动容器：

```bash
docker run -d \
  --name playwright-machine-1 \
  --restart unless-stopped \
  -v $(pwd)/machine-data:/app/data \
  -v $(pwd)/files:/files \
  --env-file machine.env \
  playwright-machine:latest
```

## 多机器部署

在多机器部署场景中，确保每台机器都有唯一的 `MACHINE_ID` 和正确的 `MACHINE_IP`。

可以使用 Docker Compose 进行多机器部署：

```yaml
version: '3.8'

services:
  machine-1:
    image: playwright-machine:latest
    container_name: playwright-machine-1
    restart: unless-stopped
    volumes:
      - ./machine-data-1:/app/data
      - ./files-1:/files
    environment:
      - NODE_ENV=production
      - MACHINE_ID=machine-1
      - MACHINE_NAME=production-machine-1
      - MANAGEMENT_SERVER_URL=http://管理端IP:3000
      - MANAGER_HOST=管理端IP:50051
      - MACHINE_IP=192.168.1.101
      - MAX_SESSIONS=20

  machine-2:
    image: playwright-machine:latest
    container_name: playwright-machine-2
    restart: unless-stopped
    volumes:
      - ./machine-data-2:/app/data
      - ./files-2:/files
    environment:
      - NODE_ENV=production
      - MACHINE_ID=machine-2
      - MACHINE_NAME=production-machine-2
      - MANAGEMENT_SERVER_URL=http://管理端IP:3000
      - MANAGER_HOST=管理端IP:50051
      - MACHINE_IP=192.168.1.102
      - MAX_SESSIONS=20
```

## 故障排除

1. **Chrome 启动失败**：检查 `CHROME_PATH` 环境变量是否正确，确保容器内已安装 Chrome
2. **连接管理端失败**：检查 `MANAGEMENT_SERVER_URL` 和 `MANAGER_HOST` 是否正确，确保网络连通性
3. **截图功能不可用**：确保 Xvfb 服务正常运行，可以通过查看容器日志检查
4. **内存使用过高**：调整 `MAX_SESSIONS` 参数，限制并发会话数量

## 性能优化

1. **调整会话数**：根据机器性能调整 `MAX_SESSIONS` 参数
2. **优化超时设置**：根据实际使用情况调整 `SESSION_TIMEOUT` 和 `DISCONNECTION_TIMEOUT`
3. **监控资源使用**：定期检查容器的 CPU 和内存使用情况，必要时进行扩容
