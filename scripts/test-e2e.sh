#!/bin/bash

# 智能测试启动脚本
#
# 使用方法:
#   ./scripts/test-e2e.sh                    # 默认启动 2 个机器
#   ./scripts/test-e2e.sh 3                # 启动 3 个机器
#   TEST_MACHINE_COUNT=5 ./test-e2e.sh  # 启动 5 个机器
#
# 平时开发（不启动机器服务）:
#   pnpm dev             # 启动管理端（固定端口 3000）
#   pnpm dev:machine     # 启动机器（固定端口 50052, 8082）

set -e

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}══════════════════════════════════════════════${NC}"
echo -e "${GREEN}     Playwright E2E 测试启动脚本${NC}"
echo -e "${GREEN}══════════════════════════════════════════════${NC}"
echo ""

# 获取机器数量参数
MACHINE_COUNT=${1:-2}
export TEST_MACHINE_COUNT=$MACHINE_COUNT

echo -e "${YELLOW}配置:${NC}"
echo "  - 机器数量: $MACHINE_COUNT"
echo "  - 管理端: 自动分配端口"
echo "  - 机器服务: 自动分配端口"
echo ""

# 检查 Node.js 进程
if pgrep -f "tsx.*server.ts" > /dev/null; then
    echo -e "${YELLOW}⚠️  检测到已有服务运行，建议先关闭:${NC}"
    echo "  pkill -f 'tsx.*server.ts'"
    echo ""
fi

# 运行测试
echo -e "${GREEN}🚀 启动测试...${NC}"
echo ""

npx playwright test "$@"

echo ""
echo -e "${GREEN}✅ 测试完成${NC}"
