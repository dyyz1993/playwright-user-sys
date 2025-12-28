# 机器管理模块 - 字段梳理和测试用例设计

> **文档版本**: v1.0
> **创建日期**: 2025-12-27
> **模块名称**: 机器管理 (Machine Management)
> **分析范围**: 模型层、API 端点、业务逻辑、测试用例设计

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

### 1.1 数据库表结构 (machines 表)

| 字段名 (数据库) | 字段名 (API) | 类型 | 必填 | 默认值 | 验证规则 | 说明 |
|----------------|-------------|------|------|--------|---------|------|
| `id` | `id` | VARCHAR(36)/String | ✅ | UUID | 非空 | 机器唯一标识符 |
| `hostname` | `hostname` | VARCHAR(255)/String | ✅ | - | 非空 | 机器主机名 |
| `ip` | `ip` | VARCHAR(45)/String | ✅ | - | IPv4 格式 | 机器 IP 地址 |
| `grpc_port` | `grpcPort` | INT/Number | ❌ | NULL | 1-65535 | gRPC 服务端口 |
| `proxy_port` | `proxyPort` | INT/Number | ❌ | NULL | 1-65535 | 代理服务端口 |
| `cpu_usage` | `cpuUsage` | DECIMAL(5,2)/Number | ❌ | NULL | 0-100 | CPU 使用率 (%) |
| `memory_usage` | `memoryUsage` | DECIMAL(5,2)/Number | ❌ | NULL | 0-100 | 内存使用率 (%) |
| `disk_usage` | `diskUsage` | DECIMAL(5,2)/Number | ❌ | NULL | 0-100 | 磁盘使用率 (%) |
| `instance_count` | `instanceCount` | INT/Number | ✅ | 0 | >=0 | 当前实例数量 |
| `max_instances` | `maxInstances` | INT/Number | ✅ | 10 | >0 | 最大实例数量 |
| `status` | `status` | VARCHAR(20)/Enum | ✅ | 'online' | online/offline/busy | 机器状态 |
| `last_seen` | `lastSeen` | DATETIME/Date | ✅ | NOW | - | 最后心跳时间 |
| `created_at` | - | DATETIME/Date | ✅ | NOW | - | 创建时间 |
| `updated_at` | - | DATETIME/Date | ✅ | NOW | - | 更新时间 |

### 1.2 TypeScript 类型定义

```typescript
// MachineInfo - API 返回类型
export interface MachineInfo {
  id: string;
  hostname: string;
  ip: string;
  grpcPort?: number;
  proxyPort?: number;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  instanceCount: number;
  maxInstances: number;
  status: 'online' | 'offline' | 'busy';
  lastSeen: Date;
}

// CreateMachineInput - 创建机器输入
export interface CreateMachineInput {
  id: string;
  hostname: string;
  ip: string;
  grpcPort?: number;
  proxyPort?: number;
  max_instances?: number;
  instanceCount?: number;
}

// UpdateMachineInput - 更新机器输入
export interface UpdateMachineInput {
  hostname?: string;
  ip?: string;
  grpcPort?: number;
  proxyPort?: number;
  cpuUsage?: number;
  memoryUsage?: number;
  diskUsage?: number;
  instanceCount?: number;
  maxInstances?: number;
  status?: 'online' | 'offline' | 'busy';
  lastSeen?: Date;
}
```

### 1.3 字段验证规则详解

#### IP 地址验证
- **格式**: IPv4 地址
- **正则表达式**: `/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/`
- **示例**: `192.168.1.100`, `10.0.0.1`
- **错误示例**: `256.0.0.1`, `192.168.1`, `192.168.1.1.1`

#### 端口号验证
- **范围**: 1-65535
- **说明**:
  - `grpcPort`: gRPC 服务端口，可选
  - `proxyPort`: 代理服务端口，可选
  - 端口号 0 无效
  - 系统保留端口 (1-1023) 通常需要管理员权限

#### 主机名验证
- **格式**: 字符串，非空
- **建议规则**:
  - 长度: 1-255 字符
  - 字符: 字母、数字、连字符 (-)
  - 不能以连字符开头或结尾
  - 不区分大小写

#### 资源使用率验证
- **CPU 使用率**: 0-100
- **内存使用率**: 0-100
- **磁盘使用率**: 0-100
- **数据类型**: 浮点数，通常保留 2 位小数

#### 实例数量验证
- **instanceCount**: >= 0
- **maxInstances**: > 0
- **约束**: instanceCount <= maxInstances

#### 状态枚举验证
- **online**: 机器在线且可用
- **offline**: 机器离线或不可用
- **busy**: 机器忙碌（实例数接近上限）

---

## 2. API 端点清单

### 2.1 管理后台 API (`/api/admin/machines`)

| 端点 | 方法 | 功能 | 权限要求 |
|------|------|------|---------|
| `/api/admin/machines` | POST | 添加新机器 | Admin |
| `/api/admin/machines/:id` | GET | 获取机器详情（含活跃会话数） | Admin |
| `/api/admin/machines/:id` | PUT | 更新机器配置 | Admin |
| `/api/admin/machines/:id/health-check` | POST | 单个机器健康检查 | Admin |
| `/api/admin/machines/health-check/batch` | POST | 批量健康检查 | Admin |
| `/api/admin/machines/batch-restart` | POST | 批量重启机器 | Admin |

### 2.2 机器服务 API (`/machines`)

| 端点 | 方法 | 功能 | 权限要求 |
|------|------|------|---------|
| `/machines/register` | POST | 机器注册 | Public (Machine) |
| `/machines/:id/status` | PUT | 更新机器状态 | Public (Machine) |
| `/machines` | GET | 获取所有机器（分页） | Admin |
| `/machines/:id` | GET | 获取单个机器 | Admin |
| `/machines/:id/sessions` | GET | 获取机器上的会话 | Admin |
| `/machines/:id/offline` | POST | 标记机器离线 | Admin |
| `/machines/refresh` | POST | 刷新所有机器状态 | Admin |
| `/machines/:id/restart` | POST | 重启机器 | Admin |
| `/machines/cleanup` | POST | 清理旧机器 | Admin |
| `/machines/:id` | DELETE | 删除机器 | Admin |

