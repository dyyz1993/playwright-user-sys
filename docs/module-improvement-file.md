# 功能模块改进文档 - 文件管理服务

## 1. 变更原因说明

当前文件管理服务存在以下问题：
1. 临时文件管理缺乏用户级别隔离
2. 文件生命周期管理不够精细
3. 缺乏文件访问权限控制
4. 文件清理策略不够灵活

## 2. 模块功能规格说明书

### 2.1 模块概述

文件管理服务负责处理用户文件上传、存储、访问和清理，提供用户级别的文件隔离、权限控制和生命周期管理功能。

### 2.2 核心功能

1. **文件上传管理**
   - 处理多类型文件上传
   - 实现文件验证和转换
   - 提供上传进度跟踪

2. **文件隔离管理**
   - 为每个用户创建独立文件空间
   - 实现文件访问权限控制
   - 管理文件共享机制

3. **文件生命周期管理**
   - 实现自动清理策略
   - 提供手动清理接口
   - 支持文件归档和恢复

4. **文件监控和统计**
   - 监控文件使用情况
   - 提供存储空间统计
   - 实现使用配额管理

## 3. 接口变更说明

### 3.1 FileUploadOptions 接口扩展

**变更前：**
```typescript
interface FileUploadOptions {
  filename?: string;
  mimetype?: string;
}
```

**变更后：**
```typescript
interface FileUploadOptions {
  filename?: string;
  mimetype?: string;
  // 新增：用户隔离配置
  userId?: number;
  sessionId?: string;
  // 新增：文件生命周期配置
  lifecycle?: {
    ttl?: number; // 生存时间（毫秒）
    autoCleanup?: boolean; // 是否自动清理
    archive?: boolean; // 是否归档
  };
  // 新增：访问控制配置
  access?: {
    public?: boolean; // 是否公开访问
    allowedUsers?: number[]; // 允许访问的用户ID列表
    permissions?: ('read' | 'write' | 'delete')[];
  };
  // 新增：存储配置
  storage?: {
    compression?: boolean; // 是否压缩
    encryption?: boolean; // 是否加密
    redundancy?: number; // 冗余份数
  };
}
```

### 3.2 uploadTempFile 方法扩展

**变更前：**
```typescript
export async function uploadTempFile(request: FastifyRequest, reply: FastifyReply) {
  // 原有逻辑...
}
```

**变更后：**
```typescript
export async function uploadTempFile(request: FastifyRequest, reply: FastifyReply) {
  try {
    // 验证用户权限
    if (!request.user) {
      return sendError(reply, '需要认证', 401);
    }
    
    // 获取上传选项
    const options = parseUploadOptions(request);
    
    // 新增：验证文件访问权限
    await validateFileAccess(request.user.id, options);
    
    // 新增：验证存储配额
    await validateStorageQuota(request.user.id, options);
    
    // 新增：获取用户隔离目录
    const userTempDir = await getUserTempDir(request.user.id, options.sessionId);
    
    // 原有逻辑...
    
    // 新增：设置文件生命周期
    await setFileLifecycle(filePath, options.lifecycle);
    
    // 新增：记录文件访问信息
    await recordFileAccess(request.user.id, fileRecord, 'upload');
    
    return sendSuccess(reply, fileRecord, '文件上传成功');
  } catch (error) {
    request.log.error('文件上传失败:', error);
    return sendError(reply, '文件上传失败', 500);
  }
}
```

### 3.3 新增接口方法

```typescript
/**
 * 获取用户临时目录
 */
async getUserTempDir(userId: number, sessionId?: string): Promise<string>;

/**
 * 验证文件访问权限
 */
async validateFileAccess(userId: number, options: FileUploadOptions): Promise<void>;

/**
 * 验证存储配额
 */
async validateStorageQuota(userId: number, options: FileUploadOptions): Promise<void>;

/**
 * 设置文件生命周期
 */
async setFileLifecycle(filePath: string, lifecycle?: FileLifecycle): Promise<void>;

/**
 * 记录文件访问
 */
async recordFileAccess(userId: number, fileRecord: FileRecord, action: string): Promise<void>;

/**
 * 清理用户文件
 */
async cleanupUserFiles(userId: number, options?: CleanupOptions): Promise<CleanupResult>;

/**
 * 获取用户文件统计
 */
async getUserFileStats(userId: number): Promise<FileStats>;
```

