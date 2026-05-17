# 类型问题清单

> 生成时间: 2026-05-16
> 扫描范围: `src/`（含 `src/tests/`）
> 当前基线: `: any`=1, `as any`=0, `<any>`=0

## 目录

- [P0: 源码 any（1 个）](#p0-源码-any-1-个)
- [P1: 测试文件 any（411 个）](#p1-测试文件-any-411-个)
- [P2: 类型断言 as X 优化（185 个）](#p2-类型断言-as-x-优化-185-个)
- [P3: 非 null 断言优化（14 个）](#p3-非-null-断言优化-14-个)
- [P4: Record<string, unknown> 审计](#p4-recordstring-unknown-审计)
- [P5: 函数返回类型补全](#p5-函数返回类型补全)
- [P6: @ts-expect-error 消除](#p6-ts-expect-error-消除)
- [P7: 配置与基础设施](#p7-配置与基础设施)

---

## P0: 源码 any（1 个）

| 难度 | 风险 | 备注 |
|------|------|------|
| ⭐☆☆ | 🟢 低 | 类型声明文件，可以保留 |

- [ ] `src/types/grpc-proto-loader.d.ts:16` — `[name: string]: any` 索引签名
  - 这是 `@grpc/grpc-js` `PackageDefinition` 的类型声明
  - 索引签名必须兼容 `string→any` 才能被 gRPC 使用
  - **建议：保留**（加注释说明原因）

---

## P1: 测试文件 any（411 个）

> 所有测试文件的 `: any`、`as any`、`<any>` 总计

### P1-A: 单元测试（295 个）

| 文件 | any 数 | 难度 | 风险 | 备注 |
|------|--------|------|------|------|
| `src/tests/unit/controllers/machine.controller.test.ts` | 78 | ⭐⭐⭐ | 🔴 高 | mock 对象 + Fastify 类型最复杂 |
| `src/tests/unit/controllers/file.controller.test.ts` | 37 | ⭐⭐⭐ | 🔴 高 | fs mock + Fastify 类型 |
| `src/tests/unit/controllers/session.controller.test.ts` | 31 | ⭐⭐⭐ | 🔴 高 | 多层 service mock |
| `src/tests/unit/controllers/user.controller.test.ts` | 22 | ⭐⭐⭐ | 🔴 高 | AuthenticatedRequest 泛型 |
| `src/tests/unit/services/memory-store.service.test.ts` | 20 | ⭐⭐ | 🟡 中 | 私有属性访问问题 |
| `src/tests/unit/machine/grpc/connection-manager.test.ts` | 13 | ⭐⭐ | 🟡 中 | gRPC mock |
| `src/tests/unit/controllers/auth.controller.test.ts` | 13 | ⭐⭐ | 🟡 中 | 登录 mock |
| `src/tests/unit/services/session.service.test.ts` | 10 | ⭐⭐ | 🟡 中 | |
| `src/tests/unit/services/admin-session.service.test.ts` | 10 | ⭐⭐ | 🟡 中 | |
| `src/tests/unit/services/storage.service.test.ts` | 9 | ⭐⭐ | 🟡 中 | |
| `src/tests/unit/services/demo.service.test.ts` | 9 | ⭐⭐ | 🟡 中 | |
| `src/tests/unit/services/user.service.test.ts` | 8 | ⭐⭐ | 🟡 中 | |
| `src/tests/unit/services/machine-monitor.service.test.ts` | 8 | ⭐⭐ | 🟡 中 | |
| `src/tests/unit/services/auth.service.test.ts` | 8 | ⭐⭐ | 🟡 中 | |
| `src/tests/unit/services/native-websocket-proxy.service.test.ts` | 7 | ⭐⭐ | 🟡 中 | |
| 其余 ~20 个测试文件 | 各 1-6 | ⭐ | 🟢 低 | |

- [ ] **P1-A-1**: `machine.controller.test.ts` — 为 mock 对象创建 Fastify 类型工厂函数
- [ ] **P1-A-2**: `file.controller.test.ts` — 用 `vi.importActual` 拆分 fs mock 类型
- [ ] **P1-A-3**: `session.controller.test.ts` — 用 `vi.mock(..., () => ({...}))` 替代动态 mock
- [ ] **P1-A-4**: `user.controller.test.ts` — 用 `AuthenticatedRequest` 取代 `Record<string, unknown>`
- [ ] **P1-A-5**: `memory-store.service.test.ts` — 处理私有属性访问（用 `as unknown as` + interface）
- [ ] **P1-A-6**: 其余测试文件 — 统一用 `MockedFunction` 类型

### P1-B: 集成测试（116 个）

| 文件 | any 数 | 难度 | 风险 | 备注 |
|------|--------|------|------|------|
| `src/tests/integration/routes/machine-api.routes.test.ts` | 17 | ⭐⭐ | 🟡 中 | |
| `src/tests/integration/routes/session-api.routes.test.ts` | 14 | ⭐⭐ | 🟡 中 | |
| `src/tests/integration/routes/credit-api.routes.test.ts` | 14 | ⭐⭐ | 🟡 中 | |
| `src/tests/integration/routes/user-api.routes.test.ts` | 12 | ⭐⭐ | 🟡 中 | |
| 其余 ~10 个集成测试文件 | 各 1-7 | ⭐ | 🟡 中 | |

- [ ] **P1-B-1**: 集成测试统一类型工厂

---

## P2: 类型断言 as X 优化（185 个）

> 源码（非测试）中的 `as SomeType` 断言

### P2-A: Puppeteer 类型（41 个）

| 文件 | 数量 | 难度 | 风险 | 备注 |
|------|------|------|------|------|
| `src/machine/browser.service.ts` | 19 | ⭐⭐⭐ | 🔴 高 | 双 puppeteer-core 依赖冲突 |
| `src/machine/session_handlers/events.handler.ts` | 15 | ⭐⭐ | 🟡 中 | keyboard.press type 兼容 |
| `src/machine/services/browser-inject.service.ts` | 7 | ⭐⭐ | 🟡 中 | uploadFile ElementHandle |

- [ ] **P2-A-1**: 解决双 `puppeteer-core` 依赖冲突（`package.json` 去重）
- [ ] **P2-A-2**: `events.handler.ts` key 类型用 `Parameters<Page['keyboard']['press']>[0]`
- [ ] **P2-A-3**: `browser-inject.service.ts` 用 `ElementHandle<HTMLInputElement>` 替代 `as HTMLElement`

### P2-B: 数据库模型类型（38 个）

| 文件 | 数量 | 难度 | 风险 | 备注 |
|------|------|------|------|------|
| `src/models/request-log.model.ts` | 11 | ⭐⭐ | 🟡 中 | Knex 行类型 |
| `src/models/user.model.ts` | 10 | ⭐⭐ | 🟡 中 | DB 行→Domain 对象 |
| `src/models/session/session-paginate.model.ts` | 9 | ⭐⭐ | 🟡 中 | 分页查询类型 |
| `src/models/session/session-stats.model.ts` | 8 | ⭐⭐ | 🟡 中 | 统计查询类型 |

- [ ] **P2-B-1**: 为 Knex 查询结果创建 `Row`/`DbRow` 类型（替代 `as SomeModel`）
- [ ] **P2-B-2**: 用 Zod 验证替代 `as SessionCreateOptions` 模式

### P2-C: JSON.parse 类型（7 个）

- [ ] **P2-C-1**: `src/models/operation-log.model.ts` — `JSON.parse` 后用 Zod parse 替代 `as Record<...>`
- [ ] **P2-C-2**: `src/models/session/types.ts` — `JSON.parse(config)` 用 Zod
- [ ] **P2-C-3**: `src/services/native-websocket-proxy.service.ts` — 同上

### P2-D: 路由/控制器类型（99 个）

- [ ] **P2-D-1**: `src/routes/admin.routes.ts` — `as IdParamRoute` 类型参数（难度 ⭐⭐，风险 🟡 中）
- [ ] **P2-D-2**: `src/routes/user.routes.ts` — 路由泛型断言（难度 ⭐⭐，风险 🟡 中）
- [ ] **P2-D-3**: 各 controller 文件 — `as any` 已清零，但 `as Record<...>` 仍需审计

---

## P3: 非 null 断言优化（14 个）

> 源码（非测试）中的 `!` 操作符

| 文件 | 数量 | 难度 | 风险 | 备注 |
|------|------|------|------|------|
| `src/machine/browser.service.ts` | 7 | ⭐⭐ | 🔴 高 | `result.args!.push(...)` — args 可能为 undefined |
| `src/services/session.service.ts` | 2 | ⭐⭐ | 🟡 中 | `userAfterSettlement!.credits` |
| `src/services/demo.service.ts` | 3 | ⭐⭐ | 🟡 中 | `user!.id`— 空安全 |
| `src/plugins/auth.plugin.ts` | 1 | ⭐ | 🟢 低 | `authHeader!.split(' ')` |
| `src/machine/health.service.ts` | 1 | ⭐ | 🟢 低 | `server!.close(...)` |

- [ ] **P3-1**: `browser.service.ts` — `result.args!.push(...)` 改为 `if (result.args) result.args.push(...)`（难度 ⭐⭐，风险 🔴 高）
- [ ] **P3-2**: `session.service.ts` — `userAfterSettlement!.credits` 改为用 guard（难度 ⭐，风险 🟢 低）
- [ ] **P3-3**: `demo.service.ts` — `user!.id` 改为 `if (!user) throw ...` 模式（难度 ⭐，风险 🟢 低）
- [ ] **P3-4**: `auth.plugin.ts` — `authHeader!.split` 改为 guard（难度 ⭐，风险 🟢 低）
- [ ] **P3-5**: `health.service.ts` — `server!.close(...)` 用 optional chaining（难度 ⭐，风险 🟢 低）
- [ ] **P3-6**: `events.handler.ts:368` — `contentWindow!.document.activeElement` 用 null check（难度 ⭐，风险 🟡 中）

---

## P4: Record<string, unknown> 审计

> `Record<string, unknown>` 是好签名，但如果滥用就变成了隐式 any

| 文件 | 出现次数 | 难度 | 风险 | 备注 |
|------|----------|------|------|------|
| `src/machine/browser.service.ts` | 5 | ⭐⭐ | 🟡 中 | SessionConfig 等处 |
| `src/services/machine-grpc/connection-manager.ts` | 4 | ⭐⭐ | 🟡 中 | |
| `src/models/operation-log.model.ts` | 4 | ⭐⭐ | 🟡 中 | |
| `src/services/native-websocket-proxy.service.ts` | 3 | ⭐⭐ | 🟡 中 | |
| `src/shared/utils/logger.ts` | 2 | ⭐ | 🟢 低 | |
| 其余 ~20 个文件 | 各 1-2 | ⭐ | 🟢 低 | |

- [ ] **P4-1**: 审查 `Record<string, unknown>` 是否可以替换为具体类型
- [ ] **P4-2**: `operation-log.model.ts` — `metadata` 用 Zod schema 替代

---

## P5: 函数返回类型补全

> 公共/exported 函数缺少显式返回类型

| 文件 | 缺失的函数 | 难度 | 风险 |
|------|-----------|------|------|
| `src/services/memory-store.service.ts:201` | `getAllMachines()` | ⭐ | 🟢 低 |
| `src/services/memory-store.service.ts:208` | `getOnlineMachines()` | ⭐ | 🟢 低 |
| `src/services/memory-store.service.ts:258` | `getAllSessions()` | ⭐ | 🟢 低 |
| `src/services/memory-store.service.ts:265` | `getActiveSessions()` | ⭐ | 🟢 低 |
| `src/services/demo.service.ts:151` | `getSessionStatus()` | ⭐ | 🟢 低 |
| `src/services/machine-grpc/service-handlers.ts:103` | 匿名 `.then` lambda | ⭐ | 🟢 低 |

- [ ] **P5-1**: 补充 6 个缺失的返回类型声明（难度 ⭐，风险 🟢 低）

---

## P6: @ts-expect-error 消除（2 个）

| 位置 | 原因 | 难度 | 风险 |
|------|------|------|------|
| `src/plugins/index.ts:39` | fastify-helmet Fastify v5 兼容 | ⭐⭐⭐ | 🔴 高 |
| `src/plugins/index.ts:77` | CORS origin 回调类型不匹配 | ⭐⭐ | 🟡 中 |

- [ ] **P6-1**: 当 fastify-helmet 更新到支持 Fastify v5 时移除（等待外部更新）
- [ ] **P6-2**: CORS origin 回调类型 —— 用 `declare module` 扩展类型（难度 ⭐⭐）

---

## P7: 配置与基础设施

- [ ] **P7-1**: 更新 `scripts/check-type-safety.sh` 的 `MAX_ALLOWED` 基线（当前 1 any，可以降到 1）
- [ ] **P7-2**: 添加 `pnpm test:types` 命令（运行 `tsc --noEmit` + 类型安全检查）
- [ ] **P7-3**: CI 配置中增加类型安全门禁步骤

---

## 汇总统计

| 类别 | 总计 | 已修复 | 剩余 |
|------|------|--------|------|
| 源码 `: any` / `as any` / `<any>` | 1 | 0 | **1** |
| 测试 `: any` / `as any` / `<any>` | 411 | 0 | **411** |
| `@ts-ignore` | 13 | 13 | **0** |
| `@ts-expect-error` | 2 | 0 | **2** |
| 非 null 断言 `!`（源码） | 14 | 0 | **14** |
| 类型断言 `as X`（源码） | 185 | 0 | **185** |
| 函数无返回类型（源码） | 6 | 0 | **6** |
| catch 缺少 `: unknown` | 277 | 277 | **0** |
| 空 catch 块 | 6 | 6 | **0** |

## 推荐修复顺序

```
1. P3 (非 null 断言) — 低风险、容易修复、防止运行时崩溃
2. P2-C (JSON.parse Zod 化) — 中风险、防止运行时数据错误
3. P1-B (集成测试 any) — 中风险、提升测试类型安全
4. P2-B (DB 模型类型) — 中风险、提升核心层类型
5. P1-A (单元测试 any) — 高风险、需要大量 mock 类型上下文
6. P2-A (Puppeteer 类型) — 高风险、依赖双 puppeteer 去重
```
