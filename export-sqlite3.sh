#!/bin/bash

# 设置变量
CONTAINER_NAME="sqlite3-export-container"
OUTPUT_DIR="./prebuilt-sqlite3"

# 创建输出目录
mkdir -p $OUTPUT_DIR

echo "🚀 开始从 Docker 容器导出编译好的 SQLite3..."

# 自动检测主机平台
HOST_PLATFORM=$(docker info --format '{{.OSType}}/{{.Architecture}}')
PLATFORM=${PLATFORM:-$HOST_PLATFORM}

# 构建一个临时镜像来编译 SQLite3
echo "📦 构建临时镜像..."
docker build --platform $PLATFORM -t sqlite3-export-image -f - . << EOF
FROM node:18-slim

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
EOF

# 创建临时容器
echo "🏗️ 创建临时容器..."
docker create --name $CONTAINER_NAME sqlite3-export-image

# 从容器中导出编译好的文件
echo "📤 导出编译好的 SQLite3 文件..."
docker cp $CONTAINER_NAME:/app/node_modules/better-sqlite3/build/Release $OUTPUT_DIR/better-sqlite3-build

# 清理临时容器和镜像
echo "🧹 清理临时容器和镜像..."
docker rm $CONTAINER_NAME
docker rmi sqlite3-export-image

echo "✅ 导出完成！编译好的 SQLite3 文件位于 $OUTPUT_DIR/better-sqlite3-build"
echo "📝 在 Dockerfile 中，您可以使用以下命令复制这些文件："
echo "COPY $OUTPUT_DIR/better-sqlite3-build/ ./node_modules/better-sqlite3/build/Release/"
