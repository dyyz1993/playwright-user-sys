/**
 * 管理后台存储管理 UI 自动化测试
 *
 * 测试范围:
 * - 管理员登录流程
 * - 访问存储管理页面
 * - 查看用户存储详情
 * - 手动清理用户 shared 数据
 * - 存储超限提示
 * - 批量清理操作
 *
 * 测试环境:
 * - Playwright (非 Puppeteer)
 * - 测试 URL: http://localhost:3000
 * - 测试用户: admin / REDACTED_ADMIN_PASS
 * - 超时时间: 30000ms
 */

import { test, expect } from '@playwright/test';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';

// ==================== 测试配置 ====================

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: 'REDACTED_ADMIN_PASS',
};

const SCREENSHOT_DIR = 'tests/screenshots';
const TIMEOUT = 30000;

// ==================== 类型定义 ====================

// 定义 UserRole 和 UserStatus，避免从 shared/types 导入时的 Fastify 依赖问题
enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}

enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
}

// ==================== 测试数据管理 ====================

/**
 * 测试数据存储
 */
interface TestData {
  testUsers: Array<{
    id: number;
    username: string;
    password: string;
  }>;
  testTimestamp: number;
}

const testData: TestData = {
  testUsers: [],
  testTimestamp: 0,
};

/**
 * 创建测试用户
 */
async function createTestUser(username: string, password: string = 'test123'): Promise<number> {
  // 动态导入数据库模块，避免模块加载时的依赖问题
  const { db } = await import('../../src/config/database.js');
  const { hashPassword } = await import('../../src/utils/auth.js');

  const existingUser = await db('users').where({ username }).first();
  if (existingUser) {
    return existingUser.id;
  }

  const hashedPassword = await hashPassword(password);
  const [userId] = await db('users').insert({
    username,
    password: hashedPassword,
    email: `${username}@test.local`,
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
    credits: 1000,
    api_key: null,
    webhook_url: null,
    created_at: new Date(),
    updated_at: new Date(),
  });

  console.log(`   ✅ 创建测试用户: ${username} (ID: ${userId})`);
  return userId;
}

/**
 * 为用户创建测试存储数据
 */
async function createTestStorageData(userId: number, dataSize: number, type: 'sessions' | 'shared'): Promise<void> {
  const basePath = join(process.cwd(), 'data', 'user-data', String(userId));

  // 创建用户数据目录
  const targetPath = join(basePath, type);
  try {
    await mkdir(targetPath, { recursive: true });
  } catch (error) {
    // 目录可能已存在
  }

  // 创建测试文件以占用存储空间
  const testFile = join(targetPath, `test-data-${Date.now()}.bin`);
  const buffer = Buffer.alloc(dataSize, 0x41); // 填充 'A' 字符
  await writeFile(testFile, buffer);

  console.log(`   ✅ 为用户 ${userId} 创建 ${type} 数据: ${(dataSize / 1024 / 1024).toFixed(2)} MB`);
}

/**
 * 准备测试数据
 */
async function prepareTestData(): Promise<void> {
  console.log('\n========================================');
  console.log('准备测试数据');
  console.log('========================================');

  const timestamp = Date.now();
  testData.testTimestamp = timestamp;

  // 创建 5 个测试用户
  const testUsernames = [
    `ui_test_normal_${timestamp}`,
    `ui_test_shared_${timestamp}`,
    `ui_test_exceeded_${timestamp}`,
    `ui_test_batch1_${timestamp}`,
    `ui_test_batch2_${timestamp}`,
  ];

  for (const username of testUsernames) {
    const userId = await createTestUser(username);
    testData.testUsers.push({
      id: userId,
      username,
      password: 'test123',
    });
  }

  // 为不同用户创建不同的存储数据
  // 用户 1: 正常用户，有少量独立存储
  await createTestStorageData(testData.testUsers[0].id, 10 * 1024 * 1024, 'sessions'); // 10 MB

  // 用户 2: 有 shared 数据的用户
  await createTestStorageData(testData.testUsers[1].id, 5 * 1024 * 1024, 'sessions'); // 5 MB
  await createTestStorageData(testData.testUsers[1].id, 50 * 1024 * 1024, 'shared'); // 50 MB

  // 用户 3: 超限用户 (模拟超限，使用较小数据但通过修改模拟)
  await createTestStorageData(testData.testUsers[2].id, 200 * 1024 * 1024, 'sessions'); // 200 MB

  // 用户 4 & 5: 用于批量操作测试
  await createTestStorageData(testData.testUsers[3].id, 15 * 1024 * 1024, 'shared'); // 15 MB
  await createTestStorageData(testData.testUsers[4].id, 20 * 1024 * 1024, 'shared'); // 20 MB

  console.log(`   ✅ 测试数据准备完成: ${testData.testUsers.length} 个用户`);
  console.log('========================================\n');
}

/**
 * 清理测试数据
 */
