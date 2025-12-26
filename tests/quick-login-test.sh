#!/bin/bash

# Quick Web Login Test
# 测试 Web 登录功能是否正常工作

echo "================================"
echo "Web Login Quick Test"
echo "================================"
echo ""

# 测试 1: 访问登录页面
echo "[Test 1] Accessing login page..."
RESPONSE=$(curl -s -i http://localhost:3000/admin/login)
HTTP_CODE=$(echo "$RESPONSE" | head -1 | awk '{print $2}')

if [ "$HTTP_CODE" = "200" ]; then
    echo "  ✓ Login page accessible (HTTP $HTTP_CODE)"
else
    echo "  ✗ Failed (HTTP $HTTP_CODE)"
    exit 1
fi
echo ""

# 测试 2: 提交登录表单
echo "[Test 2] Submitting login form..."
echo "  Username: admin"
echo "  Password: REDACTED_ADMIN_PASS"

# 发送登录请求并保存 cookies
LOGIN_RESPONSE=$(curl -s -i -X POST http://localhost:3000/admin/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=REDACTED_ADMIN_PASS" \
  -c /tmp/login_cookies.txt)

HTTP_CODE=$(echo "$LOGIN_RESPONSE" | head -1 | awk '{print $2}')
LOCATION=$(echo "$LOGIN_RESPONSE" | grep -i "Location:" | cut -d' ' -f2 | tr -d '\r')

echo "  Response code: $HTTP_CODE"
echo "  Redirect location: $LOCATION"

# 检查 cookies
if [ -f /tmp/login_cookies.txt ]; then
    COOKIE_COUNT=$(grep -c "token" /tmp/login_cookies.txt || true)
    echo "  Cookies set: $COOKIE_COUNT"

    if [ $COOKIE_COUNT -gt 0 ]; then
        echo "  ✓ Token cookie found"
        cat /tmp/login_cookies.txt | grep token
    else
        echo "  ✗ No token cookie set"
    fi
else
    echo "  ✗ No cookies file created"
fi
echo ""

# 测试 3: 访问受保护的仪表盘页面
echo "[Test 3] Accessing protected dashboard..."
DASHBOARD_RESPONSE=$(curl -s -i http://localhost:3000/admin \
  -b /tmp/login_cookies.txt)

HTTP_CODE=$(echo "$DASHBOARD_RESPONSE" | head -1 | awk '{print $2}')

if [ "$HTTP_CODE" = "200" ]; then
    # 检查页面内容
    if echo "$DASHBOARD_RESPONSE" | grep -qi "dashboard\|仪表盘"; then
        echo "  ✓ Dashboard accessible"
    else
        echo "  ? Page loaded but content unexpected"
    fi
elif [ "$HTTP_CODE" = "302" ] || [ "$HTTP_CODE" = "301" ]; then
    REDIRECT=$(echo "$DASHBOARD_RESPONSE" | grep -i "Location:" | cut -d' ' -f2 | tr -d '\r')
    echo "  ✗ Redirected to: $REDIRECT (login failed?)"
else
    echo "  ✗ Unexpected response: HTTP $HTTP_CODE"
fi
echo ""

# 测试 4: 验证 API 登录（对比）
echo "[Test 4] Testing API login for comparison..."
API_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"REDACTED_ADMIN_PASS"}')

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"REDACTED_ADMIN_PASS"}')

if [ "$HTTP_CODE" = "200" ]; then
    # 检查是否有 token
    if echo "$API_RESPONSE" | grep -q "token"; then
        echo "  ✓ API login successful, token received"
        # 提取并显示 token 的前几个字符
        TOKEN=$(echo "$API_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
        echo "  Token preview: ${TOKEN:0:30}..."
    else
        echo "  ? API responded but no token found"
    fi
else
    echo "  ✗ API login failed: HTTP $HTTP_CODE"
fi
echo ""

# 清理
rm -f /tmp/login_cookies.txt

echo "================================"
echo "Test Complete"
echo "================================"
