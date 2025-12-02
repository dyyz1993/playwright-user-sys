# 功能模块改进文档 - 会话管理服务

## 1. 变更原因说明

当前会话管理服务存在以下问题：
1. 会话资源分配缺乏精细化管理
2. 状态持久化机制不完善
3. 缺乏会话级别的数据隔离支持
4. 资源回收策略不够灵活

## 2. 模块功能规格说明书

### 2.1 模块概述

会话管理服务负责创建、维护和清理用户会话，提供会话级别的资源管理、状态持久化和数据隔离功能。

### 2.2 核心功能

1. **会话生命周期管理**
   - 创建和初始化会话
   - 监控会话状态
   - 处理会话终止和清理

2. **资源分配管理**
   - 分配会话资源配额
   - 监控资源使用情况
   - 实现资源回收策略

3. **状态持久化**
   - 保存会话配置和状态
   - 支持会话恢复
   - 管理状态历史记录

4. **数据隔离协调**
   - 协调用户数据目录创建
   - 管理Cookies和LocalStorage配置
   - 确保数据隔离正确实施

## 3. 接口变更说明

### 3.1 SessionCreateOptions 接口扩展

**变更前：**
```typescript
export interface SessionCreateOptions {
  userAgent?: string;
  proxy?: string;
  cookies?: Record<string, string>;
  localStorage?: Record<string, string>;
  viewport?: {
    width: number;
    height: number;
  };
}
```

**变更后：**
```typescript
export interface SessionCreateOptions {
  userAgent?: string;
  proxy?: string;
  cookies?: Record<string, string>;
  localStorage?: Record<string, string>;
  viewport?: {
    width: number;
    height: number;
  };
  // 新增：资源管理配置
  resourceConfig?: {
    maxMemory?: number;
    maxCpu?: number;
    maxDuration?: number; // 最大持续时间（毫秒）
    autoCleanup?: boolean; // 是否自动清理
  };
  // 新增：数据隔离配置
  isolationConfig?: {
    enableDataIsolation?: boolean;
    userDataDir?: string;
    persistentData?: boolean; // 是否持久化数据
  };
  // 新增：状态管理配置
  stateConfig?: {
    persistState?: boolean;
    stateSyncInterval?: number; // 状态同步间隔（毫秒）
    restoreOnReconnect?: boolean; // 重连时是否恢复状态
  };
}
```

### 3.2 createSession 方法扩展

**变更前：**
```typescript
async createSession(
  userId: number,
  options: SessionCreateOptions = {}
): Promise<Session>
```

**变更后：**
```typescript
async createSession(
  userId: number,
  options: SessionCreate = {}
): Promise<Session> {
  // 新增：资源预分配检查
  await this.validateResourceAvailability(userId, options);
  
  // 新增：数据隔离准备
  const isolationConfig = await this.prepareDataIsolation(options);
  
  // 原有逻辑...
  
  // 新增：资源监控初始化
  await this.initializeResourceMonitoring(sessionId, options.resourceConfig);
  
  // 新增：状态持久化初始化
  await this.initializeStatePersistence(sessionId, options.stateConfig);
}
```

### 3.3 新增接口方法

```typescript
/**
 * 验证资源可用性
 */
async validateResourceAvailability(
  userId: number,
  options: SessionCreateOptions
): Promise<void>;

/**
 * 准备数据隔离
 */
async prepareDataIsolation(
  options: SessionCreateOptions
): Promise<IsolationConfig>;

/**
 * 初始化资源监控
 */
async initializeResourceMonitoring(
  sessionId: string,
  config?: ResourceConfig
): Promise<void>;

/**
 * 初始化状态持久化
 */
async initializeStatePersistence(
  sessionId: string,
  config?: StateConfig
): Promise<void>;

/**
 * 获取会话资源使用情况
 */
async getSessionResourceUsage(sessionId: string): Promise<ResourceUsage>;

/**
 * 手动清理会话资源
 */
async cleanupSessionResources(sessionId: string): Promise<void>;
```

