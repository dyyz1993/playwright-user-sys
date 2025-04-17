#!/bin/bash

# 错误处理
set -e

# 函数定义
function cleanup() {
    echo "Cleaning up..."
    # 添加清理操作
}

# 捕获错误
trap cleanup EXIT

# 设置参数
USE_CACHE=${USE_CACHE:-"true"}
FORCE_COMPILE=${FORCE_COMPILE:-"false"}
# 自动检测主机平台
HOST_PLATFORM=$(docker info --format '{{.OSType}}/{{.Architecture}}')
PLATFORM=${PLATFORM:-$HOST_PLATFORM}

# 直接在 Dockerfile 中编译 better-sqlite3
echo "Using in-container compilation for better-sqlite3 with caching."

# 创建缓存目录
mkdir -p ./.docker-cache

# 构建应用镜像
echo "Building application image..."
CACHE_OPT=""
if [ "$USE_CACHE" = "false" ]; then
    CACHE_OPT="--no-cache"
    echo "Building without cache."
fi

docker buildx build \
  --platform $PLATFORM \
  $CACHE_OPT \
  --cache-from type=local,src=./.docker-cache \
  --cache-to type=local,dest=./.docker-cache \
  -t playwright-user-sys:latest \
  --load .

# 构建机器镜像
echo "Building machine image..."
docker buildx build \
  --platform $PLATFORM \
  $CACHE_OPT \
  --cache-from type=local,src=./.docker-cache \
  --cache-to type=local,dest=./.docker-cache \
  -t playwright-machine:latest \
  --load -f Dockerfile.machine .

# 启动容器
echo "Starting containers..."
docker-compose up -d

echo "System started successfully!"
echo "Management server is available at http://localhost:3000"
echo ""
# 不再需要强制重新编译 SQLite3
# echo "To force recompilation of SQLite3, run:"
# echo "FORCE_COMPILE=true ./build-and-start.sh"
echo ""
echo "To build without cache, run:"
echo "USE_CACHE=false ./build-and-start.sh"
echo ""
echo "To specify a different platform, run:"
echo "PLATFORM=linux/arm64 ./build-and-start.sh"
