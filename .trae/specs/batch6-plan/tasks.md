# Tasks - Batch 6: 安全加固 + 关键竞态修复 + 测试补充

## Phase 1: 安全修复 (优先级最高, ~3h)

- [ ] Task 1.1: B3-1 WebSocket Origin 校验加固 (1h)
  - [ ] 编写测试: `src/tests/unit/security/websocket-origin-validation.test.ts`
    - 测试生产环境无 Origin → 403
    - 测试开发环境无 Origin → 允许
    - 测试合法 Origin → 允许
    - 测试非法 Origin → 403
  - [ ] 修改: `src/services/native-websocket-proxy.service.ts`
    - 在 Origin 校验逻辑中，当 `!origin && NODE_ENV === 'production'` 时拒绝连接
    - 允许 localhost/127.0.0.1 的无 Origin 连接（工具客户端）

- [ ] Task 1.2: B4-1 /viewer 认证安全审查 (0.5h)
  - [ ] 编写测试: `src/tests/unit/security/viewer-session-enumeration.test.ts`
    - 验证 sessionId 为 UUID v4 格式
    - 验证随机猜测命中概率 < 10^-9
  - [ ] 修改: `src/routes/admin.routes.ts`
    - 在 `/viewer` 路由添加安全决策注释

- [ ] Task 1.3: G1-2 .env 文件泄露检查 (0.5h)
  - [ ] 编写测试: `src/tests/unit/security/env-file-not-tracked.test.ts`
    - `git ls-files` 输出不含 `.env` 文件
    - `.gitignore` 包含 `.env`、`.env.*`、`.env.*.local` 规则
  - [ ] 验证: `.gitignore` 已覆盖所有环境文件（已确认安全）

- [ ] Task 1.4: E4-1 截图尺寸限制 (1h)
  - [ ] 编写测试: `src/tests/unit/session-screenshot.test.ts`（扩展已有文件）
    - 测试大页面截图被缩放
    - 测试截图 buffer 大小有上限
  - [ ] 修改: `src/machine/browser.service.ts`
    - `takeScreenshot()` 添加 `maxScreenshopSize` 常量 (1920x1080)
    - 使用 `page.screenshot({ clip: ... })` 限制尺寸
  - [ ] 修改: `src/machine/session_handlers/stream.handler.ts`
    - `captureAndSend()` 同样限制截图尺寸

---

## Phase 2: 关键竞态条件验证 (~2h)

- [ ] Task 2.1: E1-1 credits-monitor 竞态并发测试 (2h)
  - [ ] 编写测试: `src/tests/integration/credits-monitor-race.test.ts`
    - 创建用户（余额 100 点）
    - 创建多个活跃会话
    - 并发调用 5 次 `checkSessionCredits()`
    - 验证最终积分 >= 0
    - 验证总扣减不超过原始余额
  - [ ] 审查: `src/models/user.model.ts` 中 `deductCredits()` 的 `WHERE credits >= amount` 原子性
    - 确认已用 `decrement` + `where` 条件防止超扣
    - 确认事务中的批量操作顺序正确
  - [ ] 审查: `src/services/credits-monitor.service.ts` 事务逻辑
    - 验证 `db.transaction()` 正确包裹 update + deduct
    - 验证事务失败时不影响其他用户处理

---

## Phase 3: 测试补充 (~5h)

- [ ] Task 3.1: C1-1 admin-storage.service.ts 单元测试 (2h)
  - [ ] 创建: `src/tests/unit/services/admin-storage.service.test.ts`
  - [ ] 测试 `getStorageStats()` — 按用户查询
  - [ ] 测试 `getStorageStats()` — 分页 + 排序
  - [ ] 测试 `cleanupUserData()` — 正常清理
  - [ ] 测试 `cleanupAllOldData()` — 按天数清理
  - [ ] 测试 `getSystemStorageStats()` — 系统级统计

- [ ] Task 3.2: C1-2 admin-test.service.ts 单元测试 (1h)
  - [ ] 创建: `src/tests/unit/services/admin-test.service.test.ts`
  - [ ] 测试 `createTestSessions()` — 正常创建
  - [ ] 测试 `createTestSessions()` — count=0 边界
  - [ ] 测试 `createTestMachines()` — 正常创建
  - [ ] 测试 `createTestMachines()` — count=0 边界

- [ ] Task 3.3: C2-1 user.service.ts 补充测试 (2h)
  - [ ] 修改: `src/tests/unit/services/user.service.test.ts`
  - [ ] 测试 `countAll()` — 返回用户总数
  - [ ] 测试 `sumAllCredits()` — 返回总积分
  - [ ] 测试 `countNewUsers(days)` — 按天数统计新用户
  - [ ] 测试 `findByUsername()` — 存在/不存在
  - [ ] 测试 `findByApiKey()` — 存在/不存在
  - [ ] 测试 `getCreditsStats()` — 总积分统计
  - [ ] 测试 `getUserSessionStats()` — 用户会话统计
  - [ ] 测试 `batchRecharge()` — 批量充值成功/部分失败
  - [ ] 测试 `batchDeleteUsers()` — 批量删除成功

