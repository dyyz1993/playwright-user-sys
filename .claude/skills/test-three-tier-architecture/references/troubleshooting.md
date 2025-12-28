# Troubleshooting Guide

This guide helps you diagnose and resolve common issues when running three-tier architecture integration tests.

## Common Issues

### Issue 1: Port Conflicts

**Symptoms:**
```
Error: listen EADDRINUSE: address already in use :::3000
Error: Port 50051 is already in use
```

**Solutions:**

1. **Find and kill the process:**
```bash
# Find process using the port
lsof -i :3000
lsof -i :50051

# Kill the process
kill -9 <PID>

# Or kill all Node processes
killall node
```

2. **Use dynamic ports:**
```typescript
// The test suite should use getFreePort()
import { getFreePort } from '../helpers/ports.js';

const managerHttpPort = await getFreePort();
const managerGrpcPort = await getFreePort();
```

3. **Check for zombie processes:**
```bash
# Find all Node processes
ps aux | grep node

# Kill zombie test processes
pkill -f "vitest"
pkill -f "node.*test"
```

---

### Issue 2: Chrome Not Found

**Symptoms:**
```
Error: Executable doesn't exist at /path/to/chrome
Error: Chrome not found at specified path
```

**Solutions:**

1. **Find Chrome installation:**
```bash
# macOS
ls "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# Linux
which google-chrome
which chromium-browser

# Windows
where chrome.exe
```

2. **Set CHROME_PATH in .env.test:**
```bash
# macOS
CHROME_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome

# Linux
CHROME_PATH=/usr/bin/google-chrome

# Windows
CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

3. **Install Chrome if missing:**
```bash
# macOS
brew install --cask google-chrome

# Ubuntu/Debian
sudo apt-get install -y chromium-browser

# Fedora
sudo dnf install chromium
```

4. **Use Playwright's Chrome:**
```typescript
// Alternative: Use Playwright bundled Chrome
const chromePath = (await import('playwright-core')).executablePath();
```

---

### Issue 3: Machine Registration Timeout

**Symptoms:**
```
Error: Test timeout - machines not registered
Expected: >= 2 machines online
Received: 0 machines online
```

**Solutions:**

1. **Increase wait time:**
```typescript
// In beforeAll, after starting machines
await new Promise(resolve => setTimeout(resolve, 5000)); // Increase from 3000
```

2. **Check gRPC connection:**
```bash
# Verify gRPC server is running
lsof -i :50051

# Check machine logs
tail -f /tmp/playwright-test-data/machine.log
```

3. **Verify machine configuration:**
```typescript
const machineConfig = {
  managerHost: `127.0.0.1:${managerGrpcPort}`, // Ensure correct
  grpcPort,
  heartbeatInterval: 30000,     // Check interval
  disconnectionTimeout: 10000,  // Timeout threshold
};
```

4. **Check database:**
```typescript
// Query machine registration status
const machines = await MachineModel.findAll();
console.log('Machines:', machines.items);

// Check if machines are marked as online
const onlineMachines = machines.items.filter(m => m.status === 'online');
console.log('Online machines:', onlineMachines.length);
```

---

### Issue 4: Database Connection Failures

**Symptoms:**
```
Error: connect ECONNREFUSED 127.0.0.1:3306
Error: Access denied for user 'root'@'localhost'
Error: Database 'playwright_test_user_sys' doesn't exist
```

**Solutions:**

1. **Verify MySQL is running:**
```bash
# Check MySQL status
sudo systemctl status mysql

# Start MySQL if not running
sudo systemctl start mysql

# macOS
brew services start mysql
```

2. **Test MySQL connection:**
```bash
mysql -u root -p -h 127.0.0.1 -P 3306 -e "SELECT 1"
```

3. **Verify credentials in .env.test:**
```bash
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
```

4. **Create database manually:**
```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS playwright_test_user_sys CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

5. **Check firewall:**
```bash
# Ensure MySQL port is not blocked
sudo ufw allow 3306
```

---

### Issue 5: Test Timeouts

**Symptoms:**
```
Error: Test timeout of 60000ms exceeded
Error: beforeEach timeout
Error: beforeAll timeout
```

**Solutions:**

1. **Increase timeout:**
```typescript
it('TIER-XXX: Test name', { timeout: 120000 }, async () => {
  // 120 seconds instead of 60
});

beforeAll(async () => {
  // setup
}, 300000); // 5 minutes instead of 3
```