### 2.3 页面路由 (`/admin/machines`)

| 路由 | 方法 | 功能 | 权限要求 |
|------|------|------|---------|
| `/admin/machines` | GET | 机器管理页面 | Admin |
| `/admin/machines/:id` | GET | 机器详情页面 | Admin |

### 2.4 API 端点详细说明

#### POST /api/admin/machines - 添加机器
**请求体**:
```json
{
  "hostname": "machine-01",
  "ip": "192.168.1.100",
  "grpcPort": 50051,
  "proxyPort": 8080,
  "maxInstances": 10
}
```

**验证规则**:
- hostname: 必填，非空字符串
- ip: 必填，IPv4 格式
- grpcPort: 可选，1-65535
- proxyPort: 可选，1-65535
- maxInstances: 可选，默认 10

**响应** (201 Created):
```json
{
  "success": true,
  "message": "机器添加成功",
  "data": {
    "id": "uuid",
    "hostname": "machine-01",
    "ip": "192.168.1.100",
    "grpcPort": 50051,
    "proxyPort": 8080,
    "maxInstances": 10,
    "status": "online"
  }
}
```

#### PUT /api/admin/machines/:id - 更新机器配置
**请求体**:
```json
{
  "hostname": "machine-01-updated",
  "ip": "192.168.1.101",
  "maxInstances": 20
}
```

**验证规则**: 同添加机器，但所有字段可选

#### POST /api/admin/machines/:id/health-check - 健康检查
**响应** (200 OK):
```json
{
  "success": true,
  "data": {
    "machineId": "uuid",
    "status": "healthy",
    "grpcConnected": true,
    "responseTime": 50,
    "activeInstances": 5,
    "systemInfo": {
      "cpuUsage": 45.5,
      "memoryUsage": 60.2,
      "diskUsage": 55.8
    },
    "checkedAt": "2025-12-27T10:00:00Z"
  }
}
```

---

## 3. 业务逻辑说明

### 3.1 机器注册流程

```
┌─────────────┐
│ 机器启动    │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ 发送注册请求        │
│ POST /machines/register │
│ - id (机器生成UUID) │
│ - hostname          │
│ - ip                │
│ - maxInstances      │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ 检查机器是否已存在  │
│ 存在 → 更新状态     │
│ 不存在 → 创建新记录 │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ 设置状态为 online   │
│ 更新 last_seen 时间  │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ 返回机器信息        │
└─────────────────────┘
```

### 3.2 状态机（Status Machine）

#### 状态转换图
```
                    ┌─────────────────┐
                    │   offline       │
                    └────┬────▲─────┬─┘
                         │    │     │
         注册/心跳恢复     │    │     │ 超时/主动离线
                         │    │     │
                    ┌────▼────┴─────┴─┐
                    │     online      │◄────────┐
                    └────┬────▲─────┬─┘         │
                         │    │     │            │
                    达到容量 │    │     │ 释放实例  │
                         │    │     │            │
                    ┌────▼────┴─────┴─┐         │
                    │     busy        │─────────┘
                    └─────────────────┘  容量降低
```

#### 状态说明

| 状态 | 说明 | 进入条件 | 退出条件 | 可执行操作 |
|------|------|---------|---------|-----------|
| `online` | 机器在线可用 | 机器注册、心跳恢复、容量降低 | 达到容量上限、超时离线、手动离线 | 接受新会话、更新状态 |
| `busy` | 机器忙碌 | 实例数达到上限 (instanceCount >= maxInstances * 0.9) | 释放实例使容量降低 | 更新状态、释放实例 |
| `offline` | 机器离线 | 超时（last_seen 超过阈值）、手动离线、重启 | 机器重新注册 | 无法接受会话 |

#### 状态转换规则

1. **offline → online**
   - 机器重新注册
   - 心跳恢复
   - 手动上线

2. **online → busy**
   - 条件: `instanceCount / maxInstances >= 0.9`
   - 自动触发

3. **busy → online**
   - 条件: `instanceCount / maxInstances < 0.9`
   - 实例释放后自动触发

4. **online/busy → offline**
   - 超时: `last_seen < now() - timeout`
   - 手动标记离线
   - 机器重启（发送 restart 命令）

### 3.3 健康检查机制

#### 单机健康检查流程
```
┌─────────────────────────┐
│ 开始健康检查            │
│ MachineModel.healthCheck() │
└────┬────────────────────┘
     │
     ▼
┌─────────────────────────┐
│ 检查机器是否存在        │
│ 不存在 → 返回 unhealthy  │
└────┬────────────────────┘
     │
     ▼
┌─────────────────────────┐
│ 检查 gRPC 连接          │
│ connectionManager       │
│ .isConnected()          │
└────┬────────────────────┘
     │
     ├── 未连接 → 返回 unhealthy
     │
     ▼
┌─────────────────────────┐
│ 获取机器状态            │
│ connectionManager       │
│ .getMachineStatus()     │
└────┬────────────────────┘
     │
     ▼
┌─────────────────────────┐
│ 计算响应时间            │
│ 返回健康状态            │
│ - status: healthy       │
│ - responseTime          │
│ - activeInstances       │
│ - systemInfo            │
└─────────────────────────┘
```

#### 健康状态判定

| 状态 | �定条件 | 说明 |
|------|---------|------|
| `healthy` | gRPC 连接成功且能获取状态 | 机器正常工作 |
| `unhealthy` | gRPC 连接失败或机器不存在 | 机器不可用 |

#### 批量健康检查
- 并发检查多台机器
- 返回汇总统计: 总数、健康数、不健康数

### 3.4 容量管理

