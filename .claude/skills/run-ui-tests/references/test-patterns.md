# Playwright UI Test Patterns

Common patterns and reusable code snippets for Playwright UI testing.

## Table of Contents

1. [Page Navigation](#1-page-navigation)
2. [Form Interactions](#2-form-interactions)
3. [Table Operations](#3-table-operations)
4. [Modal/Dialog Handling](#4-modaldialog-handling)
5. [Waiting Strategies](#5-waiting-strategies)
6. [Assertion Patterns](#6-assertion-patterns)
7. [Screenshot Patterns](#7-screenshot-patterns)

---

## 1. Page Navigation

### Navigate and Wait

```typescript
// ✅ GOOD: Wait for network idle
await page.goto('/admin/storage', { waitUntil: 'networkidle' });

// ✅ GOOD: Wait for specific URL
await page.goto('/admin/users');
await page.waitForURL('**/admin/users', { timeout: 10000 });

// ❌ BAD: Fixed timeout (unreliable)
await page.goto('/admin/storage');
await page.waitForTimeout(3000);
```

### Navigate and Verify Title

```typescript
await page.goto('/admin/storage');
await page.waitForLoadState('networkidle');

const title = await page.title();
expect(title).toContain('存储管理');
```

---

## 2. Form Interactions

### Fill Form

```typescript
// Fill multiple fields
await page.fill('input[name="username"]', 'testuser');
await page.fill('input[name="email"]', 'test@example.com');
await page.fill('textarea[name="description"]', 'Test description');
await page.selectOption('select[name="role"]', 'user');

// Submit form
await page.click('button[type="submit"]');
```

### Fill and Verify

```typescript
// Fill login form
await page.goto('/admin/login');
await page.fill('input[name="username"]', 'admin');
await page.fill('input[name="password"]', 'REDACTED_ADMIN_PASS');
await page.click('button[type="submit"]');

// Verify redirect
await page.waitForURL('**/admin');
expect(page.url()).toContain('/admin');
```

---

## 3. Table Operations

### Get Table Rows

```typescript
// Get all rows
const rows = await page.locator('table tbody tr').all();
console.log(`Found ${rows.length} rows`);

// Assert row count
expect(rows.length).toBeGreaterThanOrEqual(3);  // ✅ Specific
```

### Find Row by Text

```typescript
// Find row containing specific text
const row = await page.locator('table tbody tr:has-text("admin")').first();
const exists = await row.count() > 0;

if (exists) {
  // Get cell values
  const username = await row.locator('td:nth-child(1)').textContent();
  const email = await row.locator('td:nth-child(2)').textContent();

  console.log(`User: ${username}, Email: ${email}`);
}
```

### Click Button in Row

```typescript
// Find row and click button
const row = await page.locator('table tbody tr:has-text("admin")').first();
const editButton = row.locator('button:has-text("编辑")').first();
await editButton.click();
```

### Count Checkboxes

```typescript
// Count checked checkboxes
const checkedCount = await page.locator('input[type="checkbox"]:checked').count();
expect(checkedCount).toBe(2);  // Exactly 2 checked
```

---

## 4. Modal/Dialog Handling

### Wait for Modal

```typescript
// Wait for modal to appear
await page.waitForSelector('.modal, .dialog, [role="dialog"]', {
  state: 'visible',
  timeout: 5000
});

// Verify modal is visible
const modal = page.locator('.modal');
await expect(modal).toBeVisible();
```

### Confirm Dialog

```typescript
// Click confirm button (handles multiple button text options)
const confirmButton = page.locator(
  'button:has-text("确认"), button:has-text("确定"), button:has-text("OK")'
).first();
await confirmButton.click();

// Wait for modal to close
await page.waitForSelector('.modal', { state: 'hidden', timeout: 5000 }).catch(() => {});
```

### Cancel Dialog

```typescript
// Click cancel button
const cancelButton = page.locator(
  'button:has-text("取消"), button:has-text("Cancel")'
).first();
await cancelButton.click();

// Verify modal closed
await expect(page.locator('.modal')).not.toBeVisible();
```

---

## 5. Waiting Strategies

### Wait for Element

```typescript
// Wait for element to be visible
await page.waitForSelector('.loading', { state: 'hidden', timeout: 10000 });

// Wait for element to be attached
await page.waitForSelector('.data-loaded', { state: 'attached' });

// Wait with timeout
await page.waitForSelector('.result', { timeout: 30000 });
```

### Wait for URL

```typescript
// Wait for URL pattern
await page.waitForURL('**/admin/users');

// Wait for specific URL
await page.waitForURL('http://localhost:3000/admin/storage');

// Wait with function
await page.waitForURL(url => url.includes('dashboard'));
```

### Wait for Load State

```typescript
// Wait for network idle (all requests finished)
await page.waitForLoadState('networkidle');

// Wait for DOM content loaded
await page.waitForLoadState('domcontentloaded');

// Wait for full page load
await page.waitForLoadState('load');
```

---

## 6. Assertion Patterns

### Text Assertions

```typescript
// Contains text
await expect(page.locator('body')).toContainText('成功');

// Exact text
await expect(page.locator('h1')).toHaveText('存储管理');

// Using first() to avoid strict mode violation
await expect(page.locator('text=仪表盘').first()).toBeVisible();
```

### Attribute Assertions

```typescript
// Check class
await expect(page.locator('.status')).toHaveClass('bg-green-100');

// Check attribute value
await expect(page.locator('input[name="username"]')).toHaveValue('admin');

// Check element count
const count = await page.locator('table tbody tr').count();
expect(count).toBeGreaterThanOrEqual(3);  // ✅ Specific numeric
```

### Visibility Assertions

```typescript
// Element visible
await expect(page.locator('.button')).toBeVisible();

// Element hidden
await expect(page.locator('.loading')).toBeHidden();

// Element attached (in DOM)
await expect(page.locator('.modal')).toBeAttached();
```

### Numeric Assertions (Specific Values)

```typescript
// ✅ CORRECT: Specific numeric assertions
expect(userCount).toBeGreaterThanOrEqual(3);
expect(storageSize).toBeGreaterThanOrEqual(10 * 1024 * 1024);  // >= 10 MB
expect(freedSpace).toBe(50 * 1024 * 1024);  // Exactly 50 MB

// ❌ WRONG: Vague assertions
expect(userCount).toBeGreaterThan(0);
expect(result).toBeTruthy();
expect(array.length).toBe(1);
```

---

## 7. Screenshot Patterns

### Full Page Screenshot

```typescript
await page.screenshot({
  path: 'test-results/screenshots/storage-page.png',
  fullPage: true,
});
```

### Element Screenshot

```typescript
await page.locator('.modal').screenshot({
  path: 'test-results/screenshots/modal.png',
});
```

### Screenshot on Failure

```typescript
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === 'failed') {
    await page.screenshot({
      path: `test-results/screenshots/${testInfo.title}.png`,
      fullPage: true,
    });
  }
});
```

### Named Screenshots

```typescript
async function saveScreenshot(page: any, filename: string) {
  const filepath = `tests/screenshots/${filename}`;
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`   📸 截图已保存: ${filepath}`);
}

// Usage
await saveScreenshot(page, 'ui-001-admin-dashboard.png');
```

---

## Common Patterns Summary

| Pattern | Description | Example |
|---------|-------------|---------|
| **Navigate** | Goto + wait | `await page.goto(url, { waitUntil: 'networkidle' })` |
| **Fill** | Fill + submit | `await page.fill(input, value)` |
| **Table** | Find row + extract | `await page.locator('tr:has-text("x")')` |
| **Modal** | Wait + click confirm | `await page.waitForSelector('.modal')` |
| **Wait** | Wait for condition | `await page.waitForSelector('.done')` |
| **Assert** | Specific numeric values | `expect(count).toBeGreaterThanOrEqual(3)` |
| **Screenshot** | Full page or element | `await page.screenshot({ path })` |
