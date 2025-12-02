# 功能模块改进文档 - 浏览器管理服务

## 1. 变更原因说明

当前浏览器管理服务存在以下问题：
1. 缺乏用户数据隔离机制，多个会话共享资源
2. Cookies和LocalStorage初始化逻辑缺失
3. 资源清理不完整，可能导致资源泄漏
4. 扩展性不足，难以支持新功能

## 2. 模块功能规格说明书

### 2.1 模块概述

浏览器管理服务负责创建、管理和清理浏览器实例，提供用户数据隔离、状态管理和资源回收功能。

### 2.2 核心功能

1. **浏览器实例管理**
   - 创建独立浏览器实例
   - 管理实例生命周期
   - 监控实例状态

2. **用户数据隔离**
   - 为每个会话创建独立数据目录
   - 管理Cookies和LocalStorage隔离
   - 实现数据持久化和恢复

3. **状态管理**
   - 初始化浏览器状态
   - 同步用户配置
   - 持久化关键状态

4. **资源管理**
   - 分配和监控资源
   - 实现资源回收策略
   - 提供资源使用统计

## 3. 接口变更说明

### 3.1 BrowserLaunchOptions 接口扩展

**变更前：**
```typescript
export interface BrowserLaunchOptions extends BrowserOptions {
  sessionConfig?: Partial<SessionConfig>;
}
```

**变更后：**
```typescript
export interface BrowserLaunchOptions extends BrowserOptions {
  sessionConfig?: Partial<SessionConfig>;
  // 新增：用户数据目录配置
  userDataDir?: string;
  // 新增：Cookies初始化配置
  cookies?: Record<string, string>;
  // 新增：LocalStorage初始化配置
  localStorage?: Record<string, string>;
  // 新增：资源管理配置
  resourceConfig?: {
    maxMemory?: number;
    maxCpu?: number;
    cleanupTimeout?: number;
  };
}
```

### 3.2 launchBrowser 方法扩展

**变更前：**
```typescript
async launchBrowser(
  sessionId: string,
  options: BrowserLaunchOptions = {}
): Promise<BrowserInstance>
```

**变更后：**
```typescript
async launchBrowser(
  sessionId: string,
  options: BrowserLaunchOptions = {}
): Promise<BrowserInstance> {
  // 新增：用户数据目录初始化
  await this.initializeUserDataDir(sessionId, options);
  
  // 新增：资源监控初始化
  await this.initializeResourceMonitoring(sessionId, options.resourceConfig);
  
  // 原有逻辑...
  
  // 新增：状态初始化
  await this.initializeBrowserState(sessionId, browser, options);
}
```

### 3.3 新增接口方法

```typescript
/**
 * 初始化用户数据目录
 */
async initializeUserDataDir(
  sessionId: string, 
  options: BrowserLaunchOptions
): Promise<string>;

/**
 * 初始化浏览器状态
 */
async initializeBrowserState(
  sessionId: string,
  browser: Browser,
  options: BrowserLaunchOptions
): Promise<void>;

/**
 * 清理用户数据
 */
async cleanupUserData(sessionId: string): Promise<void>;

/**
 * 获取资源使用情况
 */
getResourceUsage(sessionId: string): ResourceUsage;
```

## 4. 测试用例更新方案

### 4.1 新增测试用例

1. **用户数据隔离测试**
```typescript
describe('用户数据隔离', () => {
  test('应该为每个会话创建独立数据目录', async () => {
    // 创建两个会话
    const session1 = await browserService.launchBrowser('session1');
    const session2 = await browserService.launchBrowser('session2');
    
    // 验证数据目录独立性
    const userDataDir1 = browserService.getUserDataDir('session1');
    const userDataDir2 = browserService.getUserDataDir('session2');
    
    expect(userDataDir1).not.toBe(userDataDir2);
  });
});
```

2. **Cookies初始化测试**
```typescript
describe('Cookies初始化', () => {
  test('应该正确设置初始Cookies', async () => {
    const cookies = { 'test': 'value', 'session': '123' };
    const options = { cookies };
    
    await browserService.launchBrowser('session1', options);
    
    // 验证Cookies是否正确设置
    const page = await browserService.getPrimaryPage('session1');
    const pageCookies = await page.cookies();
    
    expect(pageCookies).toContainEqual(
      expect.objectContaining({ name: 'test', value: 'value' })
    );
  });
});
```

3. **LocalStorage初始化测试**
```typescript
describe('LocalStorage初始化', () => {
  test('应该正确设置初始LocalStorage', async () => {
    const localStorage = { 'theme': 'dark', 'lang': 'zh-CN' };
    const options = { localStorage };
    
    await browserService.launchBrowser('session1', options);
    
    // 验证LocalStorage是否正确设置
    const page = await browserService.getPrimaryPage('session1');
    const storage = await page.evaluate(() => {
      return {
        theme: localStorage.getItem('theme'),
        lang: localStorage.getItem('lang')
      };
    });
    
    expect(storage).toEqual({ theme: 'dark', lang: 'zh-CN' });
  });
});
```

4. **资源清理测试**
```typescript
describe('资源清理', () => {
  test('应该正确清理用户数据', async () => {
    await browserService.launchBrowser('session1');
    const userDataDir = browserService.getUserDataDir('session1');
    
    // 验证数据目录存在
    expect(fs.existsSync(userDataDir)).toBe(true);
    
    // 清理会话
    await browserService.cleanupSession('session1');
    
    // 验证数据目录已清理
    expect(fs.existsSync(userDataDir)).toBe(false);
  });
});
```

