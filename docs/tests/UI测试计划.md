# Playwright 用户管理系统 - UI 测试计划

## 文档信息

- **创建日期**: 2025-12-26
- **版本**: 1.0
- **项目**: Playwright 用户管理系统
- **测试类型**: UI自动化测试
- **测试工具**: Playwright E2E Testing

---

## 一、测试策略概述

### 1.1 测试目标

- **功能正确性**: 验证所有 UI 功能按预期工作
- **用户体验**: 确保界面交互流畅、响应及时
- **兼容性**: 验证跨浏览器、跨设备兼容性
- **性能**: 确保页面加载和交互响应时间在可接受范围内
- **安全性**: 验证权限控制和数据保护

### 1.2 测试范围

| 测试类型 | 覆盖范围 | 优先级 |
|---------|---------|--------|
| 页面加载测试 | 所有页面 | P0 |
| 表单验证测试 | 所有表单 | P0 |
| 交互操作测试 | CRUD 操作 | P0 |
| 权限控制测试 | 角色权限 | P0 |
| 响应式布局测试 | 所有页面 | P1 |
| 错误处理测试 | 异常情况 | P1 |
| 性能测试 | 关键页面 | P1 |
| 兼容性测试 | 主流浏览器 | P2 |

### 1.3 测试工具

- **E2E 测试框架**: Playwright
- **断言库**: Playwright Assertions
- **测试运行**: Jest / Vitest
- **报告**: HTML Test Report
- **CI/CD**: GitHub Actions

---

## 二、登录认证模块测试用例

### 2.1 P0 - 核心测试用例

#### TC-LOGIN-001: 正常登录流程

**测试步骤:**
1. 访问 `/admin/login`
2. 输入有效的用户名和密码
3. 点击登录按钮
4. 验证重定向到仪表盘
5. 验证 Cookie 中包含 JWT token

**预期结果:**
- 登录成功，跳转到 `/admin`
- JWT token 正确存储在 Cookie 中
- 仪表盘正确显示用户信息

**测试代码框架:**
```typescript
test('TC-LOGIN-001: 正常登录流程', async ({ page }) => {
  await page.goto('/admin/login');
  await page.fill('#username', 'admin');
  await page.fill('#password', 'REDACTED_ADMIN_PASS');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/admin');
  const cookies = await page.context().cookies();
  const tokenCookie = cookies.find(c => c.name === 'token');
  expect(tokenCookie).toBeDefined();
});
```

---

#### TC-LOGIN-002: 错误的用户名或密码

**测试步骤:**
1. 访问 `/admin/login`
2. 输入错误的用户名或密码
3. 点击登录按钮
4. 验证错误提示消息

**预期结果:**
- 显示错误消息："用户名或密码错误"
- 仍在登录页面
- 未设置 Cookie

**测试代码框架:**
```typescript
test('TC-LOGIN-002: 错误的用户名或密码', async ({ page }) => {
  await page.goto('/admin/login');
  await page.fill('#username', 'wronguser');
  await page.fill('#password', 'wrongpass');
  await page.click('button[type="submit"]');
  await expect(page.locator('text=/用户名或密码错误/')).toBeVisible();
  await expect(page).toHaveURL('/admin/login');
});
```

---

#### TC-LOGIN-003: 空用户名或密码

**测试步骤:**
1. 访问 `/admin/login`
2. 用户名或密码留空
3. 点击登录按钮
4. 验证表单验证提示

**预期结果:**
- 显示验证错误："用户名和密码不能为空"
- 未提交请求

**测试代码框架:**
```typescript
test('TC-LOGIN-003: 空用户名或密码', async ({ page }) => {
  await page.goto('/admin/login');
  await page.click('button[type="submit"]');
  await expect(page.locator('text=/用户名和密码不能为空/')).toBeVisible();
});
```

---

#### TC-LOGIN-004: 禁用用户无法登录

**测试步骤:**
1. 准备一个状态为 inactive 的测试用户
2. 访问 `/admin/login`
3. 输入该用户的用户名和密码
4. 点击登录按钮
5. 验证错误提示

**预期结果:**
- 显示错误消息："账号已被禁用"
- 无法登录

---

#### TC-LOGIN-005: 登出功能

**测试步骤:**
1. 登录系统
2. 点击侧边栏的"退出登录"按钮
3. 验证重定向到登录页面
4. 验证 Cookie 已清除

**预期结果:**
- 重定向到 `/admin/login`
- `token` Cookie 已清除
- 无法直接访问需要认证的页面

**测试代码框架:**
```typescript
test('TC-LOGIN-005: 登出功能', async ({ page }) => {
  // 先登录
  await loginAsAdmin(page);
  // 点击登出
  await page.click('a[href="/admin/logout"]');
  await expect(page).toHaveURL('/admin/login');
  const cookies = await page.context().cookies();
  const tokenCookie = cookies.find(c => c.name === 'token');
  expect(tokenCookie).toBeUndefined();
});
```

---

### 2.2 P1 - 边界测试用例

#### TC-LOGIN-006: SQL 注入攻击防护

**测试步骤:**
1. 在用户名字段输入 SQL 注入字符串
2. 输入任意密码
3. 点击登录按钮
4. 验证系统安全处理

**预期结果:**
- 系统安全处理，未发生 SQL 注入
- 显示正常的错误提示

---

#### TC-LOGIN-007: 登录后直接访问受保护页面

**测试步骤:**
1. 登录系统
2. 直接访问 `/admin/users`
3. 验证页面正确加载

**预期结果:**
- 页面正常加载
- 无权限错误

---

#### TC-LOGIN-008: 未登录访问受保护页面

**测试步骤:**
1. 清除所有 Cookie
2. 直接访问 `/admin/users`
3. 验证重定向到登录页面

**预期结果:**
- 重定向到 `/admin/login`
- 显示未授权提示

**测试代码框架:**
```typescript
test('TC-LOGIN-008: 未登录访问受保护页面', async ({ page }) => {
  await page.goto('/admin/users');
  await expect(page).toHaveURL('/admin/login');
});
```

---

## 三、仪表盘模块测试用例

### 3.1 P0 - 核心测试用例

#### TC-DASH-001: 仪表盘数据正确加载

**测试步骤:**
1. 登录系统
2. 访问仪表盘 `/admin`
3. 验证所有统计卡片显示
4. 验证最近会话列表显示

**预期结果:**
- 活跃会话卡片显示数字
- 在线机器卡片显示数量和在线率
- 总用户数卡片显示总数和新用户
- 剩余算力卡片显示点数
- 最近会话列表显示 10 条记录

