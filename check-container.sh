#!/bin/bash

# 检查容器是否正在运行
CONTAINER_ID=$(docker ps -q -f name=playwright-user-sys)

if [ -z "$CONTAINER_ID" ]; then
    echo "容器未运行，尝试启动一个临时容器..."
    
    # 构建镜像（如果需要）
    docker build -t playwright-user-sys:debug .
    
    # 启动临时容器
    CONTAINER_ID=$(docker run -d --name playwright-user-sys-debug playwright-user-sys:debug sleep 3600)
    
    echo "已启动临时容器: $CONTAINER_ID"
else
    echo "找到正在运行的容器: $CONTAINER_ID"
fi

# 进入容器
echo "正在进入容器..."
echo "提示: 进入容器后，您可以运行以下命令检查文件路径:"
echo "  ls -la /app/node_modules/.pnpm/better-sqlite3@11.9.1/node_modules/better-sqlite3/build/Release/"
echo "  find /app -name better_sqlite3.node"
echo "  ldd /app/node_modules/.pnpm/better-sqlite3@11.9.1/node_modules/better-sqlite3/build/Release/better_sqlite3.node"

docker exec -it $CONTAINER_ID /bin/bash
