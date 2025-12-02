# 数据存储方案文档

## 1. 临时用户数据目录机制

### 1.1 实现方案和技术路线

#### 1.1.1 设计原则

1. **隔离性**: 每个会话拥有独立的数据目录，避免数据污染
2. **安全性**: 严格控制目录权限，防止越权访问
3. **生命周期**: 自动创建和清理，无需手动干预
4. **可配置**: 支持自定义目录结构和保留策略

#### 1.1.2 目录结构设计

```
/tmp/playwright-sessions/
├── {session-id}/
│   ├── user-data/              # 用户数据目录
│   │   ├── cookies/           # Cookies 数据
│   │   ├── localStorage/      # LocalStorage 数据
│   │   ├── sessionStorage/     # SessionStorage 数据
│   │   ├── cache/             # 缓存数据
│   │   └── temp/              # 临时文件
│   ├── downloads/             # 下载文件
│   ├── uploads/              # 上传文件
│   ├── screenshots/          # 截图文件
│   └── logs/                 # 日志文件
```

#### 1.1.3 技术实现

**目录管理服务:**
```typescript
export interface IDataDirectoryManager {
  createSessionDirectory(sessionId: string): Promise<string>;
  deleteSessionDirectory(sessionId: string): Promise<void>;
  getSessionDirectory(sessionId: string): string;
  cleanupExpiredDirectories(): Promise<void>;
  getDirectoryUsage(sessionId: string): Promise<DirectoryUsage>;
}

export class DataDirectoryManager implements IDataDirectoryManager {
  constructor(private readonly config: DataDirectoryConfig) {}

  async createSessionDirectory(sessionId: string): Promise<string> {
    const sessionPath = path.join(this.config.basePath, sessionId);

    // 创建目录结构
    await fs.mkdir(sessionPath, { recursive: true });
    await fs.mkdir(path.join(sessionPath, 'user-data'), { recursive: true });
    await fs.mkdir(path.join(sessionPath, 'user-data/cookies'), { recursive: true });
    await fs.mkdir(path.join(sessionPath, 'user-data/localStorage'), { recursive: true });
    await fs.mkdir(path.join(sessionPath, 'user-data/sessionStorage'), { recursive: true });
    await fs.mkdir(path.join(sessionPath, 'user-data/cache'), { recursive: true });
    await fs.mkdir(path.join(sessionPath, 'user-data/temp'), { recursive: true });
    await fs.mkdir(path.join(sessionPath, 'downloads'), { recursive: true });
    await fs.mkdir(path.join(sessionPath, 'uploads'), { recursive: true });
    await fs.mkdir(path.join(sessionPath, 'screenshots'), { recursive: true });
    await fs.mkdir(path.join(sessionPath, 'logs'), { recursive: true });

    // 设置目录权限 (仅会话所有者可访问)
    await this.setDirectoryPermissions(sessionPath);

    return sessionPath;
  }

  async deleteSessionDirectory(sessionId: string): Promise<void> {
    const sessionPath = path.join(this.config.basePath, sessionId);

    if (await this.pathExists(sessionPath)) {
      // 递归删除目录及其内容
      await fs.rmdir(sessionPath, { recursive: true });
    }
  }

  private async setDirectoryPermissions(dirPath: string): Promise<void> {
    const stats = await fs.stat(dirPath);
    const currentUid = process.getuid();

    // 设置目录权限：所有者读写执行，组和其他用户无权限
    await fs.chmod(dirPath, 0o700);

    // 如果可能，设置目录所有者
    if (currentUid !== 0 && stats.uid !== currentUid) {
      await fs.chown(dirPath, currentUid, stats.gid);
    }
  }

  async cleanupExpiredDirectories(): Promise<void> {
    const entries = await fs.readdir(this.config.basePath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const sessionPath = path.join(this.config.basePath, entry.name);
        const stats = await fs.stat(sessionPath);
        const age = Date.now() - stats.mtime.getTime();

        // 清理超过配置时间的目录
        if (age > this.config.maxAge) {
          await this.deleteSessionDirectory(entry.name);
        }
      }
    }
  }
}
```

### 1.2 权限管理策略

#### 1.2.1 文件系统权限

1. **目录权限**: 700 (rwx------) - 仅所有者可访问
2. **文件权限**: 600 (rw-------) - 仅所有者可读写
3. **执行权限**: 仅对必要的脚本文件设置

#### 1.2.2 应用层权限控制

