#!/bin/bash

# Three-Tier Architecture Test Environment Setup Script
# This script sets up the test environment for integration tests

set -e  # Exit on error

echo "================================"
echo "Three-Tier Test Environment Setup"
echo "================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Check Node.js version
echo "[Step 1] Checking Node.js version..."
if command -v nvm &> /dev/null; then
    echo "Switching to Node.js 20..."
    nvm use 20 || echo -e "${YELLOW}Warning: Node.js 20 not found, using current version${NC}"
else
    echo -e "${YELLOW}nvm not found, using current Node version${NC}"
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}✓ Node version: $NODE_VERSION${NC}"
echo ""

# Step 2: Check MySQL connection
echo "[Step 2] Checking MySQL connection..."

# Load from .env.test if exists
if [ -f .env.test ]; then
    export $(cat .env.test | grep -v '^#' | xargs)
fi

DB_HOST=${DB_HOST:-127.0.0.1}
DB_PORT=${DB_PORT:-3306}
DB_USER=${DB_USER:-root}
DB_NAME=${DB_NAME:-playwright_test_user_sys}

if command -v mysql &> /dev/null; then
    if mysql -u "$DB_USER" -h "$DB_HOST" -P "$DB_PORT" -e "SELECT 1" &> /dev/null; then
        echo -e "${GREEN}✓ MySQL connection successful${NC}"
    else
        echo -e "${RED}✗ MySQL connection failed${NC}"
        echo "Please check:"
        echo "  - MySQL is running"
        echo "  - DB_HOST, DB_PORT, DB_USER are correct in .env.test"
        echo "  - DB_PASSWORD is set if required"
        exit 1
    fi
else
    echo -e "${RED}✗ MySQL client not found${NC}"
    echo "Please install MySQL client"
    exit 1
fi
echo ""

# Step 3: Create test database
echo "[Step 3] Creating test database..."
mysql -u "$DB_USER" -h "$DB_HOST" -P "$DB_PORT" <<EOF
DROP DATABASE IF EXISTS ${DB_NAME};
CREATE DATABASE ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EOF

echo -e "${GREEN}✓ Database '${DB_NAME}' created${NC}"
echo ""

# Step 4: Run migrations
echo "[Step 4] Running database migrations..."
if [ -f package.json ]; then
    if grep -q "\"migrate\"" package.json; then
        pnpm migrate
        echo -e "${GREEN}✓ Migrations completed${NC}"
    else
        echo -e "${YELLOW}Warning: No migrate script found in package.json${NC}"
    fi
else
    echo -e "${RED}✗ package.json not found${NC}"
    exit 1
fi
echo ""

# Step 5: Check Chrome installation
echo "[Step 5] Checking Chrome installation..."

CHROME_PATH=""

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    if [ -f "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
        CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    if command -v google-chrome &> /dev/null; then
        CHROME_PATH=$(which google-chrome)
    elif command -v chromium-browser &> /dev/null; then
        CHROME_PATH=$(which chromium-browser)
    fi
else
    # Windows (Git Bash)
    if [ -f "/c/Program Files/Google/Chrome/Application/chrome.exe" ]; then
        CHROME_PATH="/c/Program Files/Google/Chrome/Application/chrome.exe"
    fi
fi

if [ -n "$CHROME_PATH" ]; then
    echo -e "${GREEN}✓ Chrome found at: $CHROME_PATH${NC}"

    # Add to .env.test if not exists
    if [ -f .env.test ]; then
        if ! grep -q "CHROME_PATH" .env.test; then
            echo "CHROME_PATH=$CHROME_PATH" >> .env.test
            echo "Added CHROME_PATH to .env.test"
        fi
    fi
else
    echo -e "${YELLOW}Warning: Chrome not found${NC}"
    echo "Please install Chrome or set CHROME_PATH in .env.test:"
    echo "  macOS: /Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    echo "  Linux: /usr/bin/google-chrome"
fi
echo ""

# Step 6: Check port availability
echo "[Step 6] Checking port availability..."

PORT=${PORT:-3000}
GRPC_PORT=${GRPC_PORT:-50051}

check_port() {
    local port=$1
    if lsof -i :$port &> /dev/null; then
        echo -e "${YELLOW}Warning: Port $port is already in use${NC}"
        echo "  Process: $(lsof -i :$port | tail -n 1)"
        return 1
    else
        echo -e "${GREEN}✓ Port $port is available${NC}"
        return 0
    fi
}

check_port $PORT
check_port $GRPC_PORT
echo ""

# Step 7: Install dependencies
echo "[Step 7] Installing dependencies..."
if [ -f package.json ] && [ -f pnpm-lock.yaml ]; then
    pnpm install
    echo -e "${GREEN}✓ Dependencies installed${NC}"
elif [ -f package.json ] && [ -f package-lock.json ]; then
    npm install
    echo -e "${GREEN}✓ Dependencies installed${NC}"
else
    echo -e "${YELLOW}Warning: No package.json found${NC}"
fi
echo ""

# Summary
echo "================================"
echo "Setup Complete!"
echo "================================"
echo ""
echo "Environment Configuration:"
echo "  Node Version: $NODE_VERSION"
echo "  Database: $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"
if [ -n "$CHROME_PATH" ]; then
    echo "  Chrome: $CHROME_PATH"
fi
echo ""
echo "Next Steps:"
echo "  1. Update .env.test with your MySQL credentials if needed"
echo "  2. Run tests: pnpm test:unit tests/integration/"
echo ""
echo "For issues, see: .claude/skills/test-three-tier-architecture/references/troubleshooting.md"
