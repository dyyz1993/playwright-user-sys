#!/bin/bash

# 启动一个临时容器
echo "启动一个临时容器..."
CONTAINER_ID=$(docker run -d --name playwright-user-sys-temp playwright-user-sys:latest sleep 3600)

echo "临时容器已启动: $CONTAINER_ID"

# 进入容器
echo "正在进入容器..."
echo "提示: 进入容器后，您可以运行以下命令检查文件路径:"
echo "  ls -la /app/node_modules/.pnpm/better-sqlite3@11.9.1/node_modules/better-sqlite3/build/Release/"
echo "  find /app -name better_sqlite3.node"
echo "  ldd /app/node_modules/.pnpm/better-sqlite3@11.9.1/node_modules/better-sqlite3/build/Release/better_sqlite3.node"

docker exec -it $CONTAINER_ID /bin/bash
