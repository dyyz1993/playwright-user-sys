# UI Testing Troubleshooting Guide

## Fixed Issues

### Issue #0: ffmpeg 依赖缺失（视频录制功能）

**Date:** 2025-12-30

**Symptoms:**
```
Error: browserContext.newPage: Executable doesn't exist at
/Users/xxx/Library/Caches/ms-playwright/ffmpeg-1011/ffmpeg-mac

╔═════════════════════════════════════════════════════════════════════════╗
║ Looks like Playwright Test or Playwright was just installed or updated. ║
║ Please run the following command to download new browsers:              ║
║                                                                         ║
║     npx playwright install                                              ║
║                                                                         ║
║ <3 Playwright Team                                                      ║
╚═════════════════════════════════════════════════════════════════════════╝
```

**Root Cause:**
ffmpeg 是 Playwright 用于视频录制功能的依赖，**仅用于测试失败时录制视频**。这不是业务逻辑验证所必需的。

在 CI/CD 环境或某些系统上，`npx playwright install` 可能无法执行或不可行。

**解决方案：禁用视频录制**

由于 ffmpeg 仅用于测试失败时的调试视频，可以安全地禁用此功能：

**方法 1：修改 playwright.config.ts**

```typescript
// playwright.ui.config.ts 或 playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  use: {
    // 禁用视频录制
    video: 'off',

    // 或者仅在失败时保留（需要 ffmpeg）
    // video: 'retain-on-failure',
  },
});
```

**方法 2：使用环境变量**

```bash
# 临时禁用视频录制
VIDEO=off pnpm test:ui
```

**方法 3：在配置中完全禁用 trace**

```typescript
export default defineConfig({
  use: {
    video: 'off',
    // 禁用 trace（trace 也需要 ffmpeg）
    trace: 'off',
  },
});
```

**验证：**
```bash
# 禁用视频后测试应正常运行
pnpm test:ui
# 结果: 8 passed (无 ffmpeg 错误)
```

**注意事项：**
- ❌ 禁用视频后，测试失败时将无法查看失败视频
- ✅ 其他功能（截图、trace）仍然可用
- ✅ 测试通过率不受影响
- ✅ 测试执行速度可能更快

---

### Issue #1: playwright.ui.config.ts Missing launchOptions

**Date:** 2025-12-29

**Symptoms:**
```
Error: browserType.launch: Executable doesn't exist at
~/Library/Caches/ms-playwright/chromium_headless_shell-1200/...
```

**Root Cause:**
`playwright.ui.config.ts` was missing the `launchOptions.executablePath` configuration to point to the local Chromium installation.

**Configuration File:** `playwright.ui.config.ts`

**Solution:**
Add `launchOptions` to the chromium project configuration:

```typescript
// Before (incorrect)
projects: [
  {
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      // Missing launchOptions!
    },
  },
]

// After (correct)
projects: [
  {
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      channel: undefined,
      launchOptions: {
        executablePath: '/Applications/Chromium.app/Contents/MacOS/Chromium',
      },
    },
  },
]
```

**Verification:**
```bash
pnpm test:ui:storage --grep "UI-001"
# Should pass: ✓ UI-001: 管理员登录 (4.0s)
```

---

### Issue #2: Strict Mode Violation in Locators

**Date:** 2025-12-29

**Symptoms:**
```
Error: strict mode violation: locator('text=仪表盘') resolved to 3 elements
```

**Root Cause:**
Playwright's strict mode (enabled by default) requires locators to resolve to exactly one element. When using `text=` selectors, multiple matches may exist (e.g., sidebar, mobile sidebar, page title).

**Test File:** `tests/ui/admin-storage-management.test.ts`

**Lines Affected:** 340-344

**Solution:**
Use `.first()` to select the first matching element:

```typescript
// Before (incorrect)
await expect(page.locator('text=仪表盘')).toBeVisible();
await expect(page.locator('text=用户管理')).toBeVisible();

// After (correct)
await expect(page.locator('text=仪表盘').first()).toBeVisible();
await expect(page.locator('text=用户管理').first()).toBeVisible();
```

**Alternative Solutions:**

1. **Use more specific selectors:**
```typescript
// Select within sidebar only
await expect(page.locator('#sidebar text=仪表盘').first()).toBeVisible();
```

2. **Use data-test attributes:**
```typescript
// HTML: <span data-test="sidebar-dashboard">仪表盘</span>
await expect(page.locator('[data-test="sidebar-dashboard"]')).toBeVisible();
```

3. **Disable strict mode (not recommended):**
```typescript
// In playwright.config.ts
use: {
  strict: false, // Not recommended
}
```

**Verification:**
```bash
pnpm test:ui:storage --grep "UI-001"
# Should pass without strict mode violation errors
```