#### 容量计算
```typescript
const usageRatio = machine.instanceCount / machine.maxInstances;

// 健康状态判定
if (usageRatio >= 0.9) {
  healthStatus = 'warning'; // 容量紧张
} else if (machine.cpuUsage > 80 || machine.memoryUsage > 80) {
  healthStatus = 'warning'; // 资源紧张
} else {
  healthStatus = 'healthy'; // 正常
}
```

#### 实例分配策略
- 选择在线机器
- 优先选择实例数少的机器
- 确保机器有可用容量: `instanceCount < maxInstances`

#### 实例计数管理
- `incrementInstanceCount(id)`: 创建会话时调用
- `decrementInstanceCount(id)`: 释放会话时调用
- 自动维护 `instanceCount` 字段

### 3.5 超时检测机制

#### 检查超时机器
```typescript
// 检查并标记超时的机器为离线
MachineModel.checkOfflineMachines(timeoutMinutes: number = 5)
```

**逻辑**:
```sql
UPDATE machines
SET status = 'offline', updated_at = NOW()
WHERE status = 'online'
  AND last_seen < DATE_SUB(NOW(), INTERVAL timeoutMinutes MINUTE)
```

#### 自动清理
```typescript
// 删除长时间未活动的离线机器
MachineModel.deleteOldMachines(cutoffDate: Date)
```

**逻辑**:
```sql
DELETE FROM machines
WHERE status = 'offline'
  AND last_seen < cutoffDate
```

### 3.6 机器与会话的关联

#### 关联关系
- 一台机器可以有多个会话 (1:N)
- 会话表 `sessions` 通过 `machine_id` 外键关联到机器表

#### 机器离线时的会话处理
```typescript
// 当机器离线时，自动关闭所有关联会话
if (updateData.status === 'offline') {
  await db('sessions')
    .where({ machine_id: id })
    .update({
      status: SessionStatus.DISCONNECTED,
      disconnected_at: new Date(),
      updated_at: new Date(),
    });
}
```

#### 查询机器的会话
```typescript
// 获取机器上的所有会话
SessionModel.findByMachineId(machineId: string)
```

---

## 4. 测试用例清单

### 4.1 按字段验证设计的测试用例

#### IP 地址验证 (M-FIELD-001 ~ M-FIELD-008)

| 编号 | 测试名称 | 端点 | 场景 | 验证点 | 优先级 |
|------|----------|------|------|--------|--------|
| M-FIELD-001 | 有效 IPv4 地址 | POST /machines | 正常注册 | 接受有效 IP，返回 201 | P0 |
| M-FIELD-002 | 无效 IP - 格式错误 | POST /machines | 注册时 | 拒绝无效格式，返回 400 | P0 |
| M-FIELD-003 | 无效 IP - 超出范围 | POST /machines | 注册时 | 拒绝 > 255 的数值 | P0 |
| M-FIELD-004 | IP 地址重复 | POST /machines | 注册时 | 拒绝已存在的 IP，返回 409 | P0 |
| M-FIELD-005 | IP 地址为空 | POST /machines | 注册时 | 拒绝空 IP，返回 400 | P0 |
| M-FIELD-006 | 本地回环地址 | POST /machines | 注册时 | 接受 127.0.0.1 | P1 |
| M-FIELD-007 | 内网地址 | POST /machines | 注册时 | 接受 192.168.x.x | P1 |
| M-FIELD-008 | 更新 IP 地址 | PUT /machines/:id | 更新时 | 验证新 IP 格式 | P1 |

#### 端口号验证 (M-FIELD-009 ~ M-FIELD-016)

| 编号 | 测试名称 | 端点 | 场景 | 验证点 | 优先级 |
|------|----------|------|------|--------|--------|
| M-FIELD-009 | 有效端口范围 | POST /machines | 正常注册 | 接受 1-65535 | P0 |
| M-FIELD-010 | gRPC 端口为 0 | POST /machines | 注册时 | 拒绝 0，返回 400 | P0 |
| M-FIELD-011 | gRPC 端口超出范围 | POST /machines | 注册时 | 拒绝 > 65535 | P0 |
| M-FIELD-012 | proxyPort 超出范围 | POST /machines | 注册时 | 拒绝 > 65535 | P0 |
| M-FIELD-013 | 负数端口 | POST /machines | 注册时 | 拒绝负数 | P0 |
| M-FIELD-014 | 端口可选 | POST /machines | 注册时 | 不提供端口也能注册 | P1 |
| M-FIELD-015 | 常用端口 | POST /machines | 正常注册 | 接受常用端口 (80, 443, 8080) | P1 |
| M-FIELD-016 | 系统保留端口 | POST /machines | 正常注册 | 接受保留端口 (1-1023) | P2 |

#### 主机名验证 (M-FIELD-017 ~ M-FIELD-022)

| 编号 | 测试名称 | 端点 | 场景 | 验证点 | 优先级 |
|------|----------|------|------|--------|--------|
| M-FIELD-017 | 有效主机名 | POST /machines | 正常注册 | 接受有效主机名 | P0 |
| M-FIELD-018 | 主机名为空 | POST /machines | 注册时 | 拒绝空主机名，返回 400 | P0 |
| M-FIELD-019 | 主机名过长 | POST /machines | 注册时 | 验证长度限制 | P1 |
| M-FIELD-020 | 特殊字符 | POST /machines | 注册时 | 验证特殊字符处理 | P2 |
| M-FIELD-021 | 中文字符 | POST /machines | 注册时 | 验证中文支持 | P2 |
| M-FIELD-022 | 更新主机名 | PUT /machines/:id | 更新时 | 成功更新主机名 | P1 |

#### 资源使用率验证 (M-FIELD-023 ~ M-FIELD-030)