## 4. 测试用例更新方案

### 4.1 新增测试用例

1. **资源分配测试**
```typescript
describe('会话资源分配', () => {
  test('应该正确验证资源可用性', async () => {
    const userId = 1;
    const options = {
      resourceConfig: {
        maxMemory: 512 * 1024 * 1024, // 512MB
        maxCpu: 50 // 50%
      }
    };
    
    // 模拟资源不足情况
    jest.spyOn(resourceService, 'checkAvailability')
      .mockResolvedValue(false);
    
    await expect(
      sessionService.createSession(userId, options)
    ).rejects.toThrow('资源不足');
  });
  
  test('应该正确分配会话资源', async () => {
    const userId = 1;
    const options = {
      resourceConfig: {
        maxMemory: 256 * 1024 * 1024, // 256MB
        maxCpu: 30 // 30%
      }
    };
    
    const session = await sessionService.createSession(userId, options);
    
    // 验证资源分配记录
    const allocation = await resourceService.getAllocation(session.id);
    expect(allocation.memory).toBe(256 * 1024 * 1024);
    expect(allocation.cpu).toBe(30);
  });
});
```

2. **数据隔离测试**
```typescript
describe('会话数据隔离', () => {
  test('应该正确准备数据隔离配置', async () => {
    const options = {
      isolationConfig: {
        enableDataIsolation: true,
        userDataDir: '/custom/path',
        persistentData: true
      }
    };
    
    const isolationConfig = await sessionService.prepareDataIsolation(options);
    
    expect(isolationConfig.enabled).toBe(true);
    expect(isolationConfig.userDataDir).toContain('/custom/path');
    expect(isolationConfig.persistent).toBe(true);
  });
  
  test('应该为每个会话创建独立数据目录', async () => {
    const userId = 1;
    const options = {
      isolationConfig: {
        enableDataIsolation: true
      }
    };
    
    const session1 = await sessionService.createSession(userId, options);
    const session2 = await sessionService.createSession(userId, options);
    
    // 验证数据目录独立性
    const dir1 = await sessionService.getSessionDataDir(session1.id);
    const dir2 = await sessionService.getSessionDataDir(session2.id);
    
    expect(dir1).not.toBe(dir2);
  });
});
```

3. **状态持久化测试**
```typescript
describe('会话状态持久化', () => {
  test('应该正确初始化状态持久化', async () => {
    const userId = 1;
    const options = {
      stateConfig: {
        persistState: true,
        stateSyncInterval: 5000,
        restoreOnReconnect: true
      }
    };
    
    const session = await sessionService.createSession(userId, options);
    
    // 验证状态持久化配置
    const stateConfig = await sessionService.getStateConfig(session.id);
    expect(stateConfig.persist).toBe(true);
    expect(stateConfig.syncInterval).toBe(5000);
    expect(stateConfig.restoreOnReconnect).toBe(true);
  });
  
  test('应该正确保存和恢复会话状态', async () => {
    const userId = 1;
    const options = {
      stateConfig: {
        persistState: true
      }
    };
    
    const session = await sessionService.createSession(userId, options);
    
    // 模拟状态变化
    await sessionService.updateSessionState(session.id, {
      lastUrl: 'https://example.com',
      cookies: { 'test': 'value' }
    });
    
    // 模拟会话重启
    await sessionService.restartSession(session.id);
    
    // 验证状态恢复
    const state = await sessionService.getSessionState(session.id);
    expect(state.lastUrl).toBe('https://example.com');
    expect(state.cookies).toEqual({ 'test': 'value' });
  });
});
```