**测试代码框架:**
```typescript
test('TC-DASH-001: 仪表盘数据正确加载', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin');

  // 验证统计卡片存在
  await expect(page.locator('text=/活跃会话/')).toBeVisible();
  await expect(page.locator('text=/在线机器/')).toBeVisible();
  await expect(page.locator('text=/总用户数/')).toBeVisible();
  await expect(page.locator('text=/剩余算力/')).toBeVisible();

  // 验证最近会话列表
  const sessionRows = await page.locator('tbody tr').count();
  expect(sessionRows).toBeGreaterThan(0);
});
```

---

#### TC-DASH-002: 仪表盘空数据状态

**测试步骤:**
1. 准备一个空数据库
2. 登录系统
3. 访问仪表盘
4. 验证空数据显示

**预期结果:**
- 统计卡片显示 0 或合理默认值
- 最近会话显示"暂无会话记录"

---

#### TC-DASH-003: 点击查看全部会话

**测试步骤:**
1. 登录系统
2. 访问仪表盘
3. 点击"查看全部"链接
4. 验证跳转到会话管理页面

**预期结果:**
- 正确跳转到 `/admin/sessions`
- 会话列表页面加载

**测试代码框架:**
```typescript
test('TC-DASH-003: 点击查看全部会话', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin');
  await page.click('a[href="/admin/sessions"]');
  await expect(page).toHaveURL('/admin/sessions');
});
```

---

### 3.2 P1 - UI 测试用例

#### TC-DASH-004: 系统状态进度条显示

**测试步骤:**
1. 登录系统
2. 访问仪表盘
3. 检查系统状态卡片
4. 验证进度条正确显示

**预期结果:**
- CPU 使用率进度条显示
- 内存使用率进度条显示
- 磁盘使用率进度条显示
- 进度条宽度与百分比一致

---

#### TC-DASH-005: 服务状态指示

**测试步骤:**
1. 登录系统
2. 访问仪表盘
3. 检查服务状态部分
4. 验证状态指示灯

**预期结果:**
- API 服务显示绿色指示灯和"正常"
- 数据库显示绿色指示灯和"正常"
- Playwright 服务显示绿色指示灯和"正常"

---

## 四、用户管理模块测试用例

### 4.1 P0 - 核心测试用例

#### TC-USER-001: 用户列表分页功能

**测试步骤:**
1. 登录管理员账号
2. 访问 `/admin/users`
3. 验证用户列表显示
4. 点击下一页按钮
5. 验证数据更新

**预期结果:**
- 用户列表正确显示
- 分页信息正确
- 点击分页后数据更新

**测试代码框架:**
```typescript
test('TC-USER-001: 用户列表分页功能', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/users');

  // 验证列表加载
  await expect(page.locator('tbody tr')).toHaveCountGreaterThan(0);

  // 验证分页信息
  await expect(page.locator('text=/显示/')).toBeVisible();

  // 点击下一页
  const nextPageButton = page.locator('a:has-text("下一页")').first();
  if (await nextPageButton.isEnabled()) {
    await nextPageButton.click();
    await page.waitForLoadState('networkidle');
  }
});
```

---

#### TC-USER-002: 搜索用户功能

**测试步骤:**
1. 登录管理员账号
2. 访问 `/admin/users`
3. 在搜索框输入用户名
4. 验证筛选结果

**预期结果:**
- 搜索结果正确过滤
- 显示匹配的用户
- 无结果时显示空状态

**测试代码框架:**
```typescript
test('TC-USER-002: 搜索用户功能', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/users');

  // 输入搜索关键词
  await page.fill('#search-users', 'admin');
  await page.waitForTimeout(500); // 等待前端筛选

  // 验证搜索结果
  const rows = page.locator('tbody tr');
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    await expect(rows.nth(i)).toContainText('admin');
  }
});
```

---

#### TC-USER-003: 角色筛选功能

**测试步骤:**
1. 登录管理员账号
2. 访问 `/admin/users`
3. 选择"管理员"角色
4. 验证筛选结果

**预期结果:**
- 只显示管理员用户
- 角色标签正确显示

**测试代码框架:**
```typescript
test('TC-USER-003: 角色筛选功能', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/users');

  // 选择管理员角色
  await page.selectOption('#role-filter', 'admin');
  await page.waitForTimeout(500);

  // 验证筛选结果
  const rows = page.locator('tbody tr span:has-text("管理员")');
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
});
```

---

#### TC-USER-004: 添加新用户

**测试步骤:**
1. 登录管理员账号
2. 访问 `/admin/users`
3. 点击"添加用户"按钮
4. 填写用户信息
5. 点击添加按钮
6. 验证用户创建成功

**预期结果:**
- 模态框正确打开
- 表单验证生效
- 用户创建成功
- 列表刷新显示新用户
- 显示成功消息

**测试代码框架:**
```typescript
test('TC-USER-004: 添加新用户', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/users');

  // 打开添加用户模态框
  await page.click('#add-user-btn');
  await expect(page.locator('#add-user-modal')).toBeVisible();

  // 填写表单
  const testUsername = `testuser_${Date.now()}`;
  await page.fill('#username', testUsername);
  await page.fill('#email', `${testUsername}@test.com`);
  await page.fill('#password', 'Test1234');
  await page.selectOption('#role', 'user');
  await page.fill('#initial-credits', '100');

  // 提交表单
  await page.click('#add-user-form button[type="submit"]');

  // 验证成功
  await page.waitForURL(/\/admin\/users/);
  await expect(page.locator(`text=${testUsername}`)).toBeVisible();
});
```

---

#### TC-USER-005: 编辑用户信息

**测试步骤:**
1. 登录管理员账号
2. 访问 `/admin/users`
3. 点击某个用户的编辑按钮
4. 修改用户信息
5. 保存更改
6. 验证更新成功

**预期结果:**
- 编辑页面正确加载
- 用户信息正确显示
- 更新成功
- 显示成功消息

**测试代码框架:**
```typescript
test('TC-USER-005: 编辑用户信息', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/users');

  // 点击编辑按钮
  await page.click('tbody tr:first-child a[href^="/admin/users/"]');
  await expect(page).toHaveURL(/\/admin\/users\/\d+\/edit/);

  // 修改邮箱
  const newEmail = `updated_${Date.now()}@test.com`;
  await page.fill('#email', newEmail);

  // 保存更改
  await page.click('#edit-user-form button[type="submit"]');

  // 验证成功消息
  await expect(page.locator('text=/用户信息已更新/')).toBeVisible();
});
```

