# Web 登录错误调研与修复 - 最终报告

## 执行摘要

成功修复了 Web 登录流程中的 `TypeError: sign is not a function` 错误。问题源于 ES Module 与 CommonJS 互操作性导致的 JWT 导入问题。

---

## 1. 问题分析

### 1.1 错误信息
```
TypeError: sign is not a function
at generateToken (/src/utils/auth.ts:22:23)
```

### 1.2 根本原因

发现了**两个**JWT 导入问题：

#### 问题 1: `/src/routes/admin.routes.ts`
```typescript
// ❌ 错误的动态导入
const { sign } = await import('jsonwebtoken');
const token = sign(...);
```

#### 问题 2: `/src/utils/auth.ts`
```typescript
// ❌ 错误的命名空间导入
import * as jwt from 'jsonwebtoken';
return (jwt as any).sign(...);
```

#### 问题 3: `/src/plugins/auth.plugin.ts`
```typescript
// ❌ 硬编码的密钥不匹配
const jwtSecret = 'your-secret-key'; // 应该使用 env.JWT_SECRET
```

---

## 2. 修复方案

### 2.1 修复文件清单

| 文件 | 问题 | 修复 |
|------|------|------|
| `/src/routes/admin.routes.ts` | 动态导入 JWT | 使用 `generateToken` 工具函数 |
| `/src/utils/auth.ts` | `import * as jwt` | 改为 `import jwt` |
| `/src/plugins/auth.plugin.ts` | 硬编码密钥 | 使用 `env.JWT_SECRET` |
| `/src/routes/admin.routes.ts` | 缺少认证中间件 | 添加 `onRequest: [fastify.verifyJWT]` |

### 2.2 代码修复详情

#### 修复 1: `/src/utils/auth.ts`
```diff
- import * as jwt from 'jsonwebtoken';
+ import jwt from 'jsonwebtoken';

- return (jwt as any).sign(...);
+ return jwt.sign(...);
```

#### 修复 2: `/src/routes/admin.routes.ts`
```diff
- import jwt from 'jsonwebtoken';

- const { sign } = await import('jsonwebtoken');
- const token = sign(...);

+ const { generateToken } = await import('../utils/auth.js');
+ const token = generateToken({...});
```

#### 修复 3: `/src/plugins/auth.plugin.ts`
```diff
+ import { env } from '../config/env.js';

- const jwtSecret = 'your-secret-key';
+ const jwtSecret = String(env.JWT_SECRET);
```

#### 修复 4: 添加认证中间件
```diff
fastify.get('/admin', async (req, reply) => {
+ fastify.get('/admin', {
+   onRequest: [fastify.verifyJWT]
+ }, async (req, reply) => {
```

---

## 3. 验证结果

### 3.1 测试输出
```bash
$ curl -i -X POST http://localhost:3000/admin/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=REDACTED_ADMIN_PASS"

HTTP/1.1 302 Found
location: /admin
set-cookie: token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3.2 功能验证

| 测试项 | 结果 | 说明 |
|--------|------|------|
| 登录页面访问 | ✓ | HTTP 200 |
| 表单提交 | ✓ | HTTP 302 重定向 |
| Token 生成 | ✓ | JWT 格式正确 |
| Cookie 设置 | ✓ | HttpOnly + SameSite |
| 认证中间件 | ✓ | 正确验证 token |
| 未授权访问 | ✓ | 重定向到登录页 |

---

## 4. 技术总结

### 4.1 ES Module vs CommonJS

在 ES Module 中使用 `jsonwebtoken`:

| 方式 | 代码 | 结果 |
|------|------|------|
| 静态默认导入 | `import jwt from 'jsonwebtoken'` | ✓ 正确 |
| 命名空间导入 | `import * as jwt from 'jsonwebtoken'` | ✗ jwt.sign 为 undefined |
| 动态导入 + 默认 | `(await import('jsonwebtoken')).default` | ✓ 正确 |
| 动态导入 + 解构 | `const { sign } = await import(...)` | ✗ sign 为 undefined |

### 4.2 最佳实践

**推荐方式** (按优先级):

1. **顶部静态导入**:
   ```typescript
   import jwt from 'jsonwebtoken';
   ```

2. **使用工具函数**:
   ```typescript
   import { generateToken } from '../utils/auth.js';
   ```

3. **动态导入** (仅必要时):
   ```typescript
   const jwt = await import('jsonwebtoken');
   jwt.default.sign(...);
   ```

---

## 5. 相关文件

### 5.1 已修复文件
- [x] `/src/routes/admin.routes.ts`
- [x] `/src/utils/auth.ts`
- [x] `/src/plugins/auth.plugin.ts`

### 5.2 新建测试文件
- [x] `/tests/verify-jwt-import.mjs` - JWT 导入验证
- [x] `/tests/test-web-login-flow.cjs` - 完整登录流程测试
- [x] `/tests/quick-login-test.sh` - 快速登录测试

### 5.3 新建文档
- [x] `/docs/JWT_IMPORT_FIX.md` - JWT 导入问题详解
- [x] `/docs/WEB_LOGIN_COMPLETE_TEST.md` - 完整测试方案
- [x] `/docs/INVESTIGATION_REPORT.md` - 调研报告
- [x] `/docs/FINAL_SUMMARY.md` - 本文档

---

## 6. 测试命令

### 6.1 验证 JWT 导入
```bash
pnpm test:jwt:verify
```

### 6.2 测试 Web 登录流程
```bash
pnpm test:web:login
```

### 6.3 快速测试
```bash
bash tests/quick-login-test.sh
```

---

## 7. 验证清单

- [x] 根因分析完成
- [x] 所有代码问题修复
- [x] 测试用例创建
- [x] 文档编写完成
- [x] 功能验证通过
- [ ] 模板错误修复 (单独任务)
- [ ] 代码审查
- [ ] 部署到生产

---

## 8. 后续建议

### 8.1 立即行动
1. 统一项目中的 JWT 导入方式
2. 添加自动化测试防止回归
3. 修复仪表盘模板错误 (`recentSessions` 未定义)

### 8.2 长期改进
1. 建立 ES Module 导入规范文档
2. 在 CI/CD 中添加导入检查
3. 考虑迁移到纯 ES Module 或统一模块系统

---

## 9. 结论

Web 登录功能已完全修复。问题包括:

1. ✅ JWT 导入方式错误 - 已修复
2. ✅ 密钥配置不一致 - 已修复
3. ✅ 认证中间件缺失 - 已修复
4. ⏳ 模板变量缺失 - 待修复 (不影响登录)

**登录流程现已正常工作！**

---

**报告日期**: 2025-12-26
**修复状态**: 完成
**测试状态**: 通过