| 编号 | 测试名称 | 端点 | 场景 | 验证点 | 优先级 |
|------|----------|------|------|--------|--------|
| M-FIELD-023 | CPU 使用率正常 | PUT /machines/:id | 更新状态 | 接受 0-100 | P0 |
| M-FIELD-024 | CPU 使用率超出范围 | PUT /machines/:id | 更新状态 | 拒绝 > 100 | P0 |
| M-FIELD-025 | CPU 使用率负数 | PUT /machines/:id | 更新状态 | 拒绝负数 | P0 |
| M-FIELD-026 | 内存使用率正常 | PUT /machines/:id | 更新状态 | 接受 0-100 | P0 |
| M-FIELD-027 | 磁盘使用率正常 | PUT /machines/:id | 更新状态 | 接受 0-100 | P0 |
| M-FIELD-028 | 小数值 | PUT /machines/:id | 更新状态 | 接受浮点数 (45.67) | P1 |
| M-FIELD-029 | 边界值 0 | PUT /machines/:id | 更新状态 | 接受 0 | P1 |
| M-FIELD-030 | 边界值 100 | PUT /machines/:id | 更新状态 | 接受 100 | P1 |

#### 实例数量验证 (M-FIELD-031 ~ M-FIELD-037)

| 编号 | 测试名称 | 端点 | 场景 | 验证点 | 优先级 |
|------|----------|------|------|--------|--------|
| M-FIELD-031 | 正常实例数量 | POST /machines | 正常注册 | 接受有效数量 | P0 |
| M-FIELD-032 | instanceCount 为负 | POST /machines | 注册时 | 拒绝负数 | P0 |
| M-FIELD-033 | maxInstances 为 0 | POST /machines | 注册时 | 拒绝 0 | P0 |
| M-FIELD-034 | maxInstances 为负 | POST /machines | 注册时 | 拒绝负数 | P0 |
| M-FIELD-035 | instanceCount > maxInstances | POST /machines | 注册时 | 拒绝不合理配置 | P1 |
| M-FIELD-036 | 增加实例计数 | POST /sessions | 创建会话 | instanceCount +1 | P0 |
| M-FIELD-037 | 减少实例计数 | DELETE /sessions | 删除会话 | instanceCount -1 | P0 |

#### 状态枚举验证 (M-FIELD-038 ~ M-FIELD-043)

| 编号 | 测试名称 | 端点 | 场景 | 验证点 | 优先级 |
|------|----------|------|------|--------|--------|
| M-FIELD-038 | 状态 online | PUT /machines/:id | 更新状态 | 接受 'online' | P0 |
| M-FIELD-039 | 状态 offline | PUT /machines/:id | 更新状态 | 接受 'offline' | P0 |
| M-FIELD-040 | 状态 busy | PUT /machines/:id | 更新状态 | 接受 'busy' | P0 |
| M-FIELD-041 | 无效状态 | PUT /machines/:id | 更新状态 | 拒绝无效值 | P0 |
| M-FIELD-042 | 状态大小写 | PUT /machines/:id | 更新状态 | 验证大小写敏感 | P1 |
| M-FIELD-043 | 状态自动转换 | POST /sessions | 达到容量 | online → busy | P1 |

### 4.2 按 API 端点设计的测试用例

#### POST /api/admin/machines - 添加机器 (M-API-001 ~ M-API-010)

| 编号 | 测试名称 | 场景 | 验证点 | 优先级 |
|------|----------|------|--------|--------|
| M-API-001 | 正常添加机器 | 提供完整有效数据 | 返回 201，机器创建成功 | P0 |
| M-API-002 | 缺少必填字段 - hostname | 不提供 hostname | 返回 400 错误 | P0 |
| M-API-003 | 缺少必填字段 - ip | 不提供 ip | 返回 400 错误 | P0 |
| M-API-004 | IP 地址重复 | 提供已存在的 IP | 返回 409 冲突 | P0 |
| M-API-005 | 端口超出范围 | grpcPort = 70000 | 返回 400 错误 | P0 |
| M-API-006 | 端口为负数 | grpcPort = -1 | 返回 400 错误 | P0 |
| M-API-007 | 使用默认值 | 只提供必填字段 | maxInstances = 10 | P1 |
| M-API-008 | 自定义 maxInstances | 提供 maxInstances | 使用自定义值 | P1 |
| M-API-009 | 未授权访问 | 不提供 token | 返回 401 未授权 | P0 |
| M-API-010 | 非管理员访问 | 使用 user 角色 | 返回 403 禁止 | P0 |

#### GET /api/admin/machines/:id - 获取机器详情 (M-API-011 ~ M-API-018)

| 编号 | 测试名称 | 场景 | 验证点 | 优先级 |
|------|----------|------|--------|--------|
| M-API-011 | 获取存在的机器 | 提供有效 ID | 返回机器详情和活跃会话数 | P0 |
| M-API-012 | 机器不存在 | 提供无效 ID | 返回 404 | P0 |
| M-API-013 | 无效 ID 格式 | 提供非 UUID 格式 | 返回 400 或 404 | P1 |
| M-API-014 | 在线机器 | 查询在线机器 | status = 'online' | P0 |
| M-API-015 | 离线机器 | 查询离线机器 | status = 'offline' | P0 |
| M-API-016 | 忙碌机器 | 查询忙碌机器 | status = 'busy' | P0 |
| M-API-017 | 未授权访问 | 不提供 token | 返回 401 | P0 |
| M-API-018 | 非管理员访问 | 使用 user 角色 | 返回 403 | P0 |

#### PUT /api/admin/machines/:id - 更新机器配置 (M-API-019 ~ M-API-028)

| 编号 | 测试名称 | 场景 | 验证点 | 优先级 |
|------|----------|------|--------|--------|
| M-API-019 | 更新主机名 | 提供新 hostname | 成功更新 | P1 |
| M-API-020 | 更新 IP 地址 | 提供有效 IP | 验证格式后更新 | P1 |
| M-API-021 | 更新为无效 IP | 提供无效 IP | 返回 400 | P0 |
| M-API-022 | 更新端口 | 提供新端口 | 验证范围后更新 | P1 |
| M-API-023 | 更新 maxInstances | 提供新值 | 成功更新 | P1 |
| M-API-024 | 部分更新 | 只更新部分字段 | 只更新提供的字段 | P1 |
| M-API-025 | 机器不存在 | 更新不存在的机器 | 返回 404 | P0 |
| M-API-026 | 更新为相同值 | 提供相同值 | 仍然成功 | P2 |
| M-API-027 | 未授权访问 | 不提供 token | 返回 401 | P0 |
| M-API-028 | 非管理员访问 | 使用 user 角色 | 返回 403 | P0 |