2. **Add debug logging:**
```typescript
beforeAll(async () => {
  console.log('[Setup] Step 1: Switching Node version...');
  await step1();

  console.log('[Setup] Step 2: Creating database...');
  await step2();

  console.log('[Setup] Step 3: Starting manager...');
  await step3();
}, 300000);
```

3. **Check for infinite loops:**
```typescript
// Add timeout to promises
await Promise.race([
  someAsyncOperation(),
  new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 30000))
]);
```

---

### Issue 6: Zombie Chrome Processes

**Symptoms:**
```
Error: Failed to connect to Chrome
Error: WebSocket connection closed
Multiple Chrome processes running
```

**Solutions:**

1. **Kill all Chrome processes:**
```bash
# macOS
killall "Google Chrome"
killall chrome

# Linux
pkill chrome
killall chromium-browser

# Find and kill
ps aux | grep chrome
kill -9 <PID>
```

2. **Clean up user data directory:**
```bash
# Remove test Chrome data
rm -rf /tmp/playwright-test-data
rm -rf /tmp/playwright-test-temp

# Recreate
mkdir -p /tmp/playwright-test-data
mkdir -p /tmp/playwright-test-temp
```

3. **Ensure proper cleanup in afterAll:**
```typescript
afterAll(async () => {
  // Disconnect all browsers
  for (const browser of browsers) {
    if (browser.isConnected()) {
      await browser.disconnect();
    }
  }

  // Stop all machine servers
  for (const machine of machineServers) {
    await machine.server.stop();
  }
}, 60000);
```

---

### Issue 7: Module Import Errors

**Symptoms:**
```
Error: Cannot find module '@/models/user'
Error: Unknown file extension ".ts"
Error: export field is not defined
```

**Solutions:**

1. **Use .js extensions in imports:**
```typescript
// ❌ Wrong
import { UserModel } from '../../models/user';

// ✅ Correct
import { UserModel } from '../../models/user.js';
```

2. **Check tsconfig.json paths:**
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

3. **Verify build output:**
```bash
# Build TypeScript
pnpm build

# Check if files exist
ls -la dist/models/user.js
```

---

### Issue 8: gRPC Connection Failures

**Symptoms:**
```
Error: 14 UNAVAILABLE: Connect failed
Error: gRPC server not responding
Error: Machine heartbeat failed
```

**Solutions:**

1. **Verify gRPC server is running:**
```bash
# Check gRPC port
lsof -i :50051

# Check manager logs
tail -f logs/manager.log
```

2. **Check machine configuration:**
```typescript
const machineConfig = {
  managerHost: `127.0.0.1:${managerGrpcPort}`, // Must match manager's gRPC port
  grpcPort: machineGrpcPort, // Machine's own gRPC port
};
```

3. **Verify firewall:**
```bash
# Ensure gRPC port is not blocked
sudo ufw allow 50051
```

4. **Add debug logging:**
```typescript
machineServer.on('error', (error) => {
  console.error('[Machine Error]', error);
});

machineServer.on('connected', () => {
  console.log('[Machine] Connected to manager');
});
```

---

## Debug Mode

### Enable Verbose Logging

```typescript
// In test file
process.env.LOG_LEVEL = 'debug';
process.env.DEBUG = 'playwright-test:*';
```

### Add Breakpoints

```typescript
it('TIER-XXX: Debug test', async () => {
  debugger; // Pause execution
  const result = await someFunction();
  console.log('Result:', result);
});
```

### Inspect Database State

```typescript
// Add debugging queries
const users = await db('users').select('*');
console.log('Users:', users);

const sessions = await db('sessions').select('*');
console.log('Sessions:', sessions);
```

---

## Getting Help

If you're still stuck:

1. **Check logs:**
```bash
tail -f logs/manager.log
tail -f logs/machine.log
tail -f logs/test.log
```

2. **Run with debug flag:**
```bash
pnpm test:unit tests/integration/ --debug
```

3. **Check documentation:**
- [Complete specification](../../../docs/tests/三端集成测试规范.md)
- [Environment setup](setup-guide.md)
- [Test patterns](test-patterns.md)

4. **Review template:**
```bash
cat tests/integration/three-tier-template.test.ts
```

---

## Prevention Tips

1. **Always use dynamic ports** with `getFreePort()`
2. **Always clean up in afterAll** - stop servers, close connections
3. **Always reset data in beforeEach** - clear tables, reset credits
4. **Always use specific values** in assertions - no true/false/0/1
5. **Always wait for async operations** - use timeouts, promises
6. **Always check Chrome path** in .env.test before running
7. **Always verify MySQL is running** before starting tests
8. **Always kill zombie processes** after failed tests