---

#### TC-USER-006: 添加算力点数

**测试步骤:**
1. 登录管理员账号
2. 访问 `/admin/users`
3. 点击某个用户的添加点数按钮
4. 输入点数数量
5. 确认添加
6. 验证点数增加

**预期结果:**
- 模态框正确打开
- 点数添加成功
- 用户点数更新
- 显示成功消息

**测试代码框架:**
```typescript
test('TC-USER-006: 添加算力点数', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/users');

  // 获取添加前的点数
  const firstUserCredits = await page.locator('tbody tr:first-child td:nth-child(3)').textContent();

  // 点击添加点数按钮
  await page.click('tbody tr:first-child .add-credits-btn');
  await expect(page.locator('#add-credits-modal')).toBeVisible();

  // 输入点数
  await page.fill('#credits-amount', '100');
  await page.fill('#credits-reason', '测试添加');

  // 确认添加
  await page.click('#add-credits-form button[type="submit"]');

  // 等待页面刷新
  await page.waitForLoadState('networkidle');

  // 验证点数增加（简单验证，实际应比较数字）
  await expect(page.locator('tbody tr:first-child')).toBeVisible();
});
```

---

#### TC-USER-007: 删除用户

**测试步骤:**
1. 登录管理员账号
2. 访问 `/admin/users`
3. 点击某个非管理员用户的删除按钮
4. 确认删除
5. 验证用户已删除

**预期结果:**
- 确认对话框显示
- 用户删除成功
- 列表更新
- 显示成功消息

**测试代码框架:**
```typescript
test('TC-USER-007: 删除用户', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/users');

  // 点击删除按钮（第一个非管理员用户）
  const deleteButtons = page.locator('.delete-user-btn');
  const count = await deleteButtons.count();
  if (count > 0) {
    await deleteButtons.first().click();
    await expect(page.locator('.confirm-dialog')).toBeVisible();
    await page.click('.confirm-delete-button');
    await page.waitForLoadState('networkidle');
    // 验证删除成功
  }
});
```

---

#### TC-USER-008: 重置用户 API Key

**测试步骤:**
1. 登录管理员账号
2. 访问用户编辑页面
3. 点击"重置 API Key"按钮
4. 确认重置
5. 验证 API Key 已更新

**预期结果:**
- API Key 重置成功
- 显示新的 API Key
- 显示成功消息

**测试代码框架:**
```typescript
test('TC-USER-008: 重置用户 API Key', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/users');

  // 进入用户编辑页
  await page.click('tbody tr:first-child a[href^="/admin/users/"]');

  // 获取旧 API Key
  const oldApiKey = await page.inputValue('#edit-api-key');

  // 点击重置按钮
  await page.click('.reset-api-key');
  await expect(page.locator('text=/确定要重置此用户的 API Key/')).toBeVisible();
  await page.click('button:has-text("确定")');

  // 验证 API Key 已更新
  await page.waitForTimeout(1000);
  const newApiKey = await page.inputValue('#edit-api-key');
  expect(newApiKey).not.toBe(oldApiKey);
});
```

---

### 4.2 P1 - 边界和异常测试用例

#### TC-USER-009: 添加重复用户名

**测试步骤:**
1. 登录管理员账号
2. 尝试添加已存在的用户名
3. 验证错误提示

**预期结果:**
- 显示"用户名已存在"错误
- 用户未创建

---

#### TC-USER-010: 删除管理员账号

**测试步骤:**
1. 登录管理员账号
2. 尝试删除管理员账号
3. 验证错误提示

**预期结果:**
- 显示"不允许删除管理员账号"错误
- 删除操作被阻止

---

## 五、会话管理模块测试用例

### 5.1 P0 - 核心测试用例

#### TC-SESSION-001: 会话列表显示

**测试步骤:**
1. 登录系统
2. 访问 `/admin/sessions`
3. 验证会话列表显示

**预期结果:**
- 会话列表正确显示
- 会话信息完整（ID、用户、机器、状态等）

**测试代码框架:**
```typescript
test('TC-SESSION-001: 会话列表显示', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/sessions');

  // 验证列表
  await expect(page.locator('tbody tr')).toHaveCountGreaterThan(0);

  // 验证列标题
  await expect(page.locator('text=/会话 ID/')).toBeVisible();
  await expect(page.locator('text=/用户/')).toBeVisible();
  await expect(page.locator('text=/状态/')).toBeVisible();
});
```

---

#### TC-SESSION-002: 状态筛选功能

**测试步骤:**
1. 登录系统
2. 访问 `/admin/sessions`
3. 选择"活跃"状态
4. 验证筛选结果

**预期结果:**
- 只显示活跃状态的会话
- 状态标签正确显示

**测试代码框架:**
```typescript
test('TC-SESSION-002: 状态筛选功能', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/sessions');

  // 选择活跃状态
  await page.selectOption('#status-filter', 'active');
  await page.waitForTimeout(500);

  // 验证筛选结果
  const activeLabels = page.locator('tbody tr span:has-text("活跃")');
  const count = await activeLabels.count();
  // 所有行都应该显示"活跃"状态
});
```

---

#### TC-SESSION-003: 日期范围筛选

**测试步骤:**
1. 登录系统
2. 访问 `/admin/sessions`
3. 选择"今天"日期范围
4. 验证筛选结果

**预期结果:**
- 只显示今天的会话
- 日期筛选正确

**测试代码框架:**
```typescript
test('TC-SESSION-003: 日期范围筛选', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/sessions');

  // 选择今天
  await page.selectOption('#date-range', 'today');
  await page.waitForTimeout(500);

  // 验证筛选结果（需要验证日期）
  const rows = page.locator('tbody tr');
  const count = await rows.count();
  expect(count).toBeGreaterThanOrEqual(0);
});
```

---

#### TC-SESSION-004: 结束活跃会话

**测试步骤:**
1. 登录系统
2. 访问 `/admin/sessions`
3. 找到一个活跃会话
4. 点击结束会话按钮
5. 确认结束
6. 验证会话已结束

**预期结果:**
- 确认对话框显示
- 会话成功结束
- 列表更新
- 显示成功消息

**测试代码框架:**
```typescript
test('TC-SESSION-004: 结束活跃会话', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/sessions');

  // 找到活跃会话的结束按钮
  const endButton = page.locator('.end-session-btn').first();
  const isVisible = await endButton.isVisible();

  if (isVisible) {
    await endButton.click();
    await expect(page.locator('#end-session-modal')).toBeVisible();
    await page.click('#confirm-end-session');
    await page.waitForLoadState('networkidle');
    // 验证会话已结束
  }
});
```