#### POST /api/admin/machines/:id/health-check - 健康检查 (M-API-029 ~ M-API-037)

| 编号 | 测试名称 | 场景 | 验证点 | 优先级 |
|------|----------|------|--------|--------|
| M-API-029 | 健康机器 | 检查在线且连接的机器 | 返回 healthy，包含响应时间 | P0 |
| M-API-030 | 不健康机器 | 检查离线机器 | 返回 unhealthy | P0 |
| M-API-031 | gRPC 未连接 | 检查未连接的机器 | 返回 unhealthy，grpcConnected=false | P0 |
| M-API-032 | 机器不存在 | 检查无效 ID | 返回 unhealthy，错误信息 | P0 |
| M-API-033 | 响应时间 | 检查健康机器 | 返回 responseTime (ms) | P1 |
| M-API-034 | 系统信息 | 检查健康机器 | 返回 cpuUsage, memoryUsage, diskUsage | P1 |
| M-API-035 | 活跃实例数 | 检查健康机器 | 返回 activeInstances | P1 |
| M-API-036 | 未授权访问 | 不提供 token | 返回 401 | P0 |
| M-API-037 | 非管理员访问 | 使用 user 角色 | 返回 403 | P0 |

#### POST /api/admin/machines/health-check/batch - 批量健康检查 (M-API-038 ~ M-API-044)

| 编号 | 测试名称 | 场景 | 验证点 | 优先级 |
|------|----------|------|--------|--------|
| M-API-038 | 批量检查正常 | 提供多个有效 ID | 返回汇总统计和结果列表 | P0 |
| M-API-039 | 空数组 | 提供空数组 | 返回 400 | P0 |
| M-API-040 | 混合健康状态 | 包含健康和不健康机器 | 返回正确统计 | P0 |
| M-API-041 | 全部健康 | 所有机器在线 | healthy = total | P1 |
| M-API-042 | 全部不健康 | 所有机器离线 | unhealthy = total | P1 |
| M-API-043 | 单个机器 | 提供单个 ID | 正常处理 | P1 |
| M-API-044 | 大批量 | 提供大量 ID | 并发处理，响应时间合理 | P2 |

#### POST /api/admin/machines/batch-restart - 批量重启 (M-API-045 ~ M-API-052)

| 编号 | 测试名称 | 场景 | 验证点 | 优先级 |
|------|----------|------|--------|--------|
| M-API-045 | 正常重启 | 重启在线连接的机器 | 发送重启命令，状态变 offline | P0 |
| M-API-046 | 机器不存在 | 重启不存在的机器 | 返回错误，失败列表 | P0 |
| M-API-047 | 机器未连接 | 重启未连接的机器 | 返回错误，失败列表 | P0 |
| M-API-048 | 部分成功 | 部分机器可重启 | 返回成功和失败列表 | P1 |
| M-API-049 | 全部失败 | 所有机器不可用 | failed = all | P1 |
| M-API-050 | 空数组 | 提供空数组 | 返回 400 | P0 |
| M-API-051 | 未授权访问 | 不提供 token | 返回 401 | P0 |
| M-API-052 | 非管理员访问 | 使用 user 角色 | 返回 403 | P0 |

#### POST /machines/register - 机器注册 (M-API-053 ~ M-API-061)

| 编号 | 测试名称 | 场景 | 验证点 | 优先级 |
|------|----------|------|--------|--------|
| M-API-053 | 首次注册 | 新机器注册 | 创建记录，返回 201 | P0 |
| M-API-054 | 重复注册 | 机器再次注册 | 更新状态为 online，更新 last_seen | P0 |
| M-API-055 | 缺少 id | 不提供 id | 返回 400 | P0 |
| M-API-056 | 无效 IP | 提供无效 IP | 返回 400 | P0 |
| M-API-057 | 自定义 maxInstances | 提供 maxInstances | 使用自定义值 | P1 |
| M-API-058 | 不提供 maxInstances | 不提供可选字段 | 使用默认值 10 | P1 |
| M-API-059 | 提供 grpcPort | 提供 gRPC 端口 | 保存端口信息 | P1 |
| M-API-060 | 提供 proxyPort | 提供代理端口 | 保存端口信息 | P1 |
| M-API-061 | 注册后状态 | 查询刚注册的机器 | status = 'online' | P0 |

#### PUT /machines/:id/status - 更新机器状态 (M-API-062 ~ M-API-070)

| 编号 | 测试名称 | 场景 | 验证点 | 优先级 |
|------|----------|------|--------|--------|
| M-API-062 | 更新资源使用率 | 更新 cpu/memory/disk | 保存新值 | P0 |
| M-API-063 | 更新实例数量 | 更新 instanceCount | 保存新值 | P0 |
| M-API-064 | CPU 超出范围 | 更新 cpu = 101 | 返回 400 | P0 |
| M-API-065 | 内存超出范围 | 更新 memory = 101 | 返回 400 | P0 |
| M-API-066 | 负实例数 | 更新 instanceCount = -1 | 返回 400 | P0 |
| M-API-067 | 更新状态为 offline | status = 'offline' | 状态更新，会话关闭 | P0 |
| M-API-068 | 机器不存在 | 更新不存在的机器 | 返回 404 | P0 |
| M-API-069 | 部分字段更新 | 只更新部分字段 | 只更新提供的字段 | P1 |
| M-API-070 | 更新 last_seen | 更新心跳时间 | 保存新时间 | P0 |

