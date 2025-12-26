# Web 登录错误深度调研报告

**日期**: 2025-12-26
**调研者**: Claude Code
**问题**: `TypeError: sign is not a function`

---

## 执行摘要

在 Web 登录流程中发现 JWT token 生成失败，经深入调研确定为 ES Module 动态导入 CommonJS 模块时的命名空间访问问题。已修复代码并创建完整测试用例。

---

## 1. 错误根因分析

### 1.1 错误信息

```
Login error: TypeError: sign is not a function
```

**发生位置**: `/src/routes/admin.routes.ts` 第 66 行

### 1.2 技术根因

**问题代码**:
```typescript
const { sign } = await import('jsonwebtoken');
const token = sign(...); // TypeError!
```

**错误原因**:
1. `jsonwebtoken` 是一个 CommonJS 模块
2. 在 ES Module 环境中使用动态 `import()` 时
3. 模块的默认导出在 `.default` 属性中
4. 直接解构会获取 `undefined`

**验证测试**:
```javascript
// 验证结果
const jwt = await import('jsonwebtoken');
console.log(typeof jwt.sign);         // undefined
console.log(typeof jwt.default);      // object
console.log(typeof jwt.default.sign); // function
```

### 1.3 ES Module vs CommonJS 互操作

| 导入方式 | 代码 | 结果 |
|---------|------|------|
| CommonJS require | `const jwt = require('jsonwebtoken')` | ✓ 正常 |
| ES 静态导入 | `import jwt from 'jsonwebtoken'` | ✓ 正常 |
| ES 动态导入 | `const jwt = await import('jsonwebtoken')` | ✓ 需要 `.default` |
| 动态解构 | `const { sign } = await import('jsonwebtoken')` | ✗ 失败 |

---

## 2. 完整登录流程分析

### 2.1 登录接口对比

| 接口 | 路径 | 用途 | Token 方式 | 状态 |
|------|------|------|-----------|------|
| 普通 API | `/api/auth/login` | 用户登录 | Bearer Token | ✓ 正常 |
| 管理 API | `/api/admin/login` | 管理员登录 | Bearer Token | ✓ 正常 |
| Web 表单 | `/admin/login` | 网页登录 | Cookie | ✗ 已修复 |

### 2.2 三个接口实现对比

#### 接口 1: `/api/auth/login` (src/controllers/auth.controller.ts)

```typescript
// ✓ 使用工具函数
import { generateToken } from '../utils/auth.js';

const token = generateToken({
  id: user.id,
  username: user.username,
  role: user.role,
});
```

#### 接口 2: `/api/admin/login` (src/routes/admin-api-auth.routes.ts)

```typescript
// ✓ 使用静态导入
import jwt from 'jsonwebtoken';

const token = jwt.sign(
  { id: user.id, username: user.username, role: user.role },
  config.jwt.secret,
  { expiresIn: config.jwt.expiresIn }
);
```

#### 接口 3: `/admin/login` (src/routes/admin.routes.ts)

**修复前**:
```typescript
// ✗ 错误的动态导入
const { sign } = await import('jsonwebtoken');
const token = sign(...); // TypeError!
```

**修复后**:
```typescript
// ✓ 使用工具函数
const { generateToken } = await import('../utils/auth.js');
const token = generateToken({
  id: user.id,
  username: user.username,
  role: user.role
});
```

---

## 3. 修复方案

### 3.1 代码修复

**文件**: `/src/routes/admin.routes.ts`

**修改内容**:
```diff
- import jwt from 'jsonwebtoken';
+ // (移除顶部导入)

  // 在登录处理函数中:
- const { sign } = await import('jsonwebtoken');
- const token = sign(
-   { id: user.id, username: user.username, role: user.role },
-   config.jwt.secret,
-   { expiresIn: config.jwt.expiresIn }
- );
+ const { generateToken } = await import('../utils/auth.js');
+ const token = generateToken({
+   id: user.id,
+   username: user.username,
+   role: user.role
+ });
```

### 3.2 修复原因

1. **一致性**: 与其他登录接口保持一致
2. **可维护性**: JWT 逻辑集中在 `auth.ts`
3. **简洁性**: 不需要重复配置管理
4. **安全性**: 统一的密钥管理

---

## 4. 测试用例

### 4.1 JWT 导入验证测试

**文件**: `/tests/verify-jwt-import.mjs`

**运行**:
```bash
pnpm test:jwt:verify
```

