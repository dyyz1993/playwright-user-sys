# 阶段1: Models层测试方案

## 文档说明

- **文档**: 01-阶段1-Models层测试.md
- **依赖**: [00-测试方案总纲.md](./00-测试方案总纲.md)
- **状态**: 待执行
- **预计时间**: 3.5天

---

## 1. 测试目标

Models层是数据访问层，负责与数据库的交互。测试目标是确保：

1. **CRUD操作正确** - 创建、读取、更新、删除功能正常
2. **数据验证正确** - 必填字段、唯一性约束、外键约束
3. **业务逻辑正确** - 点数扣除、状态流转、统计数据
4. **边界条件处理** - 空值、超限值、并发冲突

### 1.1 环境限制说明

**重要**: better-sqlite3 需要编译原生模块，在某些环境下可能无法正常工作。

**解决方案**:
- 使用现有的 MySQL 数据库进行测试
- 或者手动编译 better-sqlite3: `pnpm rebuild better-sqlite3`
- 测试环境配置使用 MySQL，不使用内存数据库

---

## 2. 测试策略

### 2.1 数据库选择

使用 **MySQL 测试数据库**

**理由**:
- better-sqlite3 需要编译原生模块，在某些环境下无法工作
- MySQL 与生产环境一致
- 可以在测试数据库中运行，不影响生产数据

**测试数据库配置**:
```bash
# .env.test
DB_TYPE=mysql
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=playwright_user_sys_test
```

### 2.2 数据清理策略

使用 **事务回滚** 方式：

```typescript
let trx: Transaction;

beforeEach(async () => {
  // 清空测试数据
  await db('users').delete();
  await db('sessions').delete();
  await db('machines').delete();
});

afterEach(async () => {
  // 可选: 事务回滚
  await trx.rollback();
});
```

### 2.3 Mock 策略

**Mock 外部服务**:
- `connectionManager` (gRPC连接)
- `createWebhookEvent` (Webhook通知)

**不 Mock**:
- 数据库操作 (使用真实MySQL数据库)

---

## 3. 测试文件结构

```
src/tests/unit/models/
├── user.model.test.ts           # 用户模型测试
├── session.model.test.ts        # 会话模型测试
├── machine.model.test.ts        # 机器模型测试
└── helpers/
    ├── database.ts              # 数据库初始化
    └── factories.ts             # 测试数据工厂
```

---

## 4. UserModel 测试方案

### 4.1 文件位置
`src/tests/unit/models/user.model.test.ts`

### 4.2 测试用例清单

| ID | 测试用例 | 预期结果 | 优先级 |
|----|---------|---------|--------|
| UM-01 | 创建用户 - 成功 | 返回用户对象，密码被哈希，api_key已生成 | P0 |
| UM-02 | 创建用户 - 重复用户名 | 抛出唯一性约束错误 | P0 |
| UM-03 | 创建用户 - 缺少必填字段 | 抛出验证错误 | P0 |
| UM-04 | 按ID查找用户 - 存在 | 返回正确用户对象 | P0 |
| UM-05 | 按ID查找用户 - 不存在 | 返回null | P0 |
| UM-06 | 按用户名查找用户 - 存在 | 返回正确用户对象 | P0 |
| UM-07 | 按用户名查找用户 - 不存在 | 返回null | P0 |
| UM-08 | 按API Key查找用户 - 存在 | 返回正确用户对象 | P0 |
| UM-09 | 按API Key查找用户 - 不存在 | 返回null | P0 |
| UM-10 | 验证密码 - 正确密码 | 返回true | P0 |
| UM-11 | 验证密码 - 错误密码 | 返回false | P0 |
| UM-12 | 验证密码 - 用户不存在 | 返回false | P0 |
| UM-13 | 添加点数 | 余额增加正确金额 | P0 |
| UM-14 | 扣除点数 - 余额充足 | 余额减少，返回扣除后金额 | P0 |
| UM-15 | 扣除点数 - 余额不足 | 抛出"余额不足"错误 | P0 |
| UM-16 | 扣除点数 - 支持事务 | 事务回滚后余额不变 | P1 |
| UM-17 | 批量扣除点数 - 全部成功 | 所有用户余额正确扣除 | P1 |
| UM-18 | 批量扣除点数 - 部分失败 | 事务回滚，无用户余额变化 | P1 |
| UM-19 | 重置API Key | 生成新的api_key，旧key失效 | P0 |
| UM-20 | 更新用户信息 - 部分更新 | 只更新指定字段 | P0 |
| UM-21 | 更新用户信息 - 用户不存在 | 返回null | P0 |
| UM-22 | 删除用户 - 成功 | 用户被删除，返回true | P0 |
| UM-23 | 删除用户 - 不存在 | 返回false | P0 |
| UM-24 | 分页查询 - 第1页 | 返回正确分页数据和总数 | P0 |
| UM-25 | 分页查询 - 边界条件 | 正确处理page=0, limit=0 | P1 |
| UM-26 | 分页查询 - 排序 | 按指定字段排序 | P1 |
| UM-27 | 获取用户统计 | 返回总数、活跃数、非活跃数 | P1 |
| UM-28 | 获取点数统计 | 返回总额、已使用、可用 | P1 |

