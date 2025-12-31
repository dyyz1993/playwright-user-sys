---
name: run-ui-tests
description: Guide for Playwright UI automation testing. Use when testing admin backend UI, storage management, or any visual regression testing. Enforces test data isolation and specific numeric assertions.
allowed-tools: "Read,Write,Edit,Bash(pnpm*),Bash(npx*),Grep,Glob,Task(Explore)"
---

# Playwright UI Automation Testing

## Quick Start

```bash
# Run storage management UI tests (8 tests)
pnpm test:ui:storage

# Run specific test
pnpm test:ui --grep "UI-001"

# Debug mode
pnpm test:ui:debug
```

## Test Structure

| File | Test Cases | Description |
|------|-----------|-------------|
| admin-storage-management.test.ts | 8 | Storage management UI |

## Key Constraints (Required)

### 1. Test Data Isolation (MUST)

Every test MUST prepare and clean up its own data:

```typescript
test.beforeAll(async () => {
  // Create test data with timestamp
  const testTimestamp = Date.now();
  const userId = await db('users').insert({
    username: `test_user_${testTimestamp}`,
  });
  createdUserIds.push(userId);
});

test.afterAll(async () => {
  // Clean up all test data
  for (const userId of createdUserIds) {
    await db('users').where('id', userId).delete();
  }
});
```

**❌ FORBIDDEN:**
- Don't rely on existing database data
- Don't skip cleanup (`test.afterAll`)
- Don't use hardcoded user IDs

### 2. Specific Numeric Assertions (MUST)

All assertions MUST use specific values, NOT true/false/0/1:

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

### 3. Dynamic Imports (REQUIRED)

Use dynamic imports to avoid premature dependency loading:

```typescript
// ✅ CORRECT
test.beforeAll(async () => {
  const { db } = await import('../../src/config/database.js');
  const { hashPassword } = await import('../../src/utils/auth.js');
});

// ❌ WRONG
import { db } from '../../src/config/database.js';  // At module level
```

## Test Numbering

| ID Range | Type | Description |
|----------|------|-------------|
| UI-001 ~ UI-010 | Core Functions | Login, page access, basic operations |
| UI-011 ~ UI-020 | CRUD Operations | Create, read, update, delete |
| UI-021 ~ UI-030 | Bulk Operations | Batch actions, multi-select |
| UI-031 ~ UI-040 | Validation | Form validation, error handling |
| UI-041 ~ UI-050 | Responsive Design | Mobile, tablet, desktop layouts |
| UI-051 ~ UI-060 | Search & Filter | Filtering, sorting, pagination |

## Configuration Files

- **playwright.ui.config.ts**: UI test configuration (uses local Chromium)
- **playwright.config.ts**: E2E test configuration

## Quick Reference

- [Test patterns](references/test-patterns.md) - Common test patterns
- [Troubleshooting](references/troubleshooting.md) - Common issues and fixes (including ffmpeg solution)
- [Data management](references/test-data-management.md) - Test data lifecycle
- [Code templates](examples/) - Ready-to-use test templates

## Common Issues

| Issue | Solution | Link |
|-------|----------|------|
| ffmpeg 依赖缺失 | 在配置中设置 `video: 'off'` | [troubleshooting.md#issue-0](references/troubleshooting.md#issue-0-ffmpeg-依赖缺失视频录制功能) |
| Strict mode violation | 使用 `.first()` 选择元素 | [troubleshooting.md#issue-2](references/troubleshooting.md#issue-2-strict-mode-violation-in-locators) |
| 测试不稳定 | 实现完整的测试数据隔离 | [troubleshooting.md#fix-3](references/troubleshooting.md#fix-3-test-data-isolation-and-stability) |
