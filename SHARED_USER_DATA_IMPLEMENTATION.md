# SharedUserData 参数实现总结

## 概述

本文档总结了 `sharedUserData` 参数的完整实现。该参数用于控制 Playwright 浏览器会话是否共享用户数据目录。

## 功能说明

| 参数值 | 含义 | 用户数据目录路径 |
|--------|------|------------------|
| `sharedUserData: false` (默认) | 独立会话 | `/data/user-data/{userId}/sessions/{sessionId}/` |
| `sharedUserData: true` | 共享会话 | `/data/user-data/{userId}/shared/` |

## 实现的文件修改

### 1. Schema 层 (`src/schemas/session.schema.ts`)

- **添加**: `sharedUserData?: boolean` 参数
- **标记废弃**: `userDataDir` 参数（出于安全考虑）

### 2. 类型定义 (`src/shared/types/index.ts`)

- **添加**: `sharedUserData?: boolean` 到 `SessionCreateOptions` 接口
- **添加**: `storageStatePath` 和 `storageState` 完整类型定义
- **标记废弃**: `userDataDir` 参数

### 3. Protobuf 定义 (`src/shared/protos/machine_service.proto`)

```protobuf
// 启动浏览器请求
message LaunchBrowserRequest {
  string session_id = 1;
  BrowserOptions options = 2;
  int64 user_id = 3;  // 用户ID，用于计算 userDataDir 路径
}

// 浏览器选项
message BrowserOptions {
  string user_agent = 1;
  string proxy = 2;
  Viewport viewport = 3;
  repeated string cookies = 4;
  repeated string args = 5;
  string storage_state_path = 6;
  StorageState storage_state = 7;
  bool shared_user_data = 8;       // 是否共享用户数据目录
  string user_data_dir = 9;        // @deprecated 已废弃
}
```

### 4. 管理端 gRPC 服务 (`src/services/machine-grpc.service.ts`)

- **修改**: `launchBrowser()` 方法转换 `sharedUserData` 参数
- **添加**: 将 `userId` 传递到 gRPC 请求中
- **添加**: 废弃参数警告日志

### 5. 机器端 gRPC 服务 (`src/machine/grpc.service.ts`)

- **修改**: `LaunchBrowser` 处理函数读取 `user_id` 和 `shared_user_data`
- **添加**: 将参数传递给 `browserService.launchBrowser()`

### 6. 浏览器服务 (`src/machine/browser.service.ts`)

**核心实现**：

1. **新增辅助方法**:
   - `calculateUserDataDir()`: 根据参数计算用户数据目录路径
   - `ensureUserDataDir()`: 确保目录存在（递归创建）
   - `cleanupUserDataDir()`: 清理独立会话的目录（共享会话不清理）

2. **修改 `launchBrowser()` 方法**:
   - 提取 `userId` 和 `sharedUserData` 参数
   - 计算并设置 `userDataDir` 路径
   - 在会话信息中存储相关字段

3. **修改 `SessionInfo` 接口**:
   - 添加 `userId`, `sessionId`, `sharedUserData`, `userDataDir` 字段

4. **修改 `closeBrowser()` 方法**:
   - 关闭浏览器前自动清理独立会话的目录

### 7. Session 服务 (`src/services/session.service.ts`)

- **修改**: `createBrowserSession()` 将 `userId` 添加到 `launchOptions` 中

## 目录结构

```
data/
└── user-data/
    ├── {userId}/
    │   ├── shared/              # sharedUserData=true (共享目录)
    │   └── sessions/            # sharedUserData=false (独立会话)
    │       └── {sessionId}/
    └── sessions/                # 兼容模式 (无 userId)
        └── {sessionId}/
```

## 清理策略

| 模式 | 浏览器关闭后 | 说明 |
|------|-------------|------|
| 独立会话 (`sharedUserData=false`) | 自动清理目录 | 每个会话独立，可安全删除 |
| 共享会话 (`sharedUserData=true`) | 保留目录 | 多个会话共享，不能删除 |
| 兼容模式 (无 `userId`) | 自动清理目录 | 独立会话，可安全删除 |

## API 使用示例

### 独立会话 (默认)

```json
POST /api/sessions
{
  "viewport": { "width": 1280, "height": 800 }
}
```

### 共享会话

```json
POST /api/sessions
{
  "sharedUserData": true,
  "viewport": { "width": 1280, "height": 800 }
}
```

## 向后兼容性

- **默认行为**: 不传 `sharedUserData` 时默认为 `false`（独立会话）
- **废弃参数**: `userDataDir` 仍然支持，但会记录警告日志
- **兼容模式**: 没有 `userId` 时使用 `/data/user-data/sessions/{sessionId}/` 路径

## 测试

测试文件: `tests/integration/shared-user-data.test.ts`

测试覆盖:
- 独立会话模式
- 共享会话模式
- 默认行为验证
- 兼容模式
- 目录创建和清理
- 错误处理

## 安全考虑

1. **路径安全**:
   - 不再允许客户端指定任意 `userDataDir` 路径
   - 所有路径都基于固定基础目录 `/data/user-data/`

2. **用户隔离**:
   - 每个用户的数据目录完全隔离
   - `userId` 是从认证会话中获取，不能伪造

3. **目录权限**:
   - 确保目录创建时使用正确的权限
   - 清理时只清理自己的会话目录

## 注意事项

1. **gRPC Proto 更新**: 修改了 proto 文件，需要确保服务端和客户端使用相同的版本
2. **磁盘空间**: 共享会话不会自动清理，需要定期清理长期不用的共享目录
3. **并发访问**: 共享模式下，多个会话同时访问同一个用户数据目录，需要注意潜在的竞争条件

## 实现完成清单

- [x] 修改 `src/schemas/session.schema.ts` 添加 `sharedUserData` 参数
- [x] 修改 `src/shared/types/index.ts` 添加 `sharedUserData` 到 `SessionCreateOptions`
- [x] 修改 `src/shared/protos/machine_service.proto` 添加 `shared_user_data` 和 `user_id` 字段
- [x] 修改 `src/services/machine-grpc.service.ts` 转换 `sharedUserData` 参数并传递 `userId`
- [x] 修改 `src/machine/grpc.service.ts` 读取 `shared_user_data` 并传递 `userId`
- [x] 修改 `src/machine/browser.service.ts` 实现 `userDataDir` 路径计算逻辑
- [x] 添加目录创建和清理逻辑
- [x] 添加集成测试 `tests/integration/shared-user-data.test.ts`
- [x] 验证 TypeScript 编译无错误