```typescript
export class SessionAccessController {
  private readonly sessionPermissions = new Map<string, SessionPermission>();

  grantAccess(sessionId: string, userId: string, permissions: string[]): void {
    this.sessionPermissions.set(sessionId, {
      sessionId,
      userId,
      permissions: new Set(permissions),
      grantedAt: new Date()
    });
  }

  checkAccess(sessionId: string, userId: string, requiredPermission: string): boolean {
    const permission = this.sessionPermissions.get(sessionId);
    return permission?.userId === userId &&
           permission.permissions.has(requiredPermission);
  }

  revokeAccess(sessionId: string): void {
    this.sessionPermissions.delete(sessionId);
  }
}
```

#### 1.2.3 安全防护措施

1. **路径遍历攻击防护**: 验证所有路径参数
2. **符号链接防护**: 禁止符号链接创建
3. **磁盘空间限制**: 监控和限制目录大小
4. **访问日志**: 记录所有目录访问操作

### 1.3 生命周期管理规则

#### 1.3.1 创建阶段

1. **会话开始时**: 自动创建目录结构
2. **初始化**: 复制默认配置和模板文件
3. **权限设置**: 应用安全权限配置
4. **注册监听**: 添加目录使用情况监控

#### 1.3.2 运行阶段

1. **使用监控**: 实时监控目录大小和文件数量
2. **清理策略**: 定期清理临时文件和缓存
3. **备份机制**: 重要数据自动备份
4. **告警机制**: 异常情况及时告警

#### 1.3.3 销毁阶段

1. **会话结束时**: 立即清理相关数据
2. **延迟清理**: 保留重要日志和调试信息
3. **最终清理**: 超过保留期限后彻底删除
4. **审计记录**: 记录清理操作日志

## 2. Cookies初始化方案

### 2.1 可配置参数清单

```typescript
export interface CookieInitializationConfig {
  // 基础配置
  domain?: string;                    // 域名
  path?: string;                     // 路径
  secure?: boolean;                  // 安全传输
  httpOnly?: boolean;                // HTTP Only
  sameSite?: 'Strict' | 'Lax' | 'None';  // SameSite 策略

  // 生命周期配置
  expires?: Date;                    // 过期时间
  maxAge?: number;                   // 最大存活时间(秒)

  // 初始Cookie列表
  cookies?: CookieConfig[];
}

export interface CookieConfig {
  name: string;                      // Cookie名称
  value: string;                     // Cookie值
  domain?: string;                   // 域名
  path?: string;                     // 路径
  expires?: Date;                    // 过期时间
  maxAge?: number;                   // 最大存活时间
  secure?: boolean;                  // 安全传输
  httpOnly?: boolean;                // HTTP Only
  sameSite?: 'Strict' | 'Lax' | 'None';  // SameSite 策略
  urlEncoded?: boolean;              // URL编码
}
```

### 2.2 安全策略说明

#### 2.2.1 默认安全配置

```typescript
export const DEFAULT_COOKIE_CONFIG: CookieInitializationConfig = {
  secure: true,                      // 仅HTTPS传输
  httpOnly: true,                    // 禁止JavaScript访问
  sameSite: 'Strict',                // 严格同站策略
  path: '/',                         // 根路径
  maxAge: 24 * 60 * 60,             // 24小时过期
};
```

#### 2.2.2 安全验证机制

1. **域名验证**: 检查Cookie域名是否匹配
2. **路径验证**: 验证Cookie路径安全性
3. **值验证**: 过滤恶意字符和脚本
4. **大小限制**: 限制单个Cookie大小

```typescript
export class CookieSecurityValidator {
  validateCookie(cookie: CookieConfig): ValidationResult {
    const errors: string[] = [];

    // 域名验证
    if (cookie.domain && !this.isValidDomain(cookie.domain)) {
      errors.push('Invalid domain');
    }

    // 路径验证
    if (cookie.path && !this.isValidPath(cookie.path)) {
      errors.push('Invalid path');
    }

    // 值验证
    if (this.containsMaliciousContent(cookie.value)) {
      errors.push('Malicious content detected');
    }

    // 大小验证
    if (cookie.value.length > this.MAX_COOKIE_SIZE) {
      errors.push('Cookie too large');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private containsMaliciousContent(value: string): boolean {
    const maliciousPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /data:text\/html/gi,
      /vbscript:/gi
    ];

    return maliciousPatterns.some(pattern => pattern.test(value));
  }
}
```

### 2.3 跨域处理方案

#### 2.3.1 CORS配置

```typescript
export class CookieCorsHandler {
  configureCorsForCookies(response: Response, allowedOrigins: string[]): void {
    // 设置CORS头
    response.setHeader('Access-Control-Allow-Origin', this.getAllowedOrigin(allowedOrigins));
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  private getAllowedOrigin(allowedOrigins: string[]): string {
    const requestOrigin = this.getRequestOrigin();
    return allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0];
  }
}
```