## 4. 测试用例更新方案

### 4.1 新增测试用例

1. **文件隔离测试**
```typescript
describe('文件隔离', () => {
  test('应该为每个用户创建独立文件目录', async () => {
    const user1 = 1;
    const user2 = 2;
    
    const dir1 = await fileService.getUserTempDir(user1);
    const dir2 = await fileService.getUserTempDir(user2);
    
    expect(dir1).not.toBe(dir2);
    expect(dir1).toContain(`/user_${user1}/`);
    expect(dir2).toContain(`/user_${user2}/`);
  });
  
  test('应该为同一用户的不同会话创建独立目录', async () => {
    const userId = 1;
    const session1 = 'session1';
    const session2 = 'session2';
    
    const dir1 = await fileService.getUserTempDir(userId, session1);
    const dir2 = await fileService.getUserTempDir(userId, session2);
    
    expect(dir1).not.toBe(dir2);
    expect(dir1).toContain(`/user_${userId}/session_${session1}/`);
    expect(dir2).toContain(`/user_${userId}/session_${session2}/`);
  });
});
```

2. **文件访问控制测试**
```typescript
describe('文件访问控制', () => {
  test('应该正确验证文件访问权限', async () => {
    const userId = 1;
    const options = {
      access: {
        public: false,
        allowedUsers: [1, 2],
        permissions: ['read', 'write']
      }
    };
    
    // 用户1有权限
    await expect(fileService.validateFileAccess(userId, options)).resolves.not.toThrow();
    
    // 用户3无权限
    await expect(fileService.validateFileAccess(3, options)).rejects.toThrow('访问被拒绝');
  });
  
  test('应该正确处理公开文件访问', async () => {
    const userId = 1;
    const options = {
      access: {
        public: true
      }
    };
    
    // 任何用户都可以访问公开文件
    await expect(fileService.validateFileAccess(userId, options)).resolves.not.toThrow();
    await expect(fileService.validateFileAccess(999, options)).resolves.not.toThrow();
  });
});
```

3. **存储配额测试**
```typescript
describe('存储配额', () => {
  test('应该正确验证存储配额', async () => {
    const userId = 1;
    const options = {
      storage: {
        size: 100 * 1024 * 1024 // 100MB
      }
    };
    
    // 模拟用户已使用90MB
    jest.spyOn(fileService, 'getUserStorageUsage')
      .mockResolvedValue(90 * 1024 * 1024);
    
    // 模拟用户配额为100MB
    jest.spyOn(fileService, 'getUserStorageQuota')
      .mockResolvedValue(100 * 1024 * 1024);
    
    // 上传10MB文件应该成功
    await expect(fileService.validateStorageQuota(userId, options)).resolves.not.toThrow();
    
    // 上传20MB文件应该失败
    options.storage.size = 20 * 1024 * 1024;
    await expect(fileService.validateStorageQuota(userId, options)).rejects.toThrow('存储配额不足');
  });
});
```

4. **文件生命周期测试**
```typescript
describe('文件生命周期', () => {
  test('应该正确设置文件生命周期', async () => {
    const filePath = '/tmp/test-file.txt';
    const lifecycle = {
      ttl: 60000, // 1分钟
      autoCleanup: true,
      archive: false
    };
    
    await fileService.setFileLifecycle(filePath, lifecycle);
    
    // 验证生命周期设置
    const fileLifecycle = await fileService.getFileLifecycle(filePath);
    expect(fileLifecycle.ttl).toBe(60000);
    expect(fileLifecycle.autoCleanup).toBe(true);
    expect(fileLifecycle.archive).toBe(false);
  });
  
  test('应该自动清理过期文件', async () => {
    const userId = 1;
    
    // 创建一个已过期的文件
    const expiredFile = await fileService.createTestFile(userId, {
      lifecycle: {
        ttl: 1 // 1毫秒
      }
    });
    
    // 等待文件过期
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // 运行清理任务
    const result = await fileService.cleanupUserFiles(userId);
    
    // 验证文件已清理
    expect(result.deletedCount).toBeGreaterThan(0);
    expect(fs.existsSync(expiredFile.path)).toBe(false);
  });
});
```

