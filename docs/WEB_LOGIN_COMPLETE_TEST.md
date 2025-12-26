# Web 登录流程完整测试方案

## 问题修复总结

### 错误根因

**错误信息**: `TypeError: sign is not a function`

**根本原因**: 在 `/src/routes/admin.routes.ts` 第 66 行使用了错误的 JWT 导入方式：

```typescript
// ❌ 错误代码
const { sign } = await import('jsonwebtoken');
const token = sign(...); // sign 是 undefined！
```

**技术原因**:
- `jsonwebtoken` 是 CommonJS 模块
- 在 ES Module 中使用动态导入 `import()` 时，模块导出在 `.default` 属性中
- 直接解构会导致获取 `undefined`

### 修复方案

已修复 `/src/routes/admin.routes.ts` 第 64-70 行：

```typescript
// ✅ 修复后 - 使用项目工具函数
const { generateToken } = await import('../utils/auth.js');
const token = generateToken({
  id: user.id,
  username: user.username,
  role: user.role
});
```

### 为什么选择工具函数方案

1. **一致性**: 其他登录接口（`/api/auth/login`, `/api/admin/login`）都使用 `generateToken`
2. **简洁性**: 不需要直接处理 JWT 配置
3. **可维护性**: JWT 逻辑集中在一处
4. **安全性**: 统一的密钥管理和错误处理

## 完整测试流程

### 准备工作

1. **启动服务器**:
```bash
pnpm dev:server
```

2. **验证环境变量** (.env.dev):
```
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=1d
ADMIN_USERNAME=admin
ADMIN_PASSWORD=REDACTED_ADMIN_PASS
```

### 测试用例 1: JWT 导入验证

**文件**: `/tests/verify-jwt-import.mjs`

```bash
node tests/verify-jwt-import.mjs
```

**预期输出**:
```
[Test 1] Default import: ✓
[Test 2] Named import: ✓ (expected to fail)
[Test 3] Token generation: ✓
```

### 测试用例 2: Web 登录完整流程

**文件**: `/tests/test-web-login-flow.cjs`

```bash
node tests/test-web-login-flow.cjs
```

**测试步骤**:
1. ✓ 服务器状态验证
2. ✓ 登录页面访问
3. ✓ 测试用户创建
4. ✓ Web 表单登录
5. ✓ Cookie 设置验证
6. ✓ 仪表盘访问
7. ✓ API 登录对比
8. ✓ 登出流程

### 测试用例 3: 手动测试

#### 3.1 访问登录页面
```bash
curl -i http://localhost:3000/admin/login
```

**预期**: HTTP 200, 包含登录表单

#### 3.2 提交登录表单
```bash
curl -i -X POST http://localhost:3000/admin/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=REDACTED_ADMIN_PASS" \
  -c cookies.txt
```

**预期**: HTTP 302, 重定向到 `/admin`, 设置 Cookie

#### 3.3 访问受保护页面
```bash
curl -i http://localhost:3000/admin \
  -b cookies.txt
```

**预期**: HTTP 200, 显示仪表盘

#### 3.4 验证 Cookie
```bash
cat cookies.txt
```

**预期**: 包含 `token` Cookie

## 登录接口对比

### API 登录 vs Web 登录

| 特性 | API 登录 | Web 登录 |
|------|---------|---------|
| 路径 | `/api/auth/login` | `/admin/login` |
| 方法 | POST | POST |
| Content-Type | application/json | application/x-www-form-urlencoded |
| 响应 | JSON (包含 token) | HTML (重定向) |
| Token 传递 | Authorization: Bearer | Cookie |
| 成功后 | 返回用户信息 + token | 重定向到仪表盘 |

### 三个登录接口实现

#### 1. `/api/auth/login` - 普通用户 API 登录

**文件**: `src/controllers/auth.controller.ts`

```typescript
export async function login(request: FastifyRequest, reply: FastifyReply) {
  // ...
  const token = generateToken({
    id: user.id,
    username: user.username,
    role: user.role,
  });
  return sendSuccess(reply, { user, token });
}
```

#### 2. `/api/admin/login` - 管理员 API 登录

**文件**: `src/routes/admin-api-auth.routes.ts`

```typescript
fastify.post('/api/admin/login', async (request, reply) => {
  // ...
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
  return reply.send({ success: true, data: { user, token } });
});
```

#### 3. `/admin/login` - Web 表单登录

**文件**: `src/routes/admin.routes.ts` (已修复)

```typescript
fastify.post('/admin/login', async (request, reply) => {
  // ...
  const { generateToken } = await import('../utils/auth.js');
  const token = generateToken({
    id: user.id,
    username: user.username,
    role: user.role
  });

  reply.setCookie('token', token, { /* options */ });
  return reply.redirect('/admin');
});
```

## 故障排查

### 问题 1: "sign is not a function"

**原因**: JWT 导入方式错误

**检查**:
```bash
grep -n "import.*jsonwebtoken\|await import('jsonwebtoken')" src/routes/admin.routes.ts
```

**修复**: 使用 `generateToken` 工具函数

### 问题 2: Cookie 未设置

**检查点**:
- `@fastify/cookie` 插件已注册
- `reply.setCookie()` 调用正确
- 浏览器未阻止 Cookie

**调试**:
```typescript
console.log('Setting cookie:', token);
reply.setCookie('token', token, {
  path: '/',
  httpOnly: true,
  secure: false, // 开发环境
  sameSite: true
});
```

### 问题 3: 重定向后仍显示登录页

**检查点**:
- Token 是否正确生成
- Cookie 是否正确设置
- 认证中间件是否正确

**调试**:
```bash
# 检查 Cookie
curl -v http://localhost:3000/admin \
  -b "token=YOUR_TOKEN"

# 检查 Token
node -e "
const jwt = require('jsonwebtoken');
const decoded = jwt.verify('YOUR_TOKEN', 'your-secret-key');
console.log(decoded);
"
```

## 相关文件

- **主路由**: `/src/routes/admin.routes.ts` (已修复)
- **工具函数**: `/src/utils/auth.ts`
- **认证插件**: `/src/plugins/auth.plugin.ts`
- **配置**: `/src/config/index.ts`
- **测试**: `/tests/test-web-login-flow.cjs`
- **文档**: `/docs/JWT_IMPORT_FIX.md`

## 验证清单

- [x] JWT 导入问题修复
- [x] 代码审查通过
- [x] 单元测试创建
- [ ] 集成测试通过
- [ ] 手动测试验证
- [ ] 文档更新完成

## 下一步

1. 运行完整测试套件:
```bash
node tests/test-web-login-flow.cjs
```

2. 测试所有登录接口:
```bash
pnpm test:login
```

3. 更新 API 文档

4. 通知团队修复
