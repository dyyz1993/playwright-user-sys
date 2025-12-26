# 阶段3: Controllers层测试方案

## 文档说明

- **文档**: 03-阶段3-Controllers层测试.md
- **依赖**: [00-测试方案总纲.md](./00-测试方案总纲.md)
- **前置**: [01-阶段1-Models层测试.md](./01-阶段1-Models层测试.md)
- **状态**: 待执行
- **预计时间**: 2.5天

---

## 1. 测试目标

Controllers层是请求处理层，负责参数验证、调用Service和返回响应。测试目标是确保：

1. **请求处理正确** - 正确解析请求、调用Service、返回响应
2. **参数验证正确** - Schema验证生效
3. **错误处理正确** - 返回正确的HTTP状态码和错误信息
4. **响应格式正确** - 统一的响应格式

---

## 2. 测试策略

### 2.1 Mock 策略

**必须 Mock**:
- 所有Services层
- 所有Models层 (间接，通过Services)

**不 Mock**:
- 被测试的Controller函数
- Fastify的 `inject()` 方法 (真实HTTP模拟)

### 2.2 测试方法

使用 **Fastify inject()** 进行内存HTTP测试：

```typescript
const response = await app.inject({
  method: 'POST',
  url: '/api/auth/login',
  payload: { username, password },
});
```

---

## 3. 测试文件结构

```
src/tests/unit/controllers/
├── auth.controller.test.ts       # 认证控制器测试
├── session.controller.test.ts    # 会话控制器测试
└── user.controller.test.ts       # 用户控制器测试
```

---

## 4. AuthController 测试方案

### 4.1 文件位置
`src/tests/unit/controllers/auth.controller.test.ts`

### 4.2 Mock 设置

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildTestApp } from '../../helpers/app.js';

// Mock Services
vi.mock('../../../services/session.service.js', () => ({
  createBrowserSession: vi.fn(),
}));

