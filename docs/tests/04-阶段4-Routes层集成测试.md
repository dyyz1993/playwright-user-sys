# 阶段4: Routes层集成测试方案

## 文档说明

- **文档**: 04-阶段4-Routes层集成测试.md
- **依赖**: [00-测试方案总纲.md](./00-测试方案总纲.md)
- **前置**: [01-阶段1-Models层测试.md](./01-阶段1-Models层测试.md)
- **状态**: 待执行
- **预计时间**: 2天

---

## 1. 测试目标

Routes层是集成测试层，验证完整的请求-响应流程。测试目标是确保：

1. **端到端流程正确** - 完整的HTTP请求处理
2. **中间件正确工作** - 认证、授权、日志
3. **集成正确** - Controller + Service + Model 协同工作
4. **错误处理正确** - 统一的错误响应格式

---

## 2. 测试策略

### 2.1 集成测试原则

```
┌─────────────────────────────────────────────────────────────┐
│                    Routes集成测试                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   HTTP Request → Middleware → Controller → Service → Model │
│       │              │            │         │        │    │
│       │              │            │         │        ▼    │
│       │              │            │         │   真实数据库   │
│       │              │            │         │   (内存SQLite) │
│       │              │            │         │              │
│       ▼              ▼            ▼         │              │
│   真实执行        真实执行      真实执行    真实执行        │
│                                                             │
│   Mock: 仅外部依赖 (gRPC, 第三方API)                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 数据库策略

使用 **真实内存数据库**，完整的数据流：
- Models层真实执行SQL
- Services层真实调用Models
- Controllers层真实调用Services
- 中间件真实执行

### 2.3 最小Mock原则

**Mock**:
- `connectionManager` (gRPC服务)
- `createWebhookEvent` (Webhook通知)
- 外部API调用 (如果有)

**不Mock**:
- 数据库操作
- 业务逻辑
- 请求处理

---

## 3. 测试文件结构

```
src/tests/integration/routes/
├── auth.routes.test.ts           # 认证路由集成测试
├── session.routes.test.ts        # 会话路由集成测试
└── user.routes.test.ts           # 用户路由集成测试
```

---

## 4. Auth Routes 测试方案

### 4.1 文件位置
`src/tests/integration/routes/auth.routes.test.ts`

### 4.2 测试用例清单

| ID | 测试用例 | 预期结果 | 优先级 |
|----|---------|---------|--------|
| AR-01 | 完整登录流程 - 成功 | 200 + token | P0 |
| AR-02 | 完整登录流程 - 失败 | 401 | P0 |
| AR-03 | JWT认证流程 | 中间件正确工作 | P0 |
| AR-04 | 获取当前用户 | 返回正确用户信息 | P0 |
| AR-05 | Token过期 | 401 | P1 |
| AR-06 | 参数验证 | 400 | P0 |

### 4.3 测试模板

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from '../../helpers/app.js';
import { setupTestDatabase, cleanupTestDatabase } from '../../helpers/database.js';
import { createTestUser, hashPassword } from '../../helpers/factories.js';

describe('Auth Routes 集成测试', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await setupTestDatabase();
    app = await build();
  });

  afterAll(async () => {
    await app.close();
    await cleanupTestDatabase();
  });

  describe('POST /api/auth/login', () => {
    it('完整登录流程应该成功', async () => {
      // Arrange: 创建真实用户
      await createTestUser({
        username: 'realuser',
        password: await hashPassword('password123'),
      });

      // Act: 真实HTTP请求
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'realuser',
          password: 'password123',
        },
      });

      // Assert: 真实断言
      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.success).toBe(true);
      expect(result.data.user.username).toBe('realuser');
      expect(result.data.token).toBeTruthy();

      // 验证token是有效的JWT
      const decoded = verifyToken(result.data.token);
      expect(decoded.username).toBe('realuser');
    });

    it('用户不存在应该返回401', async () => {
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
    });

    it('应该验证必填字段', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'testuser',
          // 缺少 password
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/auth/me', () => {
    it('已认证用户应该获取用户信息', async () => {
      // 创建用户并登录
      const user = await createTestUser();
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: user.username,
          password: 'password123',
        },
      });
      const { token } = JSON.parse(loginResponse.payload).data;

      // 使用token获取用户信息
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.data.username).toBe(user.username);
    });

    it('未认证应该返回401', async () => {
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

## 5. Session Routes 测试方案

### 5.1 文件位置
`src/tests/integration/routes/session.routes.test.ts`

### 5.2 测试用例清单

| ID | 测试用例 | 预期结果 | 优先级 |
|----|---------|---------|--------|
| SR-01 | 完整创建会话流程 | 201 + 会话信息 | P0 |
| SR-02 | 创建会话 - 未认证 | 401 | P0 |
| SR-03 | 创建会话 - 点数不足 | 400 | P0 |
| SR-04 | 获取会话 - 有权限 | 200 | P0 |
| SR-05 | 获取会话 - 无权限 | 403 | P0 |
| SR-06 | 释放会话流程 | 200 | P0 |
| SR-07 | 关闭会话 - 管理员 | 200 | P0 |
| SR-08 | 获取所有会话 - 管理员 | 200 + 分页 | P0 |
| SR-09 | 分页查询 | 正确分页 | P0 |

---

## 6. User Routes 测试方案

### 6.1 文件位置
`src/tests/integration/routes/user.routes.test.ts`

### 6.2 测试用例清单

| ID | 测试用例 | 预期结果 | 优先级 |
|----|---------|---------|--------|
| UR-01 | API Key认证流程 | 200 | P0 |
| UR-02 | 创建用户流程 - 管理员 | 201 | P0 |
| UR-03 | 创建用户 - 非管理员 | 403 | P0 |
| UR-04 | 用户列表 - 分页 | 200 + 分页 | P0 |
| UR-05 | 更新用户流程 | 200 | P0 |
| UR-06 | 删除用户流程 | 204 | P0 |
| UR-07 | 删除用户 - 管理员自己 | 400 | P0 |
| UR-08 | 重置API Key流程 | 200 | P0 |

---

## 7. 中间件测试

### 7.1 认证中间件测试

```typescript
describe('认证中间件', () => {
  it('JWT认证应该正确解析token', async () => {
    const user = await createTestUser();
    const token = generateToken(user);

    const response = await app.inject({
      method: 'GET',
      url: '/api/users/me',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
  });

  it('无效token应该返回401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/users/me',
      headers: { authorization: 'Bearer invalid_token' },
    });

    expect(response.statusCode).toBe(401);
  });
});
```

### 7.2 授权中间件测试

```typescript
describe('授权中间件', () => {
  it('管理员可以访问管理员接口', async () => {
    const admin = await createTestAdmin();
    const token = generateToken(admin);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
  });

  it('普通用户无法访问管理员接口', async () => {
    const user = await createTestUser();
    const token = generateToken(user);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(403);
  });
});
```

---

## 8. Mock 外部依赖

### 8.1 gRPC 连接 Mock

```typescript
// tests/helpers/mocks/grpc.mock.ts
export const mockConnectionManager = {
  launchBrowser: vi.fn().mockResolvedValue({
    browserWSEndpoint: 'ws://localhost:3000',
    directUrl: 'http://localhost:3000',
  }),
  closeBrowser: vi.fn().mockResolvedValue(true),
  sendCloseBrowserCommand: vi.fn().mockResolvedValue(true),
  getActiveConnections: vi.fn(() => new Map()),
};

vi.mock('../../../services/machine-grpc.service.js', () => ({
  connectionManager: mockConnectionManager,
}));
```

### 8.2 Webhook Mock

```typescript
export const mockCreateWebhookEvent = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../utils/webhook.js', () => ({
  createWebhookEvent: mockCreateWebhookEvent,
}));
```

---

## 9. 验收标准

### 9.1 完成标准

- [ ] 所有测试用例编写完成
- [ ] 所有测试通过
- [ ] 代码覆盖率 ≥ 70% (行), ≥ 60% (分支)
- [ ] 无跳过的测试
- [ ] 测试可在3分钟内完成

### 9.2 集成测试特别检查

- [ ] 中间件正确执行
- [ ] 错误响应格式统一
- [ ] 分页正确工作
- [ ] 事务正确回滚
- [ ] 并发安全性 (可选)

---

*文档创建日期: 2024-12-25*
*预计完成日期: 2025-01-04*
