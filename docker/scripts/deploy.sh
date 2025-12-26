#!/bin/bash

# 部署脚本 - 部署到生产环境
# 用法: ./deploy.sh [环境]
# 环境: prod (默认), dev

set -e

# 默认环境
ENV=${1:-prod}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

echo "开始部署到 $ENV 环境..."

case $ENV in
  "prod")
    echo "部署到生产环境"
    COMPOSE_FILE="$ROOT_DIR/docker/docker-compose.prod.yml"
    ENV_FILE="$ROOT_DIR/docker/.env"
    
    if [ ! -f "$ENV_FILE" ]; then
      echo "错误: $ENV_FILE 文件不存在。请先创建生产环境配置文件。"
      echo "复制示例配置: cp $ROOT_DIR/docker/.env.example $ENV_FILE"
      exit 1
    fi
    
    echo "停止现有服务..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down
    
    echo "拉取最新镜像..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull
    
    echo "启动服务..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
    
    echo "检查服务状态..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
    
    echo "部署完成！"
    ;;
    
  "dev")
    echo "部署到开发环境"
    COMPOSE_FILE="$ROOT_DIR/docker/docker-compose.dev.yml"
    
    echo "停止现有服务..."
    docker-compose -f "$COMPOSE_FILE" down
    
    echo "构建并启动服务..."
    docker-compose -f "$COMPOSE_FILE" up -d
    
    echo "检查服务状态..."
    docker-compose -f "$COMPOSE_FILE" ps
    
    echo "部署完成！"
    ;;
    
  *)
    echo "用法: $0 [prod|dev]"
    echo "  prod: 生产环境 (默认)"
    echo "  dev: 开发环境"
    exit 1
    ;;
esac

echo "部署脚本执行完成。"