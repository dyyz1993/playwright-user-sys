# 🎯 全量问题清单

> 生成时间: 2026-05-17 | 扫描范围: `src/`（含 `tests/`）
> 总计: **215+ 项** | 分类: 10 大类

---

## 目录

- [A. 类型安全（17 项）](#a-类型安全-17-项)
- [B. 安全性（16 项）](#b-安全性-16-项)
- [C. 测试覆盖（33 项）](#c-测试覆盖-33-项)
- [D. 代码质量（27 项）](#d-代码质量-27-项)
- [E. 性能与竞态（20 项）](#e-性能与竞态-20-项)
- [F. 架构与设计（14 项）](#f-架构与设计-14-项)
- [G. 可维护性（22 项）](#g-可维护性-22-项)
- [H. 日志与调试（12 项）](#h-日志与调试-12-项)
- [I. 依赖与配置（18 项）](#i-依赖与配置-18-项)
- [J. 文档（8 项）](#j-文档-8-项)

---

## A. 类型安全（17 项）

### A1 源码 any
- [ ] **A1-1**: `src/types/grpc-proto-loader.d.ts:16` — `[name: string]: any` 索引签名（难度 ⭐ | 风险 🟢 低）
  - 对 @grpc/grpc-js 兼容性必需，加注释说明即可

### A2 测试文件 any（411 个，以下为核心文件）
- [ ] **A2-1**: `src/tests/unit/controllers/machine.controller.test.ts` — 78 个 any（难度 ⭐⭐⭐ | 风险 🔴 高）
  - Fastify mock + 多层 service mock 类型最复杂
- [ ] **A2-2**: `src/tests/unit/controllers/file.controller.test.ts` — 37 个 any（难度 ⭐⭐⭐ | 风险 🔴 高）
  - fs mock + FastifyReply 类型
- [ ] **A2-3**: `src/tests/unit/controllers/session.controller.test.ts` — 31 个 any（难度 ⭐⭐⭐ | 风险 🔴 高）
  - 多层 service mock + response helper mock
- [ ] **A2-4**: `src/tests/unit/controllers/user.controller.test.ts` — 22 个 any（难度 ⭐⭐ | 风险 🟡 中）
  - AuthenticatedRequest 泛型问题
- [ ] **A2-5**: `src/tests/unit/services/memory-store.service.test.ts` — 20 个 any（难度 ⭐⭐ | 风险 🟡 中）
  - 私有属性访问 + MachineStatus 类型转换
- [ ] **A2-6**: `src/tests/unit/machine/grpc/connection-manager.test.ts` — 13 个 any（难度 ⭐⭐ | 风险 🟡 中）
- [ ] **A2-7**: `src/tests/unit/controllers/auth.controller.test.ts` — 13 个 any（难度 ⭐⭐ | 风险 🟡 中）
- [ ] **A2-8**: 其余 20+ 个测试文件 — 各 1-10 个 any（难度 ⭐ | 风险 🟢 低）

### A3 类型断言 `as X`（源码 185 个）
- [ ] **A3-1**: 双 `puppeteer-core` 依赖去重（难度 ⭐⭐⭐ | 风险 🔴 高）
  - `browser.service.ts` 19 个 as X → puppeteer 类型冲突
- [ ] **A3-2**: `events.handler.ts` keyboard 类型用 `KeyInput`（难度 ⭐⭐ | 风险 🟡 中）
- [ ] **A3-3**: `browser-inject.service.ts` ElementHandle 类型（难度 ⭐⭐ | 风险 🟡 中）
- [ ] **A3-4**: DB 模型 — Knex 查询行类型用 `Row`/`DbRow` 替代 `as SomeModel`（难度 ⭐⭐ | 风险 🟡 中）

### A4 @ts-expect-error
- [ ] **A4-1**: `src/plugins/index.ts:39` — fastify-helmet Fastify v5 兼容（等待外部更新）
- [ ] **A4-2**: `src/plugins/index.ts:77` — CORS 回调类型，用 `declare module` 扩展

### A5 非空断言
- [x] **A5-1**: `browser.service.ts:966-987` — 7 处 `result.args!.push(...)` 加 guard（难度 ⭐⭐ | 风险 🔴 高）✅ 2026-05-17
- [x] **A5-2**: `session.service.ts:93,211` — `userAfterSettlement!.credits` 加 null guard（难度 ⭐ | 风险 🟢 低）✅ 2026-05-17
- [x] **A5-3**: `demo.service.ts:59-63` — `user!.id` 用 `if (!user) throw` 替代（难度 ⭐ | 风险 🟢 低）✅ 2026-05-17
- [x] **A5-4**: `auth.plugin.ts:149` — `authHeader!.split` 加 null guard（难度 ⭐ | 风险 🟢 低）✅ 2026-05-17
- [x] **A5-5**: `health.service.ts:85` — `server!.close(...)` optional chaining（难度 ⭐ | 风险 🟢 低）✅ 2026-05-17
- [x] **A5-6**: `events.handler.ts:368` — `contentWindow!.document` 加 null check（难度 ⭐ | 风险 🟡 中）✅ 2026-05-17

---

## B. 安全性（16 项）

### B1 SQL 注入
- [x] **B1-1**: `src/models/request-log.model.ts:121` — `whereRaw` 字符串插值改为参数化绑定（难度 ⭐ | 风险 🔴 高）✅ 2026-05-17
  ```typescript
  // 当前：.whereRaw(`created_at >= datetime('now', '-${days} days')`)
  // 修复：.whereRaw("created_at >= datetime('now', ?)", [`-${days} days`])
  ```

### B2 错误信息泄露
- [ ] **B2-1**: `src/routes/demo.routes.ts:51` — 泄露原始 error.message 给客户端（难度 ⭐ | 风险 🟡 中）
- [ ] **B2-2**: `src/routes/admin-api/user.routes.ts:73,277,383` — 管理员 API 泄露内部错误详情（难度 ⭐ | 风险 🟡 中）
- [ ] **B2-3**: `src/routes/admin-api/session.routes.ts:64,137` — 同上模式（难度 ⭐ | 风险 🟡 中）
- [ ] **B2-4**: `src/routes/admin-api/machine.routes.ts:86,148` — 同上（难度 ⭐ | 风险 🟡 中）
- [ ] **B2-5**: `src/routes/admin-api/operation-log.routes.ts:71` — 同上（难度 ⭐ | 风险 🟡 中）
- [ ] **B2-6**: 统一用 `getSafeErrorMessage()` 替代所有 `error instanceof Error ? error.message : ...` 模式（难度 ⭐⭐ | 风险 🟢 低）

### B3 WebSocket 安全
- [ ] **B3-1**: `native-websocket-proxy.service.ts` — 无 Origin header 的 WS 连接应该被拒绝（难度 ⭐ | 风险 🟡 中）

### B4 认证与授权
- [ ] **B4-1**: `src/routes/admin.routes.ts:29` — `/viewer` 无认证，检查 sessionId 枚举风险（难度 ⭐ | 风险 🟢 低）
- [ ] **B4-2**: 全局 rate limit 是否覆盖所有 API 端点？检查 `@fastify/rate-limit` 配置（难度 ⭐ | 风险 🟢 低）

### B5 文件安全
- [ ] **B5-1**: `src/controllers/file.controller.ts:38` — 未验证文件 MIME 类型和扩展名（难度 ⭐ | 风险 🟡 中）
- [ ] **B5-2**: `src/controllers/file.controller.ts` — 上传文件大小未提前限制（难度 ⭐ | 风险 🟡 中）

---

## C. 测试覆盖（33 项）

### C1 缺少测试文件
- [ ] **C1-1**: `src/services/admin-storage.service.ts` — 4 个导出函数无测试文件（难度 ⭐⭐ | 风险 🟡 中）
  - `getStorageStats`, `cleanupUserData`, `cleanupAllOldData`, `getSystemStorageStats`
- [ ] **C1-2**: `src/services/admin-test.service.ts` — 2 个导出函数无测试文件（难度 ⭐ | 风险 🟢 低）
  - `createTestSessions`, `createTestMachines`

### C2 测试覆盖不足
- [ ] **C2-1**: `user.service.ts` — 6+ 个导出函数无独立测试用例（难度 ⭐⭐ | 风险 🟡 中）
  - `countAll`, `sumAllCredits`, `countNewUsers`, `findByUsername`, `findByApiKey`, `getCreditsStats`, `getUserSessionStats`, `batchRecharge`, `batchDeleteUsers`

### C3 API 端点缺少集成测试（P1 级）
- [ ] **C3-1**: `POST /api/sessions/:id/inject-file` — 文件注入端点（难度 ⭐⭐ | 风险 🔴 高）
- [ ] **C3-2**: `POST /api/sessions/:id/upload-url` — URL 上传端点（难度 ⭐⭐ | 风险 🔴 高）
- [ ] **C3-3**: `POST /api/machines/register` — 机器注册（难度 ⭐⭐ | 风险 🔴 高）
- [ ] **C3-4**: `PUT /api/machines/:id/status` — 机器状态更新（难度 ⭐⭐ | 风险 🟡 中）
- [ ] **C3-5**: `POST /api/machines/:id/restart` — 机器重启（难度 ⭐⭐ | 风险 🟡 中）
- [ ] **C3-6**: `POST /api/machines/cleanup` — 清理过期机器（难度 ⭐⭐ | 风险 🟡 中）

### C4 API 端点缺少集成测试（P2 级）
- [ ] **C4-1**: `GET /api/auth/me` — 当前用户信息（难度 ⭐ | 风险 🟢 低）
- [ ] **C4-2**: `GET /api/auth/verify` — token 验证（难度 ⭐ | 风险 🟢 低）
- [ ] **C4-3**: `GET /api/files` — 文件列表（难度 ⭐ | 风险 🟢 低）
- [ ] **C4-4**: `POST /api/files/cleanup-temp` — 清理临时文件（难度 ⭐ | 风险 🟢 低）
- [ ] **C4-5**: `GET /api/files/session/:sessionId` — 会话文件列表（难度 ⭐ | 风险 🟢 低）
- [ ] **C4-6**: `POST /api/files/upload-session` — 上传会话文件（难度 ⭐ | 风险 🟡 中）
- [ ] **C4-7**: `POST /api/admin/sessions/batch-release` — 批量释放会话（难度 ⭐⭐ | 风险 🟡 中）
- [ ] **C4-8**: `POST /api/admin/storage/cleanup` — 存储清理（难度 ⭐ | 风险 🟢 低）
- [ ] **C4-9**: `POST /api/admin/test/*` — 测试工具函数（难度 ⭐ | 风险 🟢 低）

### C5 关键场景缺少集成测试
- [ ] **C5-1**: 并发积分扣减竞态条件（难度 ⭐⭐⭐ | 风险 🔴 高）
  - 两个线程同时调用 credits monitor 的情况
- [ ] **C5-2**: 存储配额用尽的测试（难度 ⭐⭐ | 风险 🟡 中）
- [ ] **C5-3**: 文件上传全链路 E2E 测试（难度 ⭐⭐⭐ | 风险 🟡 中）
- [ ] **C5-4**: WebSocket 断线重连测试（难度 ⭐⭐⭐ | 风险 🔴 高）
- [ ] **C5-5**: 配置文件/环境变量校验测试（难度 ⭐⭐ | 风险 🟡 中）
- [ ] **C5-6**: 浏览器崩溃→会话自动恢复测试（难度 ⭐⭐⭐ | 风险 🔴 高）

---

## D. 代码质量（27 项）

### D1 超大文件拆分（>500 行）
- [ ] **D1-1**: `src/machine/browser.service.ts` — 1372 行（难度 ⭐⭐⭐ | 风险 🔴 高）
  - 建议拆为：`browser-launcher.ts`, `browser-inject.service.ts`（已部分拆分）, `browser-metrics.ts`
- [ ] **D1-2**: `src/machine/session_handlers/events.handler.ts` — 1207 行（难度 ⭐⭐⭐ | 风险 🔴 高）
  - 建议拆为：`keyboard.handler.ts`, `mouse.handler.ts`, `file.handler.ts`, `navigate.handler.ts`
- [ ] **D1-3**: `src/services/machine-grpc/connection-manager.ts` — 868 行（难度 ⭐⭐⭐ | 风险 🔴 高）
  - 建议拆为：`grpc-client.ts`, `connection-pool.ts`, `health-checker.ts`
- [ ] **D1-4**: `src/services/native-websocket-proxy.service.ts` — 722 行（难度 ⭐⭐ | 风险 🟡 中）
- [ ] **D1-5**: `src/routes/admin-api/user.routes.ts` — 599 行（难度 ⭐⭐ | 风险 🟡 中）
- [ ] **D1-6**: `src/routes/admin.routes.ts` — 598 行（难度 ⭐⭐ | 风险 🟡 中）
- [ ] **D1-7**: `src/services/storage.service.ts` — 596 行（难度 ⭐⭐ | 风险 🟡 中）
- [ ] **D1-8**: `src/services/memory-store.service.ts` — 577 行（难度 ⭐⭐ | 风险 🟡 中）
- [ ] **D1-9**: `src/models/machine.model.ts` — 542 行（难度 ⭐⭐ | 风险 🟡 中）
- [ ] **D1-10**: `src/controllers/session.controller.ts` — 517 行（难度 ⭐⭐ | 风险 🟡 中）

### D2 超长函数拆分（>50 行）
- [ ] **D2-1**: `browser.service.ts` — `launchBrowser()` ~284 行（难度 ⭐⭐⭐ | 风险 🔴 高）
  - 应拆为：`prepareBrowserArgs()`, `createProfile()`, `installExtensions()`, `configureProxy()`, `launchPuppeteer()`
- [ ] **D2-2**: `browser.service.ts` — `closeBrowser()` ~101 行（难度 ⭐⭐ | 风险 🟡 中）
- [ ] **D2-3**: `events.handler.ts` — `handleMouseEvents()` ~207 行（难度 ⭐⭐⭐ | 风险 🔴 高）
  - 应拆为：`handleClick()`, `handleMove()`, `handleDrag()`, `handleScroll()`, `handleInput()`
- [ ] **D2-4**: `events.handler.ts` — `handleEventsConnection()` ~192 行（难度 ⭐⭐ | 风险 🟡 中）

### D3 深层嵌套简化
- [ ] **D3-1**: `browser.service.ts` — `launchBrowser()` 函数嵌套深度 4-6 层（难度 ⭐⭐ | 风险 🟡 中）
- [ ] **D3-2**: `events.handler.ts` — 事件分发 `if/switch` 深层嵌套（难度 ⭐⭐ | 风险 🟡 中）

### D4 魔术数字提取
- [x] **D4-1**: `events.handler.ts` — 6 处 `15000` 超时值应提取为常量（难度 ⭐ | 风险 🟢 低）✅ 2026-05-17
- [x] **D4-2**: 全局的 `3000/5000/10000/30000/60000` 超时值应集中管理（难度 ⭐ | 风险 🟢 低）✅ 2026-05-17 (部分完成: events.handler.ts 的 30000 已提取)
- [x] **D4-3**: `1000000` 最大充值金额在 2 个 schema 中重复定义（难度 ⭐ | 风险 🟢 低）✅ 2026-05-17

### D5 硬编码字符串
- [ ] **D5-1**: 180+ 中文字符串硬编码在 EJS 模板中，无 i18n（难度 ⭐⭐⭐ | 风险 🟡 中）
  - `toast.error('创建失败')` / `toast.error('加载失败')` 等多处重复
- [ ] **D5-2**: alert/confirm 中文字符串无统一管理（难度 ⭐⭐ | 风险 🟢 低）

### D6 死代码清理
- [ ] **D6-1**: `src/app.ts` — 仅 1 行 re-export（难度 ⭐ | 风险 🟢 低）
- [ ] **D6-2**: `src/machine/grpc.service.ts` — 仅 1 行 re-export（难度 ⭐ | 风险 🟢 低）
- [ ] **D6-3**: `src/services/machine-grpc.service.ts` — 仅 1 行 re-export（难度 ⭐ | 风险 🟢 低）
- [ ] **D6-4**: `src/models/session.model.ts` — 仅 3 行 re-export（难度 ⭐ | 风险 🟢 低）

---

## E. 性能与竞态（20 项）

### E1 检查后操作竞态（Check-Then-Act）
- [ ] **E1-1**: `credits-monitor.service.ts:69,158` — 先读 credits 再扣减，无锁（难度 ⭐⭐⭐ | 风险 🔴 高）
  - 高并发下积分可能超扣
- [ ] **E1-2**: `machine.controller.ts:50` — `findById` → 无锁 → 更新状态（难度 ⭐⭐ | 风险 🟡 中）
- [ ] **E1-3**: `user.controller.ts:24` — `findByUsername` → 创建 — TOCTOU（难度 ⭐⭐ | 风险 🟡 中）
- [ ] **E1-4**: `connection-manager.ts:634-636` — `findById` → 检查 → 更新（难度 ⭐⭐ | 风险 🟡 中）
- [ ] **E1-5**: `admin-machine.service.ts:61` — `findById` → 检查 → 删除（难度 ⭐⭐ | 风险 🟡 中）
- [ ] **E1-6**: `db` 层面加乐观锁（version 字段）防止竞态（难度 ⭐⭐⭐ | 风险 🔴 高）

### E2 未处理的 Promise
- [x] **E2-6**: `machine/app.ts:381` — `this.stop().then(() => process.exit(1))` 已加 .catch()（难度 ⭐ | 风险 🟡 中）✅ 2026-05-17
- [x] **E2-7**: `service-handlers.ts:103` — `getConnectionManager().then()` 已加 .catch()（难度 ⭐ | 风险 🟡 中）✅ 2026-05-17
- [ ] **E2-1**: `events.handler.ts:673` — `.then()` 已有 `.catch()`（误报）✅ 验证 2026-05-17
- [ ] **E2-2~5,8**: 其他 `.then()` 均已有 `.catch()`（验证通过）✅ 2026-05-17

### E3 并发与事务
- [ ] **E3-1**: Knex 事务未用于积分扣减操作（难度 ⭐⭐ | 风险 🔴 高）
- [ ] **E3-2**: 数据库连接池配置可能过高/过低（检查 `pool.min/max`）（难度 ⭐ | 风险 🟢 低）
- [ ] **E3-3**: WebSocket 广播未使用背压控制（难度 ⭐⭐ | 风险 🟡 中）

### E4 内存与资源
- [ ] **E4-1**: 会话截图未限制尺寸导致内存 OOM（难度 ⭐⭐ | 风险 🟡 中）
- [ ] **E4-2**: 长时间运行的 WebSocket 未做心跳检测（难度 ⭐⭐ | 风险 🟡 中）
- [ ] **E4-3**: 浏览器实例未限制并发数导致系统资源耗尽（难度 ⭐⭐ | 风险 🟡 中）

---

## F. 架构与设计（14 项）

### F1 重复的 try/catch 样板代码
- [ ] **F1-1**: 创建 `tryCatchWrapper` 高阶函数消除 ~250 处重复 try/catch（难度 ⭐⭐ | 风险 🟡 中）
- [x] **F1-2**: 定义 `AppError`/`NotFoundError`/`ValidationError` 类替代内联状态码（难度 ⭐⭐ | 风险 🟢 低）✅ 2026-05-17
  - 创建 `src/utils/errors.ts`，包含 AppError/NotFoundError/ValidationError/AuthenticationError/AuthorizationError
  - 已在 session.service.ts、user.service.ts、demo.service.ts 中使用 NotFoundError
- [ ] **F1-3**: 统一 `reply.send()` 错误格式为全局 error handler（难度 ⭐⭐ | 风险 🟡 中）

### F2 路由层复杂度
- [ ] **F2-1**: `src/routes/admin.routes.ts` — SSR 路由和 API 路由混在一个文件（难度 ⭐⭐ | 风险 🟡 中）
- [ ] **F2-2**: `src/routes/admin-api/user.routes.ts` — 599 行，包含多个独立 CRUD 操作（难度 ⭐⭐ | 风险 🟡 中）

### F3 重复依赖注入
- [ ] **F3-1**: 双 `puppeteer` + `puppeteer-core` 依赖冲突（难度 ⭐⭐⭐ | 风险 🔴 高）
  - 导致 8 个 `@ts-ignore` 和 19 个 `as X` 断言
- [ ] **F3-2**: 部分 service 通过 `BrowserService.getInstance()` 与 `new BrowserService()` 两种模式初始化（难度 ⭐⭐ | 风险 🟡 中）

### F4 解耦问题
- [ ] **F4-1**: `events.handler.ts` 直接依赖 `browserService.sessions.get()` 访问内部状态（难度 ⭐⭐ | 风险 🟡 中）
- [ ] **F4-2**: `session.service.ts` 和 `credits-monitor.service.ts` 相互引用形成循环依赖风险（难度 ⭐⭐ | 风险 🟡 中）

### F5 中间件模式
- [ ] **F5-1**: 缺少请求日志和错误记录的中间件层（现在每个 controller 手写）（难度 ⭐⭐ | 风险 🟢 低）
- [ ] **F5-2**: 缺少统一的认证中间件链复用模式（部分用 `onRequest`, 部分用 `preHandler`）（难度 ⭐ | 风险 🟢 低）
- [ ] **F5-3**: 控制器方法参数校验分散在 Zod schema 和手动 parse 两种方式（难度 ⭐⭐ | 风险 🟢 低）

---

## G. 可维护性（22 项）

### G1 配置文件与环境变量
- [ ] **G1-1**: `src/config/env.ts` — JWT_SECRET 在生产环境缺失时应该有清晰报错（难度 ⭐ | 风险 🟡 中）
- [ ] **G1-2**: `.env.*` 文件不在 `.gitignore` 中（检查是否暴露 secret）（难度 ⭐ | 风险 🔴 高）
- [ ] **G1-3**: 配置项未分组归档（DB/JWT/WS/API 混在一起）（难度 ⭐ | 风险 🟢 低）

### G2 日志记录
- [ ] **G2-1**: 所有控制器中 `logger.error('...:', error)` 模式可以统一为 error handler（难度 ⭐⭐ | 风险 🟢 低）
- [ ] **G2-2**: WebSocket 日志没有 requestId/traceId 难以追踪链路（难度 ⭐ | 风险 🟡 中）

### G3 错误处理一致性
- [x] **G3-1**: `admin.routes.ts` debug 路由中 `{ error: msg }` → `{ success: false, error: msg }` 统一（难度 ⭐ | 风险 🟢 低）✅ 2026-05-17
- [ ] **G3-2**: 某些 controller 返回 `{error: string}`，其他返回 `{success: false, error: string}`（难度 ⭐ | 风险 🟢 低）

### G4 命名一致性
- [ ] **G4-1**: 函数命名混用 `getXxx` / `findXxx` / `fetchXxx` 无统一规则（难度 ⭐ | 风险 🟢 低）
- [ ] **G4-2**: 部分文件用 `snake_case`（DB 列名）部分用 `camelCase`（代码变量）（难度 ⭐ | 风险 🟢 低）

### G5 静态分析
- [ ] **G5-1**: 添加 ESLint `no-unused-vars` 规则（当前未启用）（难度 ⭐ | 风险 🟢 低）
- [ ] **G5-2**: 添加 ESLint `prefer-const` 规则强制不可变（难度 ⭐ | 风险 🟢 低）
- [ ] **G5-3**: 添加 ESLint `no-return-await` 规则（难度 ⭐ | 风险 🟢 低）

### G6 构建/开发体验
- [ ] **G6-1**: 编译 `build:emit` 使用 `--noImplicitAny false` — 应改为 true（难度 ⭐⭐ | 风险 🟡 中）
- [ ] **G6-2**: 开发模式热更新范围过大（改一个文件重编译所有）（难度 ⭐⭐ | 风险 🟢 低）
- [ ] **G6-3**: 缺少 `pnpm dev:test` 快速启动测试环境的命令（难度 ⭐ | 风险 🟢 低）
- [ ] **G6-4**: 测试数据库和开发数据库未隔离（风险 🟡 中）

### G7 依赖管理
- [ ] **G7-1**: `package.json` 中未使用的依赖（用 `depcheck` 检查）（难度 ⭐ | 风险 🟢 低）
- [ ] **G7-2**: 锁定文件（pnpm-lock.yaml）可能需要更新到最新兼容版本（难度 ⭐ | 风险 🟢 低）

---

## H. 日志与调试（12 项）

### H1 残留调试代码
- [x] **H1-1**: `browser.service.ts:1021` — `console.log('focusin', event.target)` 已移除（难度 ⭐ | 风险 🟢 低）✅ 2026-05-17
- [x] **H1-2**: `browser.service.ts:1076` — `console.log('DOMContentLoaded')` 已移除（难度 ⭐ | 风险 🟢 低）✅ 2026-05-17
- [x] **H1-3**: `browser.service.ts:1088` — `console.log('click', e.clientX, e.clientY)` 已移除（难度 ⭐ | 风险 🟢 低）✅ 2026-05-17
- [x] **H1-4**: `events.handler.ts` — 多处详细日志降级为 debug（难度 ⭐ | 风险 🟢 低）✅ 2026-05-17

### H2 日志分级不合理
- [ ] **H2-1**: 正常业务流程（如 `Sending form.field notification`）使用 `logger.info` — 应用 `logger.debug`（难度 ⭐ | 风险 🟢 低）
- [ ] **H2-2**: 认证失败场景使用 `logger.error` — 应用 `logger.warn`（难度 ⭐ | 风险 🟢 低）
- [ ] **H2-3**: 缺少结构化日志 JSON 格式输出（当前是纯文本）（难度 ⭐⭐ | 风险 🟢 低）

### H3 可观测性
- [ ] **H3-1**: 缺少 Prometheus metrics 端点（难度 ⭐⭐ | 风险 🟢 低）
- [ ] **H3-2**: 缺少健康检查端点的详细状态（当前只返回 up/down）（难度 ⭐ | 风险 🟢 低）
- [ ] **H3-3**: WebSocket 连接数等运行时指标未暴露（难度 ⭐ | 风险 🟢 低）

---

## I. 依赖与配置（18 项）

### I1 packages
- [ ] **I1-1**: 用 `depcheck` 扫描未使用的依赖（难度 ⭐ | 风险 🟢 低）
- [ ] **I1-2**: 检查是否有已知安全漏洞的包（`pnpm audit`）（难度 ⭐ | 风险 🔴 高）
- [ ] **I1-3**: `puppeteer` 和 `puppeteer-core` 同时存在（难度 ⭐⭐⭐ | 风险 🟡 中）
- [ ] **I1-4**: 检查所有依赖是否冻结版本号（当前是 `^x.y.z` 宽松模式）（难度 ⭐ | 风险 🟡 中）

### I2 Docker/部署
- [ ] **I2-1**: Dockerfile 是否有多余缓存层可优化（减少镜像大小）（难度 ⭐ | 风险 🟢 低）
- [ ] **I2-2**: 多阶段构建可以用更小的 base image（alpine → slim）（难度 ⭐ | 风险 🟡 中）
- [ ] **I2-3**: docker-compose 中缺少 `healthcheck` 的健康起始期配置（难度 ⭐ | 风险 🟡 中）
- [ ] **I2-4**: 容器日志未设置轮转大小（可能导致磁盘满）（难度 ⭐ | 风险 🟡 中）
- [ ] **I2-5**: 生产环境容器以 root 用户运行（安全风险）（难度 ⭐ | 风险 🔴 高）

### I3 CI/CD
- [ ] **I3-1**: `.github/workflows` 中缺少 CI 流程或流程不完整（难度 ⭐ | 风险 🟡 中）
- [ ] **I3-2**: PR 检查没有强制要求测试通过才能合并（难度 ⭐ | 风险 🟡 中）
- [ ] **I3-3**: 缺少自动部署流程（当前为手动 scp）（难度 ⭐ | 风险 🟢 低）
- [ ] **I3-4**: 代码审查 checklist 未标准化（难度 ⭐ | 风险 🟢 低）

### I4 TypeScript 配置
- [ ] **I4-1**: `tsconfig.json` 中 `noImplicitAny: false` — 应改为 true（难度 ⭐⭐⭐ | 风险 🔴 高）
- [ ] **I4-2**: `tsconfig.json` 未开启 `strict: true`（当前是部分 strict 选项）（难度 ⭐⭐⭐ | 风险 🔴 高）
- [ ] **I4-3**: 未启用 `noUnusedLocals` / `noUnusedParameters`（难度 ⭐ | 风险 🟢 低）
- [ ] **I4-4**: `skipLibCheck: true` 隐藏了第三方库类型问题（难度 ⭐ | 风险 🟢 低）

---

## J. 文档（8 项）

- [ ] **J-1**: `README.md` 缺少本地开发环境搭建步骤（难度 ⭐ | 风险 🟢 低）
- [ ] **J-2**: 缺少 API 文档（目前只有 swagger plugin 但 route 定义不全）（难度 ⭐⭐ | 风险 🟡 中）
- [ ] **J-3**: 缺少架构决策记录 ADR（为什么选 Fastify、为什么用 gRPC 等）（难度 ⭐ | 风险 🟢 低）
- [ ] **J-4**: 缺少数据库 ER 图文档（7 张表的关系）（难度 ⭐ | 风险 🟢 低）
- [ ] **J-5**: 缺少三层架构数据流图（SDK→Manager→Machine）（难度 ⭐ | 风险 🟢 低）
- [ ] **J-6**: 缺少部署架构文档/网络拓扑（难度 ⭐ | 风险 🟢 低）
- [ ] **J-7**: 缺少故障排查指南（常见问题 FAQ）（难度 ⭐ | 风险 🟢 低）
- [ ] **J-8**: 代码中函数缺少 JSDoc 注释（尤其 service 层公共函数）（难度 ⭐ | 风险 🟢 低）

---

## 汇总统计

| 类别 | 项数 | 难度分布 | 风险分布 |
|------|------|---------|---------|
| **A. 类型安全** | 17 | ⭐×5 ⭐⭐×8 ⭐⭐⭐×4 | 🟢×7 🟡×7 🔴×3 |
| **B. 安全性** | 16 | ⭐×13 ⭐⭐×3 | 🟢×5 🟡×9 🔴×2 |
| **C. 测试覆盖** | 33 | ⭐×15 ⭐⭐×14 ⭐⭐⭐×4 | 🟢×9 🟡×14 🔴×10 |
| **D. 代码质量** | 27 | ⭐×11 ⭐⭐×13 ⭐⭐⭐×3 | 🟢×10 🟡×14 🔴×3 |
| **E. 性能与竞态** | 20 | ⭐×10 ⭐⭐×7 ⭐⭐⭐×3 | 🟢×5 🟡×12 🔴×3 |
| **F. 架构与设计** | 14 | ⭐×5 ⭐⭐×7 ⭐⭐⭐×2 | 🟢×6 🟡×8 🔴×0 |
| **G. 可维护性** | 22 | ⭐×14 ⭐⭐×6 ⭐⭐⭐×2 | 🟢×14 🟡×8 🔴×0 |
| **H. 日志与调试** | 12 | ⭐×11 ⭐⭐×1 | 🟢×10 🟡×2 🔴×0 |
| **I. 依赖与配置** | 18 | ⭐×9 ⭐⭐×6 ⭐⭐⭐×3 | 🟢×7 🟡×9 🔴×2 |
| **J. 文档** | 8 | ⭐×7 ⭐⭐×1 | 🟢×7 🟡×1 🔴×0 |
| **合计** | **215** | ⭐×100 ⭐⭐×66 ⭐⭐⭐×49 | 🟢×80 🟡×84 🔴×23 |

## 推荐修复顺序（按 ROI）

```
第一批（低风险高收益 → 给新人）:
  D4 魔术数字提取 (3项) ⭐
  A5 非空断言 (5项) ⭐
  H1 移除调试代码 (4项) ⭐
  G3 错误格式统一 (2项) ⭐
  J 文档补全 (8项) ⭐
  → 共 22 项

第二批（中风险，核心稳定性）:
  B1 SQL注入修复 (1项) ⭐
  E2 Promise处理 (8项) ⭐
  D1 超大文件拆分 (10项) ⭐⭐
  F1 try/catch 模板 (3项) ⭐⭐
  → 共 22 项

第三批（高风险，需要领域知识）:
  E1 竞态条件 (6项) ⭐⭐⭐
  C3 关键API测试 (6项) ⭐⭐
  A1-A2 类型安全 (10项) ⭐⭐⭐
  A3 类型断言 (4项) ⭐⭐
  → 共 26 项

第四批（长期优化）:
  D5 i18n 国际化 (2项) ⭐⭐⭐
  F2 路由重构 (2项) ⭐⭐
  I4 tsconfig strict (4项) ⭐⭐⭐
  F3 依赖解耦 (2项) ⭐⭐⭐
  → 共 10 项
```
