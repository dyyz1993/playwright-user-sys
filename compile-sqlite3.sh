#!/bin/bash

# 创建临时目录
rm -rf ./prebuilt
mkdir -p ./prebuilt

# 创建临时 Dockerfile
cat > Dockerfile.temp << EOF
FROM node:18-slim

# 注意：这里使用 slim 而不是 Alpine，因为编译需要更多的工具
# 而且我们只需要编译一次，所以镜像大小不是主要考虑因素
# 安装必要的依赖
RUN apt-get update && apt-get install -y \\
    python3 \\
    make \\
    g++ \\
    build-essential \\
    sqlite3 \\
    libsqlite3-dev

# 设置工作目录
WORKDIR /app

# 复制 package.json
COPY package.json ./

# 安装 pnpm
RUN npm install -g pnpm

# 安装依赖
RUN pnpm install --no-frozen-lockfile

# 编译 better-sqlite3
RUN cd node_modules/better-sqlite3 && npm install && npm run build-release

# 创建输出目录
RUN mkdir -p /output
RUN cp -r node_modules/better-sqlite3/build/Release /output/better-sqlite3-build
EOF

# 构建临时镜像
echo "Building temporary image for SQLite3 compilation..."
docker buildx build --platform linux/amd64 -t sqlite3-compiler --load -f Dockerfile.temp .

# 检查并清理已存在的临时容器
echo "Checking for existing temporary container..."
if docker ps -a | grep -q sqlite3-temp; then
    echo "Found existing container, removing..."
    docker rm -f sqlite3-temp
fi

# 创建临时容器
echo "Creating temporary container..."
docker create --name sqlite3-temp sqlite3-compiler

# 从容器中复制编译好的文件
echo "Extracting compiled SQLite3 files..."
if ! docker cp sqlite3-temp:/output/better-sqlite3-build ./prebuilt/; then
    echo "Error: Failed to copy files from container. Compilation may have failed."
    docker logs sqlite3-temp
    exit 1
fi

# 清理临时容器和镜像
echo "Cleaning up temporary container and image..."
docker rm sqlite3-temp || true
docker rmi sqlite3-compiler || true
rm Dockerfile.temp

echo "SQLite3 compilation completed. Compiled files are in ./prebuilt/better-sqlite3-build/"