---

#### TC-SESSION-005: 会话详情查看

**测试步骤:**
1. 登录系统
2. 访问 `/admin/sessions`
3. 点击某个会话的查看详情按钮
4. 验证详情页面加载

**预期结果:**
- 详情页面正确加载
- 会话信息完整显示
- 用户信息显示
- 机器信息显示（如有）

**测试代码框架:**
```typescript
test('TC-SESSION-005: 会话详情查看', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/sessions');

  // 点击查看详情
  await page.click('tbody tr:first-child a[href^="/admin/sessions/"]');
  await expect(page).toHaveURL(/\/admin\/sessions\/.+/);

  // 验证详情页面元素
  await expect(page.locator('text=/会话详情/')).toBeVisible();
  await expect(page.locator('text=/基本信息/')).toBeVisible();
  await expect(page.locator('text=/用户信息/')).toBeVisible();
});
```

---

### 5.2 P1 - 边界测试用例

#### TC-SESSION-006: 搜索会话功能

**测试步骤:**
1. 登录系统
2. 访问 `/admin/sessions`
3. 在搜索框输入会话ID或用户名
4. 验证筛选结果

**预期结果:**
- 搜索结果正确过滤
- 显示匹配的会话

---

## 六、机器管理模块测试用例

### 6.1 P0 - 核心测试用例

#### TC-MACHINE-001: 机器列表显示

**测试步骤:**
1. 登录管理员账号
2. 访问 `/admin/machines`
3. 验证机器卡片显示

**预期结果:**
- 机器卡片正确显示
- 机器信息完整
- 状态指示灯正确

**测试代码框架:**
```typescript
test('TC-MACHINE-001: 机器列表显示', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/machines');

  // 验证机器卡片
  await expect(page.locator('.bg-white.border.rounded-lg')).toHaveCountGreaterThan(0);

  // 验证机器信息
  await expect(page.locator('text=/IP 地址/')).toBeVisible();
  await expect(page.locator('text=/活跃会话/')).toBeVisible();
});
```

---

#### TC-MACHINE-002: 机器详情查看

**测试步骤:**
1. 登录管理员账号
2. 访问 `/admin/machines`
3. 点击某个机器的详情按钮
4. 验证详情页面加载

**预期结果:**
- 详情页面正确加载
- 机器状态显示
- 资源使用图表显示
- 会话列表显示

**测试代码框架:**
```typescript
test('TC-MACHINE-002: 机器详情查看', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/machines');

  // 点击详情
  await page.click('a[href^="/admin/machines/"]').first();
  await expect(page).toHaveURL(/\/admin\/machines\/.+/);

  // 验证详情页面
  await expect(page.locator('text=/资源使用历史/')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(4); // 4个图表
});
```

---

#### TC-MACHINE-003: 重启在线机器

**测试步骤:**
1. 登录管理员账号
2. 访问 `/admin/machines`
3. 找到在线机器
4. 点击重启按钮
5. 确认重启
6. 验证重启成功

**预期结果:**
- 确认对话框显示
- 警告提示正确显示
- 机器重启成功
- 列表更新

**测试代码框架:**
```typescript
test('TC-MACHINE-003: 重启在线机器', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/machines');

  // 找到在线机器的重启按钮
  const restartButton = page.locator('.restart-machine-btn').first();
  const isVisible = await restartButton.isVisible();

  if (isVisible) {
    await restartButton.click();
    await expect(page.locator('#restart-machine-modal')).toBeVisible();
    await page.click('#confirm-restart-machine');
    await page.waitForLoadState('networkidle');
    // 验证重启成功
  }
});
```

---

#### TC-MACHINE-004: 删除机器

**测试步骤:**
1. 登录管理员账号
2. 访问 `/admin/machines`
3. 点击某个机器的删除按钮
4. 确认删除
5. 验证删除成功

**预期结果:**
- 确认对话框显示
- 警告提示正确显示
- 机器删除成功
- 列表更新

---

#### TC-MACHINE-005: 机器资源监控图表

**测试步骤:**
1. 登录管理员账号
2. 访问机器详情页
3. 验证图表加载
4. 验证图表数据

**预期结果:**
- CPU 图表显示
- 内存图表显示
- 磁盘图表显示
- 会话数图表显示
- 图表数据正确

**测试代码框架:**
```typescript
test('TC-MACHINE-005: 机器资源监控图表', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/machines');

  // 进入第一个机器详情
  await page.click('a[href^="/admin/machines/"]').first();

  // 等待图表加载
  await page.waitForSelector('canvas', { timeout: 5000 });

  // 验证4个图表存在
  await expect(page.locator('#cpuChart')).toBeVisible();
  await expect(page.locator('#memoryChart')).toBeVisible();
  await expect(page.locator('#diskChart')).toBeVisible();
  await expect(page.locator('#sessionsChart')).toBeVisible();
});
```

---

### 6.2 P1 - 边界测试用例

#### TC-MACHINE-006: 状态筛选功能

**测试步骤:**
1. 登录管理员账号
2. 访问 `/admin/machines`
3. 选择"在线"状态
4. 验证筛选结果

**预期结果:**
- 只显示在线机器
- 状态标签正确

---

## 七、操作日志模块测试用例

### 7.1 P0 - 核心测试用例

#### TC-LOG-001: 日志列表显示

**测试步骤:**
1. 登录管理员账号
2. 访问 `/admin/logs`
3. 验证日志列表显示

**预期结果:**
- 日志列表正确显示
- 日志信息完整

**测试代码框架:**
```typescript
test('TC-LOG-001: 日志列表显示', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/logs');

  // 验证列表
  await expect(page.locator('tbody tr')).toHaveCountGreaterThan(0);

  // 验证列
  await expect(page.locator('text=/时间/')).toBeVisible();
  await expect(page.locator('text=/用户/')).toBeVisible();
  await expect(page.locator('text=/操作/')).toBeVisible();
  await expect(page.locator('text=/详情/')).toBeVisible();
});
```

---

#### TC-LOG-002: 操作类型筛选

**测试步骤:**
1. 登录管理员账号
2. 访问 `/admin/logs`
3. 选择"创建用户"操作
4. 验证筛选结果

**预期结果:**
- 只显示创建用户操作日志
- 操作标签正确