### 4.3 测试模板

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../../../config/database.js';
import { UserModel } from '../../../models/user.model.js';
import { hashPassword } from '../../../utils/auth.js';
import { setupTestDatabase, cleanupTestDatabase } from '../../helpers/database.js';

describe('UserModel', () => {
  let trx: Transaction;

  beforeEach(async () => {
    await setupTestDatabase();
    trx = await db.transaction();
  });

  afterEach(async () => {
    await trx.rollback();
    await cleanupTestDatabase();
  });

  describe('创建用户', () => {
    it('应该成功创建用户', async () => {
      const user = await UserModel.create({
        username: 'testuser',
        password: await hashPassword('password123'),
        email: 'test@example.com',
        role: 'user',
        status: 'active',
        credits: 100,
      });

      expect(user).toBeTruthy();
      expect(user.id).toBeDefined();
      expect(user.username).toBe('testuser');
      expect(user.password).not.toBe('password123');  // 密码被哈希
      expect(user.api_key).toBeTruthy();  // API Key已生成
      expect(user.credits).toBe(100);
    });

    it('重复用户名应该抛出错误', async () => {
      await UserModel.create({
        username: 'testuser',
        password: await hashPassword('password123'),
      });

      await expect(
        UserModel.create({
          username: 'testuser',  // 重复
          password: await hashPassword('password123'),
        })
      ).rejects.toThrow();
    });
  });

  describe('扣除点数', () => {
    it('余额充足时应该成功扣除', async () => {
      const user = await UserModel.create({
        username: 'testuser',
        password: await hashPassword('password123'),
        credits: 100,
      });

      const result = await UserModel.deductCredits(user.id, 30);

      expect(result.credits).toBe(70);
    });

    it('余额不足时应该抛出错误', async () => {
      const user = await UserModel.create({
        username: 'testuser',
        password: await hashPassword('password123'),
        credits: 10,
      });

      await expect(
        UserModel.deductCredits(user.id, 30)
      ).rejects.toThrow('余额不足');
    });

    it('支持事务回滚', async () => {
      const user = await UserModel.create({
        username: 'testuser',
        password: await hashPassword('password123'),
        credits: 100,
      });

      const trx = await db.transaction();

      try {
        await UserModel.deductCredits(user.id, 30, trx);
        await trx.rollback();  // 回滚
      } catch (e) {
        await trx.rollback();
      }

      // 回滚后余额应该不变
      const checkUser = await UserModel.findById(user.id);
      expect(checkUser.credits).toBe(100);  // 仍是100
    });
  });
});
```

---

## 5. SessionModel 测试方案

### 5.1 文件位置
`src/tests/unit/models/session.model.test.ts`

### 5.2 测试用例清单

| ID | 测试用例 | 预期结果 | 优先级 |
|----|---------|---------|--------|
| SM-01 | 创建会话 - 成功 | 返回会话对象，id是UUID | P0 |
| SM-02 | 按ID查找会话 - 存在 | 返回正确会话对象 | P0 |
| SM-03 | 按ID查找会话 - 不存在 | 返回null | P0 |
| SM-04 | 按用户ID分页查询 | 返回该用户的会话列表 | P0 |
| SM-05 | 标记已连接 | status=connected，记录连接时间 | P0 |
| SM-06 | 标记已断开 - 有持续时间 | 计算duration和credits，status=disconnected | P0 |
| SM-07 | 标记已断开 - 持续时间为0 | credits至少为1 | P0 |
| SM-08 | 标记已过期 | status=expired | P0 |
| SM-09 | 标记错误 | status=error，记录error_message | P0 |
| SM-10 | 批量标记机器会话断开 | 该机器所有会话status更新 | P1 |
| SM-11 | 查找活跃会话 | 只返回status=connected的会话 | P0 |
| SM-12 | 按机器ID查询会话 | 返回该机器的所有会话 | P0 |
| SM-13 | 更新最后活动时间 | last_activity更新为当前时间 | P1 |
| SM-14 | 获取用户会话统计 | 返回总会话数、总时长、总消耗 | P1 |
| SM-15 | 检查超时会话 | 超时会话标记为expired | P1 |
| SM-16 | 解析options JSON - 正确 | 正确解析配置对象 | P1 |
| SM-17 | 解析options JSON - 错误 | 返回空对象或默认值 | P1 |
| SM-18 | 分页查询 - 排序 | 按指定字段排序 | P1 |

---

## 6. MachineModel 测试方案

### 6.1 文件位置
`src/tests/unit/models/machine.model.test.ts`

### 6.2 测试用例清单

| ID | 测试用例 | 预期结果 | 优先级 |
|----|---------|---------|--------|
| MM-01 | 注册新机器 | 返回机器对象 | P0 |
| MM-02 | 注册已存在机器 | 更新而非创建 | P0 |
| MM-03 | 按ID查找机器 | 返回正确机器 | P0 |
| MM-04 | 按ID查找机器 - 不存在 | 返回null | P0 |
| MM-05 | 更新机器信息 | 信息正确更新 | P0 |
| MM-06 | 删除机器 | 机器被删除 | P0 |
| MM-07 | 按状态查询机器 | 返回该状态的所有机器 | P0 |
| MM-08 | 分页查询机器 | 返回正确分页数据 | P0 |
| MM-09 | 查找可用机器 - 有可用 | 返回instance_count最少的 | P0 |
| MM-10 | 查找可用机器 - 无可用 | 返回null | P0 |
| MM-11 | 查找可用机器 - 所有满载 | 返回null | P0 |
| MM-12 | 增加实例计数 | instance_count+1 | P0 |
| MM-13 | 减少实例计数 | instance_count-1 | P0 |
| MM-14 | 减少实例计数 - 已为0 | 保持为0 | P0 |
| MM-15 | 标记机器离线 | status=offline | P0 |
| MM-16 | 检查超时机器 | 超时机器标记为offline | P1 |
| MM-17 | 删除旧机器 | 删除指定时间前的机器 | P1 |

---

## 7. 测试辅助函数

### 7.1 database.ts

```typescript
// src/tests/helpers/database.ts
import { db, initDatabase } from '../../../config/database.js';
import { runMigrations } from '../../../models/migrations.js';

