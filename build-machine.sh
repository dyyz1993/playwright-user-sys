#!/bin/bash

# 设置参数
USE_CACHE=${USE_CACHE:-"true"}
CLEAN_CACHE=${CLEAN_CACHE:-"false"}
PLATFORM=${PLATFORM:-"linux/amd64"}
TAG=${TAG:-"latest"}

# 创建缓存目录
mkdir -p ./.docker-cache

# 检查缓存大小
if [ -d "./.docker-cache" ]; then
    CACHE_SIZE=$(du -sh ./.docker-cache 2>/dev/null | cut -f1)
    echo "Current cache size: $CACHE_SIZE"
    
    # 如果需要清理缓存
    if [ "$CLEAN_CACHE" = "true" ]; then
        echo "Cleaning cache..."
        rm -rf ./.docker-cache
        mkdir -p ./.docker-cache
        echo "Cache cleaned."
    fi
fi

# 构建机器镜像
echo "Building machine image..."
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
  -t playwright-machine:$TAG \
  --load -f Dockerfile.machine .

echo "Machine image built successfully!"
echo ""
echo "To build without cache, run:"
echo "USE_CACHE=false ./build-machine.sh"
echo ""
echo "To clean cache before building, run:"
echo "CLEAN_CACHE=true ./build-machine.sh"
echo ""
echo "To specify a different platform, run:"
echo "PLATFORM=linux/arm64 ./build-machine.sh"
echo ""
echo "To specify a different tag, run:"
echo "TAG=dev ./build-machine.sh"