5. **文件统计测试**
```typescript
describe('文件统计', () => {
  test('应该正确计算用户文件统计', async () => {
    const userId = 1;
    
    // 创建测试文件
    await fileService.createTestFile(userId, { size: 1024 });
    await fileService.createTestFile(userId, { size: 2048 });
    await fileService.createTestFile(userId, { size: 3072 });
    
    const stats = await fileService.getUserFileStats(userId);
    
    expect(stats.totalFiles).toBe(3);
    expect(stats.totalSize).toBe(6144); // 1024 + 2048 + 3072
    expect(stats.averageSize).toBe(2048); // 6144 / 3
  });
});
```

### 4.2 更新现有测试用例

1. **文件上传测试**
   - 添加用户隔离验证
   - 添加访问权限验证
   - 添加存储配额验证

2. **文件清理测试**
   - 添加用户级别清理验证
   - 添加生命周期清理验证
   - 添加归档功能验证

## 5. 兼容性处理方案

### 5.1 向后兼容性

1. **参数兼容性**
   - 所有新增参数均为可选
   - 未提供新参数时使用默认行为
   - 保持原有接口签名不变

2. **行为兼容性**
   - 未启用用户隔离时使用原有逻辑
   - 未设置生命周期时使用默认TTL
   - 保持原有清理策略

### 5.2 迁移策略

1. **渐进式迁移**
   - 第一阶段：添加新功能，保持原有行为
   - 第二阶段：逐步启用新功能
   - 第三阶段：移除旧逻辑

2. **配置开关**
   - 提供功能开关控制新特性启用
   - 支持按用户级别控制
   - 提供全局默认配置

## 6. 实现细节

### 6.1 用户隔离目录管理

```typescript
/**
 * 获取用户临时目录
 */
async getUserTempDir(userId: number, sessionId?: string): Promise<string> {
  // 基础用户目录
  const baseUserDir = path.join(process.cwd(), 'data', 'temp', `user_${userId}`);
  
  // 会话级别目录
  const userTempDir = sessionId 
    ? path.join(baseUserDir, `session_${sessionId}`)
    : baseUserDir;
  
  // 确保目录存在
  if (!fs.existsSync(userTempDir)) {
    fs.mkdirSync(userTempDir, { recursive: true });
  }
  
  // 设置权限
  fs.chmodSync(userTempDir, 0o700);
  
  return userTempDir;
}
```

### 6.2 文件访问权限验证

```typescript
/**
 * 验证文件访问权限
 */
async validateFileAccess(userId: number, options: FileUploadOptions): Promise<void> {
  const access = options.access || {};
  
  // 公开文件无需验证
  if (access.public) {
    return;
  }
  
  // 检查用户是否在允许列表中
  if (access.allowedUsers && !access.allowedUsers.includes(userId)) {
    throw new Error('访问被拒绝：用户不在允许列表中');
  }
  
  // 检查权限类型
  if (access.permissions && access.permissions.length > 0) {
    // 这里可以根据具体权限类型进行更详细的验证
    // 例如：检查用户是否有写入权限、删除权限等
  }
}
```

### 6.3 存储配额验证

```typescript
/**
 * 验证存储配额
 */
async validateStorageQuota(userId: number, options: FileUploadOptions): Promise<void> {
  // 获取用户当前存储使用情况
  const currentUsage = await this.getUserStorageUsage(userId);
  
  // 获取用户存储配额
  const quota = await this.getUserStorageQuota(userId);
  
  // 计算文件大小（如果提供）
  const fileSize = options.storage?.size || 0;
  
  // 检查是否超出配额
  if (currentUsage + fileSize > quota) {
    throw new Error(`存储配额不足：当前使用 ${formatBytes(currentUsage)}，配额 ${formatBytes(quota)}`);
  }
}
```

### 6.4 文件生命周期管理

