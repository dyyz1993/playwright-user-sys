# Vitest + Puppeteer 测试用例清单

> 创建时间: 2025-12-28
> 状态: 详细设计
> 基于: `docs/tests/Vitest+Puppeteer集成测试方案.md`

---

## 目录

1. [测试用例编号规则](#测试用例编号规则)
2. [单元测试用例](#单元测试用例)
3. [集成测试用例](#集成测试用例)
4. [测试数据矩阵](#测试数据矩阵)
5. [依赖关系图](#依赖关系图)
6. [风险评估](#风险评估)
7. [预估工作量](#预估工作量)

---

## 测试用例编号规则

| 格式 | 说明 | 示例 |
|------|------|------|
| `UNIT-{模块}-{序号}` | 单元测试 | `UNIT-CREDITS-001` |
| `INT-{模块}-{序号}` | 集成测试 | `INT-CONN-001` |
| `PERF-{模块}-{序号}` | 性能测试 | `PERF-LAUNCH-001` |

模块缩写:
- `CREDITS`: 计费算法
- `STATE`: 状态机
- `ALLOC`: 会话分配
- `MONITOR`: 积分监控
- `USER`: 用户模型
- `SESSION`: 会话模型
- `MACHINE`: 机器模型
- `CONN`: Puppeteer 连接
- `BILLING`: 计费流程
- `LIFECYCLE`: 会话生命周期
- `FAILOVER`: 故障转移

---

## 单元测试用例

### UNIT-CREDITS: 计费算法测试

文件: `tests/unit/services/credits-calculator.test.ts`

基于代码位置: `src/models/session.model.ts:230`

```typescript
const creditsUsed = Math.max(1, Math.ceil(finalDuration / 60));
```

| ID | 标题 | 优先级 | 测试数据 | 预期结果 | 覆盖代码行 |
|---|------|--------|----------|----------|-----------|
| UNIT-CREDITS-001 | 基础计费公式验证 - 1分钟内 | P0 | duration=30s | credits=1 | session.model.ts:230 |
| UNIT-CREDITS-002 | 基础计费公式验证 - 刚好1分钟 | P0 | duration=60s | credits=1 | session.model.ts:230 |
| UNIT-CREDITS-003 | 基础计费公式验证 - 超过1分钟 | P0 | duration=61s | credits=2 | session.model.ts:230 |
| UNIT-CREDITS-004 | 边界条件 - 0秒 | P0 | duration=0s | credits=1 | session.model.ts:230 |
| UNIT-CREDITS-005 | 边界条件 - 1秒 | P0 | duration=1s | credits=1 | session.model.ts:230 |
| UNIT-CREDITS-006 | 边界条件 - 59秒 | P0 | duration=59s | credits=1 | session.model.ts:230 |
| UNIT-CREDITS-007 | 边界条件 - 119秒 | P0 | duration=119s | credits=2 | session.model.ts:230 |
| UNIT-CREDITS-008 | 边界条件 - 120秒 | P0 | duration=120s | credits=2 | session.model.ts:230 |
| UNIT-CREDITS-009 | 边界条件 - 121秒 | P0 | duration=121s | credits=3 | session.model.ts:230 |
| UNIT-CREDITS-010 | 极端值 - 负数应返回0 | P1 | duration=-1s | credits=0 | session.model.ts:230 |
| UNIT-CREDITS-011 | 极端值 - 非常大的数 | P1 | duration=86400s (1天) | credits=1440 | session.model.ts:230 |
| UNIT-CREDITS-012 | 精度测试 - 浮点数舍入 | P1 | duration=59.9s | credits=1 | session.model.ts:230 |
| UNIT-CREDITS-013 | 增量扣费 - 避免重复扣费 | P0 | credits_used=1, duration=90s | new_credits=1 | session.model.ts:230 |

---

### UNIT-STATE: 会话状态机测试

文件: `tests/unit/services/session-state-machine.test.ts`

基于代码位置: `src/models/session.model.ts` 和 `@shared/types/index.ts:SessionStatus`

状态转换图:
```
CREATED -> CONNECTED -> ACTIVE -> DISCONNECTED -> CLOSED
         ↘ ERROR ↙                     ↑
           └─────────────────────────────┘
```

| ID | 标题 | 优先级 | 初始状态 | 目标状态 | 是否合法 | 预期行为 |
|---|------|--------|----------|----------|----------|----------|
| UNIT-STATE-001 | CREATED -> CONNECTED | P0 | CREATED | CONNECTED | 合法 | 状态更新成功 |
| UNIT-STATE-002 | CONNECTED -> DISCONNECTED | P0 | CONNECTED | DISCONNECTED | 合法 | 状态更新成功 |
| UNIT-STATE-003 | DISCONNECTED -> CLOSED | P0 | DISCONNECTED | CLOSED | 合法 | 状态更新成功 |
| UNIT-STATE-004 | CREATED -> ERROR | P1 | CREATED | ERROR | 合法 | 状态更新成功 |
| UNIT-STATE-005 | CONNECTED -> ERROR | P1 | CONNECTED | ERROR | 合法 | 状态更新成功 |
| UNIT-STATE-006 | CONNECTED -> CREATED (非法) | P1 | CONNECTED | CREATED | 非法 | 抛出异常 |
| UNIT-STATE-007 | DISCONNECTED -> CONNECTED (非法) | P1 | DISCONNECTED | CONNECTED | 非法 | 抛出异常 |
| UNIT-STATE-008 | CLOSED -> CONNECTED (非法) | P1 | CLOSED | CONNECTED | 非法 | 抛出异常 |
| UNIT-STATE-009 | 状态回滚保护 | P0 | DISCONNECTED | CONNECTED | 禁止 | 状态不变 |
| UNIT-STATE-010 | 终态保护 | P0 | CLOSED | 任何状态 | 禁止 | 状态不变 |
| UNIT-STATE-011 | 状态与计费关系 - CREATED | P0 | CREATED | - | 不计费 | credits_used=0 |
| UNIT-STATE-012 | 状态与计费关系 - CONNECTED | P0 | CONNECTED | - | 开始计费 | start_time设置 |
| UNIT-STATE-013 | 状态与计费关系 - DISCONNECTED | P0 | DISCONNECTED | - | 结算计费 | credits_used>0 |

---

### UNIT-ALLOC: 会话分配算法测试

文件: `tests/unit/services/session-allocation.test.ts`

基于代码位置: `src/models/machine.model.ts:186-237` (findAvailable方法)

| ID | 标题 | 优先级 | 测试场景 | 输入数据 | 预期结果 |
|---|------|--------|----------|----------|----------|
| UNIT-ALLOC-001 | 负载均衡 - 选择最少会话的机器 | P0 | 3台机器, sessions=[2,0,1] | 选择第2台 | machine.instance_count=0 |
| UNIT-ALLOC-002 | 机器容量限制 - max_instances | P0 | machine.instance_count=5, max_instances=5 | 查找可用 | 该机器不返回 |
| UNIT-ALLOC-003 | 无可用机器 - 全部满载 | P0 | 所有机器 instance_count=max_instances | 查找可用 | 返回 null |
| UNIT-ALLOC-004 | 机器离线处理 | P0 | 机器状态=offline | 查找可用 | 不返回该机器 |
| UNIT-ALLOC-005 | 机器未连接处理 | P0 | 机器未在 connectionManager 中 | 查找可用 | 不返回该机器 |
| UNIT-ALLOC-006 | 首次分配 - 无活跃会话 | P0 | 所有机器 instance_count=0 | 查找可用 | 返回任意在线机器 |
| UNIT-ALLOC-007 | 并发分配 - 10个请求 | P1 | 同时创建10个会话 | 负载均衡 | 分布在各机器 |
| UNIT-ALLOC-008 | 机器动态加入 | P1 | 运行中添加新机器 | 查找可用 | 新机器可被选中 |

---

### UNIT-MONITOR: 积分监控测试

文件: `tests/unit/services/credits-monitor.test.ts`

基于代码位置: `src/services/credits-monitor.service.ts:16-217`

| ID | 标题 | 优先级 | 测试场景 | 输入数据 | 预期结果 |
|---|------|--------|----------|----------|----------|
| UNIT-MONITOR-001 | 定时检查触发 | P0 | 间隔10秒 | 等待10秒 | checkSessionCredits被调用 |
| UNIT-MONITOR-002 | 余额充足检测 | P0 | user.credits=100, duration=60s | 不扣除 | 继续运行 |
| UNIT-MONITOR-003 | 余额不足检测 | P0 | user.credits=1, duration=60s | 扣除 | 关闭会话 |
| UNIT-MONITOR-004 | 会话自动关闭 | P0 | user.credits=0 | 检测 | status->DISCONNECTED |
| UNIT-MONITOR-005 | Webhook 触发 - 余额不足 | P1 | user.credits<=0 | 检测 | CREDITS_DEPLETED事件 |
| UNIT-MONITOR-006 | Webhook 触发 - 余额低 | P1 | user.credits < threshold | 检测 | CREDITS_LOW事件 |
| UNIT-MONITOR-007 | 增量扣费逻辑 | P0 | credits_used=1, duration=120s | 计算 | 再扣除1分 |
| UNIT-MONITOR-008 | 批量更新会话 | P0 | user有5个活跃会话 | 事务 | 全部更新 |
| UNIT-MONITOR-009 | 无效会话标记 | P0 | 机器离线, session在离线机器 | 检测 | status->DISCONNECTED |
| UNIT-MONITOR-010 | 按用户分组处理 | P0 | 10个会话, 3个用户 | 检测 | 分3批处理 |

---

### UNIT-USER: 用户模型测试

文件: `tests/unit/models/user.model.test.ts`

基于代码位置: `src/models/user.model.ts`

| ID | 标题 | 优先级 | 测试场景 | 输入数据 | 预期结果 |
|---|------|--------|----------|----------|----------|
| UNIT-USER-001 | 创建用户 | P0 | 有效数据 | username, password | 用户创建成功 |
| UNIT-USER-002 | 创建用户 - 用户名重复 | P0 | 已存在用户名 | 相同username | 抛出异常 |
| UNIT-USER-003 | 创建用户 - 空用户名 | P1 | username="" | 抛出异常 | "用户名不能为空" |
| UNIT-USER-004 | 通过ID查找用户 | P0 | 存在的用户ID | id | 返回用户对象 |
| UNIT-USER-005 | 通过用户名查找 | P0 | 存在的用户名 | username | 返回用户对象 |
| UNIT-USER-006 | 通过API Key查找 | P0 | 有效的api_key | api_key | 返回用户对象 |
| UNIT-USER-007 | 更新用户 | P0 | 有效更新数据 | email, password | 更新成功 |
| UNIT-USER-008 | 重置API Key | P1 | 存在的用户ID | id | 新key生成 |
| UNIT-USER-009 | 添加点数 | P0 | amount=100 | addCredits | credits+=100 |
| UNIT-USER-010 | 扣除点数 - 余额充足 | P0 | credits=100, amount=50 | deductCredits | credits=50 |
| UNIT-USER-011 | 扣除点数 - 余额不足 | P0 | credits=10, amount=50 | deductCredits | 抛出异常 |
| UNIT-USER-012 | 批量扣除点数 | P1 | 多个用户 | batchDeductCredits | 全部扣除成功 |
| UNIT-USER-013 | 分页查询用户 | P1 | page=1, limit=10 | findAll | 返回分页数据 |
| UNIT-USER-014 | 删除用户 | P1 | 存在的用户ID | delete | 返回true |
| UNIT-USER-015 | 验证密码 - 正确 | P0 | 正确密码 | verifyPassword | 返回true |
| UNIT-USER-016 | 验证密码 - 错误 | P0 | 错误密码 | verifyPassword | 返回false |

---

### UNIT-SESSION: 会话模型测试

文件: `tests/unit/models/session.model.test.ts`

基于代码位置: `src/models/session.model.ts`

| ID | 标题 | 优先级 | 测试场景 | 输入数据 | 预期结果 |
|---|------|--------|----------|----------|----------|
| UNIT-SESSION-001 | 创建会话 | P0 | user_id, options | create | 会话创建成功 |
| UNIT-SESSION-002 | 创建会话 - 无效JSON options | P1 | options="invalid" | create | 抛出异常 |
| UNIT-SESSION-003 | 通过ID查找会话 | P0 | 存在的session_id | findById | 返回会话对象 |
| UNIT-SESSION-004 | 更新会话 | P0 | 有效更新数据 | update | 更新成功 |
| UNIT-SESSION-005 | 批量更新会话 | P0 | 多个会话 | batchUpdate | 全部更新成功 |
| UNIT-SESSION-006 | 标记会话已连接 | P0 | session_id | markConnected | status=CONNECTED |
| UNIT-SESSION-007 | 标记会话已断开 | P0 | session_id, duration | markDisconnected | status=DISCONNECTED, 扣费 |
| UNIT-SESSION-008 | 标记会话已断开 - 幂等性 | P0 | 重复调用markDisconnected | 不重复扣费 | credits_used不变 |
| UNIT-SESSION-009 | 标记会话已过期 | P1 | session_id, duration | markExpired | status=EXPIRED |
| UNIT-SESSION-010 | 标记会话错误 | P1 | session_id, duration | markError | status=ERROR |
| UNIT-SESSION-011 | 查找活跃会话 | P0 | status=[CREATED, CONNECTED] | findActiveSessions | 返回列表 |
| UNIT-SESSION-012 | 按用户ID查找会话 | P0 | user_id | findByUserId | 返回用户会话 |
| UNIT-SESSION-013 | 按机器ID查找会话 | P0 | machine_id | findByMachineId | 返回机器会话 |
| UNIT-SESSION-014 | 分页查询会话 | P1 | page=1, limit=10 | paginate | 返回分页数据 |
| UNIT-SESSION-015 | 查询会话统计 | P1 | - | getStats | 返回统计数据 |
| UNIT-SESSION-016 | 更新最后活动时间 | P0 | session_id | updateLastActivity | last_activity更新 |
| UNIT-SESSION-017 | 获取用户会话统计 | P1 | user_id | getUserSessionStats | 返回统计 |

---

### UNIT-MACHINE: 机器模型测试

文件: `tests/unit/models/machine.model.test.ts`

基于代码位置: `src/models/machine.model.ts`

| ID | 标题 | 优先级 | 测试场景 | 输入数据 | 预期结果 |
|---|------|--------|----------|----------|----------|
| UNIT-MACHINE-001 | 注册新机器 | P0 | 有效数据 | register | 机器创建成功 |
| UNIT-MACHINE-002 | 注册已存在机器 - 更新 | P0 | 已存在的machine_id | register | 更新机器信息 |
| UNIT-MACHINE-003 | 通过ID查找机器 | P0 | 存在的machine_id | findById | 返回机器对象 |
| UNIT-MACHINE-004 | 更新机器状态 | P0 | 有效更新数据 | update | 更新成功 |
| UNIT-MACHINE-005 | 更新机器离线 - 关闭会话 | P0 | status='offline' | update | sessions->DISCONNECTED |
| UNIT-MACHINE-006 | 查找可用机器 | P0 | 在线且有容量 | findAvailable | 返回机器 |
| UNIT-MACHINE-007 | 增加实例计数 | P0 | machine_id | incrementInstanceCount | instance_count++ |
| UNIT-MACHINE-008 | 减少实例计数 | P0 | machine_id | decrementInstanceCount | instance_count-- |
| UNIT-MACHINE-009 | 标记机器离线 | P0 | machine_id | markOffline | status='offline' |
| UNIT-MACHINE-010 | 检查并标记超时机器 | P1 | timeoutMinutes=5 | checkOfflineMachines | 返回标记数量 |
| UNIT-MACHINE-011 | 按状态查找机器 | P1 | status='online' | findByStatus | 返回在线机器 |
| UNIT-MACHINE-012 | 删除旧机器 | P1 | cutoffDate | deleteOldMachines | 删除成功 |
| UNIT-MACHINE-013 | 健康检查 - 在线 | P1 | 在线机器 | healthCheck | status='healthy' |
| UNIT-MACHINE-014 | 健康检查 - 离线 | P1 | 离线机器 | healthCheck | status='unhealthy' |
| UNIT-MACHINE-015 | 批量健康检查 | P2 | 多个机器ID | batchHealthCheck | 返回所有结果 |

---

## 集成测试用例

### INT-CONN: Puppeteer 连接层测试

文件: `tests/integration/puppeteer-connection.test.ts`

这是**最核心**的集成测试,需要启动完整的管理端和机器服务。

**P0 核心功能:**

| ID | 标题 | 优先级 | 测试步骤 | 验证点 | 超时 |
|---|------|--------|----------|--------|------|
| INT-CONN-001 | 创建会话并连接浏览器 | P0 | 1. 创建测试用户(credits=100)<br>2. 注册测试机器<br>3. 创建会话<br>4. 验证浏览器启动<br>5. 连接Puppeteer<br>6. 访问百度 | 1. session.status='CREATED'<br>2. browserWSEndpoint存在<br>3. Puppeteer连接成功<br>4. 页面标题正确<br>5. 创建后credits=100 | 30s |
| INT-CONN-002 | 验证后扣费模式 | P0 | 1. 创建会话<br>2. 检查用户积分 | 创建时不扣费 | 10s |
| INT-CONN-003 | 验证后台定时扣费 | P0 | 1. 创建会话<br>2. 等待70秒<br>3. 检查积分 | 70秒后扣除2分 | 80s |
| INT-CONN-004 | 会话结束时结算积分 | P0 | 1. 创建会话<br>2. 等待30秒<br>3. 关闭会话<br>4. 检查积分 | 扣除1分(30s->1min) | 40s |
| INT-CONN-005 | 积分不足自动关闭会话 | P0 | 1. 创建用户(credits=1)<br>2. 创建会话<br>3. 等待70秒<br>4. 检查会话状态 | 会话自动关闭,credits=0 | 80s |
| INT-CONN-006 | WebSocket 连接超时处理 | P0 | 1. 创建会话<br>2. 断开网络<br>3. 尝试连接 | 连接失败,正确错误信息 | 20s |
| INT-CONN-007 | 机器离线时会话处理 | P0 | 1. 创建会话<br>2. 停止机器服务<br>3. 等待检测<br>4. 检查会话状态 | 会话标记为DISCONNECTED | 40s |
| INT-CONN-008 | 并发会话积分统计 | P0 | 1. 创建用户(credits=100)<br>2. 创建5个会话<br>3. 等待70秒<br>4. 检查积分 | 扣除10分(5会话x2分) | 80s |

**P1 性能测试:**

| ID | 标题 | 优先级 | 测试步骤 | 验证点 | 超时 |
|---|------|--------|----------|--------|------|
| INT-CONN-101 | 浏览器启动时间性能 | P1 | 1. 创建会话<br>2. 测量启动时间 | 启动时间 < 5秒 | 10s |
| INT-CONN-102 | WebSocket 连接建立时间 | P1 | 1. 获取WebSocket URL<br>2. 测量连接时间 | 连接时间 < 500ms | 5s |
| INT-CONN-103 | 页面加载性能 | P1 | 1. 连接浏览器<br>2. 访问百度<br>3. 测量加载时间 | 加载时间 < 3秒 | 10s |
| INT-CONN-104 | 内存占用监控 | P1 | 1. 创建10个会话<br>2. 测量内存占用 | 内存增长合理 | 60s |

**P1 边界条件:**

| ID | 标题 | 优先级 | 测试步骤 | 验证点 | 超时 |
|---|------|--------|----------|--------|------|
| INT-CONN-201 | 长时间会话积分准确性 | P1 | 1. 创建会话<br>2. 运行10分钟<br>3. 检查积分 | 扣除10分 | 620s |
| INT-CONN-202 | 极短会话最小计费 | P1 | 1. 创建会话<br>2. 立即关闭<br>3. 检查积分 | 最小1分 | 10s |
| INT-CONN-203 | 浏览器崩溃恢复 | P1 | 1. 创建会话<br>2. 杀死浏览器进程<br>3. 检查处理 | 会话标记ERROR | 20s |
| INT-CONN-204 | 网络超时处理 | P1 | 1. 模拟网络延迟<br>2. 创建会话<br>3. 检查超时 | 正确超时处理 | 30s |

**P2 压力测试:**

| ID | 标题 | 优先级 | 测试步骤 | 验证点 | 超时 |
|---|------|--------|----------|--------|------|
| INT-CONN-301 | 并发创建10个会话 | P2 | 1. 同时创建10个会话<br>2. 验证全部创建成功 | 全部成功,无泄漏 | 60s |
| INT-CONN-302 | 长时间运行稳定性 | P2 | 1. 创建会话<br>2. 运行1小时<br>3. 检查稳定性 | 无崩溃,内存稳定 | 3620s |
| INT-CONN-303 | 资源泄漏检测 | P2 | 1. 创建并关闭100个会话<br>2. 检查资源 | 无内存泄漏 | 300s |

---

### INT-BILLING: 完整计费流程测试

文件: `tests/integration/billing-flow.test.ts`

| ID | 标题 | 优先级 | 测试步骤 | 验证点 |
|---|------|--------|----------|--------|
| INT-BILLING-001 | 端到端计费验证 | P0 | 1. 创建用户(credits=10)<br>2. 创建会话<br>3. 运行3分钟<br>4. 关闭会话<br>5. 检查积分历史 | 最终credits=7, 历史记录准确 |
| INT-BILLING-002 | 积分历史记录准确性 | P0 | 1. 创建用户<br>2. 多次创建/关闭会话<br>3. 检查积分历史 | 每次扣费都有记录 |
| INT-BILLING-003 | 计费公式边界测试 | P0 | 1. 测试各种时长<br>(5s, 60s, 61s, 120s)<br>2. 验证积分扣除 | 积分=ceil(duration/60) |
| INT-BILLING-004 | 多会话并发计费 | P0 | 1. 创建3个会话<br>2. 同时运行<br>3. 检查总积分 | 总积分正确 |
| INT-BILLING-005 | 积分不足阻止创建 | P0 | 1. 创建用户(credits=0)<br>2. 尝试创建会话 | 抛出"点数不足"错误 |

---

### INT-LIFECYCLE: 会话生命周期测试

文件: `tests/integration/session-lifecycle.test.ts`

| ID | 标题 | 优先级 | 测试步骤 | 验证点 |
|---|------|--------|----------|--------|
| INT-LIFECYCLE-001 | 完整生命周期 | P0 | 1. 创建会话<br>2. 连接浏览器<br>3. 执行操作<br>4. 断开连接<br>5. 关闭会话 | 状态流转正确,积分正确 |
| INT-LIFECYCLE-002 | 异常中断处理 | P0 | 1. 创建会话<br>2. 杀死进程<br>3. 检查状态 | status=ERROR, 正确计费 |
| INT-LIFECYCLE-003 | 重连机制 | P1 | 1. 创建会话<br>2. 断开WebSocket<br>3. 尝试重连 | 重连成功或正确失败 |
| INT-LIFECYCLE-004 | 状态持久化 | P0 | 1. 创建会话<br>2. 重启服务<br>3. 检查状态 | 状态从数据库恢复 |
| INT-LIFECYCLE-005 | 超时自动清理 | P1 | 1. 创建会话<br>2. 不活动超时<br>3. 检查清理 | 会话被清理 |

---

### INT-FAILOVER: 机器故障转移测试

文件: `tests/integration/machine-failover.test.ts`

| ID | 标题 | 优先级 | 测试步骤 | 验证点 |
|---|------|--------|----------|--------|
| INT-FAILOVER-001 | 机器离线检测 | P0 | 1. 注册2台机器<br>2. 停止1台<br>3. 等待检测 | 机器标记离线 |
| INT-FAILOVER-002 | 离线机器上会话处理 | P0 | 1. 创建会话<br>2. 停止机器<br>3. 检查会话 | 会话标记DISCONNECTED |
| INT-FAILOVER-003 | 数据一致性 | P0 | 1. 创建会话<br>2. 停止机器<br>3. 检查数据库 | 数据一致 |
| INT-FAILOVER-004 | 自动恢复 | P1 | 1. 停止机器<br>2. 重启机器<br>3. 检查连接 | 机器重新在线 |
| INT-FAILOVER-005 | 会话迁移(如支持) | P2 | 1. 创建会话<br>2. 停止机器<br>3. 检查迁移 | 会话迁移到其他机器 |

---

## 测试数据矩阵

### 测试用户数据

| 场景 | username | password | credits | role | 用途 |
|------|----------|----------|---------|------|------|
| 标准用户 | test_user_standard | pass123 | 100 | user | 大部分测试 |
| 余额不足用户 | test_user_no_credits | pass123 | 0 | user | 测试积分不足 |
| 余额低用户 | test_user_low_credits | pass123 | 2 | user | 测试余额警告 |
| 管理员 | test_admin | REDACTED_ADMIN_PASS | 1000 | admin | 管理功能测试 |

### 测试机器数据

| 场景 | machine_id | max_instances | 初始状态 | 用途 |
|------|------------|---------------|----------|------|
| 标准机器 | test-machine-1 | 10 | online | 大部分测试 |
| 满载机器 | test-machine-full | 1 | instance_count=1 | 测试容量限制 |
| 离线机器 | test-machine-offline | 10 | offline | 测试离线处理 |
| 低容量机器 | test-machine-low | 1 | online | 测试负载均衡 |

### 测试会话数据

| 场景 | duration | credits_used | status | 用途 |
|------|----------|--------------|--------|------|
| 新会话 | 0 | 0 | CREATED | 测试创建 |
| 活跃会话 | 60 | 1 | CONNECTED | 测试计费 |
| 已结束会话 | 120 | 2 | DISCONNECTED | 测试结算 |
| 错误会话 | 30 | 1 | ERROR | 测试错误处理 |

---

## 依赖关系图

```
测试依赖层次:

Level 1 (基础设施):
├── tests/helpers/ports.ts (端口管理)
├── tests/helpers/database.ts (数据库管理)
└── tests/helpers/factories.ts (测试数据工厂)

Level 2 (单元测试):
├── tests/unit/models/user.model.test.ts
├── tests/unit/models/session.model.test.ts
├── tests/unit/models/machine.model.test.ts
├── tests/unit/services/credits-calculator.test.ts
├── tests/unit/services/session-state-machine.test.ts
├── tests/unit/services/session-allocation.test.ts
└── tests/unit/services/credits-monitor.test.ts

Level 3 (集成测试):
├── tests/integration/puppeteer-connection.test.ts (核心)
├── tests/integration/billing-flow.test.ts
├── tests/integration/session-lifecycle.test.ts
└── tests/integration/machine-failover.test.ts

执行顺序:
1. 先执行 Level 1 (构建辅助工具)
2. 并行执行 Level 2 (单元测试)
3. 顺序执行 Level 3 (集成测试,按依赖关系)
```

---

## 风险评估

### 高风险测试(最可能失败)

| ID | 风险 | 原因 | 缓解措施 |
|---|------|------|----------|
| INT-CONN-003 | 后台定时扣费 | 时序敏感,可能延迟 | 使用vi.useFakeTimers模拟 |
| INT-CONN-008 | 并发会话积分统计 | 并发竞争条件 | 使用事务验证 |
| INT-CONN-301 | 并发创建10个会话 | 资源竞争 | 端口隔离,顺序验证 |
| INT-LIFECYCLE-002 | 浏览器崩溃恢复 | 进程管理复杂 | 检查进程清理 |
| INT-FAILOVER-002 | 离线机器会话处理 | 网络延迟 | 增加等待时间 |

### 中风险测试

| ID | 风险 | 原因 | 缓解措施 |
|---|------|------|----------|
| INT-CONN-201 | 长时间会话 | 测试时间长 | 缩短为3分钟验证 |
| INT-CONN-302 | 长时间稳定性 | CI环境限制 | 可选测试,本地执行 |
| INT-BILLING-003 | 边界条件 | 浮点精度 | 使用整数计算 |

### 低风险测试

| ID | 风险 | 原因 | 缓解措施 |
|---|------|------|----------|
| UNIT-* | 单元测试 | 隔离环境 | Mock外部依赖 |
| INT-CONN-001 | 基本流程 | 简单场景 | 已验证多次 |

---

## 预估工作量

| 测试文件 | 测试数量 | 工作量(小时) | 依赖 |
|---------|---------|-------------|------|
| tests/helpers/ports.ts | 3 | 1h | - |
| tests/helpers/database.ts | 5 | 2h | ports.ts |
| tests/helpers/factories.ts | 4 | 2h | database.ts |
| tests/unit/services/credits-calculator.test.ts | 13 | 2h | - |
| tests/unit/services/session-state-machine.test.ts | 13 | 2h | - |
| tests/unit/services/session-allocation.test.ts | 8 | 3h | - |
| tests/unit/services/credits-monitor.test.ts | 10 | 3h | - |
| tests/unit/models/user.model.test.ts | 16 | 2h | factories.ts |
| tests/unit/models/session.model.test.ts | 17 | 3h | factories.ts |
| tests/unit/models/machine.model.test.ts | 15 | 2h | factories.ts |
| tests/integration/puppeteer-connection.test.ts | 19 | 16h (2天) | 所有辅助工具 |
| tests/integration/billing-flow.test.ts | 5 | 4h | puppeteer-connection.test.ts |
| tests/integration/session-lifecycle.test.ts | 5 | 4h | puppeteer-connection.test.ts |
| tests/integration/machine-failover.test.ts | 5 | 4h | puppeteer-connection.test.ts |

**总计:**
- 测试用例数: 140+
- 预估工作量: 50小时 (约6-7个工作日)

### 实施计划

| 周期 | 任务 | 工作量 |
|------|------|--------|
| Day 1 | 辅助工具开发 | 5h |
| Day 2 | 单元测试 - Services | 10h |
| Day 3 | 单元测试 - Models | 7h |
| Day 4-5 | 集成测试 - Puppeteer连接 | 16h |
| Day 6 | 集成测试 - 其他流程 | 12h |

---

## 附录: 测试模板示例

### 单元测试模板

```typescript
import { describe, it, expect, vi } from 'vitest';
import { calculateCredits } from '../../src/services/credits-calculator';

describe('Credits Calculator', () => {
  it('UNIT-CREDITS-001: 基础计费公式验证 - 1分钟内', () => {
    // Given
    const duration = 30;

    // When
    const credits = calculateCredits(duration);

    // Then
    expect(credits).toBe(1);
  });
});
```

### 集成测试模板

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestUser, createTestMachine } from '../../tests/helpers/factories';
import { createBrowserSession } from '../../src/services/session.service';

describe('Puppeteer Connection', () => {
  let userId: number;
  let machineId: string;

  beforeAll(async () => {
    // Given: 创建测试数据
    const user = await createTestUser({ credits: 100 });
    userId = user.id;

    const machine = await createTestMachine({ max_instances: 10 });
    machineId = machine.id;
  });

  it('INT-CONN-001: 创建会话并连接浏览器', async () => {
    // When: 创建会话
    const session = await createBrowserSession(userId, {});

    // Then: 验证结果
    expect(session.status).toBe('CREATED');
    expect(session.browserWSEndpoint).toBeDefined();

    // And: 验证后扣费模式
    const user = await UserModel.findById(userId);
    expect(user.credits).toBe(100);
  }, 30000);

  afterAll(async () => {
    // Cleanup
    await UserModel.delete(userId);
    await MachineModel.delete(machineId);
  });
});
```

---

## 更新日志

| 日期 | 版本 | 更新内容 |
|------|------|----------|
| 2025-12-28 | 1.0 | 初始版本,详细测试用例清单 |