**测试代码框架:**
```typescript
test('TC-LOG-002: 操作类型筛选', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/logs');

  // 选择创建用户操作
  await page.selectOption('#action-filter', 'create_user');
  await page.waitForTimeout(500);

  // 验证筛选结果
  const createUserLabels = page.locator('span:has-text("创建用户")');
  const count = await createUserLabels.count();
  expect(count).toBeGreaterThan(0);
});
```

---

#### TC-LOG-003: 日期范围筛选

**测试步骤:**
1. 登录管理员账号
2. 访问 `/admin/logs`
3. 选择"本周"日期范围
4. 验证筛选结果

**预期结果:**
- 只显示本周的日志
- 日期筛选正确

---

### 7.2 P1 - 边界测试用例

#### TC-LOG-004: 日志详情JSON显示

**测试步骤:**
1. 登录管理员账号
2. 访问 `/admin/logs`
3. 查看包含JSON详情的日志
4. 验证JSON正确显示

**预期结果:**
- JSON 格式正确显示
- 特殊字符正确转义

---

## 八、系统设置模块测试用例

### 8.1 P0 - 核心测试用例

#### TC-SETTINGS-001: 设置页面加载

**测试步骤:**
1. 登录系统
2. 访问 `/admin/settings`
3. 验证设置项显示

**预期结果:**
- 通知设置显示
- 会话设置显示
- 安全设置显示
- 系统维护选项显示

**测试代码框架:**
```typescript
test('TC-SETTINGS-001: 设置页面加载', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/settings');

  // 验证设置区块
  await expect(page.locator('text=/通知设置/')).toBeVisible();
  await expect(page.locator('text=/会话设置/')).toBeVisible();
  await expect(page.locator('text=/安全设置/')).toBeVisible();
  await expect(page.locator('text=/系统维护/')).toBeVisible();
});
```

---

#### TC-SETTINGS-002: IP限制开关联动

**测试步骤:**
1. 登录系统
2. 访问 `/admin/settings`
3. 勾选"IP地址限制"复选框
4. 验证IP白名单输入框显示

**预期结果:**
- IP白名单输入框显示
- 取消勾选后隐藏

**测试代码框架:**
```typescript
test('TC-SETTINGS-002: IP限制开关联动', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/settings');

  // 勾选IP限制
  await page.check('#ip-restriction');
  await expect(page.locator('#ip-whitelist-container')).toBeVisible();

  // 取消勾选
  await page.uncheck('#ip-restriction');
  await expect(page.locator('#ip-whitelist-container')).toBeHidden();
});
```

---

#### TC-SETTINGS-003: 保存设置

**测试步骤:**
1. 登录系统
2. 访问 `/admin/settings`
3. 修改设置项
4. 点击保存设置按钮
5. 验证保存成功

**预期结果:**
- 设置保存成功
- 显示成功消息
- 设置值持久化（需要后端支持）

---

#### TC-SETTINGS-004: 清理旧日志

**测试步骤:**
1. 登录系统
2. 访问 `/admin/settings`
3. 点击"清理旧日志"按钮
4. 确认清理
5. 验证清理成功

**预期结果:**
- 确认对话框显示
- 30天前的日志被删除
- 显示成功消息

**测试代码框架:**
```typescript
test('TC-SETTINGS-004: 清理旧日志', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/settings');

  // 点击清理按钮
  await page.click('#clear-logs-btn');
  await expect(page.locator('#clear-logs-modal')).toBeVisible();

  // 确认清理
  await page.click('#confirm-clear-logs');

  // 验证成功消息（需要 mock API）
  await expect(page.locator('text=/旧日志已成功清理/')).toBeVisible();
});
```

---

#### TC-SETTINGS-005: 备份数据库

**测试步骤:**
1. 登录系统
2. 访问 `/admin/settings`
3. 点击"备份数据库"按钮
4. 验证备份文件下载

**预期结果:**
- 备份成功
- SQL 文件下载
- 文件名包含日期

**测试代码框架:**
```typescript
test('TC-SETTINGS-005: 备份数据库', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/settings');

  // 监听下载事件
  const downloadPromise = page.waitForEvent('download');

  // 点击备份按钮
  await page.click('#backup-btn');

  // 验证下载
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/backup-\d{4}-\d{2}-\d{2}\.sql/);
});
```

---

## 九、个人资料模块测试用例

### 9.1 P0 - 核心测试用例

#### TC-PROFILE-001: 个人资料页面加载

**测试步骤:**
1. 登录系统
2. 访问 `/admin/profile`
3. 验证个人信息显示

**预期结果:**
- 用户信息正确显示
- API Key 显示
- 算力点数显示
- 使用记录显示

**测试代码框架:**
```typescript
test('TC-PROFILE-001: 个人资料页面加载', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/profile');

  // 验证信息卡片
  await expect(page.locator('text=/个人资料/')).toBeVisible();
  await expect(page.locator('text=/修改密码/')).toBeVisible();
  await expect(page.locator('text=/API Key/')).toBeVisible();
  await expect(page.locator('text=/算力点数/')).toBeVisible();
});
```

---

#### TC-PROFILE-002: 更新个人资料

**测试步骤:**
1. 登录系统
2. 访问 `/admin/profile`
3. 修改邮箱和 Webhook URL
4. 点击保存更改
5. 验证更新成功

**预期结果:**
- 资料更新成功
- 显示成功消息

**测试代码框架:**
```typescript
test('TC-PROFILE-002: 更新个人资料', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/profile');

  // 修改邮箱
  const newEmail = `updated_${Date.now()}@test.com`;
  await page.fill('#email', newEmail);
  await page.fill('#webhook-url', 'https://example.com/webhook');

  // 保存
  await page.click('#profile-form button[type="submit"]');

  // 验证成功消息
  await expect(page.locator('text=/个人资料已成功更新/')).toBeVisible();
});
```

---

#### TC-PROFILE-003: 修改密码

**测试步骤:**
1. 登录系统
2. 访问 `/admin/profile`
3. 输入当前密码
4. 输入新密码和确认密码
5. 点击更新密码
6. 验证密码更新成功

**预期结果:**
- 密码更新成功
- 显示成功消息
- 表单重置

**测试代码框架:**
```typescript
test('TC-PROFILE-003: 修改密码', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/profile');

  // 填写密码表单
  await page.fill('#current-password', 'REDACTED_ADMIN_PASS');
  await page.fill('#new-password', 'NewPass123');
  await page.fill('#confirm-password', 'NewPass123');

  // 提交
  await page.click('#password-form button[type="submit"]');

  // 验证成功消息
  await expect(page.locator('text=/密码已成功更新/')).toBeVisible();
});
```

