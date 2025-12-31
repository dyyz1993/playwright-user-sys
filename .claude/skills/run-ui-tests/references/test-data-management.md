# Test Data Management

Complete guide to managing test data lifecycle for stable, repeatable UI tests.

## Core Principles

### 1. Complete Isolation

Each test suite must be self-contained and work on an empty database:

```typescript
test.beforeAll(async () => {
  // ✅ DO: Create your own test data
  const testTimestamp = Date.now();
  const userId = await createUser({
    username: `test_${testTimestamp}`,
  });
});

test.afterAll(async () => {
  // ✅ DO: Clean up all created data
  await deleteUser(userId);
  await cleanupFileSystem(userId);
});
```

**❌ DON'T:**
- Rely on existing database data
- Skip cleanup to "save time"
- Use hardcoded IDs (like userId: 1)

### 2. Timestamp Uniqueness

Always use timestamps or UUIDs for unique test data:

```typescript
// ✅ CORRECT
const testTimestamp = Date.now();
const username = `test_user_${testTimestamp}_${Math.random().toString(36)}`;

// ✅ CORRECT (with UUID)
import { v4 as uuidv4 } from 'uuid';
const username = `test_user_${uuidv4()}`;

// ❌ WRONG
const username = 'test_user';  // Will conflict on second run
```

### 3. Dynamic Imports

Use dynamic imports to avoid premature dependency loading:

```typescript
// ✅ CORRECT
test.beforeAll(async () => {
  const { db } = await import('../../src/config/database.js');
  const { hashPassword } = await import('../../src/utils/auth.js');
});

// ❌ WRONG (at top of file)
import { db } from '../../src/config/database.js';
// This causes Fastify/database to load when test file is parsed
```

## Complete Example

### Data Preparation

```typescript
test.beforeAll(async () => {
  console.log('========================================');
  console.log('准备测试数据');
  console.log('========================================');

  const testTimestamp = Date.now();
  const createdUserIds: number[] = [];

  // Dynamic imports
  const { db } = await import('../../src/config/database.js');
  const { hashPassword } = await import('../../src/utils/auth.js');

  // Define test users with specific data
  const testUsers = [
    { username: `ui_test_normal_${testTimestamp}`, sessions: 10 * 1024 * 1024 },
    { username: `ui_test_shared_${testTimestamp}`, sessions: 5 * 1024 * 1024, shared: 50 * 1024 * 1024 },
    { username: `ui_test_exceeded_${testTimestamp}`, sessions: 200 * 1024 * 1024 },
  ];

  // Create users and storage data
  for (const userData of testUsers) {
    const userId = await db('users').insert({
      username: userData.username,
      password: await hashPassword('TestPassword123'),
      role: 'user',
      status: 'active',
      credits: 10000,
    });
    createdUserIds.push(userId);

    // Create storage data
    if (userData.sessions > 0) {
      await createStorageData(userId, 'sessions', userData.sessions);
    }
    if (userData.shared > 0) {
      await createStorageData(userId, 'shared', userData.shared);
    }

    console.log(`   ✅ 创建用户: ${userData.username} (ID: ${userId})`);
  }

  console.log(`✅ 准备完成: ${testUsers.length} 个用户`);
  console.log('========================================\n');

  return createdUserIds;
});
```

### Data Cleanup

```typescript
test.afterAll(async () => {
  console.log('\n========================================');
  console.log('清理测试数据');
  console.log('========================================');

  const { db } = await import('../../src/config/database.js');
  const fs = await import('fs');
  const path = await import('path');

  // Delete users from database
  for (const userId of createdUserIds) {
    await db('users').where('id', userId).delete();
    console.log(`   ✅ 删除用户 ID: ${userId}`);

    // Clean up file system
    const userDataDir = path.join(process.cwd(), 'data/user-data', userId.toString());
    if (fs.existsSync(userDataDir)) {
      fs.rmSync(userDataDir, { recursive: true, force: true });
      console.log(`   ✅ 清理目录: ${userDataDir}`);
    }
  }

  console.log(`✅ 清理完成: ${createdUserIds.length} 个用户`);
  console.log('========================================\n');
});
```

## Test Data Templates

### Normal User

```typescript
{
  username: `ui_test_normal_${timestamp}`,
  sessions: 10 * 1024 * 1024,  // 10 MB
  shared: 0,
  credits: 10000,
  role: 'user',
  status: 'active'
}
```

### User with Shared Data

```typescript
{
  username: `ui_test_shared_${timestamp}`,
  sessions: 5 * 1024 * 1024,    // 5 MB
  shared: 50 * 1024 * 1024,    // 50 MB
  credits: 10000,
  role: 'user',
  status: 'active'
}
```

### User with Exceeded Storage

```typescript
{
  username: `ui_test_exceeded_${timestamp}`,
  sessions: 200 * 1024 * 1024,  // 200 MB (for testing large storage)
  shared: 0,
  credits: 10000,
  role: 'user',
  status: 'active'
}
```

### Batch Test Users

```typescript
const batchUsers = [
  { username: `ui_test_batch1_${timestamp}`, shared: 15 * 1024 * 1024 },
  { username: `ui_test_batch2_${timestamp}`, shared: 20 * 1024 * 1024 },
  { username: `ui_test_batch3_${timestamp}`, shared: 25 * 1024 * 1024 },
];
```

## Helper Functions

### Create User with Storage

```typescript
async function createUserWithStorage(data: any) {
  const { db } = await import('../../src/config/database.js');
  const { hashPassword } = await import('../../src/utils/auth.js');

  const userId = await db('users').insert({
    username: data.username,
    password: await hashPassword(data.password || 'TestPassword123'),
    role: data.role || 'user',
    status: data.status || 'active',
    credits: data.credits || 10000,
  });

  // Create storage data
  if (data.sessions) {
    await createStorageData(userId, 'sessions', data.sessions);
  }
  if (data.shared) {
    await createStorageData(userId, 'shared', data.shared);
  }

  return userId;
}
```

### Create Storage Data

```typescript
async function createStorageData(userId: number, type: string, size: number) {
  const fs = await import('fs');
  const path = await import('path');

  const storageDir = path.join(process.cwd(), 'data/user-data', userId.toString(), type);

  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  // Create dummy file to simulate storage
  const testFile = path.join(storageDir, 'test.dat');
  fs.writeFileSync(testFile, Buffer.alloc(size));
}
```

### Cleanup All Test Data

```typescript
async function cleanupAllTestData(userIds: number[]) {
  const { db } = await import('../../src/config/database.js');
  const fs = await import('fs');
  const path = await import('path');

  for (const userId of userIds) {
    // Delete from database
    await db('users').where('id', userId).delete();

    // Delete file system data
    const userDataDir = path.join(process.cwd(), 'data/user-data', userId.toString());
    if (fs.existsSync(userDataDir)) {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  }
}
```

## Best Practices Summary

| ✅ DO | ❌ DON'T |
|-------|----------|
| Create data in `beforeAll` | Rely on existing data |
| Clean up in `afterAll` | Skip cleanup |
| Use timestamps for uniqueness | Use hardcoded names |
| Use specific numeric assertions | Use true/false/0/1 |
| Use dynamic imports | Use static imports at module level |
| Make tests self-contained | Share state between tests |
| Prepare 3-5 test users | Test with only 1 user |
