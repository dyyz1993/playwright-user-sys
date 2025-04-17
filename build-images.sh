#!/bin/bash

# 构建基础镜像
echo "Building base image..."
docker buildx build --platform linux/amd64 -t playwright-base:latest --load -f Dockerfile.base .

# 构建应用镜像
echo "Building application image..."
docker buildx build --platform linux/amd64 -t playwright-user-sys:latest --load .

# 构建机器镜像
echo "Building machine image..."
docker buildx build --platform linux/amd64 -t playwright-machine:latest --load -f Dockerfile.machine .

echo "All images built successfully!"
