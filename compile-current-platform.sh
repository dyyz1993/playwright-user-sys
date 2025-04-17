#!/bin/bash

# 获取当前平台和架构
if [[ "$(uname)" == "Darwin" ]]; then
    PLATFORM="darwin"
else
    PLATFORM="linux"
fi

if [[ "$(uname -m)" == "x86_64" ]]; then
    ARCH="amd64"
elif [[ "$(uname -m)" == "arm64" ]] || [[ "$(uname -m)" == "aarch64" ]]; then
    ARCH="arm64"
else
    echo "不支持的架构: $(uname -m)"
    exit 1
fi

PLATFORM_DIR="${PLATFORM}-${ARCH}"
OUTPUT_DIR="./prebuilt-sqlite3/${PLATFORM_DIR}"

echo "🚀 开始为当前平台 ${PLATFORM_DIR} 编译 SQLite3..."

# 创建输出目录
mkdir -p $OUTPUT_DIR

# 安装 better-sqlite3
echo "📦 安装 better-sqlite3..."
pnpm install better-sqlite3

# 复制编译好的文件
echo "📤 复制编译好的文件..."
cp -r ./node_modules/better-sqlite3/build/Release/better_sqlite3.node $OUTPUT_DIR/

echo "✅ 编译完成！"
echo "📁 编译好的文件位于 $OUTPUT_DIR/better_sqlite3.node"