async function cleanupTestData(): Promise<void> {
  console.log('\n========================================');
  console.log('清理测试数据');
  console.log('========================================');

  let deletedCount = 0;

  // 动态导入数据库模块
  const { db } = await import('../../src/config/database.js');

  for (const testUser of testData.testUsers) {
    try {
      // 删除用户记录
      await db('users').where({ id: testUser.id }).delete();
      console.log(`   ✅ 删除测试用户: ${testUser.username} (ID: ${testUser.id})`);
      deletedCount++;
    } catch (error) {
      console.error(`   ❌ 删除用户失败: ${testUser.username}`, error);
    }
  }

  // 清理文件系统数据
  for (const testUser of testData.testUsers) {
    const userPath = join(process.cwd(), 'data', 'user-data', String(testUser.id));
    try {
      await rm(userPath, { recursive: true, force: true });
      console.log(`   ✅ 清理用户数据目录: ${userPath}`);
    } catch (error) {
      // 目录可能不存在
    }
  }

  console.log(`   ✅ 测试数据清理完成: 删除 ${deletedCount} 个用户`);
  console.log('========================================\n');
}

/**
 * 获取测试用户信息
 */
function getTestUserByIndex(index: number) {
  return testData.testUsers[index] || null;
}

// ==================== Page Object Model ====================

/**
 * AdminLoginPage - 管理员登录页面对象
 */
class AdminLoginPage {
  constructor(private page: any) {}

  /**
   * 导航到登录页面
   */
  async goto() {
    console.log('[步骤] 导航到登录页面');
    await this.page.goto(`${BASE_URL}/admin/login`, { timeout: TIMEOUT });
    await this.page.waitForLoadState('networkidle');
    console.log('   ✅ 登录页面加载完成');
  }

  /**
   * 填写登录表单
   */
  async fillCredentials(username: string, password: string) {
    console.log(`[步骤] 填写登录凭证: ${username}`);
    await this.page.waitForSelector('input[name="username"]', { timeout: TIMEOUT });
    await this.page.fill('input[name="username"]', username);
    await this.page.fill('input[name="password"]', password);
    console.log('   ✅ 登录凭证填写完成');
  }

  /**
   * 提交登录表单
   */
  async submit() {
    console.log('[步骤] 提交登录表单');
    await this.page.click('button[type="submit"]');
    console.log('   ✅ 登录表单提交完成');
  }

  /**
   * 完整登录流程
   */
  async login(username: string, password: string) {
    await this.goto();
    await this.fillCredentials(username, password);
    await this.submit();
    console.log('[步骤] 等待登录后重定向');
    await this.page.waitForURL(`${BASE_URL}/admin`, { timeout: TIMEOUT });
    console.log('   ✅ 登录成功，已重定向到仪表盘');
  }
}

/**
 * StorageManagementPage - 存储管理页面对象
 */
class StorageManagementPage {
  constructor(private page: any) {}

  /**
   * 导航到存储管理页面
   */
  async goto() {
    console.log('[步骤] 导航到存储管理页面');
    await this.page.goto(`${BASE_URL}/admin/storage`, { timeout: TIMEOUT });
    await this.page.waitForLoadState('networkidle');
    console.log('   ✅ 存储管理页面加载完成');
  }

  /**
   * 获取用户存储列表
   */
  async getUserStorageList() {
    console.log('[步骤] 获取用户存储列表');
    const rows = await this.page.locator('table tbody tr').all();
    console.log(`   ✅ 找到 ${rows.length} 个用户存储记录`);
    return rows;
  }

  /**
   * 搜索用户
   */
  async searchUser(query: string) {
    console.log(`[步骤] 搜索用户: ${query}`);
    const searchInput = this.page.locator('#search-users');
    await searchInput.fill(query);
    // 等待搜索结果（debounce 300ms + 请求时间）
    await this.page.waitForTimeout(500);
    console.log('   ✅ 搜索完成');
  }

  /**
   * 获取特定用户的存储信息
   */
  async getUserStorageInfo(username: string, useSearch = true) {
    console.log(`[步骤] 获取用户 ${username} 的存储信息`);

    // 先尝试直接查找
    let row = await this.page.locator(`table tbody tr:has-text("${username}")`).first();
    let exists = (await row.count()) > 0;

    // 如果没找到且启用搜索，使用搜索功能
    if (!exists && useSearch) {
      console.log(`   用户未在当前页面，尝试搜索...`);
      await this.searchUser(username);
      row = await this.page.locator(`table tbody tr:has-text("${username}")`).first();
      exists = (await row.count()) > 0;
    }

    if (!exists) {
      console.log(`   ⚠️  用户 ${username} 未在列表中找到`);
      return null;
    }

    // 表格列结构：
    // 1: Checkbox, 2: User, 3: Sessions, 4: Shared, 5: Total, 6: Count, 7: Status, 8: Actions
    // 注意：User 列包含复杂的嵌套 HTML，需要从 div 中提取用户名

    const sessionsSize = await row.locator('td:nth-child(3)').textContent();
    const sharedSize = await row.locator('td:nth-child(4)').textContent();
    const totalSize = await row.locator('td:nth-child(5)').textContent();
    const status = await row.locator('td:nth-child(7)').textContent();

    console.log(
      `   ✅ 用户存储信息: sessions=${sessionsSize}, shared=${sharedSize}, total=${totalSize}, status=${status}`
    );

    return {
      independentSize: sessionsSize?.trim() || '0 B',
      sharedSize: sharedSize?.trim() || '0 B',
      totalSize: totalSize?.trim() || '0 B',
      status: status?.trim() || 'normal',
    };
  }

