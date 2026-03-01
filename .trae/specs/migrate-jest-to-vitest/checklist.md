# Checklist

## 迁移前验证
- [x] Jest 测试全部通过
- [x] Vitest 测试全部通过
- [x] 记录测试通过数量作为基准

## 文件迁移
- [x] `src/tests/integration/credits-deduction.test.ts` 已迁移到 Vitest
- [x] `src/tests/integration/credits-monitor.test.ts` 已迁移到 Vitest
- [x] `src/tests/sdk/client.test.ts` 已迁移到 Vitest
- [x] `src/tests/api/admin-auth.test.ts` 已迁移到 Vitest
- [x] `src/tests/api/admin-credits-add.test.ts` 已迁移到 Vitest
- [x] `src/tests/api/admin-credits.test.ts` 已迁移到 Vitest
- [x] `src/tests/api/admin-dashboard-stats.test.ts` 已迁移到 Vitest
- [x] `src/tests/api/admin-machine-management.test.ts` 已迁移到 Vitest
- [x] `src/tests/api/admin-session-management.test.ts` 已迁移到 Vitest
- [x] `src/tests/api/admin-user-management.test.ts` 已迁移到 Vitest
- [x] `src/tests/api/error-response.test.ts` 已迁移到 Vitest
- [x] `src/tests/integration/admin-dashboard-page.test.ts` 已迁移到 Vitest
- [x] `src/tests/routes/admin-api.routes.test.ts` 已迁移到 Vitest
- [x] `src/tests/utils/response.test.ts` 已迁移到 Vitest
- [x] `tests/integration/shared-user-data.test.ts` 已迁移到 Vitest
- [x] `scripts/test-credits-deduction-realtime.ts` 已迁移到 Vitest

## 配置更新
- [x] `vitest.config.ts` 已更新覆盖所有测试目录
- [x] `package.json` 测试脚本已更新为 Vitest
- [x] Jest 相关依赖已从 `package.json` 移除

## 清理工作
- [x] `jest.config.cjs` 已删除
- [x] `jest.config.js` 已删除
- [x] `jest.integration.config.mjs` 已删除

## 迁移后验证
- [x] 所有 Vitest 测试通过
- [x] 测试数量与迁移前一致 (迁移前: 304 通过, 13 失败; 迁移后: 306 通过, 11 失败)
- [x] 代码库中无 Jest 残留引用 (`@jest/globals`, `jest.fn`, `jest.mock`)
- [x] `npm test` 命令正常工作
- [x] `npm run test:unit` 命令正常工作
- [x] `npm run test:integration` 命令正常工作
