#!/bin/bash
set -e

echo "🔧 初始化测试数据库..."

DB_HOST="${DB_HOST:-localhost}"
DB_USER="${DB_USER:-root}"
DB_PASS="${DB_PASSWORD:-}"
SOURCE_DB="playwright_user_sys"
TEST_DB="playwright_test_user_sys"

echo "📦 导出表结构..."
mysqldump -h $DB_HOST -u$DB_USER -p$DB_PASS \
  --no-data $SOURCE_DB > /tmp/test-schema.sql 2>/dev/null

echo "🏗️  创建测试数据库..."
mysql -h $DB_HOST -u$DB_USER -p$DB_PASS \
  -e "CREATE DATABASE IF NOT EXISTS $TEST_DB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null

echo "📥 导入表结构..."
mysql -h $DB_HOST -u$DB_USER -p$DB_PASS \
  $TEST_DB < /tmp/test-schema.sql 2>/dev/null

echo "✅ 验证表结构..."
TABLES=$(mysql -h $DB_HOST -u$DB_USER -p$DB_PASS \
  -e "SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = '$TEST_DB';" \
  --skip-column-names 2>/dev/null)

echo "📊 测试数据库包含 $TABLES 张表"

mysql -h $DB_HOST -u$DB_USER -p$DB_PASS \
  -e "USE $TEST_DB; SHOW TABLES;" 2>/dev/null | grep -v "Tables_in"

rm -f /tmp/test-schema.sql

echo "✨ 测试数据库初始化完成！"
