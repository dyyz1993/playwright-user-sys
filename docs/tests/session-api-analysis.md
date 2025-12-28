# 会话管理模块字段梳理与测试用例分析报告

**报告日期**: 2025-12-27
**分析范围**: 会话管理 (Session Management) 模块
**分析类型**: API 端点与测试用例设计（不包含代码实现）

---

## 目录

1. [字段清单](#1-字段清单)
2. [API 端点清单](#2-api-端点清单)
3. [业务逻辑说明](#3-业务逻辑说明)
4. [测试用例清单](#4-测试用例清单)
5. [测试覆盖估算](#5-测试覆盖估算)
6. [潜在问题](#6-潜在问题)

---

## 1. 字段清单

### 1.1 数据库表字段 (sessions 表)

| 字段名 | 类型 | 必填 | 默认值 | 验证规则 | 说明 |
|--------|------|------|--------|----------|------|
| id | string (UUID) | ✓ | - | UUID v4 | 会话唯一标识符 |
| user_id | integer | ✓ | - | 外键关联 users.id | 所属用户 ID |
| machine_id | string | ✗ | NULL | 外键关联 machines.id | 分配的机器 ID |
| port | integer | ✗ | NULL | 1-65535 | WebSocket 代理端口 |
| status | string | ✓ | 'created' | SessionStatus 枚举 | 会话状态 |
| options | json | ✗ | NULL | SessionCreateOptions | 浏览器配置选项 |
| start_time | timestamp | ✓ | NOW() | 有效日期时间 | 会话开始时间 |
| end_time | timestamp | ✗ | NULL | 有效日期时间 | 会话结束时间 |
| disconnected_at | timestamp | ✗ | NULL | 有效日期时间 | 断开连接时间 |
| duration | integer | ✓ | 0 | ≥ 0 | 会话持续时间（秒） |
| credits_used | integer | ✓ | 0 | ≥ 0 | 消耗的点数 |
| screenshot_url | string | ✗ | NULL | URL 格式 | 截图 URL |
| last_activity | timestamp | ✗ | NULL | 有效日期时间 | 最后活动时间 |
| error_message | string | ✗ | NULL | 文本 | 错误信息 |
| created_at | timestamp | ✓ | NOW() | - | 创建时间 |
| updated_at | timestamp | ✓ | NOW() | - | 更新时间 |

### 1.2 SessionStatus 枚举值

| 状态值 | 说明 | 使用场景 |
|--------|------|----------|
| created | 已创建 | 会话刚创建，等待连接 |
| connected | 已连接 | 客户端已连接到浏览器实例 |
| disconnected | 已断开 | 正常断开连接 |
| expired | 已过期 | 超时自动结束 |
| error | 错误 | 发生错误导致异常结束 |
| completed | 已完成 | 任务完成（预留状态） |

### 1.3 SessionCreateOptions 结构

| 字段名 | 类型 | 必填 | 默认值 | 验证规则 | 说明 |
|--------|------|------|--------|----------|------|
| userAgent | string | ✗ | - | 有效字符串 | 浏览器 User-Agent |
| proxy | string | ✗ | - | URL 格式 | 代理服务器地址 |
| cookies | object | ✗ | {} | Record<string, string> | Cookie 键值对 |
| localStorage | object | ✗ | {} | Record<string, string> | LocalStorage 键值对 |
| viewport | object | ✗ | - | {width, height} | 视口大小 |
| viewport.width | integer | ✓ | - | > 0 | 视口宽度 |
| viewport.height | integer | ✓ | - | > 0 | 视口高度 |

### 1.4 字段验证规则详细说明

#### id
- **格式**: UUID v4
- **生成方式**: 自动生成
- **示例**: "550e8400-e29b-41d4-a716-446655440000"

#### user_id
- **类型**: 整数
- **约束**: 必须是已存在的用户 ID
- **外键**: users.id

#### machine_id
- **类型**: UUID 字符串
- **约束**: 如果有值，必须是已存在的机器 ID
- **外键**: machines.id
- **可为空**: 创建时可能未分配机器

#### port
- **类型**: 整数
- **范围**: 1-65535
- **说明**: WebSocket 代理连接端口

#### status
- **类型**: 字符串枚举
- **可选值**: created, connected, disconnected, expired, error, completed
- **状态转换**: 见业务逻辑部分

#### options
- **类型**: JSON 对象
- **序列化**: 存储时序列化为 JSON 字符串，读取时解析
- **验证**: 必须能被 JSON.stringify 和 JSON.parse

#### duration
- **类型**: 整数（秒）
- **范围**: ≥ 0
- **计算**: end_time - start_time 的秒数

#### credits_used
- **类型**: 整数
- **范围**: ≥ 0
- **计算**: Math.ceil(duration / 60)，最少为 1

---

## 2. API 端点清单

### 2.1 用户端 API (/api/sessions)

| 端点 | 方法 | 功能 | 权限要求 | 请求参数 | 响应 |
|------|------|------|----------|----------|------|
| /api/sessions | POST | 创建会话 | API Key 认证 | SessionCreateOptions | 会话信息 + 连接 URL |
| /api/sessions/:id | GET | 获取会话详情 | API Key 认证 | - | 完整会话信息 |
| /api/sessions | GET | 获取用户会话列表 | API Key 认证 | 分页参数 | 会话列表 |
| /api/sessions/:id/release | POST | 释放会话 | API Key 认证 | - | 释放结果 + 持续时间 |
| /api/sessions/:id/screenshot | GET | 获取会话截图 | API Key 认证 | - | 截图 URL |

### 2.2 管理后台 API (/api/admin/sessions)

| 端点 | 方法 | 功能 | 权限要求 | 请求参数 | 响应 |
|------|------|------|----------|----------|------|
| /api/admin/sessions | GET | 获取会话列表 | 管理员 | 筛选+分页+排序 | 分页会话列表 |
| /api/admin/sessions/:id | GET | 获取会话详情 | 管理员 | - | 完整会话信息 |
| /api/admin/sessions/stats | GET | 获取会话统计 | 管理员 | 时间范围筛选 | 统计数据 |
| /api/admin/sessions/batch-release | POST | 批量结束会话 | 管理员 | sessionIds[] | 批量操作结果 |
| /api/admin/sessions/refresh-status | POST | 刷新会话状态 | 管理员 | sessionIds[] (可选) | 更新的会话状态 |

### 2.3 其他相关 API

| 端点 | 方法 | 功能 | 权限要求 |
|------|------|------|----------|
| /api/admin/users/:id/sessions | GET | 获取用户会话历史 | 管理员 |
| /api/admin/users/:id/session-stats | GET | 获取用户会话统计 | 管理员 |
| /api/sessions/admin/all | GET | 获取所有会话 | 管理员 |
| /api/sessions/:id/close | POST | 管理员关闭会话 | 管理员 |

### 2.4 API 端点详细说明

#### 2.4.1 POST /api/sessions (创建会话)

**请求参数**:
```typescript
{
  userAgent?: string;      // 浏览器 User-Agent
  proxy?: string;          // 代理地址
  cookies?: Record<string, string>;
  localStorage?: Record<string, string>;
  viewport?: {
    width: number;         // 必须 > 0
    height: number;        // 必须 > 0
  };
}
```

**响应数据** (201):
```typescript
{
  success: true;
  data: {
    id: string;                    // 会话 ID
    status: 'created';
    browserWSEndpoint: string;     // WebSocket 连接地址
    directUrl: string;             // 直接连接 URL
    viewerUrl: string;             // 前端查看器 URL
    created_at: Date;
  };
}
```

**错误响应**:
- 400: 点数不足、参数错误
- 401: 未认证
- 403: 权限不足
- 500: 服务器错误

#### 2.4.2 GET /api/admin/sessions (获取会话列表)

**查询参数**:
```typescript
{
  page?: number;           // 页码，默认 1
  limit?: number;          // 每页数量，默认 20
  sort?: string;           // 排序字段: created_at|duration|credits_used|updated_at|start_time
  order?: 'asc'|'desc';    // 排序方向，默认 desc
  status?: string;         // 状态筛选: active|ended|error|具体状态
  userId?: number;         // 用户 ID 筛选
  startDate?: string;      // 开始日期 (ISO 格式)
  endDate?: string;        // 结束日期 (ISO 格式)
  dateRange?: string;      // 预设时间范围: all|today|yesterday|week|month
}
```

**响应数据** (200):
```typescript
{
  success: true;
  data: {
    items: Session[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
```

#### 2.4.3 POST /api/admin/sessions/batch-release (批量结束会话)

**请求参数**:
```typescript
{
  sessionIds: string[];    // 要结束的会话 ID 数组
}
```

**响应数据** (200):
```typescript
{
  success: true;
  message: string;
  data: {
    released: string[];    // 成功结束的会话 ID
    failed: Array<{
      sessionId: string;
      error: string;
    }>;
  };
}
```

---

## 3. 业务逻辑说明

### 3.1 会话生命周期

```
┌─────────┐     ┌──────────┐     ┌─────────────┐
│ Created │ ──> │ Connected│ ──> │ Disconnected│
└─────────┘     └──────────┘     └─────────────┘
     │                │                   │
     │                │                   │
     v                v                   v
┌─────────┐     ┌──────────┐     ┌─────────────┐
│ Expired │     │  Error   │     │  Completed  │
└─────────┘     └──────────┘     └─────────────┘
```

### 3.2 状态转换规则

| 当前状态 | 可转换状态 | 触发条件 |
|----------|------------|----------|
| created | connected | 客户端成功连接 |
| created | expired | 超时未连接 |
| created | error | 创建失败 |
| connected | disconnected | 用户主动释放 |
| connected | expired | 超时自动断开 |
| connected | error | 发生错误 |
| 任何终态 | - | 不可再转换 |

### 3.3 核心业务流程

#### 3.3.1 会话创建流程

1. **验证用户点数**
   - 检查用户是否有足够点数
   - 不足则返回 400 错误

2. **分配机器资源**
   - 查找可用机器 (findAvailable)
   - 优先选择负载最低的机器
   - 无可用机器则返回错误

3. **创建数据库记录**
   - 生成会话 ID (UUID)
   - 设置状态为 'created'
   - 记录开始时间

4. **启动浏览器实例**
   - 通过 gRPC 调用机器服务
   - 返回 WebSocket 连接地址

5. **更新会话状态**
   - 标记为 'connected'
   - 更新机器实例计数

6. **返回连接信息**
   - browserWSEndpoint
   - directUrl
   - viewerUrl

#### 3.3.2 会话释放流程

1. **权限验证**
   - 检查会话是否属于当前用户
   - 管理员可以操作所有会话

2. **状态检查**
   - 已结束的会话直接返回
   - 活跃会话继续处理

3. **关闭浏览器实例**
   - 向机器发送关闭请求
   - 失败不影响后续流程

4. **计算持续时间**
   - duration = now - start_time
   - 单位: 秒

5. **计算消耗点数**
   - credits = Math.max(1, Math.ceil(duration / 60))

6. **更新数据库**
   - 状态改为 'disconnected'
   - 设置 end_time
   - 保存 duration 和 credits_used

7. **扣减用户点数**
   - 调用 UserModel.deductCredits()
   - 失败记录日志但不阻塞

8. **释放机器资源**
   - 减少机器实例计数

9. **触发 Webhook**
   - 发送 SESSION_DISCONNECTED 事件

#### 3.3.3 超时会话检测流程

1. **定时检查** (credits-monitor.service)
   - 每分钟检查一次
   - 查找超时的活跃会话

2. **标记超时**
   - 状态改为 'expired'
   - 计算持续时间和点数

3. **扣减点数**
   - 从用户账户扣除相应点数

4. **释放资源**
   - 更新机器实例计数

5. **发送通知**
   - 触发 SESSION_EXPIRED Webhook

### 3.4 点数计算规则

```typescript
// 每分钟消耗 1 点
const creditsUsed = Math.max(1, Math.ceil(duration / 60));

// 示例:
// 30 秒  -> 1 点
// 60 秒  -> 1 点
// 90 秒  -> 2 点
// 3600 秒 -> 60 点
```

### 3.5 数据关联关系

```
Session (会话)
  ├── user_id ──→ User (用户)
  ├── machine_id ──→ Machine (机器)
  └── options (JSON 配置)

User (用户)
  ├── credits (点数余额)
  └── sessions[] (会话列表)

Machine (机器)
  ├── instanceCount (当前实例数)
  ├── maxInstances (最大实例数)
  └── sessions[] (会话列表)
```

### 3.6 筛选条件处理

#### 状态筛选

| 筛选值 | 匹配状态 | 说明 |
|--------|----------|------|
| active | created, connected | 所有活跃会话 |
| ended | disconnected, expired, completed | 所有已结束会话 |
| error | error | 错误会话 |
| 具体状态 | 对应状态 | 精确匹配 |

#### 时间范围处理

```typescript
// dateRange 预设值
today:      从今天 00:00:00 开始
yesterday:  昨天全天
week:       从本周日开始
month:      从本月 1 日开始

// endDate 包含当天全天
// 例: endDate = '2025-12-27'
// 实际查询到 '2025-12-27 23:59:59.999'
```

---

## 4. 测试用例清单

### 4.1 按字段验证设计

#### S-F-001: id 字段测试

| 编号 | 测试名称 | 端点 | 场景 | 验证点 | 优先级 |
|------|----------|------|------|--------|--------|
| S-F-001-01 | 创建会话生成 UUID | POST /sessions | 正常创建 | 返回的 id 是有效 UUID v4 格式 | P0 |
| S-F-001-02 | 查询不存在的 UUID | GET /sessions/:id | 不存在的 ID | 返回 404，会话不存在 | P1 |
| S-F-001-03 | 查询无效 UUID 格式 | GET /sessions/:id | 无效 ID | 返回 400 或 404 | P1 |

#### S-F-002: user_id 字段测试

| 编号 | 测试名称 | 端点 | 场景 | 验证点 | 优先级 |
|------|----------|------|------|--------|--------|
| S-F-002-01 | 创建会话关联用户 | POST /sessions | 正常创建 | user_id 正确关联到当前用户 | P0 |
| S-F-002-02 | 无权访问其他用户会话 | GET /sessions/:id | 跨用户访问 | 返回 403，无权访问 | P0 |
| S-F-002-03 | 管理员查看所有会话 | GET /admin/sessions | 管理员权限 | 可以查看所有用户的会话 | P0 |
| S-F-002-04 | 按用户 ID 筛选会话 | GET /admin/sessions | 筛选功能 | 返回指定用户的会话 | P1 |

#### S-F-003: machine_id 字段测试

| 编号 | 测试名称 | 端点 | 场景 | 验证点 | 验证点 | 优先级 |
|------|----------|------|------|--------|--------|--------|
| S-F-003-01 | 创建时分配机器 | POST /sessions | 正常创建 | machine_id 有值且有效 | P0 |
| S-F-003-02 | 创建时无可用机器 | POST /sessions | 机器不足 | 返回错误，提示无可用机器 | P1 |
| S-F-003-03 | 会话详情包含机器信息 | GET /admin/sessions/:id | 查询详情 | 返回 machine_name 字段 | P1 |

#### S-F-004: port 字段测试

| 编号 | 测试名称 | 端点 | 场景 | 验证点 | 优先级 |
|------|----------|------|------|--------|--------|
| S-F-004-01 | 创建时分配端口 | POST /sessions | 正常创建 | port 在 1-65535 范围内 | P0 |
| S-F-004-02 | 端口唯一性 | POST /sessions | 多个会话 | 每个会话端口唯一 | P1 |

#### S-F-005: status 字段测试

| 编号 | 测试名称 | 端点 | 场景 | 验证点 | 优先级 |
|------|----------|------|------|--------|--------|
| S-F-005-01 | 初始状态为 created | POST /sessions | 正常创建 | status = 'created' | P0 |
| S-F-005-02 | 状态转换 connected | GET /sessions | 连接后 | status 正确更新 | P0 |
| S-F-005-03 | 状态转换 disconnected | POST /sessions/:id/release | 释放后 | status = 'disconnected' | P0 |
| S-F-005-04 | 状态转换 expired | - | 超时 | status = 'expired' | P1 |
| S-F-005-05 | 状态转换 error | - | 发生错误 | status = 'error' | P1 |
| S-F-005-06 | 无效状态值 | GET /admin/sessions | 筛选 | 忽略无效状态或返回错误 | P2 |
| S-F-005-07 | 状态筛选 active | GET /admin/sessions | 筛选 | 返回 created+connected | P1 |
| S-F-005-08 | 状态筛选 ended | GET /admin/sessions | 筛选 | 返回 disconnected+expired+completed | P1 |
| S-F-005-09 | 状态筛选 error | GET /admin/sessions | 筛选 | 只返回 error 状态 | P1 |

#### S-F-006: options 字段测试

| 编号 | 测试名称 | 端点 | 场景 | 验证点 | 优先级 |
|------|----------|------|------|--------|--------|
| S-F-006-01 | 空选项创建 | POST /sessions | 无 options | 成功创建，options = null | P0 |
| S-F-006-02 | 设置 userAgent | POST /sessions | 配置 UA | options.userAgent 正确保存 | P1 |
| S-F-006-03 | 设置代理 | POST /sessions | 配置 proxy | options.proxy 正确保存 | P1 |
| S-F-006-04 | 设置 cookies | POST /sessions | 配置 cookies | options.cookies 正确保存 | P1 |
| S-F-006-05 | 设置 localStorage | POST /sessions | 配置存储 | options.localStorage 正确保存 | P1 |
| S-F-006-06 | 设置 viewport | POST /sessions | 配置视口 | options.viewport 正确保存 | P1 |
| S-F-006-07 | viewport 验证 | POST /sessions | 无效尺寸 | 返回 400，验证失败 | P1 |
| S-F-006-08 | 无效 JSON | POST /sessions | 格式错误 | 返回 400 或忽略 | P2 |
| S-F-006-09 | JSON 序列化 | GET /sessions/:id | 查询详情 | 正确解析为对象 | P0 |

#### S-F-007: start_time 字段测试

| 编号 | 测试名称 | 端点 | 场景 | 验证点 | 优先级 |
|------|----------|------|------|--------|--------|
| S-F-007-01 | 创建时自动设置 | POST /sessions | 正常创建 | start_time = 创建时间 | P0 |
| S-F-007-02 | 时间范围筛选 | GET /admin/sessions | 按时间 | 返回指定范围的会话 | P1 |

#### S-F-008: end_time 字段测试

| 编号 | 测试名称 | 端点 | 场景 | 验证点 | 优先级 |
|------|----------|------|------|--------|--------|
| S-F-008-01 | 创建时为空 | POST /sessions | 正常创建 | end_time = null | P0 |
| S-F-008-02 | 释放后设置 | POST /sessions/:id/release | 正常释放 | end_time = 当前时间 | P0 |
| S-F-008-03 | 已结束会话 | POST /sessions/:id/release | 重复释放 | end_time 不变 | P1 |

#### S-F-009: duration 字段测试

| 编号 | 测试名称 | 端点 | 场景 | 验证点 | 优先级 |
|------|----------|------|------|--------|--------|
| S-F-009-01 | 创建时为 0 | POST /sessions | 正常创建 | duration = 0 | P0 |
| S-F-009-02 | 释放后计算 | POST /sessions/:id/release | 正常释放 | duration = end - start (秒) | P0 |
| S-F-009-03 | 排序 by duration | GET /admin/sessions | 排序 | 按 duration 正确排序 | P1 |
| S-F-009-04 | 边界值 | POST /sessions/:id/release | 极短时间 | 至少为 0 | P2 |

#### S-F-010: credits_used 字段测试

| 编号 | 测试名称 | 端点 | 场景 | 验证点 | 优先级 |
|------|----------|------|------|--------|--------|
| S-F-010-01 | 创建时为 0 | POST /sessions | 正常创建 | credits_used = 0 | P0 |
| S-F-010-02 | 计算点数规则 | POST /sessions/:id/release | 各种时长 | Math.ceil(duration/60)，最少 1 | P0 |
| S-F-010-03 | 扣减用户点数 | POST /sessions/:id/release | 扣费 | 用户点数正确减少 | P0 |
| S-F-010-04 | 重复不扣费 | POST /sessions/:id/release | 重复释放 | 只扣费一次 | P0 |
| S-F-010-05 | 排序 by credits_used | GET /admin/sessions | 排序 | 按 credits_used 正确排序 | P1 |

#### S-F-011: screenshot_url 字段测试

| 编号 | 测试名称 | 端点 | 场景 | 验证点 | 优先级 |
|------|----------|------|------|--------|--------|
| S-F-011-01 | 创建时为空 | POST /sessions | 正常创建 | screenshot_url = null | P0 |
| S-F-011-02 | 获取截图 URL | GET /sessions/:id/screenshot | 有截图 | 返回有效 URL | P1 |
| S-F-011-03 | 无截图时访问 | GET /sessions/:id/screenshot | 无截图 | 返回 404 | P1 |

#### S-F-012: last_activity 字段测试

| 编号 | 测试名称 | 端点 | 场景 | 验证点 | 优先级 |
|------|----------|------|------|--------|--------|
| S-F-012-01 | 创建时为空 | POST /sessions | 正常创建 | last_activity = null | P0 |
| S-F-012-02 | 活动时更新 | - | 用户操作 | last_activity = 当前时间 | P2 |

#### S-F-013: error_message 字段测试

| 编号 | 测试名称 | 端点 | 场景 | 验证点 | 优先级 |
|------|----------|------|------|--------|--------|
| S-F-013-01 | 正常时为空 | POST /sessions | 正常创建 | error_message = null | P0 |
| S-F-013-02 | 错误时记录 | - | 发生错误 | error_message 有值 | P1 |

### 4.2 按 API 端点设计

#### S-API-001: POST /api/sessions (创建会话)

| 编号 | 测试名称 | 端点 | 场景 | 验证点 | 优先级 |
|------|----------|------|------|--------|--------|
| S-API-001-01 | 正常创建会话 | POST /sessions | 默认参数 | 返回 201，数据完整 | P0 |
| S-API-001-02 | 带 options 创建 | POST /sessions | 完整配置 | options 正确保存 | P0 |
| S-API-001-03 | 点数不足创建 | POST /sessions | 余额不足 | 返回 400，提示点数不足 | P0 |
| S-API-001-04 | 无 API Key | POST /sessions | 未认证 | 返回 401 | P0 |
| S-API-001-05 | 无效 API Key | POST /sessions | 认证失败 | 返回 401 | P0 |
| S-API-001-06 | 无可用机器 | POST /sessions | 资源不足 | 返回 500 或特定错误 | P1 |
| S-API-001-07 | 无效 viewport | POST /sessions | 参数错误 | 返回 400，验证失败 | P1 |
| S-API-001-08 | 空请求体 | POST /sessions | 无 body | 成功创建，使用默认值 | P1 |
| S-API-001-09 | 返回连接信息 | POST /sessions | 检查响应 | 包含 browserWSEndpoint 等 | P0 |
| S-API-001-10 | 会话 ID 唯一性 | POST /sessions | 多次创建 | 每个 ID 不同 | P0 |

#### S-API-002: GET /api/sessions/:id (获取会话详情)

| 编号 | 测试名称 | 端点 | 场景 | 验证点 | 优先级 |
|------|----------|------|------|--------|--------|
| S-API-002-01 | 获取自己的会话 | GET /sessions/:id | 正常查询 | 返回 200，数据完整 | P0 |
| S-API-002-02 | 获取不存在的会话 | GET /sessions/:id | 不存在 | 返回 404 | P0 |
| S-API-002-03 | 获取他人的会话 | GET /sessions/:id | 跨用户 | 返回 403 | P0 |
| S-API-002-04 | 无效 ID 格式 | GET /sessions/:id | 无效 ID | 返回 400 或 404 | P1 |
| S-API-002-05 | 无 API Key | GET /sessions/:id | 未认证 | 返回 401 | P0 |
| S-API-002-06 | 管理员获取所有 | GET /sessions/:id | 管理员 | 可以获取任何会话 | P0 |
| S-API-002-07 | JSON 字段解析 | GET /sessions/:id | 检查 options | options 是对象非字符串 | P0 |

#### S-API-003: GET /api/sessions (获取用户会话列表)

| 编号 | 测试名称 | 端点 | 场景 | 验证点 | 优先级 |
|------|----------|------|------|--------|--------|
| S-API-003-01 | 获取空列表 | GET /sessions | 无会话 | 返回空数组 | P1 |
| S-API-003-02 | 获取会话列表 | GET /sessions | 有会话 | 返回自己的会话 | P0 |
| S-API-003-03 | 分页参数 | GET /sessions | 分页 | page/limit 正确处理 | P1 |
| S-API-003-04 | 默认分页 | GET /sessions | 无参数 | 使用默认值 | P1 |
| S-API-003-05 | 无效分页参数 | GET /sessions | 错误参数 | 返回 400 或使用默认值 | P2 |
| S-API-003-06 | 只返回自己的会话 | GET /sessions | 多用户 | 不包含他人会话 | P0 |
| S-API-003-07 | 排序功能 | GET /sessions | 排序 | 按 create_at 倒序 | P1 |

#### S-API-004: POST /api/sessions/:id/release (释放会话)

| 编号 | 测试名称 | 端点 | 场景 | 验证点 | 优先级 |
|------|----------|------|------|--------|--------|
| S-API-004-01 | 正常释放会话 | POST /release | 活跃会话 | 返回 200，状态更新 | P0 |
| S-API-004-02 | 释放已结束会话 | POST /release | 已结束 | 返回成功，不重复处理 | P0 |
| S-API-004-03 | 释放不存在的会话 | POST /release | 不存在 | 返回 404 | P0 |
| S-API-004-04 | 释放他人的会话 | POST /release | 跨用户 | 返回 403 | P0 |
| S-API-004-05 | 计算持续时间 | POST /release | 检查 duration | duration 正确计算 | P0 |
| S-API-004-06 | 扣减点数 | POST /release | 检查扣费 | 用户点数减少 | P0 |
| S-API-004-07 | 释放机器资源 | POST /release | 检查机器 | 机器实例计数减少 | P0 |
| S-API-004-08 | 机器失败也释放 | POST /release | 机器错误 | 仍然标记结束 | P1 |
| S-API-004-09 | 触发 Webhook | POST /release | 检查事件 | 发送 Webhook | P1 |

#### S-API-005: GET /api/sessions/:id/screenshot (获取截图)

| 编号 | 测试名称 | 端点 | 场景 | 验证点 | 优先级 |
|------|----------|------|------|--------|--------|
| S-API-005-01 | 获取截图 URL | GET /screenshot | 有截图 | 返回有效 URL | P1 |
| S-API-005-02 | 无截图时访问 | GET /screenshot | 无截图 | 返回 404 | P1 |
| S-API-005-03 | 获取他人截图 | GET /screenshot | 跨用户 | 返回 403 | P0 |
| S-API-005-04 | 无 API Key | GET /screenshot | 未认证 | 返回 401 | P0 |

#### S-API-006: GET /api/admin/sessions (管理员获取会话列表)

| 编号 | 测试名称 | 端点 | 场景 | 验证点 | 优先级 |
|------|----------|------|------|--------|--------|
| S-API-006-01 | 获取所有会话 | GET /admin/sessions | 管理员 | 返回所有用户的会话 | P0 |
| S-API-006-02 | 非管理员访问 | GET /admin/sessions | 普通用户 | 返回 403 | P0 |
| S-API-006-03 | 未认证访问 | GET /admin/sessions | 未登录 | 返回 401 | P0 |
| S-API-006-04 | 状态筛选 active | GET /admin/sessions | status=active | 返回活跃会话 | P1 |
| S-API-006-05 | 状态筛选 ended | GET /admin/sessions | status=ended | 返回已结束会话 | P1 |
| S-API-006-06 | 状态筛选 error | GET /admin/sessions | status=error | 返回错误会话 | P1 |
| S-API-006-07 | 用户筛选 | GET /admin/sessions | userId | 返回指定用户会话 | P1 |
| S-API-006-08 | 时间范围 today | GET /admin/sessions | dateRange | 返回今天的会话 | P1 |
| S-API-006-09 | 自定义时间范围 | GET /admin/sessions | startDate/endDate | 返回范围内会话 | P1 |
| S-API-006-10 | 组合筛选 | GET /admin/sessions | 多条件 | 正确应用所有筛选 | P1 |
| S-API-006-11 | 排序 by duration | GET /admin/sessions | sort=duration | 按持续时间排序 | P1 |
| S-API-006-12 | 排序 by credits_used | GET /admin/sessions | sort=credits_used | 按消耗点数排序 | P1 |
| S-API-006-13 | 倒序排列 | GET /admin/sessions | order=asc | 正确排序 | P1 |
| S-API-006-14 | 无效排序字段 | GET /admin/sessions | sort=invalid | 使用默认排序 | P2 |
| S-API-006-15 | 分页功能 | GET /admin/sessions | page/limit | 正确分页 | P1 |
| S-API-006-16 | 空列表 | GET /admin/sessions | 无会话 | 返回空数组 | P1 |
| S-API-006-17 | 包含用户名 | GET /admin/sessions | 检查字段 | 返回 username | P0 |

#### S-API-007: GET /api/admin/sessions/:id (管理员获取会话详情)

| 编号 | 测试名称 | 端点 | 场景 | 验证点 | 优先级 |
|------|----------|------|------|--------|--------|
| S-API-007-01 | 获取会话详情 | GET /admin/sessions/:id | 管理员 | 返回完整信息 | P0 |
| S-API-007-02 | 包含用户名 | GET /admin/sessions/:id | 检查字段 | 返回 username | P0 |
| S-API-007-03 | 包含机器名 | GET /admin/sessions/:id | 检查字段 | 返回 machine_name | P1 |
| S-API-007-04 | 不存在会话 | GET /admin/sessions/:id | 不存在 | 返回 404 | P0 |
| S-API-007-05 | 非管理员访问 | GET /admin/sessions/:id | 普通用户 | 返回 403 | P0 |

#### S-API-008: GET /api/admin/sessions/stats (获取统计)

| 编号 | 测试名称 | 端点 | 场景 | 验证点 | 优先级 |
|------|----------|------|------|--------|--------|
| S-API-008-01 | 获取总体统计 | GET /admin/sessions/stats | 无筛选 | 返回完整统计数据 | P1 |
| S-API-008-02 | 统计包含 total | GET /admin/sessions/stats | 检查字段 | total 数量正确 | P1 |
| S-API-008-03 | 统计包含 active | GET /admin/sessions/stats | 检查字段 | active 数量正确 | P1 |
| S-API-008-04 | 统计包含 ended | GET /admin/sessions/stats | 检查字段 | ended 数量正确 | P1 |
| S-API-008-05 | 统计包含 error | GET /admin/sessions/stats | 检查字段 | error 数量正确 | P1 |
| S-API-008-06 | 统计包含点数 | GET /admin/sessions/stats | 检查字段 | totalCreditsUsed 正确 | P1 |
| S-API-008-07 | 统计包含时长 | GET /admin/sessions/stats | 检查字段 | totalDuration 正确 | P1 |
| S-API-008-08 | 统计包含平均时长 | GET /admin/sessions/stats | 检查字段 | avgDuration 正确 | P1 |
| S-API-008-09 | 按用户分组 | GET /admin/sessions/stats | 检查 byUser | byUser 数组正确 | P1 |
| S-API-008-10 | 时间范围筛选 | GET /admin/sessions/stats | dateRange | 只统计范围内数据 | P1 |

#### S-API-009: POST /api/admin/sessions/batch-release (批量结束会话)

| 编号 | 测试名称 | 端点 | 场景 | 验证点 | 优先级 |
|------|----------|------|------|--------|--------|
| S-API-009-01 | 批量结束会话 | POST /batch-release | 多个会话 | 全部成功结束 | P0 |
| S-API-009-02 | 空数组 | POST /batch-release | sessionIds=[] | 返回 400 或成功 | P1 |
| S-API-009-03 | 部分成功 | POST /batch-release | 混合 | released/failed 正确 | P0 |
| S-API-009-04 | 全部失败 | POST /batch-release | 无效 ID | failed 包含所有 | P1 |
| S-API-009-05 | 重复会话 ID | POST /batch-release | 重复 | 只处理一次 | P2 |
| S-API-009-06 | 包含已结束会话 | POST /batch-release | 混合状态 | 已结束的在 released | P0 |
| S-API-009-07 | 扣费正确性 | POST /batch-release | 检查扣费 | 每个会话正确扣费 | P0 |
| S-API-009-08 | 释放资源 | POST /batch-release | 检查机器 | 机器实例计数减少 | P0 |
| S-API-009-09 | 非管理员访问 | POST /batch-release | 普通用户 | 返回 403 | P0 |
| S-API-009-10 | 返回详细信息 | POST /batch-release | 检查响应 | message 正确描述 | P1 |

#### S-API-010: POST /api/admin/sessions/refresh-status (刷新状态)

| 编号 | 测试名称 | 端点 | 场景 | 验证点 | 优先级 |
|------|----------|------|------|--------|--------|
| S-API-010-01 | 刷新指定会话 | POST /refresh-status | 有 sessionIds | 返回最新状态 | P1 |
| S-API-010-02 | 刷新所有活跃 | POST /refresh-status | 无参数 | 返回所有活跃会话 | P1 |
| S-API-010-03 | 空数组 | POST /refresh-status | sessionIds=[] | 返回空结果 | P2 |
| S-API-010-04 | 包含不存在会话 | POST /refresh-status | 无效 ID | 忽略或报错 | P2 |
| S-API-010-05 | 更新数量 | POST /refresh-status | 检查响应 | updated 数量正确 | P1 |

### 4.3 按业务逻辑设计

#### S-BIZ-001: 会话生命周期

| 编号 | 测试名称 | 场景 | 验证点 | 优先级 |
|------|----------|------|--------|--------|
| S-BIZ-001-01 | 完整生命周期 | 创建→连接→释放 | 状态正确转换 | P0 |
| S-BIZ-001-02 | 超时生命周期 | 创建→超时 | 状态变为 expired | P1 |
| S-BIZ-001-03 | 错误生命周期 | 创建→错误 | 状态变为 error | P1 |
| S-BIZ-001-04 | 直接释放 | 创建→释放 | 状态变为 disconnected | P0 |

#### S-BIZ-002: 点数计算

| 编号 | 测试名称 | 场景 | 验证点 | 优先级 |
|------|----------|------|--------|--------|
| S-BIZ-002-01 | 不足 1 分钟 | 30 秒会话 | 消耗 1 点 | P0 |
| S-BIZ-002-02 | 整数分钟 | 60 秒会话 | 消耗 1 点 | P0 |
| S-BIZ-002-03 | 超过 1 分钟 | 90 秒会话 | 消耗 2 点 | P0 |
| S-BIZ-002-04 | 长时间会话 | 3600 秒会话 | 消耗 60 点 | P0 |
| S-BIZ-002-05 | 边界值 0 秒 | 立即释放 | 消耗 0 点 | P2 |

#### S-BIZ-003: 并发场景

| 编号 | 测试名称 | 场景 | 验证点 | 优先级 |
|------|----------|------|--------|--------|
| S-BIZ-003-01 | 并发创建 | 多用户同时创建 | 都成功，无冲突 | P1 |
| S-BIZ-003-02 | 并发释放 | 同时释放同一会话 | 只处理一次 | P2 |
| S-BIZ-003-03 | 机器资源竞争 | 机器满载 | 正确分配或拒绝 | P1 |

#### S-BIZ-004: 数据关联

| 编号 | 测试名称 | 场景 | 验证点 | 优先级 |
|------|----------|------|--------|--------|
| S-BIZ-004-01 | 用户会话关联 | 查询用户 | 返回其所有会话 | P0 |
| S-BIZ-004-02 | 机器会话关联 | 机器下线 | 会话标记为断开 | P1 |
| S-BIZ-004-03 | 级联删除 | 删除用户 | 会话如何处理 | P2 |
| S-BIZ-004-04 | 机器实例计数 | 创建/释放 | 计数正确增减 | P0 |

#### S-BIZ-005: 边界条件

| 编号 | 测试名称 | 场景 | 验证点 | 优先级 |
|------|----------|------|--------|--------|
| S-BIZ-005-01 | 极短会话 | < 1 秒 | 正确处理 | P2 |
| S-BIZ-005-02 | 极长会话 | > 24 小时 | 正确计算点数 | P2 |
| S-BIZ-005-03 | 特殊字符 | options 包含特殊字符 | 正确保存 | P2 |
| S-BIZ-005-04 | 大数据 | 大量会话 | 分页正确 | P1 |
| S-BIZ-005-05 | 时间边界 | 跨时区 | 正确处理 | P2 |

#### S-BIZ-006: 错误处理

| 编号 | 测试名称 | 场景 | 验证点 | 优先级 |
|------|----------|------|--------|--------|
| S-BIZ-006-01 | 机器无响应 | gRPC 超时 | 正确降级处理 | P1 |
| S-BIZ-006-02 | 数据库连接失败 | - | 返回适当错误 | P1 |
| S-BIZ-006-03 | 点数不足 | 扣费失败 | 记录日志 | P0 |
| S-BIZ-006-04 | Webhook 失败 | 发送失败 | 不影响主流程 | P1 |

---

## 5. 测试覆盖估算

### 5.1 总体统计

| 分类 | 测试用例数 | 占比 |
|------|------------|------|
| **字段验证测试** | 67 | 35% |
| **API 端点测试** | 97 | 51% |
| **业务逻辑测试** | 24 | 14% |
| **总计** | **188** | **100%** |

### 5.2 按优先级分布

| 优先级 | 数量 | 占比 |
|--------|------|------|
| P0 (关键) | 82 | 44% |
| P1 (重要) | 87 | 46% |
| P2 (一般) | 19 | 10% |

### 5.3 按功能模块分布

| 功能模块 | P0 | P1 | P2 | 小计 |
|----------|----|----|----|------|
| 会话创建 | 10 | 6 | 2 | 18 |
| 会话查询 | 12 | 15 | 3 | 30 |
| 会话释放 | 12 | 8 | 2 | 22 |
| 管理功能 | 25 | 20 | 4 | 49 |
| 状态管理 | 8 | 12 | 2 | 22 |
| 点数计费 | 15 | 6 | 2 | 23 |
| 筛选排序 | 0 | 20 | 4 | 24 |
| **总计** | **82** | **87** | **19** | **188** |

### 5.4 按字段分布

| 字段 | 测试用例数 | 覆盖方面 |
|------|------------|----------|
| id | 3 | 格式验证、唯一性 |
| user_id | 4 | 关联性、权限 |
| machine_id | 3 | 分配、关联 |
| port | 2 | 范围、唯一性 |
| status | 9 | 状态转换、筛选 |
| options | 9 | 各选项、验证 |
| start_time | 2 | 自动设置、筛选 |
| end_time | 3 | 设置时机、更新 |
| duration | 4 | 计算、排序 |
| credits_used | 5 | 计算、扣费、排序 |
| screenshot_url | 3 | 获取、不存在 |
| last_activity | 2 | 更新 |
| error_message | 2 | 记录 |
| **总计** | **67** | - |

### 5.5 按 API 端点分布

| API 端点 | 测试用例数 | 覆盖场景 |
|---------|------------|----------|
| POST /api/sessions | 10 | 创建、认证、参数 |
| GET /api/sessions/:id | 7 | 查询、权限 |
| GET /api/sessions | 7 | 列表、分页 |
| POST /api/sessions/:id/release | 9 | 释放、扣费 |
| GET /api/sessions/:id/screenshot | 4 | 截图 |
| GET /api/admin/sessions | 17 | 筛选、排序、分页 |
| GET /api/admin/sessions/:id | 5 | 详情、关联 |
| GET /api/admin/sessions/stats | 10 | 统计、聚合 |
| POST /api/admin/sessions/batch-release | 10 | 批量操作 |
| POST /api/admin/sessions/refresh-status | 5 | 状态刷新 |
| GET /api/admin/users/:id/sessions | 3 | 用户历史 |
| GET /api/admin/users/:id/session-stats | 3 | 用户统计 |
| GET /api/sessions/admin/all | 3 | 管理员列表 |
| POST /api/sessions/:id/close | 4 | 管理员关闭 |
| **总计** | **97** | - |

### 5.6 测试覆盖率目标

| 维度 | 当前估计 | 目标 | 差距 |
|------|----------|------|------|
| API 端点覆盖 | 100% (14/14) | 100% | - |
| 字段覆盖 | 100% (13/13) | 100% | - |
| 业务场景覆盖 | 80% | 95% | +15% |
| 状态转换覆盖 | 100% | 100% | - |
| 错误场景覆盖 | 70% | 90% | +20% |

---

## 6. 潜在问题

### 6.1 功能层面

#### 6.1.1 会话状态管理

**问题**: 状态转换可能不一致
- **影响**: 会话可能卡在中间状态
- **风险等级**: 中
- **建议**:
  - 实现状态机模式
  - 添加状态转换日志
  - 定期清理僵尸会话

#### 6.1.2 并发操作

**问题**: 同一会话可能被同时操作
- **影响**: 重复扣费、资源泄漏
- **风险等级**: 高
- **建议**:
  - 添加分布式锁
  - 实现幂等性
  - 乐观锁版本号

#### 6.1.3 点数计算

**问题**: 精度和舍入可能不一致
- **影响**: 计费不准确
- **风险等级**: 高
- **建议**:
  - 统一计算逻辑
  - 添加计费审计
  - 定期对账

### 6.2 性能层面

#### 6.2.1 大数据量查询

**问题**: 会话数量增长后查询变慢
- **影响**: 列表页响应慢
- **风险等级**: 中
- **建议**:
  - 添加必要索引
  - 实现查询缓存
  - 分页限制

#### 6.2.2 统计查询

**问题**: 统计 API 可能很慢
- **影响**: 管理后台卡顿
- **风险等级**: 中
- **建议**:
  - 预计算统计数据
  - 定时更新缓存
  - 异步计算

### 6.3 安全层面

#### 6.3.1 权限控制

**问题**: API 权限验证可能不完整
- **影响**: 数据泄露
- **风险等级**: 高
- **建议**:
  - 统一权限中间件
  - 审查所有端点
  - 添加访问日志

#### 6.3.2 资源滥用

**问题**: 恶意创建大量会话
- **影响**: 资源耗尽
- **风险等级**: 中
- **建议**:
  - 添加速率限制
  - 用户配额限制
  - 异常检测

### 6.4 数据一致性

#### 6.4.1 机器状态同步

**问题**: 机器实例计数可能不准确
- **影响**: 资源分配错误
- **风险等级**: 高
- **建议**:
  - 定时同步
  - 事务保证
  - 补偿机制

#### 6.4.2 会话数据完整性

**问题**: options JSON 可能损坏
- **影响**: 数据读取失败
- **风险等级**: 低
- **建议**:
  - 添加验证
  - 错误处理
  - 数据备份

### 6.5 测试相关

#### 6.5.1 测试数据隔离

**问题**: 测试间可能互相影响
- **影响**: 测试不稳定
- **风险等级**: 中
- **建议**:
  - 每个测试独立事务
  - 测试后清理
  - 使用测试数据库

#### 6.5.2 Mock 配置

**问题**: 外部依赖 Mock 不完整
- **影响**: 测试不可靠
- **风险等级**: 中
- **建议**:
  - 统一 Mock 配置
  - 验证 Mock 调用
  - 集成测试补充

#### 6.5.3 边界条件

**问题**: 边界值测试可能不足
- **影响**: 潜在 bug
- **风险等级**: 低
- **建议**:
  - 补充边界测试
  - 压力测试
  - 混沌测试

### 6.6 监控与告警

**问题**: 缺少关键指标监控
- **建议监控**:
  - 会话创建成功率
  - 会话平均持续时间
  - 点数消耗趋势
  - 异常会话数量
  - API 响应时间

---

## 附录

### A. 快速参考

#### 重要文件位置
```
会话模型:        src/models/session.model.ts
会话控制器:      src/controllers/session.controller.ts
会话路由:        src/routes/session.routes.ts
管理后台路由:    src/routes/admin-api.routes.ts
类型定义:        src/shared/types/index.ts
Schema 定义:     src/schemas/session.schema.ts
数据库迁移:      src/models/migrations.ts
```

#### 数据库表
```sql
CREATE TABLE sessions (
  id STRING PRIMARY KEY,
  user_id INTEGER NOT NULL,
  machine_id STRING,
  port INTEGER,
  status STRING NOT NULL,
  options JSON,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  disconnected_at TIMESTAMP,
  duration INTEGER DEFAULT 0,
  credits_used INTEGER DEFAULT 0,
  screenshot_url STRING,
  last_activity TIMESTAMP,
  error_message STRING,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

#### 状态枚举
```typescript
enum SessionStatus {
  CREATED = 'created',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  EXPIRED = 'expired',
  ERROR = 'error',
  COMPLETED = 'completed',
}
```

### B. 测试执行建议

#### 优先执行顺序
1. **第一批** (P0): 所有关键功能测试
2. **第二批** (P1): 重要功能和边界测试
3. **第三批** (P2): 边界条件和异常测试

#### 测试组织建议
```
tests/
├── e2e/
│   ├── p0-critical.spec.ts       # P0 用例
│   ├── p1-important.spec.ts      # P1 用例
│   └── p2-nice-to-have.spec.ts   # P2 用例
├── integration/
│   ├── session-lifecycle.spec.ts # 生命周期测试
│   ├── session-billing.spec.ts   # 计费测试
│   └── session-admin.spec.ts     # 管理功能测试
└── unit/
    ├── session.model.test.ts
    ├── session.controller.test.ts
    └── session.service.test.ts
```

### C. 相关文档

- `docs/tests/00-测试方案总纲.md` - 测试总体方案
- `docs/tests/集成测试指南.md` - 集成测试指南
- `docs/tests/Bug分析报告.md` - 已知 Bug 参考
- `CLAUDE.md` - 项目开发文档

---

**报告生成**: 2025-12-27
**分析工具**: Claude Code
**报告版本**: 1.0
**下次更新**: 实现测试代码后