export async function setupTestDatabase() {
  process.env.NODE_ENV = 'test';
  process.env.DB_TYPE = 'sqlite';
  process.env.DB_PATH = ':memory:';

  await initDatabase();
  await runMigrations();
}

export async function cleanupTestDatabase() {
  await db.destroy();
}

export async function clearAllTables() {
  await db('users').delete();
  await db('sessions').delete();
  await db('machines').delete();
  await db('credit_history').delete();
  await db('operation_logs').delete();
}
```

### 7.2 factories.ts

```typescript
// src/tests/helpers/factories.ts
import { UserModel } from '../../../models/user.model.js';
import { SessionModel } from '../../../models/session.model.js';
import { MachineModel } from '../../../models/machine.model.js';
import { hashPassword } from '../../../utils/auth.js';
import { UserRole, UserStatus } from '@shared/types/index.js';

export async function createTestUser(overrides = {}) {
  return UserModel.create({
    username: `testuser_${Date.now()}`,
    password: await hashPassword('password123'),
    email: `test_${Date.now()}@example.com`,
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
    credits: 100,
    ...overrides,
  });
}

export async function createTestAdmin(overrides = {}) {
  return UserModel.create({
    username: `testadmin_${Date.now()}`,
    password: await hashPassword('password123'),
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    credits: 1000,
    ...overrides,
  });
}

export async function createTestSession(userId: number, overrides = {}) {
  return SessionModel.create({
    user_id: userId,
    status: 'created',
    options: {},
    ...overrides,
  });
}

export async function createTestMachine(overrides = {}) {
  return MachineModel.register({
    id: `machine-${Date.now()}`,
    hostname: 'test-machine',
    ip: '127.0.0.1',
    grpc_port: 50051,
    proxy_port: 8080,
    max_instances: 10,
    status: 'online',
    ...overrides,
  });
}
```

---

## 8. 验收标准

### 8.1 完成标准

- [ ] 所有测试用例编写完成
- [ ] 所有测试通过
- [ ] 代码覆盖率 ≥ 85% (行), ≥ 75% (分支)
- [ ] 无跳过的测试 (除非是已知Bug记录)
- [ ] 测试可在2分钟内完成

### 8.2 问题记录

测试中发现的问题，使用 `test.skip()` 记录：

```typescript
test.skip('Bug记录: XXX问题', async () => {
  // 记录问题详情
  // 写下正确的预期
});
```

---

*文档创建日期: 2024-12-25*
*预计完成日期: 2024-12-29*
