#!/bin/bash

# 集成测试运行脚本
# 运行所有重要的集成测试

set -e

echo "========================================"
echo "运行集成测试套件"
echo "========================================"

# 检查 Node.js 版本
NODE_VERSION=$(node -v)
echo "Node.js 版本: $NODE_VERSION"

# 检查数据库连接
echo ""
echo "检查数据库连接..."
DB_HOST=${DB_HOST:-REDACTED_INTERNAL_HOST}
DB_PORT=${DB_PORT:-3306}
DB_NAME=${DB_NAME:-playwright_test_user_sys}

if mysql -h"$DB_HOST" -P"$DB_PORT" -uroot -pREDACTED_PASSWORD -e "USE $DB_NAME;" 2>/dev/null; then
    echo "✅ 数据库连接成功"
else
    echo "❌ 数据库连接失败，请检查配置"
    exit 1
fi

# 设置环境变量
export NODE_ENV=test
export DB_TYPE=mysql
export DB_HOST=$DB_HOST
export DB_PORT=$DB_PORT
export DB_NAME=$DB_NAME
export DB_USER=root
export DB_PASSWORD=REDACTED_PASSWORD
export JWT_SECRET=test_secret_key_for_ci
export JWT_EXPIRES_IN=24h
export NODE_OPTIONS="--max-old-space-size=4096"

# 测试文件列表
TESTS=(
  "tests/integration/security-vulnerabilities.test.ts"
  "tests/integration/multi-user-concurrency.test.ts"
  "tests/integration/three-tier-architecture.test.ts"
  "tests/integration/billing-flow.test.ts"
  "tests/integration/session-lifecycle.test.ts"
)

PASSED=0
FAILED=0

# 运行每个测试
for test in "${TESTS[@]}"; do
    echo ""
    echo "========================================"
    echo "运行: $test"
    echo "========================================"

    TEST_NAME=$(basename "$test" .test.ts)

    if npx vitest run "$test" --reporter=verbose; then
        echo "✅ $TEST_NAME 通过"
        ((PASSED++))
    else
        echo "❌ $TEST_NAME 失败"
        ((FAILED++))
    fi
done

# 输出结果
echo ""
echo "========================================"
echo "测试结果汇总"
echo "========================================"
echo "通过: $PASSED"
echo "失败: $FAILED"
echo "总计: $((PASSED + FAILED))"
echo ""

if [ $FAILED -gt 0 ]; then
    echo "❌ 有 $FAILED 个测试失败"
    exit 1
else
    echo "✅ 所有测试通过"
    exit 0
fi
