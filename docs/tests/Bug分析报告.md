# Bug 分析报告 - 阶段1 & 2

**生成日期**: 2025-12-25
**分析范围**: Models 层 (user, session, machine) + Services 层 (memory-store, session)
**总测试用例**: 81 个
**跳过测试**: 18 个 (22%)

---

## 目录

1. [总体概览](#总体概览)
2. [UserModel Bug 分析](#usermodel-bug-分析)
3. [SessionModel Bug 分析](#sessionmodel-bug-分析)
4. [MachineModel Bug 分析](#machinemodel-bug-分析)
5. [MemoryStoreService Bug 分析](#memorystoreservice-bug-分析)
6. [优先级分类](#优先级分类)
7. [修复路线图](#修复路线图)

---

## 总体概览

| 文件 | 总测试数 | 跳过数 | 跳过率 | Bug数 |
|------|---------|--------|--------|-------|
| user.model.test.ts | 28 | 5 | 18% | 5 |
| session.model.test.ts | 18 | 2 | 11% | 2 |
| machine.model.test.ts | 17 | 7 | 41% | 7 |
| memory-store.service.test.ts | 18 | 4 | 22% | 4 |
| **总计** | **81** | **18** | **22%** | **18** |

---

## UserModel Bug 分析

### UM-02: 重复用户名检查 (中等优先级)

**文件**: `src/models/user.model.ts:40-58`

**问题描述**: `UserModel.create()` 没有检查重复用户名，允许创建重复用户名的用户。

**当前行为**:
```typescript
// 直接插入数据库，没有先检查
const [data] = await db('users')
  .insert({ ... })
  .returning('*');
return data;
```

**预期行为**: 应该先检查用户名是否已存在，如果存在则返回 null 或抛出错误。

**解决方案 1 (推荐)**: 应用层验证
```typescript
async create(data: CreateUserInput) {
  // 检查用户名是否已存在
  const existing = await this.findByUsername(data.username);
  if (existing) {
    return null; // 或 throw new Error('Username already exists')
  }
  // 继续创建...
}
```

**解决方案 2**: 数据库约束
```sql
ALTER TABLE users ADD UNIQUE INDEX idx_username ON username);
```
然后在代码中捕获重复键错误。

---

### UM-03: 缺少必填字段验证 (低优先级)

**文件**: `src/models/user.model.ts:40-58`

**问题描述**: 空字符串 `username` 被接受，创建用户成功而非返回错误。

**当前行为**: `''` 是有效字符串，`data.username || null` 不会处理空字符串。

**预期行为**: 应该拒绝空字符串作为用户名。

**解决方案 1**: 添加验证函数
```typescript
function validateUsername(username: string): boolean {
  return username && username.trim().length > 0;
}

async create(data: CreateUserInput) {
  if (!validateUsername(data.username)) {
    return null;
  }
  // ...
}
```

**解决方案 2**: 使用 Zod 验证
```typescript
import { z } from 'zod';

const CreateUserSchema = z.object({
  username: z.string().min(1, 'Username cannot be empty'),
  // ...
});

async create(data: CreateUserInput) {
  const validated = CreateUserSchema.parse(data);
  // ...
}
```

---

### UM-10: 密码验证失败 (高优先级)

**文件**: `src/models/user.model.ts:103-105`

**问题描述**: `verifyPassword()` 总是返回 false，无法验证正确的密码。

**根本原因**:
- `comparePassword` 函数实现正确
- 但数据库返回的 `user.password` 可能为 null 或格式不正确
- 测试中创建用户后密码可能被哈希了两次

**解决方案 1**: 添加 null 检查
```typescript
async verifyPassword(userId: number, password: string): Promise<boolean> {
  const user = await this.findById(userId);
  if (!user || !user.password) {
    return false;
  }
  return comparePassword(password, user.password);
}
```

**解决方案 2**: 调试日志
```typescript
async verifyPassword(userId: number, password: string): Promise<boolean> {
  const user = await this.findById(userId);
  console.log('DEBUG: user =', user);
  console.log('DEBUG: user.password =', user?.password);
  // ...
}
```

---

### UM-12: 验证不存在用户的密码 (中等优先级)

**文件**: `src/models/user.model.ts:103-105`

**问题描述**: `verifyPassword()` 对 null 用户没有防护，抛出运行时错误。

**当前行为**: 直接访问 `user.password` 导致 "Cannot read properties of null"。

**解决方案 1**: 添加空值检查
```typescript
async verifyPassword(userId: number, password: string): Promise<boolean> {
  const user = await this.findById(userId);
  if (!user) {
    return false; // 优雅处理不存在的用户
  }
  return comparePassword(password, user.password);
}
```

**解决方案 2**: 类型守卫
```typescript
function isValidUser(user: User | null): user is User {
  return user !== null;
}

async verifyPassword(userId: number, password: string): Promise<boolean> {
  const user = await this.findById(userId);
  if (!isValidUser(user)) {
    return false;
  }
  // ...
}
```

---

### UM-22: 删除用户功能异常 (高优先级)

**文件**: `src/models/user.model.ts:224-227`

**问题描述**: 删除用户后 `findById()` 仍然返回用户（返回 null 而非 undefined）。

**当前行为**: `findById()` 使用 `|| null` 返回 null。

**预期行为**: 测试期望返回 undefined。

**解决方案 1**: 统一返回 undefined
```typescript
async findById(id: number): Promise<User | undefined> {
  const [user] = await db('users').where({ id });
  return user || undefined; // 改为 undefined
}
```

**解决方案 2**: 更新测试期望
```typescript
it('删除用户后findById应该返回null', async () => {
  await UserModel.delete(userId);
  const user = await UserModel.findById(userId);
  expect(user).toBeNull(); // 改为 toBeNull()
});
```

**推荐**: 使用解决方案 1，统一返回 undefined 更符合 JavaScript 惯例。

---

## SessionModel Bug 分析

### SM-15: 检查超时会话 (中等优先级)

**文件**: `src/models/session.model.ts:563-615`

**问题描述**: `checkExpiredSessions()` 调用外部依赖，难以在单元测试中 Mock。

**依赖的外部服务**:
- `UserModel.deductCredits()` - 第593行
- `createWebhookEvent()` - 第597行

**解决方案 1**: 正确配置 Vitest Mock
```typescript
// 在测试文件顶部
vi.mock('../../../models/user.model.js', () => ({
  UserModel: {
    deductCredits: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../utils/webhook.js', () => ({
  createWebhookEvent: vi.fn().mockResolvedValue(undefined),
}));
```

**解决方案 2**: 依赖注入
```typescript
// 修改为接受依赖作为参数
async checkExpiredSessions(
  timeoutMs: number,
  creditDeductor = UserModel.deductCredits,
  webhookCreator = createWebhookEvent
) {
  // 使用注入的函数
  await creditDeductor(userId, credits);
  await webhookCreator(userId, type, data);
}
```

---

### SM-17: MySQL JSON列验证 (低优先级)

**文件**: `src/models/session.model.ts:48-64`

**问题描述**: MySQL 在数据库层面验证 JSON 格式，无法测试无效 JSON 的错误处理。

**当前行为**: 插入无效 JSON 时数据库直接拒绝，代码无法处理。

**解决方案 1**: 移除此测试
```typescript
// 此测试在 MySQL 环境下无意义，建议移除
it.skip('MySQL 会拒绝无效的 JSON', () => {
  // 测试内容...
});
```

**解决方案 2**: Mock Knex 抛出错误
```typescript
it('应该处理数据库错误', async () => {
  vi.mocked(db).mockImplementationOnce(() => {
    throw new Error('Invalid JSON format');
  });

  const result = await SessionModel.create({
    user_id: 1,
    options: '{invalid json',
  });

  expect(result).toBeNull();
});
```

---

## MachineModel Bug 分析

### MM-05: 更新机器信息字段名不匹配 (高优先级)

**文件**: `src/models/machine.model.ts:83-128`

**问题描述**: `MachineModel.update()` 使用 camelCase 参数名，但数据库字段是 snake_case。

**当前行为**: 测试传入 `cpuUsage: 75.5`，但 updateData 期望 `data.cpu_usage`。

**解决方案 1**: 添加参数转换
```typescript
async update(id: string, data: UpdateMachineInput) {
  // 添加字段名转换
  const updateData: any = {
    cpu_usage: data.cpuUsage ?? data.cpu_usage,
    memory_usage: data.memoryUsage ?? data.memory_usage,
    disk_usage: data.diskUsage ?? data.disk_usage,
    instance_count: data.instanceCount ?? data.instance_count,
    grpc_port: data.grpcPort ?? data.grpc_port,
    proxy_port: data.proxyPort ?? data.proxy_port,
    max_instances: data.maxInstances ?? data.max_instances,
    last_seen: data.lastSeen ?? data.last_seen,
    status: data.status,
  };

  // 移除 undefined 值
  Object.keys(updateData).forEach(key => {
    if (updateData[key] === undefined) delete updateData[key];
  });

  const [machine] = await db('machines')
    .where({ id })
    .update(updateData)
    .returning('*');

  return machine;
}
```

**解决方案 2**: 使用 snake_case 接口
```typescript
// 统一使用 snake_case
interface UpdateMachineInput {
  cpu_usage?: number;
  memory_usage?: number;
  // ...
}
```

---

### MM-09: 查找可用机器需要配置Mock (中等优先级)

**文件**: `src/models/machine.model.ts:184-234`

**问题描述**: `findAvailable()` 依赖 `connectionManager.getAllConnectedMachines()`，Mock 配置不正确。

**当前问题**: 测试中 Mock 返回空数组，导致没有可用机器。

**解决方案 1**: 正确配置 Mock
```typescript
vi.mock('../../../services/machine-grpc.service.js', () => ({
  connectionManager: {
    getAllConnectedMachines: vi.fn(() => ['machine-001', 'machine-002']),
  },
}));

// 在测试中
it('应该找到可用的机器', async () => {
  const { connectionManager } = await import('../services/machine-grpc.service.js');
  vi.mocked(connectionManager.getAllConnectedMachines).mockReturnValue(['machine-001']);

  await MachineModel.register({
    id: 'machine-001',
    hostname: 'test-host',
    ip: '192.168.1.100',
    maxInstances: 10,
  });

  const available = await MachineModel.findAvailable();
  expect(available).toBeTruthy();
});
```

**解决方案 2**: 依赖注入
```typescript
async findAvailable(
  getConnectedMachines = () => connectionManager?.getAllConnectedMachines() ?? []
) {
  const connectedMachines = getConnectedMachines();
  // ...
}
```

---

### MM-11: 所有机器满载测试 (中等优先级)

**文件**: `src/models/machine.model.ts:184-234`

**问题描述**: 需要测试所有机器满载时返回 null 的场景。

**解决方案**: 与 MM-09 类似，需要正确配置 Mock 和测试数据

```typescript
it('所有机器满载时应该返回null', async () => {
  const { connectionManager } = await import('../services/machine-grpc.service.js');
  vi.mocked(connectionManager.getAllConnectedMachines).mockReturnValue(['machine-001']);

  await MachineModel.register({
    id: 'machine-001',
    hostname: 'test-host',
    ip: '192.168.1.100',
    maxInstances: 10,
  });

  // 手动设置为满载
  await db('machines').where('id', 'machine-001').update({
    instance_count: 10,
  });

  const available = await MachineModel.findAvailable();
  expect(available).toBeNull();
});
```

---

### MM-12, MM-13, MM-14: register方法不处理instanceCount参数 (低优先级)

**文件**: `src/models/machine.model.ts:28-59`

**问题描述**: `MachineModel.register()` 不接受 `instanceCount` 参数，测试中需要手动设置。

**解决方案 1**: 添加参数支持
```typescript
interface CreateMachineInput {
  id: string;
  hostname: string;
  ip: string;
  instance_count?: number; // 添加此参数
  max_instances?: number;
  grpcPort?: number;
  proxyPort?: number;
}

async register(data: CreateMachineInput) {
  const [machine] = await db('machines')
    .insert({
      id: data.id,
      hostname: data.hostname,
      ip: data.ip,
      instance_count: data.instance_count || 0, // 支持初始值
      max_instances: data.max_instances || 10,
      grpc_port: data.grpcPort || 50052,
      proxy_port: data.proxyPort || 8082,
      status: 'online',
    })
    .returning('*');

  return machine;
}
```

**解决方案 2**: 测试中使用 Workaround（当前方式）
```typescript
it('应该增加实例计数', async () => {
  await MachineModel.register({ id: 'm1', hostname: 'h1', ip: '1.1.1.1' });

  // 手动设置 instance_count
  await db('machines').where('id', 'm1').update({ instance_count: 5 });

  await MachineModel.incrementInstanceCount('m1');
  // ...
});
```

---

### MM-16: checkOfflineMachines使用SQLite语法 (高优先级)

**文件**: `src/models/machine.model.ts:255-265`

**问题描述**: 使用 SQLite 的 `datetime()` 函数，在 MySQL 中执行失败。

**当前代码**:
```typescript
const timeoutMinutes = Math.floor(timeoutMs / 60000);
const machines = await db('machines')
  .where('status', 'online')
  .whereRaw(`datetime(last_seen) < datetime('now', '-${timeoutMinutes} minutes')`)
  .update({ status: 'offline' });
```

**解决方案 1**: 使用 Knex 原生方法
```typescript
async checkOfflineMachines(timeoutMs: number): Promise<number> {
  const cutoffTime = new Date(Date.now() - timeoutMs);

  const count = await db('machines')
    .where('status', 'online')
    .where('last_seen', '<', cutoffTime) // Knex 会正确处理 Date 对象
    .update({ status: 'offline' });

  return count;
}
```

**解决方案 2**: 数据库特定语法
```typescript
const dbType = process.env.DB_TYPE || 'sqlite';

let query;
if (dbType === 'mysql') {
  query = `last_seen < DATE_SUB(NOW(), INTERVAL ${timeoutMinutes} MINUTE)`;
} else {
  query = `datetime(last_seen) < datetime('now', '-${timeoutMinutes} minutes')`;
}

const machines = await db('machines')
  .where('status', 'online')
  .whereRaw(query)
  .update({ status: 'offline' });
```

---

## MemoryStoreService Bug 分析

### MS-01: MemoryStoreService 类未导出 (低优先级)

**文件**: `src/services/memory-store.service.ts:544-546`

**问题描述**: 只导出单例实例 `memoryStore`，没有导出类，无法测试单例模式。

**当前代码**:
```typescript
export const memoryStore = MemoryStoreService.getInstance();
export default memoryStore;
// 类没有导出
```

**解决方案 1**: 同时导出类和实例
```typescript
export class MemoryStoreService extends EventEmitter {
  // ...
}

export const memoryStore = MemoryStoreService.getInstance();
export default memoryStore;
```

**解决方案 2**: 保持现状，移除单例测试
```typescript
// 测试文件中
it.skip('类未导出，无法测试单例模式', () => {
  // 此测试无法实现
});
```

---

### MS-15: updateMachineStatus 覆盖 last_heartbeat (中等优先级)

**文件**: `src/services/memory-store.service.ts:126-151`

**问题描述**: `updateMachineStatus()` 总是设置 `last_heartbeat = new Date()`，忽略传入的参数。

**当前代码**:
```typescript
updateMachineStatus(status: MachineStatus): void {
  const newStatus: MachineRealTimeStatus = {
    // ...
    last_heartbeat: new Date(), // 总是当前时间
  };
  // ...
}
```

**解决方案**: 使用传入值
```typescript
updateMachineStatus(status: MachineStatus): void {
  const existingStatus = this.machines.get(status.machine_id);

  const newStatus: MachineRealTimeStatus = {
    // ...
    last_heartbeat: status.last_heartbeat || new Date(), // 使用传入值或当前时间
  };

  this.machines.set(status.machine_id, newStatus);
}
```

---

### MS-16: loadInitialData 依赖数据库 (中等优先级)

**文件**: `src/services/memory-store.service.ts:420-540`

**问题描述**: `loadInitialData()` 需要从数据库加载数据，单元测试需要完整 Mock 配置。

**解决方案 1**: 正确配置 Mock
```typescript
it('应该加载初始数据', async () => {
  const { MachineModel } = await import('../models/machine.model.js');
  const { SessionModel } = await import('../models/session.model.js');

  vi.mocked(MachineModel.findAll).mockResolvedValue({
    items: [
      {
        id: 'machine-001',
        hostname: 'test-host',
        ip: '192.168.1.1',
        instanceCount: 0,
        maxInstances: 10,
        status: 'online',
      },
    ],
  });

  vi.mocked(SessionModel.findActiveSessions).mockResolvedValue([]);

  await service.loadInitialData();

  const machine = service.getMachine('machine-001');
  expect(machine).toBeDefined();
  expect(machine!.name).toBe('test-host');
});
```

**解决方案 2**: 改为集成测试
```typescript
// 将此测试移至 integration/ 目录
describe('MemoryStoreService Integration', () => {
  it('应该从数据库加载初始数据', async () => {
    // 使用真实数据库
    await service.loadInitialData();
    // ...
  });
});
```

---

### MS-17: checkDataConsistency 依赖数据库 (中等优先级)

**文件**: `src/services/memory-store.service.ts:320-403`

**问题描述**: `checkDataConsistency()` 调用多个 Model 方法，需要完整 Mock。

**解决方案**: 与 MS-16 类似，需要正确配置所有 Mock。

---

## 优先级分类

### 高优先级 (建议立即修复)

| ID | 文件 | 问题描述 | 影响 |
|----|------|---------|------|
| UM-10 | user.model.test.ts | 密码验证失败 | 安全功能 |
| UM-22 | user.model.test.ts | 删除用户功能异常 | 基础CRUD |
| MM-05 | machine.model.test.ts | 字段名不匹配 | 机器状态更新 |
| MM-16 | machine.model.test.ts | SQLite语法兼容性 | 数据库兼容性 |

### 中等优先级 (建议近期修复)

| ID | 文件 | 问题描述 |
|----|------|---------|
| UM-02 | user.model.test.ts | 重复用户名检查 |
| UM-12 | user.model.test.ts | 空值用户验证 |
| SM-15 | session.model.test.ts | Mock配置问题 |
| MM-09, MM-11 | machine.model.test.ts | findAvailable Mock |
| MS-15, MS-16, MS-17 | memory-store.service.test.ts | 测试隔离 |

### 低优先级 (可延后处理)

| ID | 文件 | 问题描述 |
|----|------|---------|
| UM-03 | user.model.test.ts | 空字符串验证 |
| SM-17 | session.model.test.ts | MySQL JSON验证 |
| MM-12-14 | machine.model.test.ts | register参数 |
| MS-01 | memory-store.service.test.ts | 类导出 |

---

## 修复路线图

### 第一阶段: 高优先级修复 (1-2天)

```bash
# 1. 修复 UM-22: 统一返回值
# 文件: src/models/user.model.ts
- 将 findById 等方法的返回值从 null 改为 undefined
- 或更新所有测试期望为 toBeNull()

# 2. 修复 MM-16: MySQL 兼容性
# 文件: src/models/machine.model.ts
- 使用 Knex 的 where() 方法替代 whereRaw()
- 使用 Date 对象替代日期函数

# 3. 调试 UM-10: 密码验证
# 文件: src/models/user.model.ts, src/utils/auth.ts
- 添加日志确认密码存储和比较
- 检查密码是否被哈希两次
```

### 第二阶段: 中优先级修复 (3-5天)

```bash
# 1. 修复 MM-05: 字段名转换
# 文件: src/models/machine.model.ts
- 添加 camelCase 到 snake_case 的转换逻辑

# 2. 修复 UM-02, UM-12: 输入验证
# 文件: src/models/user.model.ts
- 添加用户名重复检查
- 添加空值检查

# 3. 配置 MM-09, MM-11 Mock
# 文件: src/tests/unit/models/machine.model.test.ts
- 正确配置 connectionManager Mock
- 添加测试数据
```

### 第三阶段: 低优先级处理 (按需)

```bash
# 1. 处理 MS-01: 导出类或移除测试
# 2. 处理 MS-15, MS-16, MS-17: 改为集成测试
# 3. 添加字段验证 (UM-03, MM-12-14)
```

---

## 附录: 快速参考

### 运行测试

```bash
# 运行所有测试
pnpm test:unit

# 运行特定文件
npx vitest run src/tests/unit/models/user.model.test.ts
npx vitest run src/tests/unit/models/session.model.test.ts
npx vitest run src/tests/unit/models/machine.model.test.ts
npx vitest run src/tests/unit/services/memory-store.service.test.ts
npx vitest run src/tests/unit/services/session.service.test.ts
```

### 修复检查清单

- [ ] UM-10: 密码验证问题
- [ ] UM-22: 删除用户返回值
- [ ] MM-05: 字段名转换
- [ ] MM-16: MySQL 日期函数
- [ ] UM-02: 用户名重复检查
- [ ] UM-12: 空值检查
- [ ] MS-01: 导出类
- [ ] MS-15: last_heartbeat 问题

---

*报告生成: 2025-12-25*
*分析工具: Claude Code*
