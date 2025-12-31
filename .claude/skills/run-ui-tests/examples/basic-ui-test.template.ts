/**
 * Basic UI Test Template
 *
 * Instructions:
 * 1. Copy this file to tests/ui/your-feature.test.ts
 * 2. Update the test metadata (name, ID range)
 * 3. Replace placeholder data with your test data
 * 4. Run: pnpm test:ui tests/ui/your-feature.test.ts
 */

import { test, expect } from '@playwright/test';

// ==================== Test Configuration ====================

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: 'REDACTED_ADMIN_PASS',
};

// ==================== Test Data Management ====================

/**
 * Test data setup - prepares consistent test data before running tests
 */
async function prepareTestData() {
  console.log('========================================');
  console.log('准备测试数据');
  console.log('========================================');

  const testTimestamp = Date.now();
  const createdUserIds: number[] = [];

  // Dynamic import to avoid premature dependency loading
  const { db } = await import('../../src/config/database.js');
  const { hashPassword } = await import('../../src/utils/auth.js');

  // Create test users with specific data
  const testUsers = [
    {
      username: `ui_test_user1_${testTimestamp}`,
      sessions: 10 * 1024 * 1024,  // 10 MB
      shared: 0,
    },
    {
      username: `ui_test_user2_${testTimestamp}`,
      sessions: 5 * 1024 * 1024,   // 5 MB
      shared: 50 * 1024 * 1024,   // 50 MB
    },
    {
      username: `ui_test_user3_${testTimestamp}`,
      sessions: 0,
      shared: 15 * 1024 * 1024,  // 15 MB
    },
  ];

  for (const userData of testUsers) {
    const userId = await db('users').insert({
      username: userData.username,
      password: await hashPassword('TestPassword123'),
      role: 'user',
      status: 'active',
      credits: 10000,
    });
    createdUserIds.push(userId);

    // Create storage data if needed
    if (userData.sessions > 0) {
      // Create sessions storage data
      await createUserStorageData(userId, 'sessions', userData.sessions);
    }
    if (userData.shared > 0) {
      // Create shared storage data
      await createUserStorageData(userId, 'shared', userData.shared);
    }

    console.log(`   ✅ 创建测试用户: ${userData.username} (ID: ${userId})`);
  }

  console.log(`✅ 测试数据准备完成: ${testUsers.length} 个用户`);
  console.log('========================================\n');

  return { testTimestamp, createdUserIds };
}

/**
 * Test data cleanup - removes all created test data
 */
async function cleanupTestData(createdUserIds: number[]) {
  console.log('\n========================================');
  console.log('清理测试数据');
  console.log('========================================');

  const { db } = await import('../../src/config/database.js');
  const fs = await import('fs');
  const path = await import('path');

  for (const userId of createdUserIds) {
    await db('users').where('id', userId).delete();

    // Clean up file system data
    const userDataDir = path.join(process.cwd(), 'data/user-data', userId.toString());
    if (fs.existsSync(userDataDir)) {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }

    console.log(`   ✅ 删除测试用户 ID: ${userId}`);
  }

  console.log(`✅ 测试数据清理完成: 删除 ${createdUserIds.length} 个用户`);
  console.log('========================================\n');
}

/**
 * Helper function to create user storage data
 */
async function createUserStorageData(userId: number, type: string, size: number) {
  // Implement storage data creation logic
  // This is a placeholder - adapt to your actual storage implementation
  console.log(`   ✅ 为用户 ${userId} 创建 ${type} 数据: ${(size / 1024 / 1024).toFixed(2)} MB`);
}

// ==================== Page Object Model ====================

/**
 * Example Page Object - adapt to your actual page
 */
class ExamplePage {
  constructor(private page: any) {}

  async goto() {
    await this.page.goto(`${BASE_URL}/admin/example`);
    await this.page.waitForLoadState('networkidle');
  }

  async getItemCount() {
    return await this.page.locator('table tbody tr').count();
  }

  async takeScreenshot(filename: string) {
    await this.page.screenshot({
      path: `tests/screenshots/${filename}`,
      fullPage: true,
    });
  }
}

// ==================== Test Suite ====================

test.describe.configure({ mode: 'serial' });

test.describe('Your Feature UI Tests', () => {
  const createdUserIds: number[] = [];

  test.beforeAll(async () => {
    const result = await prepareTestData();
    createdUserIds.push(...result.createdUserIds);
  });

  test.afterAll(async () => {
    await cleanupTestData(createdUserIds);
  });

  /**
   * UI-XXX: Test description
   *
   * Testing requirement:
   * - Verify specific behavior with specific numeric assertions
   * - Use >= 3, >= 10 MB instead of > 0 or true/false
   */
  test('UI-XXX: Should do something specific', async ({ page }) => {
    // Arrange
    const examplePage = new ExamplePage(page);
    await examplePage.goto();

    // Act
    const itemCount = await examplePage.getItemCount();

    // Assert - Use specific numeric assertions
    expect(itemCount).toBeGreaterThanOrEqual(3);  // ✅ Specific: >= 3
    // NOT: expect(itemCount).toBeGreaterThan(0);  // ❌ Too vague

    // Take screenshot for documentation
    await examplePage.takeScreenshot('ui-xxx-example.png');
  });
});
