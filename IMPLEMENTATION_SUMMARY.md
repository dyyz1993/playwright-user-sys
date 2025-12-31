# 浏览器启动参数实现总结

## 实现概述

成功在 `src/machine/browser.service.ts` 中实现了浏览器启动参数支持，包括 `storageStatePath`、`storageState` 和 `userDataDir` 三个新参数。

## 实现详情

### 1. 扩展的 BrowserOptions 接口

在 `/Users/xuyingzhou/Project/study-node-ts/playwright-user-sys/src/machine/browser.service.ts` 中添加了以下参数：

```typescript
export interface BrowserOptions {
  // ... 现有参数 ...

  // 状态持久化参数
  storageStatePath?: string; // 从文件加载存储状态

  storageState?: {
    // 直接传递存储状态对象
    cookies?: Array<{
      name: string;
      value: string;
      domain: string;
      path: string;
      expires?: number;
      httpOnly?: boolean;
      secure?: boolean;
      sameSite: "Strict" | "Lax" | "None";
    }>;
    origins?: Array<{
      origin: string;
      localStorage: Array<{ name: string; value: string }>;
    }>;
  };

  userDataDir?: string; // 用户数据目录路径
}
```

### 2. convertPuppeteerOptions 方法修改

在 `convertPuppeteerOptions` 方法中添加了对 `userDataDir` 的处理：

```typescript
// 处理 userDataDir - 必须在启动时传递
if (options.userDataDir) {
  result.args.push(`--user-data-dir=${options.userDataDir}`);
  logger.info(`设置 userDataDir: ${options.userDataDir}`);
}
```

### 3. launchBrowser 方法修改

在浏览器启动后添加了 `storageState` 处理逻辑：

```typescript
// 处理 storageState - 在浏览器启动后设置 Cookie 和 localStorage
if (options.storageStatePath || options.storageState) {
  try {
    let storageState = options.storageState;

    // 如果是路径，从文件加载
    if (options.storageStatePath && !storageState) {
      logger.info(`从文件加载 storageState: ${options.storageStatePath}`);
      const storageContent = await fs.readFile(options.storageStatePath, 'utf-8');
      storageState = JSON.parse(storageContent);
    }

    // 设置 cookies
    if (storageState?.cookies && Array.isArray(storageState.cookies)) {
      logger.info(`设置 ${storageState.cookies.length} 个 cookies`);
      try {
        await primaryPage.setCookie(...storageState.cookies);
        logger.info('✅ Cookies 设置成功');
      } catch (cookieError) {
        logger.warn('设置 Cookies 失败:', cookieError);
      }
    }

    // 设置 localStorage
    if (storageState?.origins && Array.isArray(storageState.origins)) {
      logger.info(`为 ${storageState.origins.length} 个 origin 设置 localStorage`);
      for (const origin of storageState.origins) {
        try {
          // 导航到对应 origin
          await primaryPage.goto(origin.origin, { waitUntil: 'domcontentloaded', timeout: 10000 });

          // 设置 localStorage
          await primaryPage.evaluate((items) => {
            items.forEach(item => {
              localStorage.setItem(item.name, item.value);
            });
          }, origin.localStorage);

          logger.info(`✅ localStorage 设置成功: ${origin.origin}`);
        } catch (originError) {
          logger.warn(`设置 localStorage 失败 (${origin.origin}):`, originError);
        }
      }
    }
  } catch (error) {
    logger.error('处理 storageState 时出错:', error);
  }
}
```

### 4. Schema 验证更新

在 `/Users/xuyingzhou/Project/study-node-ts/playwright-user-sys/src/schemas/session.schema.ts` 中添加了相应的 Zod 验证模式：

```typescript
// Cookie 模式
const cookieSchema = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string(),
  path: z.string(),
  expires: z.number().optional(),
  httpOnly: z.boolean().optional(),
  secure: z.boolean().optional(),
  sameSite: z.enum(['Strict', 'Lax', 'None']).optional(),
});

// localStorage 项模式
const localStorageItemSchema = z.object({
  name: z.string(),
  value: z.string(),
});

// Origin 模式
const originSchema = z.object({
  origin: z.string(),
  localStorage: z.array(localStorageItemSchema),
});

// StorageState 模式
const storageStateSchema = z.object({
  cookies: z.array(cookieSchema).optional(),
  origins: z.array(originSchema).optional(),
});

// 创建会话请求模式
export const createSessionRequestSchema = z.object({
  // ... 现有字段 ...
  storageStatePath: z.string().optional(),
  storageState: storageStateSchema.optional(),
  userDataDir: z.string().optional(),
}).strict();
```