---

#### TC-PROFILE-004: 新密码和确认密码不匹配

**测试步骤:**
1. 登录系统
2. 访问 `/admin/profile`
3. 输入当前密码
4. 输入不同的新密码和确认密码
5. 点击更新密码
6. 验证错误提示

**预期结果:**
- 显示"新密码和确认密码不匹配"错误
- 密码未更新

**测试代码框架:**
```typescript
test('TC-PROFILE-004: 新密码和确认密码不匹配', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/profile');

  // 填写不匹配的密码
  await page.fill('#current-password', 'REDACTED_ADMIN_PASS');
  await page.fill('#new-password', 'NewPass123');
  await page.fill('#confirm-password', 'DifferentPass123');

  // 提交
  await page.click('#password-form button[type="submit"]');

  // 验证错误消息
  await expect(page.locator('text=/新密码和确认密码不匹配/')).toBeVisible();
});
```

---

#### TC-PROFILE-005: 复制 API Key

**测试步骤:**
1. 登录系统
2. 访问 `/admin/profile`
3. 点击复制 API Key 按钮
4. 验证复制成功提示

**预期结果:**
- API Key 复制到剪贴板
- 按钮样式变化
- 显示复制成功提示

**测试代码框架:**
```typescript
test('TC-PROFILE-005: 复制 API Key', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/profile');

  // 点击复制按钮
  await page.click('#copy-api-key');

  // 验证按钮变化
  await expect(page.locator('#copy-api-key i')).toHaveClass(/fa-check/);

  // 验证剪贴板内容
  const apiKey = await page.inputValue('#api-key');
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText).toBe(apiKey);
});
```

---

#### TC-PROFILE-006: 重新生成 API Key

**测试步骤:**
1. 登录系统
2. 访问 `/admin/profile`
3. 点击重新生成 API Key 按钮
4. 确认重新生成
5. 验证 API Key 已更新

**预期结果:**
- 确认对话框显示
- API Key 重新生成成功
- 页面刷新显示新 Key
- 显示成功消息

**测试代码框架:**
```typescript
test('TC-PROFILE-006: 重新生成 API Key', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/profile');

  // 获取旧 API Key
  const oldApiKey = await page.inputValue('#api-key');

  // 点击重新生成
  await page.click('#regenerate-api-key');
  await expect(page.locator('#regenerate-key-modal')).toBeVisible();
  await page.click('#confirm-regenerate-key');

  // 等待页面刷新
  await page.waitForLoadState('networkidle');

  // 验证新 Key
  const newApiKey = await page.inputValue('#api-key');
  expect(newApiKey).not.toBe(oldApiKey);
});
```

---

## 十、文件上传模块测试用例

### 10.1 P0 - 核心测试用例

#### TC-FILE-001: 文件上传页面加载

**测试步骤:**
1. 登录管理员账号
2. 访问 `/admin/files`
3. 验证上传界面显示

**预期结果:**
- 文件选择输入显示
- 上传按钮显示
- 文件列表加载

**测试代码框架:**
```typescript
test('TC-FILE-001: 文件上传页面加载', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/files');

  // 验证界面元素
  await expect(page.locator('#upload-form')).toBeVisible();
  await expect(page.locator('#file-input')).toBeVisible();
  await expect(page.locator('button:has-text("上传文件")')).toBeVisible();
});
```

---

#### TC-FILE-002: 上传文件

**测试步骤:**
1. 登录管理员账号
2. 访问 `/admin/files`
3. 选择一个测试文件
4. 点击上传按钮
5. 验证上传成功

**预期结果:**
- 文件上传成功
- 显示上传结果
- 文件列表更新
- 显示文件名、大小、URL

**测试代码框架:**
```typescript
test('TC-FILE-002: 上传文件', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/files');

  // 创建测试文件
  const file = new File(['test content'], 'test.txt', { type: 'text/plain' });

  // 选择文件
  await page.setInputFiles('#file-input', file);

  // 上传
  await page.click('#upload-form button[type="submit"]');

  // 验证上传成功
  await expect(page.locator('text=/文件上传成功/')).toBeVisible();
  await expect(page.locator('text=/test.txt/')).toBeVisible();
});
```

---

#### TC-FILE-003: 文件列表显示

**测试步骤:**
1. 登录管理员账号
2. 访问 `/admin/files`
3. 验证文件列表显示

**预期结果:**
- 文件列表正确显示
- 文件信息完整（文件名、大小、上传时间、下载链接）

---

#### TC-FILE-004: 下载文件

**测试步骤:**
1. 登录管理员账号
2. 访问 `/admin/files`
3. 点击某个文件的下载链接
4. 验证文件下载

**预期结果:**
- 文件下载成功
- 文件内容正确

**测试代码框架:**
```typescript
test('TC-FILE-004: 下载文件', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/files');

  // 监听下载事件
  const downloadPromise = page.waitForEvent('download');

  // 点击下载链接
  await page.click('a[href^="http"]:has-text("下载")').first();

  // 验证下载
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBeTruthy();
});
```

---

### 10.2 P1 - 边界测试用例

#### TC-FILE-005: 上传空文件

**测试步骤:**
1. 登录管理员账号
2. 访问 `/admin/files`
3. 不选择文件，直接点击上传
4. 验证错误提示

**预期结果:**
- 显示"请选择一个文件"错误
- 未发起上传请求

**测试代码框架:**
```typescript
test('TC-FILE-005: 上传空文件', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/files');

  // 不选择文件，直接点击上传
  await page.click('#upload-form button[type="submit"]');

  // 验证错误消息
  await expect(page.locator('text=/请选择一个文件/')).toBeVisible();
});
```

---

#### TC-FILE-006: 上传大文件

**测试步骤:**
1. 登录管理员账号
2. 访问 `/admin/files`
3. 选择一个大文件（超过限制）
4. 点击上传按钮
5. 验证错误提示

**预期结果:**
- 显示文件大小超限错误
- 上传失败

---

## 十一、权限控制测试用例

### 11.1 P0 - 核心测试用例

#### TC-AUTH-001: 普通用户无法访问用户管理

**测试步骤:**
1. 登录普通用户账号
2. 尝试访问 `/admin/users`
3. 验证重定向或权限错误

**预期结果:**
- 重定向到仪表盘或显示权限错误

**测试代码框架:**
```typescript
test('TC-AUTH-001: 普通用户无法访问用户管理', async ({ page }) => {
  await loginAsUser(page);
  await page.goto('/admin/users');

  // 验证被重定向或显示权限错误
  await expect(page).toHaveURL(/\/admin(?!\/users)/);
});
```