```typescript
/**
 * 设置文件生命周期
 */
async setFileLifecycle(filePath: string, lifecycle?: FileLifecycle): Promise<void> {
  if (!lifecycle) {
    return;
  }
  
  const fileLifecycle: FileLifecycleRecord = {
    filePath,
    createdAt: Date.now(),
    ttl: lifecycle.ttl || DEFAULT_FILE_TTL,
    autoCleanup: lifecycle.autoCleanup !== false,
    archive: lifecycle.archive || false,
    expiresAt: Date.now() + (lifecycle.ttl || DEFAULT_FILE_TTL)
  };
  
  // 存储生命周期信息
  await this.lifecycleStore.set(filePath, fileLifecycle);
  
  // 如果启用自动清理，设置清理定时器
  if (fileLifecycle.autoCleanup) {
    this.scheduleCleanup(filePath, fileLifecycle.expiresAt);
  }
}

/**
 * 安排文件清理
 */
private scheduleCleanup(filePath: string, expiresAt: number): void {
  const delay = expiresAt - Date.now();
  
  if (delay <= 0) {
    // 已过期，立即清理
    this.cleanupFile(filePath);
    return;
  }
  
  // 设置定时清理
  setTimeout(() => {
    this.cleanupFile(filePath);
  }, delay);
}
```

### 6.5 文件清理实现

```typescript
/**
 * 清理用户文件
 */
async cleanupUserFiles(userId: number, options?: CleanupOptions): Promise<CleanupResult> {
  const userTempDir = await this.getUserTempDir(userId);
  const result: CleanupResult = {
    deletedCount: 0,
    archivedCount: 0,
    totalSize: 0,
    errors: []
  };
  
  try {
    // 读取用户目录中的所有文件
    const files = await this.getAllFiles(userTempDir);
    
    for (const file of files) {
      try {
        // 检查文件生命周期
        const lifecycle = await this.getFileLifecycle(file.path);
        
        if (this.shouldCleanupFile(file, lifecycle, options)) {
          if (lifecycle && lifecycle.archive) {
            // 归档文件
            await this.archiveFile(file.path);
            result.archivedCount++;
          } else {
            // 删除文件
            const stats = fs.statSync(file.path);
            result.totalSize += stats.size;
            
            fs.unlinkSync(file.path);
            result.deletedCount++;
          }
          
          // 清理生命周期记录
          await this.lifecycleStore.delete(file.path);
        }
      } catch (error) {
        result.errors.push({
          file: file.path,
          error: error.message
        });
      }
    }
    
    return result;
  } catch (error) {
    throw new Error(`清理用户文件失败: ${error.message}`);
  }
}
```

## 7. 影响范围评估

### 7.1 直接影响

1. **文件上传流程**
   - 增加用户隔离目录创建
   - 添加访问权限验证
   - 增加存储配额检查

2. **文件管理**
   - 扩展文件配置参数
   - 增加生命周期管理
   - 添加访问控制逻辑

3. **存储使用**
   - 增加磁盘空间使用（隔离目录）
   - 增加元数据存储（生命周期）
   - 增加内存使用（缓存）

### 7.2 间接影响

1. **性能影响**
   - 文件上传时间增加（约5-15%）
   - 存储空间使用增加（约10-20%）
   - 系统响应时间略有增加

2. **运维影响**
   - 需要监控用户存储使用情况
   - 需要管理文件清理策略
   - 需要处理文件访问权限

## 8. 相关依赖说明

### 8.1 内部依赖

1. **用户服务**：获取用户信息和配额
2. **会话服务**：获取会话信息
3. **存储服务**：管理文件元数据
4. **通知服务**：发送存储警告

### 8.2 外部依赖

1. **文件系统**：创建和管理文件目录
2. **数据库**：存储文件元数据和生命周期信息
3. **监控系统**：监控存储使用情况

## 9. 验证方法和标准

### 9.1 功能验证

1. **文件隔离验证**
   - 验证用户目录独立性
   - 检查权限设置是否正确
   - 测试跨用户访问是否被阻止

2. **访问控制验证**
   - 验证权限检查是否正确
   - 测试公开文件访问
   - 检查权限列表功能

3. **生命周期验证**
   - 验证文件自动清理
   - 检查文件归档功能
   - 测试手动清理接口

### 9.2 性能验证

1. **上传时间**：文件上传时间增加不超过15%
2. **存储使用**：存储空间增长不超过20%
3. **并发性能**：支持并发上传数不低于当前水平

### 9.3 稳定性验证

1. **异常恢复**：系统异常后能正确恢复文件状态
2. **资源泄漏**：长时间运行无文件泄漏
3. **边界测试**：超出存储配额时的处理是否正确