4. **资源清理测试**
```typescript
describe('会话资源清理', () => {
  test('应该正确清理会话资源', async () => {
    const userId = 1;
    const session = await sessionService.createSession(userId);
    
    // 验证资源已分配
    const beforeCleanup = await sessionService.getSessionResourceUsage(session.id);
    expect(beforeCleanup.memory).toBeGreaterThan(0);
    
    // 清理会话
    await sessionService.cleanupSessionResources(session.id);
    
    // 验证资源已清理
    const afterCleanup = await sessionService.getSessionResourceUsage(session.id);
    expect(afterCleanup.memory).toBe(0);
  });
  
  test('应该自动清理超时会话', async () => {
    const userId = 1;
    const options = {
      resourceConfig: {
        maxDuration: 1000 // 1秒
      }
    };
    
    const session = await sessionService.createSession(userId, options);
    
    // 等待超时
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // 验证会话已自动清理
    const isActive = await sessionService.isSessionActive(session.id);
    expect(isActive).toBe(false);
  });
});
```

### 4.2 更新现有测试用例

1. **会话创建测试**
   - 添加资源分配验证
   - 添加数据隔离验证
   - 添加状态持久化验证

2. **会话终止测试**
   - 添加资源清理验证
   - 添加状态保存验证
   - 添加数据目录清理验证

## 5. 兼容性处理方案

### 5.1 向后兼容性

1. **参数兼容性**
   - 所有新增参数均为可选
   - 未提供新参数时使用默认行为
   - 保持原有接口签名不变

2. **行为兼容性**
   - 未启用数据隔离时使用原有逻辑
   - 未启用状态持久化时跳过相关操作
   - 保持原有资源管理行为

### 5.2 迁移策略

1. **渐进式迁移**
   - 第一阶段：添加新功能，保持原有行为
   - 第二阶段：逐步启用新功能
   - 第三阶段：移除旧逻辑

2. **配置开关**
   - 提供功能开关控制新特性启用
   - 支持按用户或会话级别控制
   - 提供全局默认配置

## 6. 实现细节

### 6.1 资源验证

```typescript
/**
 * 验证资源可用性
 */
async validateResourceAvailability(
  userId: number,
  options: SessionCreateOptions
): Promise<void> {
  const resourceConfig = options.resourceConfig || {};
  const maxMemory = resourceConfig.maxMemory || DEFAULT_MAX_MEMORY;
  const maxCpu = resourceConfig.maxCpu || DEFAULT_MAX_CPU;
  
  // 检查用户资源配额
  const userQuota = await this.getUserResourceQuota(userId);
  const currentUsage = await this.getUserCurrentUsage(userId);
  
  if (currentUsage.memory + maxMemory > userQuota.memory) {
    throw new Error('内存资源不足');
  }
  
  if (currentUsage.cpu + maxCpu > userQuota.cpu) {
    throw new Error('CPU资源不足');
  }
  
  // 检查系统资源可用性
  const systemAvailability = await this.getSystemResourceAvailability();
  if (systemAvailability.memory < maxMemory) {
    throw new Error('系统内存不足');
  }
}
```

### 6.2 数据隔离准备

```typescript
/**
 * 准备数据隔离
 */
async prepareDataIsolation(
  options: SessionCreateOptions
): Promise<IsolationConfig> {
  const isolationConfig = options.isolationConfig || {};
  const enableDataIsolation = isolationConfig.enableDataIsolation !== false;
  
  if (!enableDataIsolation) {
    return { enabled: false };
  }
  
  // 生成用户数据目录
  const userDataDir = isolationConfig.userDataDir || 
    path.join(process.cwd(), 'data', 'userdata', generateId());
  
  // 确保目录存在
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }
  
  // 设置权限
  fs.chmodSync(userDataDir, 0o700);
  
  return {
    enabled: true,
    userDataDir,
    persistent: isolationConfig.persistentData || false
  };
}
```

### 6.3 状态持久化初始化

