#!/bin/bash
set -e

echo "🔧 初始化测试数据库..."

# 配置
DB_HOST="REDACTED_INTERNAL_HOST"
DB_USER="root"
DB_PASS="REDACTED_PASSWORD"
SOURCE_DB="playwright_user_sys"
TEST_DB="playwright_test_user_sys"

# 1. 导出表结构
echo "📦 导出表结构..."
mysqldump -h $DB_HOST -u$DB_USER -p$DB_PASS \
  --no-data $SOURCE_DB > /tmp/test-schema.sql 2>/dev/null

# 2. 创建测试数据库（如果不存在）
echo "🏗️  创建测试数据库..."
mysql -h $DB_HOST -u$DB_USER -p$DB_PASS \
  -e "CREATE DATABASE IF NOT EXISTS $TEST_DB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null

# 3. 导入表结构
echo "📥 导入表结构..."
mysql -h $DB_HOST -u$DB_USER -p$DB_PASS \
  $TEST_DB < /tmp/test-schema.sql 2>/dev/null

# 4. 验证
echo "✅ 验证表结构..."
TABLES=$(mysql -h $DB_HOST -u$DB_USER -p$DB_PASS \
  -e "SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = '$TEST_DB';" \
  --skip-column-names 2>/dev/null)

echo "📊 测试数据库包含 $TABLES 张表"

# 显示所有表
mysql -h $DB_HOST -u$DB_USER -p$DB_PASS \
  -e "USE $TEST_DB; SHOW TABLES;" 2>/dev/null | grep -v "Tables_in"

# 5. 清理临时文件
rm -f /tmp/test-schema.sql

echo "✨ 测试数据库初始化完成！"