#### GET /machines - 获取所有机器 (M-API-071 ~ M-API-078)

| 编号 | 测试名称 | 场景 | 验证点 | 优先级 |
|------|----------|------|--------|--------|
| M-API-071 | 获取所有机器 | 默认查询 | 返回所有机器列表 | P0 |
| M-API-072 | 分页查询 | 提供 page, limit | 正确分页 | P1 |
| M-API-073 | 排序 - 最后心跳 | sort=last_seen, order=desc | 按最后心跳降序 | P1 |
| M-API-074 | 排序 - 实例数 | sort=instance_count | 按实例数排序 | P1 |
| M-API-075 | 排序 - CPU 使用率 | sort=cpu_usage | 按 CPU 使用率排序 | P1 |
| M-API-076 | 空列表 | 无机器记录 | 返回空数组 | P1 |
| M-API-077 | 未授权访问 | 不提供 token | 返回 401 | P0 |
| M-API-078 | 非管理员访问 | 使用 user 角色 | 返回 403 | P0 |

#### DELETE /machines/:id - 删除机器 (M-API-079 ~ M-API-087)

| 编号 | 测试名称 | 场景 | 验证点 | 优先级 |
|------|----------|------|--------|--------|
| M-API-079 | 删除离线机器 | 删除离线状态的机器 | 成功删除 | P0 |
| M-API-080 | 删除在线机器 | 删除在线状态的机器 | 先发送关闭命令，再删除 | P0 |
| M-API-081 | 机器不存在 | 删除不存在的机器 | 返回 404 | P0 |
| M-API-082 | 机器有活跃会话 | 删除有会话的机器 | 关闭会话后删除 | P1 |
| M-API-083 | 未授权访问 | 不提供 token | 返回 401 | P0 |
| M-API-084 | 非管理员访问 | 使用 user 角色 | 返回 403 | P0 |
| M-API-085 | 删除后查询 | 查询已删除的机器 | 返回 404 | P1 |
| M-API-086 | 重复删除 | 再次删除 | 返回 404 | P2 |
| M-API-087 | 内存存储清理 | 删除后检查内存 | 从内存中移除 | P1 |

### 4.3 按业务逻辑设计的测试用例

#### 机器注册流程 (M-BIZ-001 ~ M-BIZ-007)

| 编号 | 测试名称 | 场景 | 验证点 | 优先级 |
|------|----------|------|--------|--------|
| M-BIZ-001 | 新机器注册 | 首次注册 | 创建记录，状态 online | P0 |
| M-BIZ-002 | 机器重新注册 | 离线后重新注册 | 更新为 online，更新 last_seen | P0 |
| M-BIZ-003 | 在线机器心跳 | 在线机器更新状态 | 保持 online，更新 last_seen | P0 |
| M-BIZ-004 | 注册时提供所有字段 | 完整信息注册 | 保存所有字段 | P1 |
| M-BIZ-005 | 注册时只提供必填字段 | 最小信息注册 | 使用默认值 | P1 |
| M-BIZ-006 | 多次快速注册 | 短时间内多次注册 | 不重复创建记录 | P1 |
| M-BIZ-007 | 注册后立即查询 | 注册后查询 | 能查询到新机器 | P0 |

#### 状态转换测试 (M-BIZ-008 ~ M-BIZ-018)

| 编号 | 测试名称 | 场景 | 验证点 | 优先级 |
|------|----------|------|--------|--------|
| M-BIZ-008 | offline → online | 机器重新注册 | 状态变 online | P0 |
| M-BIZ-009 | online → busy | 达到容量上限 | 状态自动变 busy | P0 |
| M-BIZ-010 | busy → online | 释放实例 | 状态自动变 online | P0 |
| M-BIZ-011 | online → offline | 手动标记离线 | 状态变 offline，会话关闭 | P0 |
| M-BIZ-012 | busy → offline | 手动标记离线 | 状态变 offline，会话关闭 | P0 |
| M-BIZ-013 | 超时离线 | 超过心跳间隔 | 自动变 offline | P0 |
| M-BIZ-014 | 容量临界点 - 90% | instanceCount = maxInstances * 0.9 | 状态变 busy | P1 |
| M-BIZ-015 | 容量临界点 - 89% | instanceCount = maxInstances * 0.89 | 保持 online | P1 |
| M-BIZ-016 | 状态持久化 | 状态变化后 | 数据库状态已更新 | P0 |
| M-BIZ-017 | 状态查询 | 查询不同状态的机器 | 返回正确状态 | P0 |
| M-BIZ-018 | 状态筛选 | 按状态筛选机器 | 返回符合状态的机器 | P1 |

#### 健康检查测试 (M-BIZ-019 ~ M-BIZ-027)

| 编号 | 测试名称 | 场景 | 验证点 | 优先级 |
|------|----------|------|--------|--------|
| M-BIZ-019 | 健康机器检查 | gRPC 连接正常 | 返回 healthy | P0 |
| M-BIZ-020 | 不健康机器检查 | gRPC 连接失败 | 返回 unhealthy | P0 |
| M-BIZ-021 | 响应时间测量 | 检查健康机器 | 返回 responseTime > 0 | P1 |
| M-BIZ-022 | 系统信息获取 | 检查健康机器 | 返回 cpu/memory/disk 使用率 | P1 |
| M-BIZ-023 | 活跃实例数获取 | 检查健康机器 | 返回 activeInstances | P1 |
| M-BIZ-024 | 批量检查 - 全健康 | 所有机器在线 | 全部返回 healthy | P0 |
| M-BIZ-025 | 批量检查 - 全不健康 | 所有机器离线 | 全部返回 unhealthy | P0 |
| M-BIZ-026 | 批量检查 - 混合 | 部分在线部分离线 | 返回正确统计 | P0 |
| M-BIZ-027 | 健康检查并发 | 同时检查多台 | 并发执行，结果正确 | P1 |

