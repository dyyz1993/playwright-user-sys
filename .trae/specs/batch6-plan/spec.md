# Batch 6: 安全加固 + 关键竞态修复 + 测试补充

> 优先级: 安全修复 > 竞态条件 > 测试覆盖 > 代码质量
> 预计总工时: ~14.5h
> 前置批次: Batch 1-5 (已完成 21 项)

---

## Why

前 5 批已完成基础类型安全、错误类定义、SQL 注入修复、调试代码清理等低风险项。当前系统仍存在以下关键风险:

1. **竞态条件** (`E1-1`): credits-monitor 的"先读后扣"模式在高并发下可能导致积分超扣，直接影响业务正确性
2. **安全盲区** (`B3-1`, `B4-1`, `G1-2`): WebSocket Origin 校验不完整、.env 可能泄露到 git
3. **关键服务零测试** (`C1-1`, `C1-2`, `C2-1`): admin-storage、admin-test、user.service 的多个导出函数完全无测试覆盖
4. **死代码** (`D6-1~4`): 4 个仅含 re-export 的中间文件增加维护成本

## What Changes

### 1. E1-1 credits-monitor 竞态条件修复

- **目标**: `checkSessionCredits()` 中先读 user.credits 再扣减的模式在高并发下不安全。当前已用事务 + `WHERE credits >= amount` 做了原子扣减，但需补充并发测试验证
- **修改文件**: `src/services/credits-monitor.service.ts`, `src/models/user.model.ts`
- **新增测试**: `src/tests/integration/credits-monitor-race.test.ts`
- **验收标准**: 并发 5 个 checkSessionCredits 同时执行，积分不超扣

### 2. B3-1 WebSocket Origin 校验加固

- **目标**: `native-websocket-proxy.service.ts` 当前只校验 Origin 存在的情况；无 Origin 的连接直接放行。应要求所有非本地连接必须携带 Origin
- **修改文件**: `src/services/native-websocket-proxy.service.ts`
- **新增测试**: `src/tests/unit/security/websocket-origin-validation.test.ts`
- **验收标准**: 无 Origin header 的 WS 连接在生产环境被拒绝；localhost 连接始终放行

### 3. B4-1 /viewer 认证检查

- **目标**: `/viewer` 路由无认证，需确认 sessionId 是否可被枚举。若 sessionId 使用 UUID v4 则枚举风险极低，仅需加注释说明设计决策
- **修改文件**: `src/routes/admin.routes.ts`
- **新增测试**: `src/tests/unit/security/viewer-session-enumeration.test.ts`
- **验收标准**: 确认 sessionId 为 UUID v4 格式，不可枚举；代码中有注释说明安全决策

### 4. G1-2 .env 文件安全检查

- **目标**: 确认 `.env.*` 文件全部在 `.gitignore` 中（已确认），运行 `git ls-files` 验证无泄露
- **修改文件**: 无需修改（已安全）
- **新增测试**: `src/tests/unit/security/env-file-not-tracked.test.ts`
- **验收标准**: `git ls-files` 输出中无 `.env` 文件

### 5. C1-1 admin-storage.service.ts 测试

- **目标**: 为 `getStorageStats`、`cleanupUserData`、`cleanupAllOldData`、`getSystemStorageStats` 4 个导出函数编写单元测试
- **新增文件**: `src/tests/unit/services/admin-storage.service.test.ts`
- **验收标准**: 4 个函数均有 ≥1 个测试用例，覆盖正常路径和错误路径

### 6. C1-2 admin-test.service.ts 测试

- **目标**: 为 `createTestSessions`、`createTestMachines` 2 个导出函数编写单元测试
- **新增文件**: `src/tests/unit/services/admin-test.service.test.ts`
- **验收标准**: 2 个函数均有测试，覆盖正常和边界（count=0）

### 7. C2-1 user.service.ts 补充测试

- **目标**: `countAll`、`sumAllCredits`、`countNewUsers`、`findByUsername`、`findByApiKey`、`getCreditsStats`、`getUserSessionStats`、`batchRecharge`、`batchDeleteUsers` 9 个函数缺少独立测试
- **修改文件**: `src/tests/unit/services/user.service.test.ts`（已有部分，需扩展）
- **验收标准**: 9 个函数均有 ≥1 个测试用例

### 8. D6-1~4 死代码清理

- **目标**: 移除 4 个仅含 re-export 的中间文件，直接在消费者中 import 最终模块
- **修改文件**:
  - 删除: `src/app.ts`
  - 删除: `src/machine/grpc.service.ts`
  - 删除: `src/services/machine-grpc.service.ts`
  - 删除: `src/models/session.model.ts`
  - 更新: 所有引用这些文件的 import 路径
- **验收标准**: `pnpm build` 通过，所有现有测试通过

### 9. G3-2 错误响应格式统一

- **目标**: 部分路由返回 `{error: string}`，部分返回 `{success: false, error: string}`，需统一为后者
- **修改文件**: `src/routes/admin-api/*.routes.ts` 中的不一致响应
- **新增测试**: 在现有路由测试中验证响应格式
- **验收标准**: 所有错误响应均为 `{success: false, error: string}` 格式

### 10. E4-1 截图尺寸限制

- **目标**: `takeScreenshot` 和 `captureAndSend` 未限制截图分辨率，大页面可能导致内存 OOM
- **修改文件**: `src/machine/browser.service.ts`, `src/machine/session_handlers/stream.handler.ts`
- **验收标准**: 截图最大分辨率限制为 1920x1080，超出时按比例缩放

### 11. H2-1 业务日志级别降级

