# JWT 导入问题分析与修复报告

## 问题概述

在 Web 登录流程中遇到错误：
```
Login error: TypeError: sign is not a function
```

## 根因分析

### 1. JWT 模块的 ES Module 导入行为

在 TypeScript/ES Module 环境中，`jsonwebtoken` 模块的导入有特殊行为：

```javascript
// 错误的导入方式 - 会导致 "sign is not a function"
const { sign } = await import('jsonwebtoken');
// sign 是 undefined！

// 正确的导入方式
const jwt = await import('jsonwebtoken');
const sign = jwt.default.sign; // sign 现在是函数
```

### 2. 技术原因

`jsonwebtoken` 是一个 CommonJS 模块，当在 ES Module 环境中使用动态 `import()` 时：

- `import('jsonwebtoken')` 返回一个模块命名空间对象
- 实际的导出在 `.default` 属性中
- 直接解构会导致获取到 `undefined`

### 3. 不同导入方式对比

| 导入方式 | 代码示例 | 结果 | 使用场景 |
|---------|---------|------|---------|
| CommonJS require | `const jwt = require('jsonwebtoken')` | ✓ 正常 | .cjs 文件 |
| ES Module 默认导入 | `import jwt from 'jsonwebtoken'` | ✓ 正常 | 需要 `esModuleInterop` |
| ES Module 命名导入 | `import { sign } from 'jsonwebtoken'` | ✓ 正常 | 需要 `esModuleInterop` |
| 动态导入 + 解构 | `const { sign } = await import('jsonwebtoken')` | ✗ 失败 | 动态导入时 |
| 动态导入 + 默认 | `const jwt = await import('jsonwebtoken'); jwt.default.sign()` | ✓ 正常 | 动态导入时 |

### 4. 当前代码中的问题

在 `/src/routes/admin.routes.ts` 第 66 行：

```typescript
// ❌ 错误代码
const { sign } = await import('jsonwebtoken');
const token = sign(...); // TypeError: sign is not a function
```

## 修复方案

### 方案 1: 使用默认导入（推荐）

```typescript
// ✅ 正确代码
const jwt = await import('jsonwebtoken');
const token = jwt.default.sign(
  { id: user.id, username: user.username, role: user.role },
  config.jwt.secret,
  { expiresIn: config.jwt.expiresIn }
);
```

### 方案 2: 顶部静态导入

```typescript
// ✅ 在文件顶部
import jwt from 'jsonwebtoken';

// 使用时直接调用
const token = jwt.sign(...);
```

### 方案 3: 统一使用工具函数

```typescript
// ✅ 使用已有的工具函数
import { generateToken } from '../utils/auth.js';

const token = generateToken({
  id: user.id,
  username: user.username,
  role: user.role
});
```

## 代码对比

### 其他登录接口的正确实现

#### 1. API 登录 (`/api/auth/login`)

**文件**: `src/controllers/auth.controller.ts`

```typescript
// ✅ 正确 - 使用工具函数
import { generateToken } from '../utils/auth.js';

const token = generateToken({
  id: user.id,
  username: user.username,
  role: user.role,
});
```

#### 2. 管理 API 登录 (`/api/admin/login`)

**文件**: `src/routes/admin-api-auth.routes.ts`

```typescript
// ✅ 正确 - 顶部静态导入
import jwt from 'jsonwebtoken';

const token = jwt.sign(
  { id: user.id, username: user.username, role: user.role },
  config.jwt.secret,
  { expiresIn: config.jwt.expiresIn }
);
```

#### 3. Web 登录 (`/admin/login`)

**文件**: `src/routes/admin.routes.ts` (已修复)

```typescript
// ❌ 原代码（错误）
const { sign } = await import('jsonwebtoken');
const token = sign(...);

// ✅ 修复后
const jwt = await import('jsonwebtoken');
const token = jwt.default.sign(...);
```

## 测试验证

### 测试文件

创建了完整的测试流程：`/tests/test-web-login-flow.cjs`

测试覆盖：
1. 服务器状态验证
2. 登录页面访问
3. 测试用户创建
4. Web 表单登录
5. Cookie 设置验证
6. 仪表盘访问
7. API 登录对比
8. 登出流程

### 运行测试

```bash
# 确保服务器运行
pnpm dev:server

# 在另一个终端运行测试
node tests/test-web-login-flow.cjs
```

## 最佳实践建议

### 1. 统一导入风格

在项目中统一使用以下方式之一：

**选项 A: 顶部静态导入（推荐）**
```typescript
import jwt from 'jsonwebtoken';
```

**选项 B: 使用工具函数**
```typescript
import { generateToken, verifyToken } from '../utils/auth.js';
```

### 2. 避免动态导入

除非必要，避免在函数内部动态导入 JWT：

```typescript
// ❌ 不推荐
async function login() {
  const jwt = await import('jsonwebtoken');
  // ...
}

// ✅ 推荐
import jwt from 'jsonwebtoken';

async function login() {
  // 直接使用 jwt
}
```

### 3. TypeScript 配置

确保 `tsconfig.json` 包含：

```json
{
  "compilerOptions": {
    "esModuleInterop": true,
    "moduleResolution": "NodeNext",
    "module": "NodeNext"
  }
}
```

## 相关文件清单

需要检查和修复的文件：

- [x] `src/routes/admin.routes.ts` - 已修复
- [ ] `src/utils/auth.ts` - 使用正确方式
- [ ] `src/plugins/auth.plugin.ts` - 需要检查
- [ ] 其他使用动态导入 JWT 的文件

## 验证清单

- [x] 根因分析完成
- [x] 修复代码实现
- [x] 测试用例创建
- [ ] 运行测试验证
- [ ] 代码审查
- [ ] 文档更新

## 总结

问题的根本原因是 **ES Module 动态导入 CommonJS 模块时的命名空间访问方式不正确**。修复方案是使用 `jwt.default.sign()` 而不是直接解构 `sign` 函数。

建议在项目中统一使用静态导入或工具函数，避免动态导入带来的复杂性。