---

#### TC-AUTH-002: 普通用户无法访问机器管理

**测试步骤:**
1. 登录普通用户账号
2. 尝试访问 `/admin/machines`
3. 验证重定向或权限错误

**预期结果:**
- 重定向到仪表盘或显示权限错误

---

#### TC-AUTH-003: 普通用户无法访问操作日志

**测试步骤:**
1. 登录普通用户账号
2. 尝试访问 `/admin/logs`
3. 验证重定向或权限错误

**预期结果:**
- 重定向到仪表盘或显示权限错误

---

#### TC-AUTH-004: 侧边栏权限控制

**测试步骤:**
1. 登录普通用户账号
2. 检查侧边栏菜单
3. 验证管理员专属菜单项不显示

**预期结果:**
- "用户管理"菜单不显示
- "机器管理"菜单不显示
- "操作日志"菜单不显示
- "文件上传"菜单不显示

**测试代码框架:**
```typescript
test('TC-AUTH-004: 侧边栏权限控制', async ({ page }) => {
  await loginAsUser(page);
  await page.goto('/admin');

  // 验证管理员菜单不显示
  await expect(page.locator('a[href="/admin/users"]')).not.toBeVisible();
  await expect(page.locator('a[href="/admin/machines"]')).not.toBeVisible();
  await expect(page.locator('a[href="/admin/logs"]')).not.toBeVisible();
  await expect(page.locator('a[href="/admin/files"]')).not.toBeVisible();
});
```

---

## 十二、响应式布局测试用例

### 12.1 P1 - 核心测试用例

#### TC-RESP-001: 桌面端布局 (1920x1080)

**测试步骤:**
1. 设置视口为 1920x1080
2. 登录系统
3. 访问各个页面
4. 验证布局正常

**预期结果:**
- 侧边栏固定显示
- 内容区域正常显示
- 无布局错乱

**测试代码框架:**
```typescript
test('TC-RESP-001: 桌面端布局', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await loginAsAdmin(page);
  await page.goto('/admin');

  // 验证侧边栏可见
  await expect(page.locator('aside.w-64')).toBeVisible();

  // 验证内容区域
  await expect(page.locator('.grid-cols-4')).toBeVisible();
});
```

---

#### TC-RESP-002: 平板端布局 (768x1024)

**测试步骤:**
1. 设置视口为 768x1024
2. 登录系统
3. 访问各个页面
4. 验证布局正常

**预期结果:**
- 侧边栏固定显示
- 内容区域适配
- 卡片布局调整为 2 列

**测试代码框架:**
```typescript
test('TC-RESP-002: 平板端布局', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await loginAsAdmin(page);
  await page.goto('/admin');

  // 验证响应式布局
  await expect(page.locator('aside.hidden.md\\:block')).toBeVisible();
});
```

---

#### TC-RESP-003: 移动端布局 (375x667)

**测试步骤:**
1. 设置视口为 375x667
2. 登录系统
3. 访问各个页面
4. 验证布局正常

**预期结果:**
- 侧边栏隐藏，通过按钮打开
- 内容区域全宽显示
- 卡片布局调整为 1 列
- 移动端菜单正常工作

**测试代码框架:**
```typescript
test('TC-RESP-003: 移动端布局', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await loginAsAdmin(page);
  await page.goto('/admin');

  // 验证侧边栏隐藏
  await expect(page.locator('aside.hidden.md\\:block')).toBeHidden();

  // 验证移动端菜单按钮显示
  await expect(page.locator('#sidebar-toggle')).toBeVisible();

  // 点击打开菜单
  await page.click('#sidebar-toggle');
  await expect(page.locator('#mobile-sidebar')).toBeVisible();
});
```

---

## 十三、性能测试用例

### 13.1 P1 - 核心测试用例

#### TC-PERF-001: 仪表盘加载时间

**测试步骤:**
1. 登录系统
2. 访问仪表盘
3. 测量页面加载时间
4. 验证在可接受范围内

**预期结果:**
- 页面加载时间 < 2秒
- 所有资源加载完成

**测试代码框架:**
```typescript
test('TC-PERF-001: 仪表盘加载时间', async ({ page }) => {
  await loginAsAdmin(page);

  const startTime = Date.now();
  await page.goto('/admin');
  await page.waitForLoadState('networkidle');
  const loadTime = Date.now() - startTime;

  expect(loadTime).toBeLessThan(2000);
});
```

---

#### TC-PERF-002: 大列表性能

**测试步骤:**
1. 准备大量测试数据（100+ 用户）
2. 登录系统
3. 访问用户列表
4. 测量渲染时间

**预期结果:**
- 列表渲染时间 < 1秒
- 页面不卡顿

---

#### TC-PERF-003: 图表渲染性能

**测试步骤:**
1. 登录系统
2. 访问机器详情页
3. 测量图表渲染时间
4. 验证渲染流畅

**预期结果:**
- 图表渲染时间 < 1秒
- 动画流畅

---

## 十四、测试环境配置

### 14.1 测试环境要求

```json
{
  "name": "playwright-user-sys-tests",
  "version": "1.0.0",
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:debug": "playwright test --debug"
  },
  "devDependencies": {
    "@playwright/test": "^1.40.0",
    "@types/node": "^20.0.0"
  }
}
```

### 14.2 测试配置文件

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['junit', { outputFile: 'test-results/junit.xml' }]
  ],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
```

### 14.3 测试辅助函数

```typescript
// tests/helpers/auth.ts
import { Page } from '@playwright/test';

export async function loginAsAdmin(page: Page) {
  await page.goto('/admin/login');
  await page.fill('#username', 'admin');
  await page.fill('#password', 'REDACTED_ADMIN_PASS');
  await page.click('button[type="submit"]');
  await page.waitForURL('/admin');
}

export async function loginAsUser(page: Page) {
  await page.goto('/admin/login');
  await page.fill('#username', 'testuser');
  await page.fill('#password', 'testpass123');
  await page.click('button[type="submit"]');
  await page.waitForURL('/admin');
}

