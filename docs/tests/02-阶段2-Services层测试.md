# 阶段2: Services层测试方案

## 文档说明

- **文档**: 02-阶段2-Services层测试.md
- **依赖**: [00-测试方案总纲.md](./00-测试方案总纲.md)
- **前置**: [01-阶段1-Models层测试.md](./01-阶段1-Models层测试.md)
- **状态**: 待执行
- **预计时间**: 2天

---

## 1. 测试目标

Services层是业务逻辑层，负责状态管理、业务规则和协调工作。测试目标是确保：

1. **业务逻辑正确** - 状态转换、业务规则执行
2. **状态管理正确** - 内存数据一致性
3. **错误处理正确** - 异常场景的降级处理
4. **依赖调用正确** - 正确调用Models层和外部服务

---

## 2. 测试策略

### 2.1 Mock 策略

**必须 Mock**:
- `UserModel`, `SessionModel`, `MachineModel` 等Models层
- `connectionManager` (gRPC连接)
- `createWebhookEvent` (Webhook通知)
- `logger` (日志，可选)

**不 Mock**:
- 被测试的Service类本身
- 纯内存操作和业务逻辑

### 2.2 测试原则

```
┌─────────────────────────────────────────────────────────────┐
│                    Service测试原则                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   真实执行Service方法                                      │
│       │                                                   │
│       ├── 计算逻辑 (真实执行)                              │
│       ├── 状态转换 (真实执行)                              │
│       └── 业务规则 (真实执行)                              │
│                                                             │
│   外部依赖全部Mock                                          │
│       │                                                   │
│       ├── Models层 → Mock                                  │
│       ├── gRPC → Mock                                      │
│       └── Webhook → Mock                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 测试文件结构

```
src/tests/unit/services/
├── memory-store.service.test.ts    # 内存存储服务测试
└── session.service.test.ts          # 会话服务测试
```

---

## 4. MemoryStoreService 测试方案

### 4.1 文件位置
`src/tests/unit/services/memory-store.service.test.ts`

### 4.2 Mock 设置

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryStoreService } from '../../../services/memory-store.service.js';

// Mock Models
vi.mock('../../../models/machine.model.js', () => ({
  MachineModel: {
    findAll: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../../../models/session.model.js', () => ({
  SessionModel: {
    findActiveSessions: vi.fn(),
  },
}));

// Mock connectionManager
vi.mock('../../../services/machine-grpc.service.js', () => ({
  connectionManager: {
    getActiveConnections: vi.fn(() => new Map()),
  },
}));
```

### 4.3 测试用例清单

| ID | 测试用例 | 预期结果 | 优先级 |
|----|---------|---------|--------|
| MS-01 | 单例模式 | 只有一个实例 | P0 |
| MS-02 | 更新机器状态 - 新机器 | 内存中添加机器 | P0 |
| MS-03 | 更新机器状态 - 已存在 | 更新现有机器数据 | P0 |
| MS-04 | 更新机器状态 - 指标归一化 | cpu_usage 0-100之间 | P0 |
| MS-05 | 获取机器信息 - 存在 | 返回机器数据 | P0 |
| MS-06 | 获取机器信息 - 不存在 | 返回undefined | P0 |
| MS-07 | 获取所有机器 | 返回内存中所有机器 | P0 |
| MS-08 | 标记机器离线 | 机器状态变为offline | P0 |
| MS-09 | 更新会话状态 - 新会话 | 内存中添加会话 | P0 |
| MS-10 | 更新会话状态 - 已存在 | 更新现有会话数据 | P0 |
| MS-11 | 获取会话信息 - 存在 | 返回会话数据 | P0 |
| MS-12 | 获取会话信息 - 不存在 | 返回undefined | P0 |
| MS-13 | 获取所有会话 | 返回内存中所有会话 | P0 |
| MS-14 | 清理过期会话 | 移除超时会话 | P0 |
| MS-15 | 清理离线机器 | 移除长时间离线的机器 | P0 |
| MS-16 | 加载初始数据 | 从数据库加载到内存 | P1 |
| MS-17 | 数据一致性检查 | 检测并修复内存与数据库差异 | P1 |
| MS-18 | 更新机器会话计数 | 机器的session_count正确更新 | P0 |

### 4.4 测试模板