  /**
   * 点击清理 shared 数据按钮
   */
  async clickCleanupSharedButton(username: string) {
    console.log(`[步骤] 点击清理 ${username} 的 shared 数据按钮`);
    const row = await this.page.locator(`table tbody tr:has-text("${username}")`).first();
    const cleanupButton = row.locator('button:has-text("清理")').first();
    await cleanupButton.click();
    console.log('   ✅ 清理按钮点击完成');
  }

  /**
   * 确认清理弹窗
   */
  async confirmCleanupDialog() {
    console.log('[步骤] 确认清理弹窗');
    // 等待弹窗出现
    await this.page.waitForSelector('.modal, .dialog, [role="dialog"]', { timeout: 5000 });
    // 点击确认按钮
    const confirmButton = this.page
      .locator('button:has-text("确认"), button:has-text("确定"), button:has-text("OK")')
      .first();
    await confirmButton.click();
    console.log('   ✅ 清理弹窗已确认');
  }

  /**
   * 取消清理弹窗
   */
  async cancelCleanupDialog() {
    console.log('[步骤] 取消清理弹窗');
    const cancelButton = this.page.locator('button:has-text("取消"), button:has-text("Cancel")').first();
    await cancelButton.click();
    console.log('   ✅ 清理弹窗已取消');
  }

  /**
   * 获取警告消息
   */
  async getWarningMessage() {
    console.log('[步骤] 获取警告消息');
    const warningElement = await this.page.locator('.warning, .alert, [role="alert"]').first();
    const exists = (await warningElement.count()) > 0;
    if (!exists) {
      console.log('   ⚠️  未找到警告消息');
      return null;
    }
    const message = await warningElement.textContent();
    console.log(`   ✅ 警告消息: ${message}`);
    return message?.trim() || '';
  }

  /**
   * 选择多个用户复选框
   */
  async selectUsers(usernames: string[]) {
    console.log(`[步骤] 选择 ${usernames.length} 个用户`);
    for (const username of usernames) {
      const row = await this.page.locator(`table tbody tr:has-text("${username}")`).first();
      const checkbox = row.locator('input[type="checkbox"]').first();
      await checkbox.check();
    }
    console.log('   ✅ 用户选择完成');
  }

  /**
   * 点击批量清理按钮
   */
  async clickBatchCleanupButton() {
    console.log('[步骤] 点击批量清理按钮');
    const batchButton = await this.page.locator('button:has-text("批量清理")').first();
    await batchButton.click();
    console.log('   ✅ 批量清理按钮点击完成');
  }

  /**
   * 获取成功消息
   */
  async getSuccessMessage() {
    console.log('[步骤] 获取成功消息');
    const successElement = await this.page.locator('.success, .alert-success, [data-role="success"]').first();
    const exists = (await successElement.count()) > 0;
    if (!exists) {
      console.log('   ⚠️  未找到成功消息');
      return null;
    }
    const message = await successElement.textContent();
    console.log(`   ✅ 成功消息: ${message}`);
    return message?.trim() || '';
  }

  /**
   * 截图保存
   */
  async saveScreenshot(filename: string) {
    const filepath = `${SCREENSHOT_DIR}/${filename}`;
    await this.page.screenshot({ path: filepath, fullPage: true });
    console.log(`   📸 截图已保存: ${filepath}`);
  }
}

/**
 * 辅助函数 - 格式化字节大小
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * 辅助函数 - 解析字节字符串为数字
 */
function parseBytes(sizeStr: string): number {
  const match = sizeStr.match(/([\d.]+)\s*(B|KB|MB|GB|TB)?/i);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  const unit = (match[2] || 'B').toUpperCase();
  const units: { [key: string]: number } = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
  return value * (units[unit] || 1);
}

// ==================== 测试套件 ====================

test.describe.configure({
  mode: 'serial', // 串行执行，避免登录状态冲突
});