export async function createTestUser(page: Page, userData: any) {
  await page.goto('/admin/users');
  await page.click('#add-user-btn');
  await page.fill('#username', userData.username);
  await page.fill('#email', userData.email);
  await page.fill('#password', userData.password);
  await page.selectOption('#role', userData.role);
  await page.fill('#initial-credits', String(userData.credits || 100));
  await page.click('#add-user-form button[type="submit"]');
  await page.waitForLoadState('networkidle');
}
```

---

## 十五、测试执行计划

### 15.1 测试阶段划分

| 阶段 | 时间 | 测试范围 | 目标 |
|-----|------|---------|------|
| 第一阶段 | 第1周 | P0 核心功能 | 核心流程100%通过 |
| 第二阶段 | 第2周 | P1 重要功能 | 重要功能90%通过 |
| 第三阶段 | 第3周 | P2 辅助功能 | 辅助功能80%通过 |
| 第四阶段 | 第4周 | 回归测试 | 全部测试85%通过 |

### 15.2 每日测试执行

```bash
# 每日冒烟测试（P0用例）
pnpm test:e2e --grep "@P0"

# 每周全量测试
pnpm test:e2e

# 回归测试（发布前）
pnpm test:e2e --project=chromium --project=firefox
```

### 15.3 CI/CD 集成

```yaml
# .github/workflows/e2e-tests.yml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: 20
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install

      - name: Install Playwright Browsers
        run: pnpm exec playwright install --with-deps

      - name: Run E2E tests
        run: pnpm test:e2e

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
```

---

## 十六、测试用例编写规范

### 16.1 命名规范

- 测试文件: `*.spec.ts`
- 测试套件: 按模块分组
- 测试用例: `TC-[模块]-[编号]: [描述]`

### 16.2 结构规范

```typescript
import { test, expect } from '@playwright/test';

test.describe('用户管理模块', () => {
  test.beforeEach(async ({ page }) => {
    // 每个测试前的准备工作
    await loginAsAdmin(page);
  });

  test('TC-USER-001: 用户列表分页功能', async ({ page }) => {
    // Arrange（准备）
    await page.goto('/admin/users');

    // Act（执行）
    await page.click('a:has-text("下一页")');

    // Assert（断言）
    await expect(page).toHaveURL(/page=2/);
  });
});
```

### 16.3 注释规范

```typescript
test('TC-USER-001: 用户列表分页功能', async ({ page }) => {
  // 测试目标: 验证用户列表分页功能正常工作
  // 前置条件: 已登录管理员账号，存在至少2页用户数据

  await page.goto('/admin/users');

  // 记录当前页面的用户数量
  const initialCount = await page.locator('tbody tr').count();

  // 点击下一页按钮
  await page.click('a:has-text("下一页")');
  await page.waitForLoadState('networkidle');

  // 验证: URL包含page=2参数
  await expect(page).toHaveURL(/page=2/);

  // 验证: 第二页也有用户数据
  const newCount = await page.locator('tbody tr').count();
  expect(newCount).toBeGreaterThan(0);
});
```

---

## 十七、缺陷报告模板

### 17.1 缺陷分级

| 级别 | 定义 | 示例 |
|-----|------|------|
| P0 - 致命 | 系统无法使用，核心功能完全失效 | 登录失败、数据丢失 |
| P1 - 严重 | 主要功能受损，但有变通方案 | 保存失败、页面崩溃 |
| P2 - 一般 | 次要功能缺陷，不影响主要流程 | 样式错乱、文字错误 |
| P3 - 轻微 | 界面优化、建议改进 | 颜色搭配、用词建议 |

### 17.2 缺陷报告模板

```markdown
## 缺陷标题

**缺陷ID**: BUG-XXX
**发现日期**: YYYY-MM-DD
**严重级别**: P0/P1/P2/P3
**影响范围**: [模块/功能]
**测试用例**: TC-XXX-XXX

### 环境信息
- 浏览器: Chrome 120
- 操作系统: macOS 14
- 测试环境: 开发环境

### 重现步骤
1. 步骤一
2. 步骤二
3. 步骤三

### 实际结果
[描述实际发生的情况]

### 预期结果
[描述应该发生的情况]

### 截图/录屏
[附上相关截图或录屏]

### 附加信息
[其他相关信息]
```

---

## 十八、测试覆盖率目标

### 18.1 功能覆盖率

| 模块 | P0覆盖率 | P1覆盖率 | P2覆盖率 | 总体目标 |
|-----|---------|---------|---------|---------|
| 登录认证 | 100% | 90% | 70% | 90% |
| 仪表盘 | 100% | 80% | 60% | 85% |
| 用户管理 | 100% | 90% | 70% | 90% |
| 会话管理 | 100% | 85% | 65% | 88% |
| 机器管理 | 100% | 85% | 65% | 88% |
| 操作日志 | 90% | 80% | 60% | 80% |
| 系统设置 | 90% | 75% | 60% | 78% |
| 个人资料 | 100% | 85% | 65% | 88% |
| 文件上传 | 90% | 75% | 60% | 78% |

### 18.2 代码覆盖率目标

- **语句覆盖率**: ≥ 80%
- **分支覆盖率**: ≥ 75%
- **函数覆盖率**: ≥ 85%
- **行覆盖率**: ≥ 80%

---

## 十九、测试风险管理

### 19.1 测试风险

| 风险 | 影响 | 概率 | 缓解措施 |
|-----|------|------|---------|
| 测试数据不足 | 高 | 中 | 提前准备测试数据脚本 |
| 环境不稳定 | 中 | 中 | 使用Docker容器化测试环境 |
| 测试用例维护成本高 | 中 | 高 | 使用Page Object Model |
| CI执行时间长 | 中 | 中 | 并行执行测试 |
| 浏览器兼容性问题 | 低 | 中 | 多浏览器测试覆盖 |

### 19.2 缓解策略

1. **测试数据管理**
   - 使用脚本自动生成测试数据
   - 每次测试前重置数据库
   - 使用fixture快速准备数据

2. **测试环境管理**
   - Docker容器化
   - 环境配置版本控制
   - 定期环境健康检查

3. **测试用例优化**
   - Page Object Model架构
   - 测试代码模块化
   - 公共方法封装

4. **并行执行**
   - 按模块分组并行
   - 使用多个worker
   - 优化测试依赖

---

## 二十、总结

### 20.1 测试要点总结

1. **核心功能优先**: P0测试用例必须100%通过
2. **用户体验关注**: 不仅验证功能，还要关注体验
3. **性能基准**: 建立性能基线，监控性能变化
4. **持续改进**: 定期回顾测试结果，优化测试策略

### 20.2 下一步行动

1. **Week 1**: 实现P0测试用例
2. **Week 2**: 实现P1测试用例
3. **Week 3**: 集成CI/CD
4. **Week 4**: 回归测试和优化

---

**文档版本历史:**

- v1.0 (2025-12-26): 初始版本，UI测试计划完成