## 测试验证

### 单元测试

创建了两个单元测试文件：

1. **`tests/unit/browser-options.test.ts`** - 测试 Schema 验证
   - 测试 storageStatePath 参数验证
   - 测试 storageState 对象验证（包含 cookies）
   - 测试 storageState 对象验证（包含 origins）
   - 测试 userDataDir 参数验证
   - 测试多参数同时使用
   - 测试无效格式拒绝

2. **`tests/unit/browser-service-storage.test.ts`** - 测试 BrowserService 处理逻辑
   - 测试 storageStatePath 参数处理
   - 测试 userDataDir 参数处理
   - 测试多参数同时处理
   - 测试包含 origins 的 storageState 处理
   - 测试完整的 storageState 处理

### 测试结果

所有单元测试均通过：

```
✓ tests/unit/browser-options.test.ts > 浏览器选项 Schema 验证 > 应该接受 storageStatePath 参数
✓ tests/unit/browser-options.test.ts > 浏览器选项 Schema 验证 > 应该接受 storageState 对象（包含 cookies）
✓ tests/unit/browser-options.test.ts > 浏览器选项 Schema 验证 > 应该接受 storageState 对象（包含 origins）
✓ tests/unit/browser-options.test.ts > 浏览器选项 Schema 验证 > 应该接受 userDataDir 参数
✓ tests/unit/browser-options.test.ts > 浏览器选项 Schema 验证 > 应该同时接受多个新参数
✓ tests/unit/browser-options.test.ts > 浏览器选项 Schema 验证 > 应该拒绝无效的 storageState 格式
✓ tests/unit/browser-options.test.ts > 浏览器选项 Schema 验证 > 应该拒绝无效的 sameSite 值

✓ tests/unit/browser-service-storage.test.ts > BrowserService storageState 处理 > 应该正确处理 storageStatePath 参数
✓ tests/unit/browser-service-storage.test.ts > BrowserService storageState 处理 > 应该正确处理 userDataDir 参数
✓ tests/unit/browser-service-storage.test.ts > BrowserService storageState 处理 > 应该同时处理多个参数
✓ tests/unit/browser-service-storage.test.ts > BrowserService storageState 处理 > 应该正确处理包含 origins 的 storageState
✓ tests/unit/browser-service-storage.test.ts > BrowserService storageState 处理 > 应该正确处理包含 cookies 和 origins 的完整 storageState
```

## 功能说明

### storageStatePath 参数

- **用途**: 从 JSON 文件加载存储状态（cookies 和 localStorage）
- **实现**: 在浏览器启动后，读取文件并解析为 storageState 对象，然后设置 cookies 和 localStorage
- **文件格式**: 符合 Playwright storageState 标准的 JSON 文件

### storageState 参数

- **用途**: 直接传递存储状态对象，无需文件
- **实现**: 在浏览器启动后，直接使用传入的对象设置 cookies 和 localStorage
- **支持**:
  - `cookies`: 数组，包含 Cookie 对象
  - `origins`: 数组，包含 origin 和其 localStorage 数据

### userDataDir 参数

- **用途**: 指定用户数据目录，实现数据持久化
- **实现**: 通过 Chrome 的 `--user-data-dir` 启动参数传递
- **效果**: 浏览器的所有数据（cookies、localStorage、缓存等）都会保存在指定目录

## 注意事项

1. **Cookie 设置**: 需要先导航到对应域名才能设置该域名的 Cookie
2. **localStorage 设置**: 需要先导航到对应 origin 才能设置其 localStorage
3. **错误处理**: 添加了完善的错误处理和日志记录
4. **兼容性**: 参数设计符合 Playwright MCP 的标准
5. **安全性**: 使用 Zod 进行严格的输入验证

## 后续建议

1. **集成测试**: 当前由于数据库连接池问题，集成测试无法运行。建议在修复数据库问题后重新运行 TIER-072 到 TIER-075 测试。
2. **性能优化**: 对于大量 origins 的 localStorage 设置，可以考虑批量处理
3. **文档更新**: 更新 API 文档，说明新参数的用法

## 修改的文件

1. `/Users/xuyingzhou/Project/study-node-ts/playwright-user-sys/src/machine/browser.service.ts`
2. `/Users/xuyingzhou/Project/study-node-ts/playwright-user-sys/src/schemas/session.schema.ts`
3. `/Users/xuyingzhou/Project/study-node-ts/playwright-user-sys/tests/unit/browser-options.test.ts` (新建)
4. `/Users/xuyingzhou/Project/study-node-ts/playwright-user-sys/tests/unit/browser-service-storage.test.ts` (新建)
