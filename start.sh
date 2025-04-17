#!/bin/bash

# 构建所有镜像
echo "Building all images..."
./build-images.sh

# 启动容器
echo "Starting containers..."
docker-compose up -d

echo "System started successfully!"
echo "Management server is available at http://localhost:3000"
