# Bug修复方案指南

**生成日期**: 2025-12-25
**分析范围**: 阶段1 & 2 所有跳过的测试
**Bug总数**: 18个

---

## 目录

1. [修复总结](#修复总结)
2. [高优先级修复](#高优先级修复-4个)
3. [中优先级修复](#中优先级修复-8个)
4. [低优先级修复](#低优先级修复-6个)
5. [修复清单](#修复清单)
6. [执行计划](#执行计划)

---

## 修复总结

### Bug分类统计

```
按原因分类:
├── 数据库兼容性问题: 3个
├── 字段名映射问题: 2个
├── 输入验证缺失: 3个
├── Mock配置问题: 5个
├── 代码实现问题: 3个
└── 架构设计问题: 2个

按难度分类:
├── 容易修复 (<1小时): 3个
├── 中等修复 (1-3小时): 7个
└── 复杂修复 (3-8小时): 8个

按代码修改 vs 测试修复:
├── 需要修改代码: 10个
├── 仅需修复测试: 5个
└── 代码本身正确: 3个
```

### 总体估算

- **总修复时间**: ~4.5小时
- **高优先级**: ~1.5小时
- **中优先级**: ~2.5小时
- **低优先级**: ~0.5小时

---

## 高优先级修复 (4个)

### 1. MM-16: SQLite语法兼容性 ⚠️

**文件**: `src/models/machine.model.ts:255-265`

**问题**: 使用SQLite的`datetime()`函数，MySQL中失败

**当前代码**:
```typescript
static async checkOfflineMachines(timeoutMinutes: number = 5): Promise<number> {
  const result = await db('machines')
    .where('status', 'online')
    .whereRaw(`last_seen < datetime('now', '-${timeoutMinutes} minutes')`)
    .update({ status: 'offline', updated_at: new Date() });
  return result;
}
```

**修复方案**: 使用数据库无关的日期计算

**修复后代码**:
```typescript
static async checkOfflineMachines(timeoutMinutes: number = 5): Promise<number> {
  const cutoffDate = new Date(Date.now() - timeoutMinutes * 60 * 1000);

  const result = await db('machines')
    .where('status', 'online')
    .where('last_seen', '<', cutoffDate)
    .update({ status: 'offline', updated_at: new Date() });

  return result;
}
```

**影响评估**:
- 修复时间: 30分钟
- 风险: 低
- 需要迁移: 无
- 测试更新: 启用MM-16

---

### 2. UM-02: 重复用户名检查

**文件**: `src/models/user.model.ts:40-58`

**问题**: 没有检查重复用户名

**修复方案**: 在创建前检查

**修复后代码**:
```typescript
static async create(data: CreateUserInput): Promise<User | null> {
  // 检查用户名是否已存在
  const existing = await this.findByUsername(data.username);
  if (existing) {
    throw new Error(`用户名 "${data.username}" 已存在`);
  }

  const hashedPassword = await hashPassword(data.password);
  const apiKey = uuidv4();

  const [id] = await db('users').insert({
    username: data.username,
    password: hashedPassword,
    email: data.email || null,
    role: data.role || UserRole.USER,
    status: data.status || UserStatus.ACTIVE,
    credits: data.credits || 0,
    api_key: apiKey,
    webhook_url: data.webhook_url || null,
    created_at: new Date(),
    updated_at: new Date(),
  });

  return this.findById(id);
}
```

**影响评估**:
- 修复时间: 20分钟
- 风险: 低
- 需要迁移: 无（约束已存在）
- 测试更新: 启用UM-02

---

### 3. UM-12: 空值用户验证

**文件**: `src/models/user.model.ts:103-105`

**问题**: `verifyPassword`没有处理null用户

**修复方案**: 添加null检查

**修复后代码**:
```typescript
static async verifyPassword(user: User | null, password: string): Promise<boolean> {
  if (!user) {
    return false;
  }
  return comparePassword(password, user.password);
}
```

**影响评估**:
- 修复时间: 10分钟
- 风险: 低
- 需要迁移: 无
- 测试更新: 启用UM-12

---

### 4. MM-05: 字段名映射验证

**文件**: `src/models/machine.model.ts:83-128`

**问题**: 代码已正确实现，需要验证

**修复方案**: 代码正确，无需修改

**影响评估**:
- 修复时间: 30分钟（验证测试）
- 风险: 无
- 需要迁移: 无
- 测试更新: 启用MM-05

---

## 中优先级修复 (8个)

### 5. MM-12,13,14: register参数扩展

**文件**: `src/models/machine.model.ts:28-59`

**问题**: `register`不接受`instanceCount`参数

**修复方案**: 扩展接口和实现

**修复后代码**:
```typescript
// 更新接口
export interface CreateMachineInput {
  id: string;
  hostname: string;
  ip: string;
  grpcPort?: number;
  proxyPort?: number;
  max_instances?: number;
  instanceCount?: number; // 新增
}

// 更新register方法
static async register(data: CreateMachineInput): Promise<MachineInfo | null> {
  const exists = await db('machines').where({ id: data.id }).first();

  if (exists) {
    await db('machines').where({ id: data.id }).update({
      hostname: data.hostname,
      ip: data.ip,
      grpc_port: data.grpcPort,
      proxy_port: data.proxyPort,
      status: 'online',
      last_seen: db.fn.now(),
      updated_at: new Date(),
    });
  } else {
    await db('machines').insert({
      id: data.id,
      hostname: data.hostname,
      ip: data.ip,
      grpc_port: data.grpcPort,
      proxy_port: data.proxyPort,
      max_instances: data.max_instances || 10,
      instance_count: data.instanceCount || 0, // 新增
      status: 'online',
      last_seen: db.fn.now(),
      created_at: new Date(),
      updated_at: new Date(),
    });
  }

  return this.findById(data.id);
}
```

**影响评估**:
- 修复时间: 30分钟
- 风险: 低
- 需要迁移: 无
- 测试更新: 启用MM-12, MM-13, MM-14

---

### 6. MS-15: updateMachineStatus修复

**文件**: `src/services/memory-store.service.ts:126-151`

**问题**: 总是设置`last_heartbeat = new Date()`

**修复方案**: 使用传入值

**修复后代码**:
```typescript
updateMachineStatus(status: MachineStatus): void {
  const existingStatus = this.machines.get(status.machine_id);

  const newStatus: MachineRealTimeStatus = {
    machine_id: status.machine_id,
    name: status.name,
    ip: status.ip,
    grpc_port: status.grpc_port,
    online: true,
    cpu_usage: status.cpu_usage,
    memory_usage: status.memory_usage,
    disk_space: status.disk_space || 0,
    active_sessions: status.active_sessions,
    max_sessions: status.max_sessions,
    last_heartbeat: status.last_heartbeat || new Date(), // 修复
  };

  this.machines.set(status.machine_id, newStatus);

  if (!existingStatus || existingStatus.online !== newStatus.online) {
    this.emit('machine:status:changed', newStatus);
  }
}
```

**影响评估**:
- 修复时间: 20分钟
- 风险: 低
- 需要迁移: 无
- 测试更新: 启用MS-15

---

### 7. MM-09,11: findAvailable测试修复

**文件**: `src/tests/unit/models/machine.model.test.ts`

**问题**: Mock配置不正确

**修复方案**: 修正测试

**修复后代码**:
```typescript
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
  expect(available!.id).toBe('machine-001');
});

it('所有机器满载时应该返回null', async () => {
  const { connectionManager } = await import('../services/machine-grpc.service.js');
  vi.mocked(connectionManager.getAllConnectedMachines).mockReturnValue(['machine-001']);

  await MachineModel.register({
    id: 'machine-001',
    hostname: 'test-host',
    ip: '192.168.1.100',
    maxInstances: 10,
  });

  // 直接更新使机器满载
  await db('machines').where('id', 'machine-001').update({ instance_count: 10 });

  const available = await MachineModel.findAvailable();
  expect(available).toBeNull();
});
```

**影响评估**:
- 修复时间: 30分钟
- 风险: 无（仅测试）
- 需要迁移: 无
- 测试更新: 启用MM-09, MM-11

---

### 8. SM-15: checkExpiredSessions Mock

**文件**: `src/tests/unit/models/session.model.test.ts`

**问题**: 需要配置Mock

**修复方案**: 添加Mock配置

**修复后代码**:
```typescript
// 在测试文件顶部
vi.mock('../../../models/user.model.js', () => ({
  UserModel: {
    deductCredits: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../../utils/webhook.js', () => ({
  createWebhookEvent: vi.fn().mockResolvedValue(undefined),
}));
```

**影响评估**:
- 修复时间: 20分钟
- 风险: 无（仅测试）
- 需要迁移: 无
- 测试更新: 启用SM-15

---

### 9-12. MS-16,17等Mock配置

**文件**: `src/tests/unit/services/memory-store.service.test.ts`

**问题**: Mock配置不完整

**修复方案**: 完整Mock配置

**修复后代码**:
```typescript
it('loadInitialData应该正确工作', async () => {
  const { MachineModel } = await import('../../../models/machine.model.js');
  const { SessionModel } = await import('../../../models/session.model.js');

  vi.mocked(MachineModel.findAll).mockResolvedValue({
    items: [
      {
        id: 'machine-001',
        hostname: 'test-host',
        ip: '192.168.1.1',
        grpcPort: 50051,
        instanceCount: 0,
        maxInstances: 10,
        status: 'online',
      },
    ],
    total: 1,
  });

  vi.mocked(SessionModel.findActiveSessions).mockResolvedValue([]);

  await service.loadInitialData();

  const machine = service.getMachine('machine-001');
  expect(machine).toBeDefined();
});
```

**影响评估**:
- 修复时间: 40分钟
- 风险: 无（仅测试）
- 需要迁移: 无
- 测试更新: 启用MS-16, MS-17

---

## 低优先级修复 (6个)

### 13. UM-03: 空字符串验证

**文件**: `src/models/user.model.ts:40-58`

**问题**: 接受空字符串作为用户名

**修复方案**: 添加输入验证

**修复后代码**:
```typescript
static async create(data: CreateUserInput): Promise<User | null> {
  if (!data.username || data.username.trim() === '') {
    throw new Error('用户名不能为空');
  }

  // ... 其余代码
}
```

**影响评估**:
- 修复时间: 20分钟
- 风险: 低
- 需要迁移: 无
- 测试更新: 启用UM-03

---

### 14. SM-17: MySQL JSON验证

**文件**: `src/models/session.model.ts:48-64`

**问题**: 应用层缺少JSON验证

**修复方案**: 添加JSON验证

**修复后代码**:
```typescript
static async create(data: CreateSessionInput): Promise<Session | null> {
  const sessionId = uuidv4();

  let optionsJson = null;
  if (data.options) {
    try {
      optionsJson = JSON.stringify(data.options);
      JSON.parse(optionsJson); // 验证
    } catch (error) {
      throw new Error('无效的options格式');
    }
  }

  await db('sessions').insert({
    id: sessionId,
    user_id: data.user_id,
    machine_id: data.machine_id || null,
    port: data.port || null,
    status: SessionStatus.CREATED,
    options: optionsJson,
    start_time: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
  });

  return this.findById(sessionId);
}
```

**影响评估**:
- 修复时间: 20分钟
- 风险: 低
- 需要迁移: 无
- 测试更新: 修改SM-17

---

### 15. MS-01: 类未导出

**文件**: `src/services/memory-store.service.ts:544-546`

**问题**: 类未导出

**修复方案**: 导出类

**修复后代码**:
```typescript
// 在文件末尾
export { MemoryStoreService };
export const memoryStore = MemoryStoreService.getInstance();
export default memoryStore;
```

**影响评估**:
- 修复时间: 10分钟
- 风险: 无
- 需要迁移: 无
- 测试更新: 启用MS-01

---

## 修复清单

### 快速检查清单

```bash
# 高优先级 (必须修复)
- [ ] MM-16: SQLite语法兼容性 (30min)
- [ ] UM-02: 重复用户名检查 (20min)
- [ ] UM-12: 空值验证 (10min)
- [ ] MM-05: 字段名验证 (30min)

# 中优先级 (建议修复)
- [ ] MM-12,13,14: register参数 (30min)
- [ ] MS-15: updateMachineStatus (20min)
- [ ] MM-09,11: findAvailable测试 (30min)
- [ ] SM-15: checkExpiredSessions Mock (20min)
- [ ] MS-16,17: Mock配置 (40min)

# 低优先级 (可选)
- [ ] UM-03: 空字符串验证 (20min)
- [ ] SM-17: JSON验证 (20min)
- [ ] MS-01: 类导出 (10min)
```

---

## 执行计划

### 第一阶段: 核心修复 (1.5小时)

```bash
# 目标: 修复高优先级Bug

Step 1: 修复 MM-16 (30分钟)
├── 修改 checkOfflineMachines 方法
├── 运行测试验证
└── 启用 MM-16 测试

Step 2: 修复 UM-02 (20分钟)
├── 添加用户名重复检查
├── 运行测试验证
└── 启用 UM-02 测试

Step 3: 修复 UM-12 (10分钟)
├── 添加空值检查
├── 运行测试验证
└── 启用 UM-12 测试

Step 4: 验证 MM-05, UM-10, UM-22 (30分钟)
├── 检查代码实现
├── 运行测试验证
└── 启用相关测试

预期成果:
✅ 高优先级Bug全部修复
✅ 测试通过率提升到85%+
```

### 第二阶段: 完善功能 (2小时)

```bash
# 目标: 修复中优先级Bug

Day 1 上午: 扩展register功能 (30分钟)
├── 修改 CreateMachineInput 接口
├── 更新 register 方法
├── 运行测试验证
└── 启用 MM-12, MM-13, MM-14

Day 1 下午: 修复内存服务 (60分钟)
├── 修复 MS-15: updateMachineStatus (20min)
├── 修复 MS-16,17: Mock配置 (40min)
├── 运行测试验证
└── 启用相关测试

Day 2 上午: 修复测试Mock (50分钟)
├── 修复 MM-09,11: findAvailable (30min)
├── 修复 SM-15: checkExpiredSessions (20min)
├── 运行测试验证
└── 启用相关测试

Day 2 下午: 完整回归测试 (20分钟)
└── 运行所有测试确保无回归

预期成果:
✅ 中优先级Bug全部修复
✅ 测试通过率提升到95%+
```

### 第三阶段: 边界改进 (1小时)

```bash
# 目标: 修复低优先级Bug

Step 1: 添加输入验证 (30分钟)
├── UM-03: 空字符串验证 (20min)
├── SM-17: JSON验证 (10min)
├── 运行测试验证
└── 启用相关测试

Step 2: 架构改进 (10分钟)
├── MS-01: 导出类
├── 更新导入语句
└── 启用 MS-01 测试

Step 3: 最终验证 (20分钟)
├── 运行完整测试套件
├── 检查测试覆盖率
└── 生成测试报告

预期成果:
✅ 所有Bug修复完成
✅ 测试通过率达到98%+
✅ 测试覆盖率达到85%+
```

---

## 验证步骤

### 每个修复后

```bash
# 1. 运行相关测试
npx vitest run <affected_test_file>

# 2. 运行完整测试套件
pnpm test:unit

# 3. 检查测试覆盖率
npx vitest run --coverage

# 4. 启用被跳过的测试
# 修改 test.skip() 为 test()
```

### 全部修复后

```bash
# 1. 运行所有测试
pnpm test:unit

# 2. 检查通过率
# 目标: >95%

# 3. 检查覆盖率
npx vitest run --coverage
# 目标: >85%

# 4. 生成测试报告
npx vitest run --reporter=verbose
```

---

## 风险管理

### 风险评估

| Bug | 风险等级 | 说明 |
|-----|---------|------|
| MM-16 | 中 | 数据库语法变更 |
| UM-02 | 低 | 添加验证逻辑 |
| 其他 | 低 | 最小化变更 |

### 回滚计划

```bash
# 如果修复后出现问题:
1. Git checkout 恢复文件
2. 重新启用 test.skip()
3. 分析失败原因
4. 调整修复方案
5. 重新应用修复
```

---

## 附录

### 相关文档

- `Bug分析报告.md` - 详细Bug分析
- `测试质量评估报告.md` - 测试质量评估
- `测试分析总结报告.md` - 综合总结

### 快速命令

```bash
# 运行所有测试
pnpm test:unit

# 运行特定测试
npx vitest run src/tests/unit/models/user.model.test.ts
npx vitest run src/tests/unit/models/machine.model.test.ts

# 查看覆盖率
npx vitest run --coverage

# 监视模式
npx vitest watch
```

---

*修复方案版本: 1.0*
*生成日期: 2025-12-25*
*预计完成时间: 4.5小时*