#### 2.3.2 跨域Cookie策略

1. **SameSite=None**: 需要Secure属性
2. **域名配置**: 使用顶级域名共享Cookie
3. **预检请求**: 处理OPTIONS预检请求
4. **白名单机制**: 限制跨域访问源

## 3. LocalStorage初始化方案

### 3.1 命名空间管理策略

#### 3.1.1 命名空间设计

```typescript
export interface LocalStorageNamespace {
  sessionId: string;                 // 会话ID
  namespace: string;                 // 命名空间
  isolated: boolean;                 // 是否隔离
  persistent: boolean;               // 是否持久化
  maxSize?: number;                  // 最大容量(字节)
  ttl?: number;                      // 存活时间(秒)
}

export class LocalStorageNamespaceManager {
  private readonly namespaces = new Map<string, LocalStorageNamespace>();

  createNamespace(config: LocalStorageNamespace): void {
    const namespaceKey = `${config.sessionId}:${config.namespace}`;
    this.namespaces.set(namespaceKey, config);
  }

  getNamespace(sessionId: string, namespace: string): LocalStorageNamespace | null {
    return this.namespaces.get(`${sessionId}:${namespace}`) || null;
  }

  isNamespaceIsolated(sessionId: string, namespace: string): boolean {
    const ns = this.getNamespace(sessionId, namespace);
    return ns?.isolated || false;
  }
}
```

#### 3.1.2 隔离机制实现

```typescript
export class LocalStorageIsolationHandler {
  constructor(private readonly namespaceManager: LocalStorageNamespaceManager) {}

  async setItem(sessionId: string, key: string, value: string, namespace: string = 'default'): Promise<void> {
    const ns = this.namespaceManager.getNamespace(sessionId, namespace);
    if (!ns) {
      throw new Error(`Namespace ${namespace} not found for session ${sessionId}`);
    }

    // 构建隔离的键名
    const isolatedKey = this.buildIsolatedKey(sessionId, namespace, key);

    // 检查容量限制
    await this.checkCapacityLimit(ns, value.length);

    // 存储数据
    await this.storeData(isolatedKey, value, ns);
  }

  async getItem(sessionId: string, key: string, namespace: string = 'default'): Promise<string | null> {
    const ns = this.namespaceManager.getNamespace(sessionId, namespace);
    if (!ns) {
      return null;
    }

    const isolatedKey = this.buildIsolatedKey(sessionId, namespace, key);
    return await this.getData(isolatedKey, ns);
  }

  private buildIsolatedKey(sessionId: string, namespace: string, key: string): string {
    return `${sessionId}:${namespace}:${key}`;
  }

  private async checkCapacityLimit(namespace: LocalStorageNamespace, dataSize: number): Promise<void> {
    if (!namespace.maxSize) return;

    const currentUsage = await this.getNamespaceUsage(namespace);
    if (currentUsage + dataSize > namespace.maxSize) {
      throw new Error(`Namespace ${namespace.namespace} capacity exceeded`);
    }
  }
}
```

### 3.2 数据类型支持说明

#### 3.2.1 支持的数据类型

```typescript
export enum LocalStorageDataType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  OBJECT = 'object',
  ARRAY = 'array',
  JSON = 'json'
}

export class LocalStorageTypeHandler {
  serialize(value: any, type: LocalStorageDataType): string {
    switch (type) {
      case LocalStorageDataType.STRING:
        return String(value);
      case LocalStorageDataType.NUMBER:
        return JSON.stringify({ type: 'number', value: Number(value) });
      case LocalStorageDataType.BOOLEAN:
        return JSON.stringify({ type: 'boolean', value: Boolean(value) });
      case LocalStorageDataType.OBJECT:
      case LocalStorageDataType.ARRAY:
        return JSON.stringify({ type: 'object', value });
      case LocalStorageDataType.JSON:
        return JSON.stringify({ type: 'json', value });
      default:
        throw new Error(`Unsupported data type: ${type}`);
    }
  }

  deserialize(data: string): any {
    try {
      const parsed = JSON.parse(data);
      if (parsed.type) {
        switch (parsed.type) {
          case 'number':
            return Number(parsed.value);
          case 'boolean':
            return Boolean(parsed.value);
          case 'object':
          case 'json':
            return parsed.value;
          default:
            return parsed.value;
        }
      }
      return data;
    } catch {
      return data;
    }
  }
}
```

#### 3.2.2 类型转换和验证