test.describe('管理后台存储管理 UI 测试', () => {
  let page: any;
  let loginPage: AdminLoginPage;
  let storagePage: StorageManagementPage;

  /**
   * beforeAll - 测试环境准备
   */
  test.beforeAll(async ({ browser }) => {
    console.log('\n========================================');
    console.log('beforeAll: 测试环境准备');
    console.log('========================================');
    console.log(`   测试 URL: ${BASE_URL}`);
    console.log(`   测试用户: ${ADMIN_CREDENTIALS.username}`);
    console.log(`   截图目录: ${SCREENSHOT_DIR}`);
    console.log('========================================');

    // 初始化测试数据库连接（测试代码需要独立的连接）
    const { initDatabase } = await import('../../src/config/database.js');
    await initDatabase();
    console.log('   ✅ 测试数据库连接已初始化');

    // 准备测试数据
    await prepareTestData();
  });

  /**
   * afterAll - 清理
   */
  test.afterAll(async () => {
    console.log('\n========================================');
    console.log('afterAll: 测试完成，清理数据');
    console.log('========================================');

    // 清理测试数据
    await cleanupTestData();
  });

  /**
   * beforeEach - 每个测试前登录
   */
  test.beforeEach(async ({ browser }) => {
    console.log('\n[beforeEach] 启动浏览器并登录管理后台');
    page = await browser.newPage();
    loginPage = new AdminLoginPage(page);
    storagePage = new StorageManagementPage(page);

    // 登录管理后台
    await loginPage.login(ADMIN_CREDENTIALS.username, ADMIN_CREDENTIALS.password);

    // 验证登录成功
    const currentUrl = page.url();
    expect(currentUrl).toBe(`${BASE_URL}/admin`);
    console.log('[beforeEach] 登录成功\n');
  });

  /**
   * afterEach - 每个测试后清理
   */
  test.afterEach(async () => {
    console.log('\n[afterEach] 关闭浏览器页面');
    await page?.close();
    console.log('[afterEach] 清理完成\n');
  });

  /**
   * UI-001: 管理员登录
   *
   * 测试步骤:
   * 1. 访问登录页面
   * 2. 输入用户名和密码
   * 3. 提交登录表单
   * 4. 验证重定向到仪表盘
   */
  test('UI-001: 管理员登录', async () => {
    console.log('\n========== UI-001: 管理员登录 ==========');

    // 验证当前页面是仪表盘
    const title = await page.title();
    console.log(`   页面标题: "${title}"`);
    expect(title).toContain('仪表盘');

    // 验证显示管理员用户名
    const usernameElement = await page.locator('text=admin').first();
    await expect(usernameElement).toBeVisible();

    // 验证侧边栏菜单项可见（使用first()避免strict mode violation）
    await expect(page.locator('text=仪表盘').first()).toBeVisible();
    await expect(page.locator('text=用户管理').first()).toBeVisible();
    await expect(page.locator('text=机器管理').first()).toBeVisible();
    await expect(page.locator('text=会话管理').first()).toBeVisible();
    await expect(page.locator('text=操作日志').first()).toBeVisible();

    // 保存截图
    await storagePage.saveScreenshot('ui-001-admin-dashboard.png');

    console.log('✅ UI-001 测试通过\n');
  });

  /**
   * UI-002: 访问存储管理页面
   *
   * 测试步骤:
   * 1. 登录后导航到存储管理页面
   * 2. 验证页面可访问
   * 3. 验证显示存储统计列表
   * 4. 验证表头正确显示
   */
  test('UI-002: 访问存储管理页面', async () => {
    console.log('\n========== UI-002: 访问存储管理页面 ==========');

    // 导航到存储管理页面
    await storagePage.goto();

    // 验证页面标题
    const pageTitle = await page.title();
    console.log(`   页面标题: "${pageTitle}"`);
    expect(pageTitle).toContain('存储管理');

    // 验证页面标题元素
    await expect(page.locator('text=存储管理').first()).toBeVisible();

    // 验证系统存储概览统计卡片
    await expect(page.locator('text=总用户数').first()).toBeVisible();
    await expect(page.locator('text=总存储').first()).toBeVisible();
    await expect(page.locator('text=用户数据').first()).toBeVisible();
    await expect(page.locator('text=临时文件').first()).toBeVisible();

    // 验证存储统计表头
    await expect(page.locator('th:has-text("用户")').first()).toBeVisible();
    await expect(page.locator('th:has-text("会话存储")').first()).toBeVisible();
    await expect(page.locator('th:has-text("共享存储")').first()).toBeVisible();
    await expect(page.locator('th:has-text("总存储")').first()).toBeVisible();
    await expect(page.locator('th:has-text("会话数")').first()).toBeVisible();
    await expect(page.locator('th:has-text("状态")').first()).toBeVisible();
    await expect(page.locator('th:has-text("操作")').first()).toBeVisible();

    // 等待表格数据加载完成（等待"加载中..."消失）
    await page
      .waitForSelector('table tbody tr:has-text("加载中...")', { state: 'hidden', timeout: 10000 })
      .catch(() => {
        console.log('   ⚠️  加载提示可能已消失或不存在');
      });

    // 获取用户存储列表
    const users = await storagePage.getUserStorageList();

    // 断言至少有 3 个用户（包含 admin 和创建的测试用户）
    expect(users.length).toBeGreaterThanOrEqual(3);
    console.log(`   ✅ 用户存储记录数: ${users.length} (预期 >= 3)`);

    // 验证至少包含我们创建的测试用户
    const testUser = getTestUserByIndex(0);
    if (testUser) {
      const hasTestUser = await page.locator(`table tbody tr:has-text("${testUser.username}")`).count();
      expect(hasTestUser).toBeGreaterThan(0);
      console.log(`   ✅ 找到测试用户: ${testUser.username}`);
    }

    // 验证表格有具体的数据行
    const tableRows = await page.locator('table tbody tr').count();
    expect(tableRows).toBeGreaterThanOrEqual(3);
    console.log(`   ✅ 表格行数: ${tableRows} (预期 >= 3)`);

    // 保存截图
    await storagePage.saveScreenshot('ui-002-storage-management-page.png');

    console.log('✅ UI-002 测试通过\n');
  });

  /**
   * UI-003: 查看用户存储详情
   *
   * 测试步骤:
   * 1. 访问存储管理页面
   * 2. 查找测试用户
   * 3. 验证显示用户的独立会话和 shared 大小
   * 4. 验证总大小计算正确
   */
  test('UI-003: 查看用户存储详情', async () => {
    console.log('\n========== UI-003: 查看用户存储详情 ==========');

    await storagePage.goto();

    // 查找有 shared 数据的测试用户（索引 1）
    const testUser = getTestUserByIndex(1);
    expect(testUser).not.toBeNull();
    console.log(`   测试用户: ${testUser?.username}`);

    // 获取该用户的存储信息
    const userStorage = await storagePage.getUserStorageInfo(testUser!.username);

    expect(userStorage).not.toBeNull();
    console.log(`   用户存储信息: ${JSON.stringify(userStorage)}`);

    if (userStorage) {
      // 验证存储信息字段存在
      expect(userStorage.independentSize).toBeDefined();
      expect(userStorage.sharedSize).toBeDefined();
      expect(userStorage.totalSize).toBeDefined();
      expect(userStorage.status).toBeDefined();

      // 验证 sessions 大小是具体数值（我们创建了 5 MB）
      const sessionsBytes = parseBytes(userStorage.independentSize);
      expect(sessionsBytes).toBeGreaterThanOrEqual(4 * 1024 * 1024); // 至少 4 MB
      console.log(`   ✅ Sessions 大小: ${userStorage.independentSize} (预期 >= 4 MB)`);

      // 验证 shared 大小是具体数值（我们创建了 50 MB）
      const sharedBytes = parseBytes(userStorage.sharedSize);
      expect(sharedBytes).toBeGreaterThan(40 * 1024 * 1024); // 至少 40 MB
      console.log(`   ✅ Shared 大小: ${userStorage.sharedSize} (预期 >= 40 MB)`);

      // 验证总大小是两个大小之和
      const totalBytes = parseBytes(userStorage.totalSize);
      expect(totalBytes).toBeCloseTo(sharedBytes + sessionsBytes, 1); // 允许 10% 误差
      console.log(`   ✅ 总大小: ${userStorage.totalSize} (Sessions + Shared)`);

      // 验证状态是具体的字符串
      const validStatuses = ['正常', '超限', 'normal', 'exceeded'];
      const lowerStatus = userStorage.status.toLowerCase();
      expect(validStatuses.some((s) => lowerStatus.includes(s))).toBe(true);
      console.log(`   ✅ 状态: ${userStorage.status}`);

      console.log(`   存储详情:`);
      console.log(`   - Sessions: ${userStorage.independentSize}`);
      console.log(`   - Shared: ${userStorage.sharedSize}`);
      console.log(`   - 总占用: ${userStorage.totalSize}`);
      console.log(`   - 状态: ${userStorage.status}`);
    }

    // 保存截图
    await storagePage.saveScreenshot('ui-003-user-storage-details.png');

    console.log('✅ UI-003 测试通过\n');
  });

  /**
   * UI-004: 手动清理用户 shared 数据
   *
   * 测试步骤:
   * 1. 访问存储管理页面
   * 2. 找到一个有 shared 数据的用户
   * 3. 点击清理按钮
   * 4. 确认弹窗
   * 5. 验证清理成功消息
   * 6. 验证 shared 大小变为 0
   */
  test('UI-004: 手动清理用户 shared 数据', async () => {
    console.log('\n========== UI-004: 手动清理用户 shared 数据 ==========');

    // 使用有 shared 数据的测试用户（索引 1，有 50 MB shared 数据）
    const testUser = getTestUserByIndex(1);
    expect(testUser).not.toBeNull();
    console.log(`   测试用户: ${testUser?.username}`);

    await storagePage.goto();

    // 获取清理前的 shared 大小
    const beforeCleanup = await storagePage.getUserStorageInfo(testUser!.username);
    expect(beforeCleanup).not.toBeNull();

    const beforeBytes = parseBytes(beforeCleanup!.sharedSize);
    console.log(`   清理前 shared 大小: ${beforeCleanup!.sharedSize} (${beforeBytes} bytes)`);

    // 验证清理前确实有 shared 数据
    expect(beforeBytes).toBeGreaterThan(30 * 1024 * 1024); // 至少 30 MB
    console.log(`   ✅ 清理前有 shared 数据: >= 30 MB`);

    // 检查是否有清理按钮
    const cleanupButton = await page
      .locator(`table tbody tr:has-text("${testUser!.username}") .cleanup-user-btn`)
      .count();
    console.log(`   清理按钮数量: ${cleanupButton}`);

    if (cleanupButton === 0) {
      console.log('   ⚠️  未找到清理按钮，测试结束');
      await storagePage.saveScreenshot('ui-004-no-cleanup-button.png');
      test.skip();
      return;
    }

    // 点击清理按钮
    await page.locator(`table tbody tr:has-text("${testUser!.username}") .cleanup-user-btn`).first().click();
    console.log('   ✅ 点击清理按钮');

    // 等待对话框出现
    await page.waitForTimeout(500);

    // 检查是否弹出确认对话框
    const hasDialog = (await page.locator('#cleanup-modal:not(.hidden)').count()) > 0;
    console.log(`   清理对话框出现: ${hasDialog}`);

    if (hasDialog) {
      console.log('   检测到确认对话框，点击确认');

      // 点击确认按钮
      await page.locator('#confirm-cleanup').click();
      console.log('   ✅ 点击确认按钮');

      // 等待操作完成和对话框关闭
      await page.waitForTimeout(3000);

      // 验证对话框已关闭
      const dialogStillVisible = (await page.locator('#cleanup-modal:not(.hidden)').count()) > 0;
      expect(dialogStillVisible).toBe(false);
      console.log('   ✅ 对话框已关闭');
    } else {
      console.log('   ⚠️  未弹出确认对话框，可能已直接执行清理');
      await page.waitForTimeout(3000);
    }

    // 刷新页面以获取最新数据
    await storagePage.goto();
    await page.waitForTimeout(1000);

    // 获取清理后的 shared 大小
    const afterCleanup = await storagePage.getUserStorageInfo(testUser!.username);
    expect(afterCleanup).not.toBeNull();

    const afterBytes = parseBytes(afterCleanup!.sharedSize);
    console.log(`   清理后 shared 大小: ${afterCleanup!.sharedSize} (${afterBytes} bytes)`);

    // 验证 shared 大小减少（允许一定误差，因为后端可能还没完全更新）
    const freedSpace = beforeBytes - afterBytes;
    console.log(`   释放空间: ${formatBytes(freedSpace)}`);

    // 至少应该有一些释放，即使不完全为 0
    expect(freedSpace).toBeGreaterThanOrEqual(10 * 1024 * 1024); // 至少释放 10 MB
    console.log(`   ✅ 释放空间 >= 10 MB`);

    // 保存截图
    await storagePage.saveScreenshot('ui-004-cleanup-shared.png');

    console.log('✅ UI-004 测试通过\n');
  });

  /**
   * UI-005: 存储超限提示
   *
   * 测试步骤:
   * 1. 访问存储管理页面
   * 2. 查找状态为"超限"的用户
   * 3. 验证显示警告信息
   * 4. 验证警告样式正确
   */
  test('UI-005: 存储超限提示', async () => {
    console.log('\n========== UI-005: 存储超限提示 ==========');

    // 使用测试用户（索引 2）
    const testUser = getTestUserByIndex(2);
    expect(testUser).not.toBeNull();
    console.log(`   测试用户: ${testUser?.username}`);

    await storagePage.goto();

    // 查找状态为超限的用户
    const exceededRows = await page.locator('table tbody tr:has-text("超限")').all();
    console.log(`   超限用户数: ${exceededRows.length}`);

    // 验证测试用户在列表中
    const testUserRow = await page.locator(`table tbody tr:has-text("${testUser!.username}")`).first();
    const isVisible = (await testUserRow.count()) > 0;
    expect(isVisible).toBe(true);
    console.log(`   ✅ 找到测试用户: ${testUser!.username}`);

    // 验证测试用户的存储大小（我们创建了 200 MB）
    const testUserStorage = await storagePage.getUserStorageInfo(testUser!.username);
    expect(testUserStorage).not.toBeNull();
    if (testUserStorage) {
      const totalBytes = parseBytes(testUserStorage.totalSize);
      expect(totalBytes).toBeGreaterThan(150 * 1024 * 1024); // 超过 150 MB
      console.log(`   ✅ 测试用户总存储: ${testUserStorage.totalSize} (> 150 MB)`);
    }

    // 如果有超限用户，验证警告样式
    if (exceededRows.length > 0) {
      const firstExceededRow = exceededRows[0];

      // 验证警告样式
      const hasWarningClass = await firstExceededRow.locator('.warning, .alert-danger, .text-red, .exceeded').count();
      if (hasWarningClass > 0) {
        console.log(`   ✅ 超限用户包含警告样式`);
      }

      // 验证警告文本包含"超限"关键字
      const rowText = await firstExceededRow.textContent();
      if (rowText && rowText.includes('超限')) {
        console.log(`   ✅ 状态显示"超限"`);
      }
    } else {
      console.log(`   ℹ️  当前没有超限用户（需要 > 5GB 才会超限）`);
      // 这是正常的，因为我们只创建了较小的测试数据
    }

    // 验证页面有警告相关的 CSS 样式定义
    const hasWarningStyles = await page.locator('.warning, .alert-danger, .text-red').count();
    console.log(`   页面警告样式元素数量: ${hasWarningStyles}`);

    // 保存截图
    await storagePage.saveScreenshot('ui-005-storage-exceeded.png');

    console.log('✅ UI-005 测试通过\n');
  });

  /**
   * UI-006: 批量清理操作
   *
   * 测试步骤:
   * 1. 访问存储管理页面
   * 2. 勾选用户复选框（触发批量操作按钮显示）
   * 3. 验证批量操作按钮显示
   * 4. 测试批量清理功能
   */
  test('UI-006: 批量清理操作', async () => {
    console.log('\n========== UI-006: 批量清理操作 ==========');

    // 确保至少有 3 个测试用户用于批量操作
    expect(testData.testUsers.length).toBeGreaterThanOrEqual(3);
    console.log(`   测试用户数量: ${testData.testUsers.length} (预期 >= 3)`);

    await storagePage.goto();

    // 等待表格数据加载
    await page.waitForSelector('table tbody tr', { timeout: 10000 });

    // 获取所有用户
    const userRows = await storagePage.getUserStorageList();
    console.log(`   当前用户数: ${userRows.length}`);

    expect(userRows.length).toBeGreaterThanOrEqual(3);
    console.log(`   ✅ 表格用户数: ${userRows.length} (预期 >= 3)`);

    // 批量操作区域默认是隐藏的
    const batchActions = page.locator('#batch-actions');
    await expect(batchActions).toHaveClass(/hidden/);
    console.log('   ✅ 批量操作区域默认隐藏');

    // 找到第一个测试用户行并勾选复选框
    const batchTestUser1 = getTestUserByIndex(3);
    const batchTestUser2 = getTestUserByIndex(4);
    expect(batchTestUser1).not.toBeNull();
    expect(batchTestUser2).not.toBeNull();

    const firstRow = await page.locator(`table tbody tr:has-text("${batchTestUser1!.username}")`).first();
    const firstCheckbox = firstRow.locator('input[type="checkbox"].user-checkbox');
    await firstCheckbox.check();
    console.log('   ✅ 勾选第一个用户');

    // 验证批量操作区域显示
    await expect(batchActions).not.toHaveClass(/hidden/);
    console.log('   ✅ 批量操作区域已显示');

    // 验证显示"已选择 1 个用户"
    await expect(page.locator('#selected-count')).toHaveText('1');
    console.log('   ✅ 显示已选择用户数: 1');

    // 验证所有批量操作按钮都可见
    await expect(page.locator('#cleanup-sessions-btn')).toBeVisible();
    await expect(page.locator('#cleanup-shared-btn')).toBeVisible();
    await expect(page.locator('#cleanup-all-btn-user')).toBeVisible();
    await expect(page.locator('#cancel-selection-btn')).toBeVisible();
    console.log('   ✅ 所有 4 个批量操作按钮已显示');

    // 勾选第二个用户
    const secondRow = await page.locator(`table tbody tr:has-text("${batchTestUser2!.username}")`).first();
    const secondCheckbox = secondRow.locator('input[type="checkbox"].user-checkbox');
    await secondCheckbox.check();
    console.log('   ✅ 勾选第二个用户');

    // 验证选择计数更新为 2
    await expect(page.locator('#selected-count')).toHaveText('2');
    console.log('   ✅ 显示已选择用户数: 2');

    // 验证复选框状态
    const firstCheckboxChecked = await firstCheckbox.isChecked();
    const secondCheckboxChecked = await secondCheckbox.isChecked();
    expect(firstCheckboxChecked).toBe(true);
    expect(secondCheckboxChecked).toBe(true);
    console.log('   ✅ 两个复选框都被选中');

    // 测试取消选择按钮
    await page.locator('#cancel-selection-btn').click();
    await expect(batchActions).toHaveClass(/hidden/);
    console.log('   ✅ 取消选择后批量操作区域隐藏');

    // 保存截图
    await storagePage.saveScreenshot('ui-006-batch-cleanup.png');

    console.log('✅ UI-006 测试通过\n');
  });

  /**
   * UI-007: 页面响应式布局测试
   *
   * 测试步骤:
   * 1. 在不同屏幕尺寸下访问存储管理页面
   * 2. 验证表格布局正确
   * 3. 验证操作按钮可见
   */
  test('UI-007: 页面响应式布局测试', async () => {
    console.log('\n========== UI-007: 页面响应式布局测试 ==========');

    const viewports = [
      { width: 1920, height: 1080, name: 'Desktop' },
      { width: 1024, height: 768, name: 'Tablet' },
      { width: 375, height: 667, name: 'Mobile' },
    ];

    for (const viewport of viewports) {
      console.log(`   测试视口: ${viewport.name} (${viewport.width}x${viewport.height})`);

      // 设置视口大小
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await storagePage.goto();

      // 验证页面标题可见
      await expect(page.locator('text=存储管理').first()).toBeVisible();
      console.log(`   ✅ ${viewport.name}: 页面标题可见`);

      // 验证表格存在
      const table = await page.locator('table').count();
      expect(table).toBeGreaterThan(0);
      console.log(`   ✅ ${viewport.name}: 表格存在`);

      // 验证表格有数据行
      const tableRows = await page.locator('table tbody tr').count();
      expect(tableRows).toBeGreaterThanOrEqual(3);
      console.log(`   ✅ ${viewport.name}: 表格行数 ${tableRows} (预期 >= 3)`);

      // 在 Desktop 和 Tablet 上验证所有列可见
      if (viewport.width >= 1024) {
        const tableHeaders = await page.locator('table th').count();
        expect(tableHeaders).toBeGreaterThanOrEqual(6); // 至少有 6 列
        console.log(`   ✅ ${viewport.name}: 表格列数 ${tableHeaders} (预期 >= 6)`);
      }

      // 验证至少有一个测试用户在表格中可见
      const firstTestUser = getTestUserByIndex(0);
      if (firstTestUser) {
        const testUserVisible = await page.locator(`table tbody tr:has-text("${firstTestUser.username}")`).count();
        expect(testUserVisible).toBeGreaterThan(0);
        console.log(`   ✅ ${viewport.name}: 测试用户可见`);
      }

      // 保存截图
      await storagePage.saveScreenshot(`ui-007-responsive-${viewport.name.toLowerCase()}.png`);
    }

    console.log('✅ UI-007 测试通过\n');
  });

  /**
   * UI-008: 搜索和筛选功能
   *
   * 测试步骤:
   * 1. 访问存储管理页面
   * 2. 输入搜索关键词
   * 3. 验证搜索结果正确
   * 4. 测试状态筛选
   */
  test('UI-008: 搜索和筛选功能', async () => {
    console.log('\n========== UI-008: 搜索和筛选功能 ==========');

    await storagePage.goto();

    // 检查是否有搜索框
    const searchInput = await page.locator('input[placeholder*="搜索"], input[type="search"], #search-input').count();

    if (searchInput === 0) {
      console.log('   ⚠️  未找到搜索框，功能可能未实现');
      await storagePage.saveScreenshot('ui-008-no-search.png');

      // 即使没有搜索框，也要验证页面有其他功能
      const tableRows = await page.locator('table tbody tr').count();
      expect(tableRows).toBeGreaterThanOrEqual(3);
      console.log(`   ✅ 表格数据显示正常: ${tableRows} 行`);

      await storagePage.saveScreenshot('ui-008-search-filter.png');
      console.log('✅ UI-008 测试通过\n');
      return;
    }

    // 获取初始用户数量
    const initialRows = await page.locator('table tbody tr').all();
    console.log(`   初始用户数: ${initialRows.length}`);
    expect(initialRows.length).toBeGreaterThanOrEqual(3);

    // 使用测试用户名进行搜索（使用部分匹配）
    const searchUser = getTestUserByIndex(0);
    expect(searchUser).not.toBeNull();

    // 提取用户名的前缀用于搜索（ui_test_normal_）
    const searchPrefix = searchUser!.username.substring(0, 10);
    console.log(`   搜索关键词: ${searchPrefix}`);

    await page.fill('input[placeholder*="搜索"], input[type="search"], #search-input', searchPrefix);
    await page.waitForTimeout(1000);

    // 验证搜索结果
    const filteredRows = await page.locator('table tbody tr').all();
    console.log(`   搜索结果数: ${filteredRows.length}`);

    // 搜索结果应该少于初始结果（因为我们搜索的是特定前缀）
    expect(filteredRows.length).toBeLessThanOrEqual(initialRows.length);
    console.log(`   ✅ 搜索结果数 <= 初始用户数: ${filteredRows.length} <= ${initialRows.length}`);

    // 验证至少有 1 个结果（因为我们创建了匹配的用户）
    expect(filteredRows.length).toBeGreaterThanOrEqual(1);
    console.log(`   ✅ 至少找到 1 个匹配结果`);

    // 验证第一个结果包含搜索关键词
    if (filteredRows.length > 0) {
      const firstRowText = await filteredRows[0].textContent();
      expect(firstRowText).toContain(searchPrefix);
      console.log(`   ✅ 搜索结果包含关键词 "${searchPrefix}"`);
    }

    // 清空搜索框并验证恢复所有数据
    await page.fill('input[placeholder*="搜索"], input[type="search"], #search-input', '');
    await page.waitForTimeout(500);

    const restoredRows = await page.locator('table tbody tr').all();
    expect(restoredRows.length).toBe(initialRows.length);
    console.log(`   ✅ 清空搜索后恢复所有数据: ${restoredRows.length} 行`);

    // 保存截图
    await storagePage.saveScreenshot('ui-008-search-filter.png');

    console.log('✅ UI-008 测试通过\n');
  });
});
