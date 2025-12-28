#!/bin/bash

# Three-Tier Architecture Test Database Cleanup Script
# This script drops the test database and cleans up temporary files

set -e  # Exit on error

echo "================================"
echo "Three-Tier Test Environment Cleanup"
echo "================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Load from .env.test if exists
if [ -f .env.test ]; then
    export $(cat .env.test | grep -v '^#' | xargs)
fi

DB_HOST=${DB_HOST:-127.0.0.1}
DB_PORT=${DB_PORT:-3306}
DB_USER=${DB_USER:-root}
DB_NAME=${DB_NAME:-playwright_test_user_sys}

# Step 1: Stop any running test processes
echo "[Step 1] Stopping test processes..."
pkill -f "vitest" 2>/dev/null && echo -e "${GREEN}✓ Stopped vitest processes${NC}" || echo -e "${YELLOW}No vitest processes running${NC}"
pkill -f "node.*test" 2>/dev/null && echo -e "${GREEN}✓ Stopped test processes${NC}" || echo -e "${YELLOW}No test processes running${NC}"
echo ""

# Step 2: Stop Chrome processes
echo "[Step 2] Stopping Chrome processes..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    killall "Google Chrome" 2>/dev/null && echo -e "${GREEN}✓ Stopped Chrome${NC}" || echo -e "${YELLOW}No Chrome processes running${NC}"
else
    pkill chrome 2>/dev/null && echo -e "${GREEN}✓ Stopped Chrome${NC}" || echo -e "${YELLOW}No Chrome processes running${NC}"
fi
echo ""

# Step 3: Drop test database
echo "[Step 3] Dropping test database..."
if command -v mysql &> /dev/null; then
    if mysql -u "$DB_USER" -h "$DB_HOST" -P "$DB_PORT" -e "USE ${DB_NAME}" &> /dev/null; then
        mysql -u "$DB_USER" -h "$DB_HOST" -P "$DB_PORT" <<EOF
DROP DATABASE IF EXISTS ${DB_NAME};
EOF
        echo -e "${GREEN}✓ Database '${DB_NAME}' dropped${NC}"
    else
        echo -e "${YELLOW}Database '${DB_NAME}' does not exist${NC}"
    fi
else
    echo -e "${RED}✗ MySQL client not found${NC}"
    echo "Please drop database manually:"
    echo "  mysql -u $DB_USER -h $DB_HOST -P $DB_PORT -e \"DROP DATABASE IF EXISTS ${DB_NAME};\""
fi
echo ""

# Step 4: Clean up temporary files
echo "[Step 4] Cleaning up temporary files..."

TEMP_DIRS=(
    "/tmp/playwright-test-data"
    "/tmp/playwright-test-temp"
    "/tmp/chrome-dev-profile"
)

for dir in "${TEMP_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        rm -rf "$dir"
        echo -e "${GREEN}✓ Removed $dir${NC}"
    else
        echo -e "${YELLOW}Directory does not exist: $dir${NC}"
    fi
done
echo ""

# Step 5: Clean up test logs
echo "[Step 5] Cleaning up test logs..."
if [ -d "logs" ]; then
    rm -f logs/test-*.log
    echo -e "${GREEN}✓ Cleaned test logs${NC}"
else
    echo -e "${YELLOW}No logs directory found${NC}"
fi
echo ""

# Step 6: Clean up coverage reports
echo "[Step 6] Cleaning up coverage reports..."
if [ -d "coverage" ]; then
    rm -rf coverage
    echo -e "${GREEN}✓ Removed coverage directory${NC}"
else
    echo -e "${YELLOW}No coverage directory found${NC}"
fi
echo ""

# Step 7: Clean up test reports
echo "[Step 7] Cleaning up test reports..."
if [ -d "test-results" ]; then
    rm -rf test-results/*.json
    echo -e "${GREEN}✓ Cleaned test results${NC}"
else
    echo -e "${YELLOW}No test results directory found${NC}"
fi
echo ""

# Summary
echo "================================"
echo "Cleanup Complete!"
echo "================================"
echo ""
echo "Cleaned up:"
echo "  - Test database: ${DB_NAME}"
echo "  - Temporary directories"
echo "  - Test logs and reports"
echo "  - Chrome processes"
echo ""
echo "Next time you run tests, use:"
echo "  bash .claude/skills/test-three-tier-architecture/scripts/setup-test-env.sh"
echo ""