### 4.2 更新现有测试用例

1. **浏览器启动测试**
   - 添加用户数据目录验证
   - 添加资源监控验证
   - 添加状态初始化验证

2. **浏览器关闭测试**
   - 添加资源清理验证
   - 添加数据目录删除验证
   - 添加资源监控停止验证

## 5. 兼容性处理方案

### 5.1 向后兼容性

1. **参数兼容性**
   - 所有新增参数均为可选
   - 未提供新参数时使用默认行为
   - 保持原有接口签名不变

2. **行为兼容性**
   - 未指定用户数据目录时使用原有逻辑
   - 未提供Cookies/LocalStorage时跳过初始化
   - 保持原有资源管理行为

### 5.2 迁移策略

1. **渐进式迁移**
   - 第一阶段：添加新功能，保持原有行为
   - 第二阶段：逐步启用新功能
   - 第三阶段：移除旧逻辑

2. **配置开关**
   - 提供功能开关控制新特性启用
   - 支持按会话级别控制功能
   - 提供全局默认配置

## 6. 实现细节

### 6.1 用户数据目录管理

```typescript
/**
 * 初始化用户数据目录
 */
async initializeUserDataDir(
  sessionId: string, 
  options: BrowserLaunchOptions
): Promise<string> {
  // 创建用户数据目录
  const userDataDir = options.userDataDir || 
    path.join(process.cwd(), 'data', 'userdata', sessionId);
  
  // 确保目录存在
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }
  
  // 设置权限
  fs.chmodSync(userDataDir, 0o700);
  
  // 存储目录路径
  this.userDataDirs.set(sessionId, userDataDir);
  
  return userDataDir;
}
```

### 6.2 Cookies初始化

```typescript
/**
 * 初始化Cookies
 */
async initializeCookies(
  page: Page, 
  cookies: Record<string, string>
): Promise<void> {
  if (!cookies || Object.keys(cookies).length === 0) {
    return;
  }
  
  // 转换Cookies格式
  const cookieObjects = Object.entries(cookies).map(([name, value]) => ({
    name,
    value,
    domain: 'localhost', // 可配置
    path: '/',
    httpOnly: false,
    secure: false,
    sameSite: 'Lax' as const
  }));
  
  // 设置Cookies
  await page.setCookie(...cookieObjects);
}
```

### 6.3 LocalStorage初始化

```typescript
/**
 * 初始化LocalStorage
 */
async initializeLocalStorage(
  page: Page, 
  localStorage: Record<string, string>
): Promise<void> {
  if (!localStorage || Object.keys(localStorage).length === 0) {
    return;
  }
  
  // 注入LocalStorage初始化脚本
  await page.evaluateOnNewDocument((data) => {
    Object.entries(data).forEach(([key, value]) => {
      localStorage.setItem(key, value);
    });
  }, localStorage);
}
```

### 6.4 资源监控

```typescript
/**
 * 初始化资源监控
 */
async initializeResourceMonitoring(
  sessionId: string,
  config?: ResourceConfig
): Promise<void> {
  const monitoring = new ResourceMonitor(sessionId, {
    maxMemory: config?.maxMemory || 512 * 1024 * 1024, // 512MB
    maxCpu: config?.maxCpu || 80, // 80%
    checkInterval: 5000, // 5秒检查一次
    cleanupTimeout: config?.cleanupTimeout || 30000 // 30秒
  });
  
  // 启动监控
  monitoring.start();
  
  // 存储监控实例
  this.resourceMonitors.set(sessionId, monitoring);
}
```

## 7. 影响范围评估

### 7.1 直接影响

1. **浏览器启动流程**
   - 增加用户数据目录初始化步骤
   - 添加状态初始化逻辑
   - 增加资源监控启动

2. **会话管理**
   - 扩展会话创建参数
   - 增加资源管理逻辑
   - 添加数据清理步骤

3. **资源使用**
   - 增加磁盘空间使用
   - 增加内存使用（监控）
   - 增加CPU使用（监控）

### 7.2 间接影响

1. **性能影响**
   - 浏览器启动时间增加（约10-20%）
   - 资源使用增加（约5-10%）
   - 系统响应时间略有增加

2. **运维影响**
   - 需要监控磁盘使用情况
   - 需要调整资源分配策略
   - 需要更新清理脚本

## 8. 相关依赖说明

### 8.1 内部依赖

1. **配置服务**：获取用户数据目录配置
2. **日志服务**：记录操作和错误信息
3. **监控服务**：上报资源使用情况

### 8.2 外部依赖

1. **文件系统**：创建和管理用户数据目录
2. **Puppeteer**：设置Cookies和LocalStorage
3. **系统API**：获取资源使用情况

## 9. 验证方法和标准

### 9.1 功能验证

1. **数据隔离验证**
   - 创建多个会话，验证数据目录独立性
   - 检查文件权限设置是否正确
   - 验证数据清理是否完整

2. **状态管理验证**
   - 验证Cookies初始化是否正确
   - 检查LocalStorage隔离是否有效
   - 测试状态持久化和恢复

3. **资源管理验证**
   - 验证资源监控是否准确
   - 检查资源回收是否及时
   - 测试资源限制是否有效

### 9.2 性能验证

1. **启动时间**：浏览器启动时间增加不超过20%
2. **资源使用**：内存使用增长不超过10%
3. **并发性能**：支持并发会话数不低于当前水平

### 9.3 稳定性验证

1. **异常恢复**：系统异常后能正确恢复状态
2. **资源泄漏**：长时间运行无资源泄漏
3. **边界测试**：超出资源限制时的处理是否正确