```typescript
export class LocalStorageValidator {
  validateValue(value: any, type: LocalStorageDataType): ValidationResult {
    switch (type) {
      case LocalStorageDataType.STRING:
        return { isValid: typeof value === 'string', errors: [] };
      case LocalStorageDataType.NUMBER:
        return {
          isValid: !isNaN(Number(value)),
          errors: isNaN(Number(value)) ? ['Invalid number'] : []
        };
      case LocalStorageDataType.BOOLEAN:
        return {
          isValid: typeof value === 'boolean' || value === 'true' || value === 'false',
          errors: []
        };
      case LocalStorageDataType.OBJECT:
      case LocalStorageDataType.ARRAY:
        try {
          JSON.stringify(value);
          return { isValid: true, errors: [] };
        } catch {
          return { isValid: false, errors: ['Invalid object'] };
        }
      default:
        return { isValid: true, errors: [] };
    }
  }
}
```

### 3.3 容量限制处理方案

#### 3.3.1 容量监控

```typescript
export class LocalStorageCapacityManager {
  private readonly usageTracker = new Map<string, number>();

  async trackUsage(sessionId: string, namespace: string, delta: number): Promise<void> {
    const key = `${sessionId}:${namespace}`;
    const currentUsage = this.usageTracker.get(key) || 0;
    const newUsage = currentUsage + delta;
    this.usageTracker.set(key, newUsage);

    // 检查是否超过限额
    await this.checkUsageLimits(sessionId, namespace, newUsage);
  }

  private async checkUsageLimits(sessionId: string, namespace: string, usage: number): Promise<void> {
    const limits = await this.getNamespaceLimits(sessionId, namespace);

    if (usage > limits.maxSize) {
      // 触发清理策略
      await this.triggerCleanup(sessionId, namespace, usage - limits.maxSize);
    }
  }

  private async triggerCleanup(sessionId: string, namespace: string, excessSize: number): Promise<void> {
    const cleanupStrategies = [
      this.cleanupExpiredItems(sessionId, namespace),
      this.cleanupLeastUsedItems(sessionId, namespace, excessSize),
      this.cleanupByPriority(sessionId, namespace, excessSize)
    ];

    for (const strategy of cleanupStrategies) {
      const cleaned = await strategy;
      if (cleaned >= excessSize) {
        break;
      }
    }
  }

  private async cleanupLeastUsedItems(sessionId: string, namespace: string, targetSize: number): Promise<number> {
    // 实现LRU清理策略
    const items = await this.getItemsByLastAccessed(sessionId, namespace);
    let cleanedSize = 0;

    for (const item of items) {
      if (cleanedSize >= targetSize) break;

      await this.removeItem(sessionId, item.key, namespace);
      cleanedSize += item.size;
    }

    return cleanedSize;
  }
}
```

#### 3.3.2 自动清理策略

1. **LRU策略**: 清理最少使用的项目
2. **TTL策略**: 清理过期项目
3. **优先级策略**: 根据数据重要性清理
4. **大小策略**: 优先清理大文件

## 4. 实施路线图

### 4.1 阶段一：基础架构 (1周)

- **任务1**: 实现数据目录管理服务
- **任务2**: 添加权限管理机制
- **任务3**: 实现基础生命周期管理
- **任务4**: 创建监控和日志系统

### 4.2 阶段二：Cookies系统 (1周)

- **任务1**: 实现Cookies初始化组件
- **任务2**: 添加安全验证机制
- **任务3**: 实现跨域处理逻辑
- **任务4**: 创建Cookies同步服务

### 4.3 阶段三：LocalStorage系统 (1周)

- **任务1**: 实现命名空间管理
- **任务2**: 添加数据类型支持
- **任务3**: 实现容量限制机制
- **任务4**: 创建自动清理策略

### 4.4 阶段四：集成测试 (1周)

- **任务1**: 端到端功能测试
- **任务2**: 性能和压力测试
- **任务3**: 安全性测试
- **任务4**: 用户体验测试

## 5. 验证标准

### 5.1 功能验证

- ✅ 数据目录正确创建和删除
- ✅ 权限控制有效防止越权访问
- ✅ Cookies正确初始化和管理
- ✅ LocalStorage正确隔离和存储

### 5.2 安全验证

- ✅ 路径遍历攻击防护有效
- ✅ 恶意内容过滤机制正常
- ✅ 跨域访问控制正确实施
- ✅ 数据加密和传输安全

### 5.3 性能验证

- ✅ 目录操作响应时间 <100ms
- ✅ Cookies设置和读取 <50ms
- ✅ LocalStorage操作 <200ms
- ✅ 内存使用增长 <10%

通过以上数据存储方案的实施，将建立起安全、高效、可扩展的数据管理体系，为系统的稳定运行提供坚实基础。