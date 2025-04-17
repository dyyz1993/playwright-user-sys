#!/bin/bash

# 检查容器是否正在运行
CONTAINER_ID=$(docker ps -q -f name=playwright-user-sys)

if [ -z "$CONTAINER_ID" ]; then
    echo "没有找到正在运行的容器，请先启动容器。"
    exit 1
else
    echo "找到正在运行的容器: $CONTAINER_ID"
fi

# 创建输出目录
OUTPUT_DIR="./prebuilt-sqlite3"
mkdir -p $OUTPUT_DIR

# 从容器中导出 better-sqlite3 文件
echo "从容器中导出 better-sqlite3 文件..."
docker cp $CONTAINER_ID:/app/node_modules/.pnpm/better-sqlite3@11.9.1/node_modules/better-sqlite3/build/Release $OUTPUT_DIR/better-sqlite3-build

echo "导出完成！文件位于 $OUTPUT_DIR/better-sqlite3-build"
echo "现在您可以将这些文件提交到代码仓库，以便在后续构建中使用。"