---

## Phase 4: 代码质量改进 (~3.5h)

- [ ] Task 4.1: D6-1~4 死代码清理 (1.5h)
  - [ ] 分析: 使用 `grep -r "from.*['\"].*app['\"]"` 找到所有引用 `src/app.ts` 的文件
  - [ ] 分析: 找到所有引用其他 3 个 re-export 文件的消费者
  - [ ] 更新: 所有消费者 import 路径指向最终模块
    - `src/app.ts` → `src/manager/app.js`
    - `src/machine/grpc.service.ts` → `src/machine/grpc/index.js`
    - `src/services/machine-grpc.service.ts` → `src/services/machine-grpc/index.js`
    - `src/models/session.model.ts` → `src/models/session/index.js` + `src/models/session/types.js`
  - [ ] 删除: 4 个 re-export 文件
  - [ ] 验证: `pnpm build` 通过
  - [ ] 验证: `pnpm test:unit` 通过

- [ ] Task 4.2: G3-2 错误响应格式统一 (1h)
  - [ ] 分析: 使用 `grep` 找到所有返回 `{error:` 而非 `{success: false, error:` 的路由
  - [ ] 修改: 不一致的错误响应添加 `success: false` 字段
  - [ ] 测试: 在现有路由测试中验证响应格式

- [ ] Task 4.3: H2-1 + H2-2 日志级别调整 (0.5h)
  - [ ] 修改: `src/services/credits-monitor.service.ts`
    - "检查 X 个活跃会话" → `logger.debug`
    - "其中 X 个会话在在线机器上" → `logger.debug`
    - "有 X 个用户有活跃会话" → `logger.debug`
    - 保留 warn/error: "点数不足"、"标记无效会话时出错"
  - [ ] 修改: `src/services/machine-monitor.service.ts` — 同样原则
  - [ ] 修改: `src/controllers/auth.controller.ts` — 认证失败 `error` → `warn`
  - [ ] 验证: 手动检查日志输出级别正确

- [ ] Task 4.4: E3-2 数据库连接池配置审查 (0.5h)
  - [ ] 审查: `src/config/database.ts` pool 配置
  - [ ] 添加: 配置项注释说明 pool.min/max 的选择理由
  - [ ] 验证: SQLite 模式下 pool 配置合理（SQLite 单文件写入锁限制）

---

## Phase 5: 开发体验 (~1h)

- [ ] Task 5.1: G6-3 添加 dev:test 快捷命令 (0.5h)
  - [ ] 修改: `package.json` scripts 添加 `"dev:test": "NODE_ENV=test vitest run"`
  - [ ] 验证: `pnpm dev:test` 成功运行

- [ ] Task 5.2: 全量回归验证 (0.5h)
  - [ ] 运行: `pnpm build` — 构建通过
  - [ ] 运行: `pnpm test:unit` — 所有单元测试通过
  - [ ] 检查: 无新增 TypeScript 编译错误
  - [ ] 检查: 无新增 ESLint 错误

---

## Task Dependencies

```
Phase 1 (安全) ─────────────────────────────┐
  1.1 B3-1 WS Origin                        │
  1.2 B4-1 Viewer 认证                      │
  1.3 G1-2 .env 检查                        ├──→ Phase 5 (回归)
  1.4 E4-1 截图限制                         │
Phase 2 (竞态) ──────────────────────────────┤         │
  2.1 E1-1 竞态测试                         │         │
Phase 3 (测试) ──────────────────────────────┤         │
  3.1 C1-1 admin-storage 测试               │         │
  3.2 C1-2 admin-test 测试                  │         │
  3.3 C2-1 user.service 测试                │         │
Phase 4 (代码质量) ──────────────────────────┘         │
  4.1 D6-1~4 死代码清理 ──→ 4.2 G3-2 格式统一         │
  4.3 H2-1/2 日志级别                                  │
  4.4 E3-2 DB 连接池                                   │
Phase 5 (DX) ──────────────────────────────────────────┘
  5.1 G6-3 dev:test 命令
  5.2 全量回归验证
```

**关键依赖**:
- Task 4.1 (D6 死代码清理) 必须在 Phase 5 之前完成（影响 import 路径）
- Task 2.1 (E1-1) 独立于其他任务，可随时执行
- Phase 1 安全修复之间无依赖，可并行
- Phase 3 测试之间无依赖，可并行

---

## 验收标准

1. **安全**: WebSocket Origin 校验在生产环境有效；.env 文件未泄露到 git
2. **竞态**: 并发积分扣减测试通过，积分不超扣
3. **测试**: 新增测试文件 7 个，覆盖 15+ 个函数，所有测试通过
4. **构建**: `pnpm build` 零错误
5. **测试**: `pnpm test:unit` 零失败
6. **代码**: 4 个死代码文件已删除，import 路径已更新
7. **日志**: 常规检查日志为 debug 级别，异常为 warn/error
8. **格式**: 所有错误响应包含 `success: false` 字段
9. **截图**: 大页面截图限制在 1920x1080 以内
10. **DX**: `pnpm dev:test` 命令可用
