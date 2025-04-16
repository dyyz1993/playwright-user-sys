#!/bin/bash

# 设置颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}开始演示流程...${NC}"

# 打印当前目录
echo -e "${YELLOW}当前目录: $(pwd)${NC}"

# 步骤 1: 创建测试用户
echo -e "${YELLOW}\n步骤 1: 创建测试用户${NC}"
npx tsx scripts/create-test-user.ts > create-user.log 2>&1

# 获取 API Key
API_KEY=$(grep "API Key:" create-user.log | awk '{print $NF}')

if [ -z "$API_KEY" ]; then
  echo -e "${RED}无法获取 API Key，请检查日志${NC}"
  cat create-user.log
  exit 1
fi

echo -e "${GREEN}获取到 API Key: $API_KEY${NC}"

# 步骤 2: 运行客户端演示
echo -e "${YELLOW}\n步骤 2: 运行客户端演示${NC}"
echo -e "${YELLOW}注意: 请确保管理服务器和机器端已经启动${NC}"
API_KEY=$API_KEY API_BASE_URL=http://localhost:3000/api npx tsx scripts/client-demo.ts

echo -e "${GREEN}\n演示完成！${NC}"