```typescript
describe('MemoryStoreService', () => {
  let service: MemoryStoreService;

  beforeEach(() => {
    service = MemoryStoreService.getInstance();
    service.clear();  // 清空状态
  });

  describe('更新机器状态', () => {
    it('应该添加新机器到内存', () => {
      const machineData = {
        id: 'machine-1',
        hostname: 'test-host',
        ip: '192.168.1.1',
        cpu_usage: 50,
        memory_usage: 60,
        instance_count: 2,
        max_instances: 10,
        status: 'online',
      };

      service.updateMachineStatus(machineData);

      const machine = service.getMachine('machine-1');
      expect(machine).toBeDefined();
      expect(machine.hostname).toBe('test-host');
      expect(machine.cpu_usage).toBe(50);
    });

    it('应该更新已存在的机器', () => {
      service.updateMachineStatus({
        id: 'machine-1',
        cpu_usage: 30,
      });

      service.updateMachineStatus({
        id: 'machine-1',
        cpu_usage: 50,
      });

      const machine = service.getMachine('machine-1');
      expect(machine.cpu_usage).toBe(50);  // 更新后的值
    });
  });

  describe('获取可用机器', () => {
    it('应该返回instance_count最少的机器', () => {
      service.updateMachineStatus({
        id: 'machine-1',
        instance_count: 5,
        max_instances: 10,
      });

      service.updateMachineStatus({
        id: 'machine-2',
        instance_count: 2,
        max_instances: 10,
      });

      const available = service.getAvailableMachine();
      expect(available.id).toBe('machine-2');  // 实例数最少的
    });

    it('所有机器满载时返回null', () => {
      service.updateMachineStatus({
        id: 'machine-1',
        instance_count: 10,
        max_instances: 10,
      });

      const available = service.getAvailableMachine();
      expect(available).toBeNull();
    });
  });

  describe('清理过期会话', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('应该移除超时的会话', () => {
      const createdAt = Date.now() - 31 * 60 * 1000;  // 31分钟前

      service.updateSessionStatus({
        id: 'session-1',
        user_id: 1,
        status: 'connected',
        last_activity: createdAt,
      });

      vi.advanceTimersByTime(30 * 60 * 1000);  // 前进30分钟

      service.cleanupOldSessions();

      const session = service.getSession('session-1');
      expect(session).toBeUndefined();  // 已被清理
    });
  });
});
```

---

## 5. SessionService 测试方案

### 5.1 文件位置
`src/tests/unit/services/session.service.test.ts`

### 5.2 Mock 设置

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createBrowserSession, handleSessionDisconnect } from '../../../services/session.service.js';

// Mock Models
vi.mock('../../../models/user.model.js', () => ({
  UserModel: {
    findById: vi.fn(),
    deductCredits: vi.fn(),
  },
}));

vi.mock('../../../models/session.model.js', () => ({
  SessionModel: {
    create: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(),
  },
}));

vi.mock('../../../models/machine.model.js', () => ({
  MachineModel: {
    findAvailable: vi.fn(),
    decrementInstanceCount: vi.fn(),
  },
}));

// Mock 外部服务
vi.mock('../../../services/machine-grpc.service.js', () => ({
  connectionManager: {
    launchBrowser: vi.fn(),
    closeBrowser: vi.fn(),
  },
}));