vi.mock('../../../models/user.model.js', () => ({
  UserModel: {
    findByUsername: vi.fn(),
    findById: vi.fn(),
    verifyPassword: vi.fn(),
  },
}));
```

### 4.3 测试用例清单

| ID | 测试用例 | 预期结果 | 优先级 |
|----|---------|---------|--------|
| AC-01 | 登录 - 成功 | 200 + token + 用户信息 | P0 |
| AC-02 | 登录 - 用户不存在 | 401 + 错误信息 | P0 |
| AC-03 | 登录 - 密码错误 | 401 + 错误信息 | P0 |
| AC-04 | 登录 - 用户被禁用 | 403 + 错误信息 | P0 |
| AC-05 | 登录 - 缺少必填字段 | 400 + 验证错误 | P0 |
| AC-06 | 登录 - 参数类型错误 | 400 + 验证错误 | P0 |
| AC-07 | 获取当前用户 - 已认证 | 200 + 用户信息 | P0 |
| AC-08 | 获取当前用户 - 未认证 | 401 | P0 |
| AC-09 | 获取当前用户 - 用户不存在 | 404 | P0 |

### 4.4 测试模板

```typescript
describe('AuthController', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
    vi.clearAllMocks();
  });

  describe('POST /api/auth/login', () => {
    it('登录成功应该返回token和用户信息', async () => {
      // Arrange
      const hashedPassword = await hashPassword('password123');
      vi.mocked(UserModel.findByUsername).mockResolvedValue({
        id: 1,
        username: 'testuser',
        password: hashedPassword,
        role: 'user',
        status: 'active',
      });

      // Act
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'testuser',
          password: 'password123',
        },
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.data.user.username).toBe('testuser');
      expect(result.data.token).toBeTruthy();
      expect(result.data.user).not.toHaveProperty('password');  // 不返回密码
    });

    it('用户不存在时返回401', async () => {
      vi.mocked(UserModel.findByUsername).mockResolvedValue(null);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'nonexistent',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(401);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(false);
      expect(result.error).toContain('用户名或密码错误');
    });

    it('密码错误时返回401', async () => {
      const hashedPassword = await hashPassword('password123');
      vi.mocked(UserModel.findByUsername).mockResolvedValue({
        id: 1,
        username: 'testuser',
        password: hashedPassword,
      });
      vi.mocked(UserModel.verifyPassword).mockResolvedValue(false);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'testuser',
          password: 'wrongpassword',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('缺少必填字段时返回400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'testuser',
          // 缺少 password
        },
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(false);
    });
  });

  describe('GET /api/auth/me', () => {
    it('已认证用户返回用户信息', async () => {
      const mockUser = { id: 1, username: 'testuser', role: 'user' };
      vi.mocked(UserModel.findById).mockResolvedValue(mockUser);

      const token = generateToken(mockUser);

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.data.username).toBe('testuser');
    });

    it('未认证时返回401', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        // 没有 Authorization header
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
```

---

## 5. SessionController 测试方案

### 5.1 文件位置
`src/tests/unit/controllers/session.controller.test.ts`

### 5.2 测试用例清单

| ID | 测试用例 | 预期结果 | 优先级 |
|----|---------|---------|--------|
| SC-01 | 创建会话 - 成功 | 201 + 会话信息 | P0 |
| SC-02 | 创建会话 - 未认证 | 401 | P0 |
| SC-03 | 创建会话 - 点数不足 | 400 + 错误信息 | P0 |
| SC-04 | 创建会话 - 无可用机器 | 500 + 错误信息 | P0 |
| SC-05 | 获取会话 - 有权限 | 200 + 会话详情 | P0 |
| SC-06 | 获取会话 - 无权限 | 403 | P0 |
| SC-07 | 获取会话 - 不存在 | 404 | P0 |
| SC-08 | 释放会话 - 成功 | 200 + 更新后信息 | P0 |
| SC-09 | 释放会话 - 不存在 | 404 | P0 |
| SC-10 | 关闭会话 - 管理员 | 200 | P0 |
| SC-11 | 关闭会话 - 非管理员 | 403 | P0 |
| SC-12 | 获取所有会话 - 管理员 | 200 + 分页数据 | P0 |
| SC-13 | 获取所有会话 - 非管理员 | 403 | P0 |
| SC-14 | 获取用户会话列表 - 分页 | 200 + 分页数据 | P0 |

---

## 6. UserController 测试方案

### 6.1 文件位置
`src/tests/unit/controllers/user.controller.test.ts`

### 6.2 测试用例清单

| ID | 测试用例 | 预期结果 | 优先级 |
|----|---------|---------|--------|
| UC-01 | 创建用户 - 管理员 | 201 + 用户信息 | P0 |
| UC-02 | 创建用户 - 非管理员 | 403 | P0 |
| UC-03 | 创建用户 - 用户名重复 | 409 | P0 |
| UC-04 | 创建用户 - 参数验证失败 | 400 | P0 |
| UC-05 | 获取用户列表 - 管理员 | 200 + 分页数据 | P0 |
| UC-06 | 获取用户列表 - 非管理员 | 403 | P0 |
| UC-07 | 获取单个用户 - 管理员 | 200 + 用户信息 | P0 |
| UC-08 | 获取单个用户 - 不存在 | 404 | P0 |
| UC-09 | 更新用户 - 成功 | 200 + 更新后信息 | P0 |
| UC-10 | 更新用户 - 不存在 | 404 | P0 |
| UC-11 | 删除用户 - 成功 | 204 | P0 |
| UC-12 | 删除用户 - 管理员自己 | 400 + 错误信息 | P0 |
| UC-13 | 重置API Key | 200 + 新key | P0 |
| UC-14 | 获取会话统计 | 200 + 统计数据 | P1 |

---

## 7. 验收标准

### 7.1 完成标准

- [ ] 所有测试用例编写完成
- [ ] 所有测试通过
- [ ] 代码覆盖率 ≥ 80% (行), ≥ 70% (分支)
- [ ] 无跳过的测试
- [ ] 测试可在2分钟内完成

### 7.2 问题记录

```typescript
test.skip('Bug记录: XXX问题', async () => {
  // 记录问题详情
});
```

---

*文档创建日期: 2024-12-25*
*预计完成日期: 2025-01-02*