```typescript
/**
 * 初始化状态持久化
 */
async initializeStatePersistence(
  sessionId: string,
  config?: StateConfig
): Promise<void> {
  const stateConfig = {
    persist: config?.persistState || false,
    syncInterval: config?.stateSyncInterval || 30000,
    restoreOnReconnect: config?.restoreOnReconnect || false
  };
  
  if (!stateConfig.persist) {
    return;
  }
  
  // 创建状态管理器
  const stateManager = new SessionStateManager(sessionId, {
    syncInterval: stateConfig.syncInterval,
    restoreOnReconnect: stateConfig.restoreOnReconnect
  });
  
  // 启动状态同步
  await stateManager.start();
  
  // 存储状态管理器
  this.stateManagers.set(sessionId, stateManager);
}
```

### 6.4 资源监控初始化

```typescript
/**
 * 初始化资源监控
 */
async initializeResourceMonitoring(
  sessionId: string,
  config?: ResourceConfig
): Promise<void> {
  const resourceConfig = {
    maxMemory: config?.maxMemory || DEFAULT_MAX_MEMORY,
    maxCpu: config?.maxCpu || DEFAULT_MAX_CPU,
    maxDuration: config?.maxDuration || DEFAULT_MAX_DURATION,
    autoCleanup: config?.autoCleanup !== false
  };
  
  // 创建资源监控器
  const monitor = new SessionResourceMonitor(sessionId, resourceConfig);
  
  // 设置资源超限处理
  monitor.on('resourceExceeded', async (resource) => {
    if (resourceConfig.autoCleanup) {
      await this.cleanupSessionResources(sessionId);
    } else {
      // 发送警告通知
      await this.notifyResourceExceeded(sessionId, resource);
    }
  });
  
  // 设置会话超时处理
  monitor.on('sessionTimeout', async () => {
    await this.cleanupSessionResources(sessionId);
  });
  
  // 启动监控
  await monitor.start();
  
  // 存储监控器
  this.resourceMonitors.set(sessionId, monitor);
}
```

## 7. 影响范围评估

### 7.1 直接影响

1. **会话创建流程**
   - 增加资源验证步骤
   - 添加数据隔离准备
   - 增加状态持久化初始化

2. **会话管理**
   - 扩展会话配置参数
   - 增加资源监控逻辑
   - 添加自动清理机制

3. **资源使用**
   - 增加内存使用（监控）
   - 增加CPU使用（监控）
   - 增加磁盘空间使用（数据隔离）

### 7.2 间接影响

1. **性能影响**
   - 会话创建时间增加（约5-10%）
   - 资源使用增加（约3-5%）
   - 系统响应时间略有增加

2. **运维影响**
   - 需要监控资源使用情况
   - 需要调整资源配额策略
   - 需要管理数据目录存储

## 8. 相关依赖说明

### 8.1 内部依赖

1. **资源服务**：验证和分配资源
2. **数据隔离服务**：管理用户数据目录
3. **状态管理服务**：持久化和恢复状态
4. **通知服务**：发送资源警告

### 8.2 外部依赖

1. **数据库**：存储会话状态和配置
2. **文件系统**：创建和管理数据目录
3. **系统API**：获取资源使用情况

## 9. 验证方法和标准

### 9.1 功能验证

1. **资源管理验证**
   - 验证资源分配是否正确
   - 检查资源监控是否准确
   - 测试资源回收是否及时

2. **数据隔离验证**
   - 验证数据目录独立性
   - 检查权限设置是否正确
   - 测试数据清理是否完整

3. **状态持久化验证**
   - 验证状态保存是否正确
   - 检查状态恢复是否有效
   - 测试状态同步是否及时

### 9.2 性能验证

1. **创建时间**：会话创建时间增加不超过10%
2. **资源使用**：内存使用增长不超过5%
3. **并发性能**：支持并发会话数不低于当前水平

### 9.3 稳定性验证

1. **异常恢复**：系统异常后能正确恢复状态
2. **资源泄漏**：长时间运行无资源泄漏
3. **边界测试**：超出资源限制时的处理是否正确