**覆盖**:
- [x] 默认导入验证
- [x] 命名导入失败确认
- [x] Token 生成测试
- [x] Token 验证测试
- [x] 工具函数测试

### 4.2 Web 登录流程测试

**文件**: `/tests/test-web-login-flow.cjs`

**运行**:
```bash
pnpm test:web:login
```

**测试步骤**:
1. [x] 服务器状态验证
2. [x] 登录页面访问
3. [x] 测试用户创建
4. [x] Web 表单登录
5. [x] Cookie 设置验证
6. [x] 仪表盘访问
7. [x] API 登录对比
8. [x] 登出流程

### 4.3 手动测试命令

```bash
# 1. 访问登录页
curl -i http://localhost:3000/admin/login

# 2. 提交登录表单
curl -i -X POST http://localhost:3000/admin/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=REDACTED_ADMIN_PASS" \
  -c cookies.txt

# 3. 访问受保护页面
curl -i http://localhost:3000/admin -b cookies.txt

# 4. 验证 Token
cat cookies.txt
```

---

## 5. 相关文件清单

### 5.1 已修改文件

- [x] `/src/routes/admin.routes.ts` - JWT 导入修复

### 5.2 新建文件

- [x] `/docs/JWT_IMPORT_FIX.md` - JWT 导入问题详解
- [x] `/docs/WEB_LOGIN_COMPLETE_TEST.md` - 完整测试方案
- [x] `/tests/verify-jwt-import.mjs` - JWT 验证测试
- [x] `/tests/test-web-login-flow.cjs` - 登录流程测试

### 5.3 相关文件（无需修改）

- `/src/utils/auth.ts` - 工具函数（正确实现）
- `/src/plugins/auth.plugin.ts` - 认证插件（正确实现）
- `/src/controllers/auth.controller.ts` - API 登录（正确实现）
- `/src/routes/admin-api-auth.routes.ts` - 管理 API 登录（正确实现）

---

## 6. 最佳实践建议

### 6.1 导入规范

**推荐方式** (按优先级):

1. **顶部静态导入** (最推荐):
   ```typescript
   import jwt from 'jsonwebtoken';
   ```

2. **使用工具函数** (推荐):
   ```typescript
   import { generateToken } from '../utils/auth.js';
   ```

3. **动态导入 + 默认** (如必须动态):
   ```typescript
   const jwt = await import('jsonwebtoken');
   jwt.default.sign(...);
   ```

**禁止方式**:
   ```typescript
   // ✗ 不要这样做
   const { sign } = await import('jsonwebtoken');
   ```

### 6.2 TypeScript 配置

确保 `tsconfig.json` 包含:
```json
{
  "compilerOptions": {
    "esModuleInterop": true,
    "moduleResolution": "NodeNext",
    "module": "NodeNext"
  }
}
```

### 6.3 代码审查要点

- [ ] 检查所有 JWT 动态导入
- [ ] 确保使用工具函数或正确的默认导入
- [ ] 验证错误处理
- [ ] 确认配置正确性

---

## 7. 验证清单

- [x] 根因分析完成
- [x] 代码修复实现
- [x] 单元测试创建
- [x] 集成测试创建
- [x] 文档编写完成
- [ ] 手动测试验证
- [ ] 代码审查通过
- [ ] 部署到测试环境

---

## 8. 下一步行动

### 立即执行

1. **运行测试验证**:
   ```bash
   pnpm test:jwt:verify
   pnpm test:web:login
   ```

2. **启动服务器测试**:
   ```bash
   pnpm dev:server
   ```

3. **浏览器测试**:
   - 访问 http://localhost:3000/admin/login
   - 使用 admin/REDACTED_ADMIN_PASS 登录
   - 验证重定向到仪表盘

### 后续跟进

1. 将修复提交到代码仓库
2. 更新相关 API 文档
3. 通知团队成员修改
4. 添加 CI/CD 测试

---

## 9. 技术总结

### 问题类型

ES Module 与 CommonJS 互操作性问题

### 解决模式

使用统一工具函数抽象底层库的导入差异

### 经验教训

1. 在混合模块系统中，优先使用静态导入
2. 创建工具函数封装第三方库
3. 动态导入时注意命名空间差异
4. 编写测试验证导入方式

---

## 10. 参考资料

- [Node.js ES Modules](https://nodejs.org/api/esm.html)
- [jsonwebtoken Documentation](https://www.npmjs.com/package/jsonwebtoken)
- [Typebook Module Resolution](https://www.typescriptlang.org/docs/handbook/module-resolution.html)

---

**报告结束**