---

## Fix #3: Test Data Isolation and Stability

**Date:** 2025-12-29

**Symptoms:**
Tests were flaky and unreliable:
- Dependent on existing database data
- Different results on each run
- No cleanup of test data
- Used vague assertions like `> 0` or `true`

**Root Cause:**
Tests were reading/writing existing database data without proper isolation:
```typescript
// Bad: Relying on existing data
const users = await storagePage.getUserStorageList();
expect(users.length).toBeGreaterThan(0);  // May pass or fail randomly
```

**Solution:**
Implemented complete test data lifecycle management:

1. **Data Preparation (beforeAll)**:
```typescript
test.beforeAll(async () => {
  const testTimestamp = Date.now();

  // Create 5 specific test users
  const testUsers = [
    { username: `ui_test_normal_${testTimestamp}`, sessions: 10 * 1024 * 1024 },
    { username: `ui_test_shared_${testTimestamp}`, sessions: 5 * 1024 * 1024, shared: 50 * 1024 * 1024 },
    // ... more users
  ];

  for (const userData of testUsers) {
    const userId = await db('users').insert({...});
    createdUserIds.push(userId);
  }
});
```

2. **Data Cleanup (afterAll)**:
```typescript
test.afterAll(async () => {
  // Delete all created test users
  for (const userId of createdUserIds) {
    await db('users').where('id', userId).delete();
    // Clean up file system
    fs.rmSync(`data/user-data/${userId}`, { recursive: true });
  }
});
```

3. **Specific Numeric Assertions**:
```typescript
// Before (vague)
expect(users.length).toBeGreaterThan(0);

// After (specific)
expect(users.length).toBeGreaterThanOrEqual(3);  // At least 3 users
expect(storageSize).toBeGreaterThanOrEqual(10 * 1024 * 1024);  // >= 10 MB
```

**Verification:**
```bash
npx playwright test --config=playwright.ui.config.ts tests/ui/admin-storage-management.test.ts
# Result: 8 passed consistently (44.3s)
# - Creates 5 test users before tests
# - Tests use specific numeric assertions
# - Cleans up all test data after completion
```

**Benefits:**
- ✅ Tests are completely self-contained
- ✅ Can run on empty database
- ✅ Consistent results every time
- ✅ No data pollution between runs

---

## Fix #4: Dynamic Imports for Database Dependencies

**Date:** 2025-12-29

**Symptoms:**
```
Error: Cannot access 'UserRole' before initialization
Error: Fastify dependency loaded during test setup
```

**Root Cause:**
Using static imports at module level caused Fastify to initialize during test file loading:
```typescript
// Bad: Static import at module level
import { db } from '../../src/config/database.js';
import { hashPassword } from '../../src/utils/auth.js';
// This tries to initialize database connection when test file loads
```

**Solution:**
Use dynamic imports inside test functions:
```typescript
// Good: Dynamic import inside beforeAll
test.beforeAll(async () => {
  const { db } = await import('../../src/config/database.js');
  const { hashPassword } = await import('../../src/utils/auth.js');

  // Now database only connects when test runs, not when test loads
  const userId = await db('users').insert({...});
});
```

**Verification:**
Tests now load without initializing Fastify or database connections prematurely.

---

## Common Error Patterns

### Pattern 1: Timeout Waiting for Element

**Error:**
```
Error: Timed out 10000ms waiting for expect(locator).toBeVisible()
```

**Possible Causes:**
1. Element doesn't exist (wrong selector)
2. Element is not visible (hidden by CSS)
3. Element hasn't loaded yet (need to wait)
4. Wrong page/URL (navigation issue)

**Debug Steps:**
```typescript
// 1. Take screenshot
await page.screenshot({ path: 'debug.png' });

// 2. Check if element exists at all
const count = await page.locator('text=Something').count();
console.log(`Found ${count} elements`);

// 3. Check page state
console.log(`Current URL: ${page.url()}`);
console.log(`Page title: ${await page.title()}`);

// 4. Wait longer
await expect(page.locator('text=Something').first()).toBeVisible({ timeout: 30000 });
```

**Fix Strategies:**
```typescript
// Wait for navigation first
await page.goto('/admin/storage');
await page.waitForLoadState('networkidle');
await page.waitForURL('**/storage');

// Wait for element to be ready
await page.waitForSelector('text=Storage Management', { state: 'attached' });
await expect(page.locator('text=Storage Management').first()).toBeVisible();
```

---

### Pattern 2: Flaky Tests (Sometimes Pass, Sometimes Fail)

**Common Causes:**

1. **Race condition with server startup**
   ```typescript
   // Bad: Assume server is ready
   await page.goto('/api/users');

   // Good: Wait for server
   await page.waitForURL('**/login');
   ```

