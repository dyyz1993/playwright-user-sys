# UI Test Examples

This directory contains ready-to-use test templates and examples.

## Templates

### 1. Basic Test Template

**File**: `basic-ui-test.template.ts`

A minimal UI test template with data preparation and cleanup:
- Creates test users with timestamps
- Cleans up all test data
- Uses specific numeric assertions

**Usage**:
```bash
cp examples/basic-ui-test.template.ts tests/ui/my-feature.test.ts
# Edit the test file and run:
pnpm test:ui tests/ui/my-feature.test.ts
```

### 2. Page Object Template

**File**: `page-object.template.ts`

Page Object Model pattern for maintainable UI tests.

### 3. Test Data Template

**File**: `test-data-manager.template.ts`

Helper functions for creating and cleaning up test data.

## Examples

### Storage Management Test

**Reference**: `../../tests/ui/admin-storage-management.test.ts`

A complete example with 8 test cases:
- Data preparation (5 test users)
- Specific numeric assertions
- Complete cleanup
- All tests passing (44.3s)

## Test Data Examples

### User Data Structure

```typescript
// Normal user
{
  username: `ui_test_normal_${timestamp}`,
  sessions: 10 * 1024 * 1024,  // 10 MB
  shared: 0
}

// User with shared data
{
  username: `ui_test_shared_${timestamp}`,
  sessions: 5 * 1024 * 1024,   // 5 MB
  shared: 50 * 1024 * 1024    // 50 MB
}

// User with exceeded storage
{
  username: `ui_test_exceeded_${timestamp}`,
  sessions: 200 * 1024 * 1024, // 200 MB
  shared: 0
}
```

### Assertion Examples

```typescript
// Count assertions
expect(users.length).toBeGreaterThanOrEqual(3);
expect(tableRows.count()).toBe(20);

// Size assertions
expect(storageSize).toBeGreaterThanOrEqual(10 * 1024 * 1024);
expect(freedSpace).toBe(50 * 1024 * 1024);

// State assertions
expect(status).toBe('正常');
expect(element).toHaveClass('bg-red-50');
```