#### 容量管理测试 (M-BIZ-028 ~ M-BIZ-037)

| 编号 | 测试名称 | 场景 | 验证点 | 优先级 |
|------|----------|------|--------|--------|
| M-BIZ-028 | 容量充足 | instanceCount << maxInstances | 健康状态 = healthy | P0 |
| M-BIZ-029 | 容量紧张 | instanceCount ≈ maxInstances | 健康状态 = warning | P0 |
| M-BIZ-030 | 容量已满 | instanceCount = maxInstances | 不能创建新会话 | P0 |
| M-BIZ-031 | 容量增加 | 更新 maxInstances | 新容量生效 | P1 |
| M-BIZ-032 | 容量减少 | 更新 maxInstances | 如果当前数超过新值，处理 | P1 |
| M-BIZ-033 | 创建会话 | 在可用机器上创建 | instanceCount +1 | P0 |
| M-BIZ-034 | 释放会话 | 关闭会话 | instanceCount -1 | P0 |
| M-BIZ-035 | 选择最少实例机器 | 自动分配 | 选择 instanceCount 最小的 | P0 |
| M-BIZ-036 | 容量使用率计算 | 计算使用率 | 公式正确 | P1 |
| M-BIZ-037 | 健康状态判定 | 综合判定 | 考虑容量和资源使用率 | P1 |

#### 超时检测测试 (M-BIZ-038 ~ M-BIZ-043)

| 编号 | 测试名称 | 场景 | 验证点 | 优先级 |
|------|----------|------|--------|--------|
| M-BIZ-038 | 正常心跳 | 机器定期更新 | 保持 online | P0 |
| M-BIZ-039 | 心跳超时 | 超过阈值未更新 | 自动变 offline | P0 |
| M-BIZ-040 | 超时阈值 - 5分钟 | 默认阈值 | 5 分钟后离线 | P0 |
| M-BIZ-041 | 超时阈值 - 自定义 | 自定义阈值 | 使用自定义阈值 | P1 |
| M-BIZ-042 | 超时后恢复 | 离线机器重新注册 | 恢复 online | P0 |
| M-BIZ-043 | 定时检查 | 定时执行检查 | 自动标记超时机器 | P0 |

#### 机器与会话关联测试 (M-BIZ-044 ~ M-BIZ-052)

| 编号 | 测试名称 | 场景 | 验证点 | 优先级 |
|------|----------|------|--------|--------|
| M-BIZ-044 | 创建会话关联 | 在机器上创建会话 | 会话的 machine_id 正确 | P0 |
| M-BIZ-045 | 查询机器会话 | 查询机器上的会话 | 返回正确列表 | P0 |
| M-BIZ-046 | 机器离线关闭会话 | 机器离线 | 关闭所有关联会话 | P0 |
| M-BIZ-047 | 会话数统计 | 查询机器详情 | activeSessions 正确 | P0 |
| M-BIZ-048 | 删除机器检查会话 | 删除有会话的机器 | 会话被处理 | P1 |
| M-BIZ-049 | 多会话关联 | 在机器上创建多个会话 | 所有会话正确关联 | P0 |
| M-BIZ-050 | 会话释放更新计数 | 关闭会话 | instanceCount 正确更新 | P0 |
| M-BIZ-051 | 会话创建更新计数 | 创建会话 | instanceCount 正确更新 | P0 |
| M-BIZ-052 | 机器详情含会话 | GET /machines/:id | 包含活跃会话数 | P1 |

### 4.4 综合测试用例

#### 并发和性能测试 (M-INT-001 ~ M-INT-006)

| 编号 | 测试名称 | 场景 | 验证点 | 优先级 |
|------|----------|------|--------|--------|
| M-INT-001 | 并发注册 | 多台机器同时注册 | 全部注册成功 | P1 |
| M-INT-002 | 并发更新 | 多个请求更新同一机器 | 数据一致性 | P1 |
| M-INT-003 | 并发创建会话 | 多个会话同时创建 | instanceCount 正确 | P1 |
| M-INT-004 | 批量操作性能 | 批量健康检查 100 台 | 响应时间 < 5s | P2 |
| M-INT-005 | 分页性能 | 查询大量机器 | 响应时间合理 | P2 |
| M-INT-006 | 内存泄漏测试 | 长时间运行 | 内存稳定 | P2 |

#### 数据一致性测试 (M-INT-007 ~ M-INT-012)

| 编号 | 测试名称 | 场景 | 验证点 | 优先级 |
|------|----------|------|--------|--------|
| M-INT-007 | 数据库与内存一致 | 创建机器 | 两者数据一致 | P0 |
| M-INT-008 | 更新同步 | 更新机器 | 两者同步更新 | P0 |
| M-INT-009 | 删除同步 | 删除机器 | 两者同步删除 | P0 |
| M-INT-010 | 状态同步 | 状态变化 | 两者状态一致 | P0 |
| M-INT-011 | last_seen 同步 | 心跳更新 | 时间一致 | P0 |
| M-INT-012 | 实例计数同步 | 创建/释放会话 | 计数一致 | P0 |

---

## 5. 测试覆盖估算

### 5.1 测试用例总数统计

| 分类 | 测试用例数 |
|------|-----------|
| **字段验证测试** | 43 |
| **API 端点测试** | 87 |
| **业务逻辑测试** | 52 |
| **综合测试** | 12 |
| **总计** | **194** |

### 5.2 按功能模块分类

| 功能模块 | 测试用例数 | 占比 |
|---------|-----------|------|
| 机器注册 | 14 | 7.2% |
| 机器查询 | 18 | 9.3% |
| 机器更新 | 20 | 10.3% |
| 机器删除 | 9 | 4.6% |
| 健康检查 | 18 | 9.3% |
| 状态管理 | 18 | 9.3% |
| 容量管理 | 14 | 7.2% |
| 字段验证 | 43 | 22.2% |
| 权限控制 | 32 | 16.5% |
| 会话关联 | 8 | 4.1% |

