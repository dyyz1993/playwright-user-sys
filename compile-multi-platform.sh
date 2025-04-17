#!/bin/bash

# 设置变量
OUTPUT_DIR="./prebuilt-sqlite3"
PLATFORMS=("linux/amd64" "linux/arm64" "darwin/amd64" "darwin/arm64")

# 清理输出目录
rm -rf $OUTPUT_DIR
mkdir -p $OUTPUT_DIR

echo "🚀 开始为多个平台编译 SQLite3..."

# 为每个平台编译 SQLite3
for PLATFORM in "${PLATFORMS[@]}"; do
    PLATFORM_DIR=$(echo $PLATFORM | tr '/' '-')
    PLATFORM_OUTPUT_DIR="$OUTPUT_DIR/$PLATFORM_DIR"
    mkdir -p $PLATFORM_OUTPUT_DIR

    echo "📦 为平台 $PLATFORM 构建临时镜像..."
    
    # 创建临时 Dockerfile
    cat > Dockerfile.temp << EOF
FROM --platform=$PLATFORM node:18-slim

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
    echo "🏗️ 构建 $PLATFORM 平台的临时镜像..."
    CONTAINER_NAME="sqlite3-temp-$PLATFORM_DIR"
    
    # 检查并清理已存在的容器
    if docker ps -a | grep -q $CONTAINER_NAME; then
        echo "找到已存在的容器，正在移除..."
        docker rm -f $CONTAINER_NAME
    fi
    
    # 构建镜像并创建容器
    docker buildx build --platform $PLATFORM -t sqlite3-$PLATFORM_DIR -f Dockerfile.temp .
    docker create --name $CONTAINER_NAME sqlite3-$PLATFORM_DIR

    # 从容器中导出编译好的文件
    echo "📤 导出 $PLATFORM 平台的编译文件..."
    docker cp $CONTAINER_NAME:/output/better-sqlite3-build $PLATFORM_OUTPUT_DIR/

    # 清理临时容器和镜像
    echo "🧹 清理临时容器和镜像..."
    docker rm $CONTAINER_NAME
    docker rmi sqlite3-$PLATFORM_DIR
done

rm Dockerfile.temp

echo "✅ 所有平台的 SQLite3 编译完成！"
echo "📁 编译好的文件位于 $OUTPUT_DIR 目录下的各个平台子目录中"
