# Environment Setup Guide

This guide provides detailed steps for setting up the test environment for three-tier architecture integration tests.

## Prerequisites

- Node.js 20 (use nvm)
- MySQL 5.7+ or 8.0+
- Chrome browser (for Playwright)

## Step 1: Switch to Node.js 20

```bash
nvm use 20
```

If nvm is not available, the tests will use your current Node version, but Node.js 20+ is recommended.

## Step 2: Configure Test Database

### Option A: Use Existing MySQL Server

Set environment variables in `.env.test`:

```bash
NODE_ENV=test
DB_TYPE=mysql
DB_NAME=playwright_test_user_sys
DB_HOST=REDACTED_INTERNAL_HOST
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
```

### Option B: Use Local MySQL

```bash
NODE_ENV=test
DB_TYPE=mysql
DB_NAME=playwright_test_user_sys
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
```

## Step 3: Port Configuration

The test suite uses dynamic port allocation to avoid conflicts. However, you can specify default ports in your environment:

```bash
# Manager Server
PORT=3000
GRPC_PORT=50051

# Machine services use dynamic ports by default
# See getFreePort() helper in tests/helpers/ports.ts
```

## Step 4: Chrome Path Configuration

Set the Chrome path in `.env.test`:

```bash
# macOS
CHROME_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome

# Linux
CHROME_PATH=/usr/bin/google-chrome

# Windows
CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

## Step 5: Database Initialization (Automated)

The `beforeAll` hook in your test file will automatically:

1. Drop the test database if it exists
2. Create a fresh database with proper encoding
3. Run all migrations

```typescript
// This is done automatically in beforeAll
await adminDb.raw(`DROP DATABASE IF EXISTS ${process.env.DB_NAME}`);
await adminDb.raw(`CREATE DATABASE ${process.env.DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
await initDatabase();
await runMigrations();
```

## Step 6: Manual Database Setup (Optional)

If you need to manually set up the database:

```bash
# Create database
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS playwright_test_user_sys CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Run migrations
pnpm migrate
```

## Step 7: Install Dependencies

```bash
pnpm install
```

## Step 8: Verify Environment

Run the setup script to verify your environment:

```bash
bash .claude/skills/test-three-tier-architecture/scripts/setup-test-env.sh
```

This script will check:
- Node.js version
- MySQL connection
- Chrome installation
- Port availability

## Step 9: Run Test

```bash
# Run all integration tests
pnpm test:unit tests/integration/

# Run specific test file
pnpm test:unit tests/integration/three-tier-template.test.ts
```

## Environment Variables Reference

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| NODE_ENV | Environment mode | test | Yes |
| DB_TYPE | Database type | mysql | Yes |
| DB_NAME | Database name | playwright_test_user_sys | Yes |
| DB_HOST | MySQL host | 127.0.0.1 | Yes |
| DB_PORT | MySQL port | 3306 | Yes |
| DB_USER | MySQL user | root | Yes |
| DB_PASSWORD | MySQL password | (empty) | No |
| PORT | Manager HTTP port | 3000 | No |
| GRPC_PORT | Manager gRPC port | 50051 | No |
| CHROME_PATH | Chrome executable path | auto-detect | No |

## Troubleshooting

### MySQL Connection Failed

```bash
# Check MySQL is running
mysql -u root -p -e "SELECT 1"

# Check credentials
mysql -u root -p -h 127.0.0.1 -P 3306 -e "SHOW DATABASES"
```

### Port Already in Use

The test suite uses `getFreePort()` to find available ports dynamically. If you still encounter port conflicts:

```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>
```

### Chrome Not Found

```bash
# Find Chrome path
which google-chrome

# macOS
ls "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# Set in .env.test
echo "CHROME_PATH=/path/to/chrome" >> .env.test
```

## Automated Setup Script

Use the provided script for automated setup:

```bash
bash .claude/skills/test-three-tier-architecture/scripts/setup-test-env.sh
```

This script will:
1. Check Node.js version
2. Verify MySQL connection
3. Create test database
4. Run migrations
5. Verify Chrome installation
6. Report any issues