### 5.3 按字段分类统计

| 字段 | 测试用例数 |
|------|-----------|
| IP 地址 | 8 |
| 端口号 (grpcPort/proxyPort) | 8 |
| 主机名 (hostname) | 6 |
| 资源使用率 (cpu/memory/disk) | 8 |
| 实例数量 (instanceCount/maxInstances) | 7 |
| 状态 (status) | 6 |

### 5.4 按 API 端点分类统计

| API 端点 | 测试用例数 |
|---------|-----------|
| POST /api/admin/machines | 10 |
| GET /api/admin/machines/:id | 8 |
| PUT /api/admin/machines/:id | 10 |
| POST /api/admin/machines/:id/health-check | 9 |
| POST /api/admin/machines/health-check/batch | 7 |
| POST /api/admin/machines/batch-restart | 8 |
| POST /machines/register | 9 |
| PUT /machines/:id/status | 9 |
| GET /machines | 8 |
| DELETE /machines/:id | 9 |

### 5.5 按优先级分类统计

| 优先级 | 测试用例数 | 占比 |
|--------|-----------|------|
| **P0 (核心功能)** | 108 | 55.7% |
| **P1 (重要功能)** | 69 | 35.6% |
| **P2 (辅助功能)** | 17 | 8.7% |

### 5.6 预计工作量估算

| 测试类型 | 用例数 | 预估工作量 (小时)* |
|---------|--------|------------------|
| P0 测试 | 108 | 54 |
| P1 测试 | 69 | 35 |
| P2 测试 | 17 | 9 |
| **总计** | **194** | **98** |

*注: 每个测试用例平均 0.5 小时（包括编写代码、调试、维护）

---

## 6. 潜在问题

### 6.1 字段验证问题

1. **IP 地址验证不完整**
   - 当前只验证 IPv4 格式
   - 未考虑 IPv6 支持
   - 未验证 IP 是否可达

2. **端口号验证**
   - 未检查端口是否已被占用
   - 未验证端口是否可用（能否连接）

3. **主机名验证**
   - 没有严格的格式验证
   - 可能接受特殊字符或过长字符串

4. **资源使用率验证**
   - 未验证数据类型（整数 vs 浮点数）
   - 未验证精度（小数位数）

### 6.2 业务逻辑问题

1. **状态转换**
   - busy → online 的自动转换逻辑未在代码中明确实现
   - 需要在会话释放时触发状态检查

2. **超时检测**
   - 依赖定时任务，定时任务未在本文档范围
   - 需要确保定时任务正确执行

3. **容量管理**
   - instanceCount 可能与实际会话数不一致
   - 需要定期同步

4. **并发问题**
   - 多个会话同时创建可能导致 instanceCount 不准确
   - 需要使用事务或原子操作

### 6.3 数据一致性问题

1. **内存与数据库同步**
   - 代码中同时使用内存存储和数据库
   - 需要确保两者一致

2. **机器离线处理**
   - 离线时关闭会话的逻辑可能失败
   - 需要处理部分失败的情况

3. **删除机器**
   - 删除前未检查是否有活跃会话
   - 可能导致孤立会话

### 6.4 安全问题

1. **权限控制**
   - 部分端点缺少权限验证
   - 需要确保所有管理端点都有权限检查

2. **输入验证**
   - 部分端点未使用 Zod schema 验证
   - 可能存在注入风险

3. **信息泄露**
   - 健康检查可能暴露系统信息
   - 需要限制返回的信息

### 6.5 性能问题

1. **批量操作**
   - 批量健康检查未使用并发控制
   - 可能同时发起过多请求

2. **分页查询**
   - 未设置最大分页限制
   - 可能导致大量数据返回

3. **内存使用**
   - 内存存储未设置上限
   - 可能导致内存溢出

### 6.6 测试相关问题

1. **测试数据清理**
   - 测试后需要清理创建的机器和会话
   - 避免影响后续测试

2. **并发测试**
   - 需要模拟真实并发场景
   - 测试数据竞态条件

3. **Mock 依赖**
   - gRPC 连接需要 Mock
   - 内存存储需要隔离

### 6.7 建议改进

1. **增强字段验证**
   - 使用 Zod schema 统一验证
   - 添加更多格式检查

2. **完善状态管理**
   - 实现自动状态转换
   - 添加状态转换日志

3. **优化容量管理**
   - 使用原子操作更新计数
   - 定期同步实际数量

4. **加强数据一致性**
   - 使用事务确保一致性
   - 添加数据校验机制

5. **提升性能**
   - 添加并发控制
   - 设置合理的分页限制

6. **完善测试**
   - 添加更多边界测试
   - 增加性能测试

---

## 附录

### A. 术语表

| 术语 | 说明 |
|------|------|
| Machine | 机器，运行 Playwright 浏览器实例的服务器 |
| Session | 会话，用户创建的浏览器实例 |
| instanceCount | 当前运行的实例数量 |
| maxInstances | 机器允许的最大实例数量 |
| gRPC | 远程过程调用协议，用于管理服务器与机器通信 |
| Proxy Port | 代理端口，用于 WebSocket 连接 |
| Health Check | 健康检查，检查机器是否可用 |
| Heartbeat | 心跳，机器定期发送的状态更新 |

### B. 参考文档

1. [Playwright 官方文档](https://playwright.dev/)
2. [Fastify 文档](https://www.fastify.io/)
3. [Zod 验证库](https://zod.dev/)
4. [gRPC 文档](https://grpc.io/)

### C. 相关文档

- [测试方案总纲](./00-测试方案总纲.md)
- [用户管理模块分析](./user-api-integration-test-report.md)
- [集成测试实战指南](./集成测试实战指南-用户管理示例.md)

---

**文档结束**

> 本文档详细梳理了机器管理模块的字段、API 端点和业务逻辑，并设计了完整的测试用例清单。后续编写测试代码时，请参考本文档中的测试用例和验证点。