2. **Timing issues with animations**
   ```typescript
   // Bad: Click immediately after showing
   await page.click('button');
   await page.click('.modal button');

   // Good: Wait for element to be ready
   await page.click('button');
   await page.waitForSelector('.modal button', { state: 'visible' });
   await page.click('.modal button');
   ```

3. **Network not idle**
   ```typescript
   // Bad: Navigate and immediately check
   await page.goto('/admin/users');
   const count = await page.locator('table tbody tr').count();

   // Good: Wait for network idle
   await page.goto('/admin/users', { waitUntil: 'networkidle' });
   const count = await page.locator('table tbody tr').count();
   ```

**General Solution:**
Use `test.step()` for better error messages:
```typescript
await test.step('Navigate to storage page', async () => {
  await storagePage.goto();
});

await test.step('Verify storage list loaded', async () => {
  await page.waitForSelector('table tbody tr');
  const rows = await storagePage.getUserStorageList();
  expect(rows.length).toBeGreaterThan(0);
});
```

---

### Pattern 3: Server Already Running

**Error:**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Cause:**
Playwright's `webServer` tries to start a server on port 3000, but one is already running.

**Solutions:**

1. **Kill existing server:**
```bash
pkill -f "tsx src/server.ts"
# or
lsof -ti:3000 | xargs kill -9
```

2. **Use different port:**
```bash
PORT=3001 pnpm test:ui
```

3. **Let Playwright reuse existing server:**
In `playwright.ui.config.ts`:
```typescript
webServer: {
  reuseExistingServer: true, // Allow reusing server
  // ...
}
```

---

### Pattern 4: Database Errors

**Error:**
```
Error: connect ECONNREFUSED 127.0.0.1:3306
Error: Unknown database 'playwright_test_user_sys'
```

**Solutions:**

1. **Check MySQL is running:**
```bash
# macOS
brew services list | grep mysql
brew services start mysql

# Linux
sudo systemctl status mysql
sudo systemctl start mysql
```

2. **Create test database:**
```bash
mysql -h 127.0.0.1 -u root -e "CREATE DATABASE IF NOT EXISTS playwright_test_user_sys;"
```

3. **Check connection string:**
In `.env.test`:
```
DB_TYPE=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=playwright_test_user_sys
DB_USER=root
DB_PASSWORD=<your_password>
```

---

## Debug Checklist

When tests fail, go through this checklist:

- [ ] Can I manually reproduce the issue?
  - Open browser and navigate to the page
  - Check if elements exist
  - Check network tab for errors

- [ ] Is the selector correct?
  - Use Playwright Inspector: `pnpm test:ui:debug`
  - Try selector in DevTools Console: `document.querySelectorAll('text=Something')`

- [ ] Is timing the issue?
  - Add explicit waits: `await page.waitForLoadState('networkidle')`
  - Increase timeout: `{ timeout: 30000 }`

- [ ] Is the server running?
  - Check `http://localhost:3000` in browser
  - Check server logs for errors

- [ ] Is the database accessible?
  - Run: `mysql -h 127.0.0.1 -u root -e "SHOW DATABASES;"`

- [ ] Are there console errors?
  - Check Playwright trace file
  - Check browser console in headed mode

---

## Quick Fixes

### Fix 1: Disable Headless for Debugging

```bash
# Run with visible browser
pnpm test:ui:headed

# Or set in config
use: {
  headless: false,
}
```

### Fix 2: Slow Down Tests

```typescript
// Add delay between actions
use: {
  actionTimeout: 10 * 1000,  // Increase from default
}

// Or add explicit delays
await page.waitForTimeout(1000); // For debugging only
```

### Fix 3: Ignore HTTPS Errors

```typescript
// Already configured, but if needed:
use: {
  ignoreHTTPSErrors: true,
}
```

### Fix 4: Use Base URL

```typescript
// Instead of
await page.goto('http://localhost:3000/admin');

// Use baseURL (configured in playwright config)
await page.goto('/admin');
```

---

## Getting Help

When stuck, provide this information:

1. **Test output** (full error message)
2. **Screenshot** (if any)
3. **Trace file**:
   ```bash
   npx playwright show-trace test-results/trace.zip
   ```
4. **Test code** (the failing test)
5. **Configuration** (playwright config)

### Useful Commands

```bash
# List all tests
npx playwright test --config=playwright.ui.config.ts --list

# Dry run (show what would run)
npx playwright test --config=playwright.ui.config.ts --dry-run

# Run specific file
npx playwright test --config=playwright.ui.config.ts tests/ui/admin-storage-management.test.ts

# Run with debug logs
DEBUG=pw:api pnpm test:ui
```