- **目标**: 正常业务流程（如"点数监控: 检查 X 个活跃会话"）使用 `logger.info`，应降为 `logger.debug`
- **修改文件**: `src/services/credits-monitor.service.ts`, `src/services/machine-monitor.service.ts`
- **验收标准**: 常规定时检查日志为 debug 级别，异常情况（余额不足、会话关闭）保持 info/warn

### 12. H2-2 认证失败日志级别调整

- **目标**: 认证失败场景（密码错误、token 无效）使用 `logger.error`，应改为 `logger.warn`
- **修改文件**: `src/controllers/auth.controller.ts`, `src/plugins/auth.plugin.ts`（如适用）
- **验收标准**: 认证失败日志为 warn 级别，不含敏感信息

### 13. E3-2 数据库连接池配置审查

- **目标**: 检查 `src/config/database.ts` 中 pool.min/max 配置是否合理
- **修改文件**: `src/config/database.ts`（如需调整）
- **验收标准**: 添加配置注释，确保 SQLite 单文件模式 pool 配置合理

### 14. G6-3 添加 dev:test 快捷命令

- **目标**: 添加 `pnpm dev:test` 命令，一键启动测试环境（设置 NODE_ENV=test + 运行 vitest）
- **修改文件**: `package.json`
- **验收标准**: `pnpm dev:test` 可正常运行单元测试

---

## Impact

- **Affected specs**: 无外部规格依赖
- **Affected code**:
  - `src/services/credits-monitor.service.ts` (E1-1, H2-1)
  - `src/models/user.model.ts` (E1-1 验证)
  - `src/services/native-websocket-proxy.service.ts` (B3-1)
  - `src/routes/admin.routes.ts` (B4-1)
  - `src/routes/admin-api/*.routes.ts` (G3-2)
  - `src/machine/browser.service.ts` (E4-1, D6-1 引用更新)
  - `src/machine/session_handlers/stream.handler.ts` (E4-1)
  - `src/controllers/auth.controller.ts` (H2-2)
  - `src/config/database.ts` (E3-2)
  - `package.json` (G6-3)
  - 多个文件 import 路径更新 (D6)
  - 新增 7 个测试文件

## ADDED Requirements

### Requirement: Credits Monitor Race Condition Protection
系统 SHALL 在并发调用 `checkSessionCredits()` 时保证用户积分不被超扣，通过数据库原子操作 `WHERE credits >= amount` 确保一致性。

#### Scenario: 并发积分扣减不超扣
- **WHEN** 5 个 `checkSessionCredits()` 实例同时对同一用户（余额 100 点）执行扣减
- **THEN** 最终积分 >= 0
- **AND** 总扣减量不超过用户原始积分

### Requirement: WebSocket Origin Validation
系统 SHALL 在生产环境拒绝无 Origin header 的 WebSocket 升级请求，仅允许 localhost/127.0.0.1 的无 Origin 连接。

#### Scenario: 生产环境无 Origin 连接被拒绝
- **WHEN** NODE_ENV=production 且 WS 升级请求无 Origin header
- **THEN** 返回 403 Forbidden
- **AND** 连接被销毁

#### Scenario: 本地开发无 Origin 连接被允许
- **WHEN** NODE_ENV=development 且 WS 升级请求无 Origin header
- **THEN** 连接正常建立

### Requirement: Viewer Session Security Documentation
系统 SHALL 在 `/viewer` 路由代码中注释说明 sessionId 使用 UUID v4 格式，不可被枚举。

#### Scenario: Viewer 路由安全决策有文档
- **WHEN** 开发者阅读 `/viewer` 路由代码
- **THEN** 可看到注释说明 sessionId 为 UUID v4，枚举概率极低

### Requirement: Screenshot Size Limitation
系统 SHALL 限制浏览器截图的最大分辨率为 1920x1080，超出时按比例缩放，防止内存 OOM。

#### Scenario: 大页面截图不导致 OOM
- **WHEN** 浏览器页面分辨率为 3840x2160
- **THEN** 截图被缩放至 1920x1080
- **AND** 截图文件大小 < 500KB

### Requirement: Business Log Level Downgrade
系统 SHALL 将常规定时检查日志（credits-monitor、machine-monitor 的周期性检查）从 `info` 降级为 `debug`。

#### Scenario: 定时检查日志为 debug 级别
- **WHEN** credits-monitor 执行定期检查
- **THEN** "检查 X 个活跃会话" 类日志使用 `logger.debug`
- **AND** 异常情况（余额不足）保持 `logger.warn`

### Requirement: Auth Failure Log Level
系统 SHALL 将认证失败场景的日志从 `error` 降为 `warn`。

#### Scenario: 密码错误日志为 warn
- **WHEN** 用户登录密码错误
- **THEN** 日志使用 `logger.warn` 而非 `logger.error`

### Requirement: Error Response Format Consistency
系统 SHALL 所有错误响应使用统一的 `{success: false, error: string}` 格式。

#### Scenario: 路由错误响应格式一致
- **WHEN** 任何 API 路由返回错误响应
- **THEN** 响应体包含 `success: false` 字段
- **AND** 错误消息在 `error` 字段中

### Requirement: Dead Code Removal
系统 SHALL 移除仅含 re-export 的中间文件（app.ts、grpc.service.ts、machine-grpc.service.ts、session.model.ts），消费者直接导入最终模块。

#### Scenario: 中间文件移除后构建正常
- **WHEN** 移除 4 个 re-export 文件并更新 import
- **THEN** `pnpm build` 成功
- **AND** 所有测试通过

## MODIFIED Requirements

### Requirement: Admin Storage Service Testability
新增 `admin-storage.service.ts` 的单元测试覆盖，确保存储统计、清理函数正确性。

### Requirement: User Service Testability
扩展 `user.service.test.ts` 覆盖 `countAll`、`sumAllCredits`、`batchRecharge` 等 9 个函数。

## REMOVED Requirements

无