vi.mock('../../../utils/webhook.js', () => ({
  createWebhookEvent: vi.fn(),
}));
```

### 5.3 测试用例清单

| ID | 测试用例 | 预期结果 | 优先级 |
|----|---------|---------|--------|
| SS-01 | 创建会话 - 成功 | 返回会话信息，调用gRPC | P0 |
| SS-02 | 创建会话 - 用户不存在 | 抛出错误 | P0 |
| SS-03 | 创建会话 - 点数不足 | 抛出"点数不足"错误 | P0 |
| SS-04 | 创建会话 - 无可用机器 | 抛出"无可用机器"错误 | P0 |
| SS-05 | 创建会话 - gRPC失败 | 会话标记为error状态 | P0 |
| SS-06 | 创建会话 - WebSocket直连 | 返回directUrl | P0 |
| SS-07 | 创建会话 - 使用公共端点 | directUrl使用公共域名 | P1 |
| SS-08 | 创建会话 - 使用机器IP | directUrl使用机器IP | P1 |
| SS-09 | 处理断开 - 正常 | 计算duration，扣除点数 | P0 |
| SS-10 | 处理断开 - 会话不存在 | 记录错误并返回 | P0 |
| SS-11 | 处理断开 - 已断开 | 不重复处理 | P0 |
| SS-12 | 处理断开 - gRPC失败 | 继续处理会话断开 | P1 |
| SS-13 | 处理断开 - 已有消耗点数 | 不重复扣除 | P1 |
| SS-14 | 处理断开 - 触发Webhook | 调用createWebhookEvent | P1 |

### 5.4 测试模板

```typescript
describe('SessionService', () => {
  describe('createBrowserSession', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('应该成功创建会话', async () => {
      // Arrange
      const mockUser = { id: 1, username: 'testuser', credits: 100 };
      const mockMachine = { id: 'machine-1', hostname: 'test', instance_count: 0, max_instances: 10 };
      const mockSession = { id: 'session-1', user_id: 1, status: 'created' };

      vi.mocked(UserModel.findById).mockResolvedValue(mockUser);
      vi.mocked(MachineModel.findAvailable).mockResolvedValue(mockMachine);
      vi.mocked(SessionModel.create).mockResolvedValue(mockSession);
      vi.mocked(connectionManager.launchBrowser).mockResolvedValue({
        browserWSEndpoint: 'ws://localhost:3000',
        directUrl: 'http://localhost:3000',
      });

      // Act
      const result = await createBrowserSession(1, {
        project: 'test-project',
      });

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe('session-1');
      expect(result.browserWSEndpoint).toBeTruthy();
      expect(UserModel.findById).toHaveBeenCalledWith(1);
      expect(MachineModel.findAvailable).toHaveBeenCalled();
      expect(connectionManager.launchBrowser).toHaveBeenCalledWith(
        'machine-1',
        'session-1',
        expect.any(Object)
      );
    });

    it('用户不存在时应该抛出错误', async () => {
      vi.mocked(UserModel.findById).mockResolvedValue(null);

      await expect(
        createBrowserSession(999, { project: 'test' })
      ).rejects.toThrow('用户不存在');
    });

    it('点数不足时应该抛出错误', async () => {
      const mockUser = { id: 1, credits: 0 };  // 余额为0

      vi.mocked(UserModel.findById).mockResolvedValue(mockUser);

      await expect(
        createBrowserSession(1, { project: 'test' })
      ).rejects.toThrow('点数不足');
    });
  });

  describe('handleSessionDisconnect', () => {
    it('应该正确处理会话断开', async () => {
      const startTime = Date.now() - 5 * 60 * 1000;  // 5分钟前

      const mockSession = {
        id: 'session-1',
        user_id: 1,
        machine_id: 'machine-1',
        start_time: new Date(startTime),
        credits_used: 0,
      };

      vi.mocked(SessionModel.findById).mockResolvedValue(mockSession);

      // Act
      await handleSessionDisconnect('session-1', 1, 'machine-1');

      // Assert
      expect(SessionModel.update).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({
          status: 'disconnected',
          duration: expect.any(Number),
          credits_used: expect.any(Number),
        })
      );
      expect(UserModel.deductCredits).toHaveBeenCalledWith(1, expect.any(Number));
      expect(MachineModel.decrementInstanceCount).toHaveBeenCalledWith('machine-1');
      expect(createWebhookEvent).toHaveBeenCalled();
    });

    it('会话不存在时应该记录错误', async () => {
      vi.mocked(SessionModel.findById).mockResolvedValue(null);

      // 应该不抛出错误，只记录日志
      await expect(
        handleSessionDisconnect('nonexistent', 1, 'machine-1')
      ).resolves.not.toThrow();
    });
  });
});
```

---

## 6. 验收标准

### 6.1 完成标准

- [ ] 所有测试用例编写完成
- [ ] 所有测试通过
- [ ] 代码覆盖率 ≥ 80% (行), ≥ 70% (分支)
- [ ] 无跳过的测试
- [ ] 测试可在1分钟内完成

### 6.2 问题记录

```typescript
test.skip('Bug记录: XXX问题', async () => {
  // 记录问题详情
});
```

---

*文档创建日期: 2024-12-25*
*预计完成日期: 2024-12-31*
