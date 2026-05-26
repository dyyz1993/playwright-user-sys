# Checklist - Batch 6: 安全加固 + 关键竞态修复 + 测试补充

## 安全修复

- [ ] B3-1: WebSocket 无 Origin 连接在生产环境被拒绝（返回 403）
- [ ] B3-1: WebSocket 无 Origin 连接在开发环境被允许
- [ ] B3-1: WebSocket 非法 Origin 在所有环境被拒绝
- [ ] B3-1: WebSocket 合法 Origin（localhost/127.0.0.1）被允许
- [ ] B3-1: 新增测试文件 `websocket-origin-validation.test.ts` 通过
- [ ] B4-1: `/viewer` 路由代码包含安全决策注释（sessionId 为 UUID v4）
- [ ] B4-1: 新增测试文件 `viewer-session-enumeration.test.ts` 通过
- [ ] G1-2: `git ls-files` 输出不含 `.env` 文件
- [ ] G1-2: 新增测试文件 `env-file-not-tracked.test.ts` 通过
- [ ] E4-1: 截图最大分辨率限制为 1920x1080
- [ ] E4-1: `takeScreenshot()` 中大页面截图被缩放
- [ ] E4-1: `captureAndSend()` 中大页面截图被缩放
- [ ] E4-1: 截图尺寸限制测试通过

## 竞态条件

- [ ] E1-1: `deductCredits()` 使用 `WHERE credits >= amount` 原子操作
- [ ] E1-1: 并发 5 次 `checkSessionCredits()` 积分不超扣
- [ ] E1-1: 并发扣减后最终积分 >= 0
- [ ] E1-1: 事务失败不影响其他用户处理
- [ ] E1-1: 新增测试文件 `credits-monitor-race.test.ts` 通过

## 测试覆盖

- [ ] C1-1: `admin-storage.service.test.ts` 文件已创建
- [ ] C1-1: `getStorageStats()` 有正常路径 + 错误路径测试
- [ ] C1-1: `cleanupUserData()` 有测试覆盖
- [ ] C1-1: `cleanupAllOldData()` 有测试覆盖
- [ ] C1-1: `getSystemStorageStats()` 有测试覆盖
- [ ] C1-2: `admin-test.service.test.ts` 文件已创建
- [ ] C1-2: `createTestSessions()` 有正常 + count=0 测试
- [ ] C1-2: `createTestMachines()` 有正常 + count=0 测试
- [ ] C2-1: `countAll()` 有测试
- [ ] C2-1: `sumAllCredits()` 有测试
- [ ] C2-1: `countNewUsers()` 有测试
- [ ] C2-1: `findByUsername()` 有存在/不存在测试
- [ ] C2-1: `findByApiKey()` 有存在/不存在测试
- [ ] C2-1: `getCreditsStats()` 有测试
- [ ] C2-1: `getUserSessionStats()` 有测试
- [ ] C2-1: `batchRecharge()` 有成功/部分失败测试
- [ ] C2-1: `batchDeleteUsers()` 有测试

## 代码质量

- [ ] D6: `src/app.ts` 已删除
- [ ] D6: `src/machine/grpc.service.ts` 已删除
- [ ] D6: `src/services/machine-grpc.service.ts` 已删除
- [ ] D6: `src/models/session.model.ts` 已删除
- [ ] D6: 所有消费者 import 路径已更新指向最终模块
- [ ] D6: 删除后 `pnpm build` 通过
- [ ] D6: 删除后 `pnpm test:unit` 通过
- [ ] G3-2: 所有错误响应包含 `success: false` 字段
- [ ] G3-2: 无残留的 `{error: string}` 格式（不含 `success` 字段）
- [ ] H2-1: credits-monitor 常规检查日志为 `logger.debug`
- [ ] H2-1: credits-monitor 异常日志保持 `logger.warn` / `logger.error`
- [ ] H2-1: machine-monitor 常规检查日志为 `logger.debug`
- [ ] H2-2: auth.controller 认证失败日志为 `logger.warn`
- [ ] H2-2: 认证失败日志不包含密码等敏感信息
- [ ] E3-2: `database.ts` pool 配置有注释说明
- [ ] E3-2: SQLite 模式 pool 配置合理（不过度分配连接）

## 开发体验

- [ ] G6-3: `package.json` 包含 `dev:test` 脚本
- [ ] G6-3: `pnpm dev:test` 成功执行 vitest 单元测试
- [ ] G6-3: 命令设置 `NODE_ENV=test`

## 回归验证

- [ ] `pnpm build` 零错误通过
- [ ] `pnpm test:unit` 零失败通过
- [ ] 无新增 TypeScript 编译错误
- [ ] 无新增 ESLint 错误
- [ ] 新增测试文件数量: 7 个
- [ ] 删除文件数量: 4 个
- [ ] 修改文件数量: ~15 个
