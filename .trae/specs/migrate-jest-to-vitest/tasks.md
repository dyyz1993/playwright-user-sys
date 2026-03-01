# Tasks

- [x] Task 1: 验证当前测试状态
  - [x] SubTask 1.1: 运行现有 Jest 测试，确保全部通过
  - [x] SubTask 1.2: 运行现有 Vitest 测试，确保全部通过
  - [x] SubTask 1.3: 记录测试通过数量作为基准

- [x] Task 2: 迁移使用 @jest/globals 的测试文件
  - [x] SubTask 2.1: 迁移 `src/tests/integration/credits-deduction.test.ts`
  - [x] SubTask 2.2: 迁移 `src/tests/integration/credits-monitor.test.ts`
  - [x] SubTask 2.3: 迁移 `src/tests/sdk/client.test.ts`

- [x] Task 3: 迁移使用全局 Jest API 的测试文件
  - [x] SubTask 3.1: 迁移 `src/tests/api/admin-auth.test.ts`
  - [x] SubTask 3.2: 迁移 `src/tests/api/admin-credits-add.test.ts`
  - [x] SubTask 3.3: 迁移 `src/tests/api/admin-credits.test.ts`
  - [x] SubTask 3.4: 迁移 `src/tests/api/admin-dashboard-stats.test.ts`
  - [x] SubTask 3.5: 迁移 `src/tests/api/admin-machine-management.test.ts`
  - [x] SubTask 3.6: 迁移 `src/tests/api/admin-session-management.test.ts`
  - [x] SubTask 3.7: 迁移 `src/tests/api/admin-user-management.test.ts`
  - [x] SubTask 3.8: 迁移 `src/tests/api/error-response.test.ts`
  - [x] SubTask 3.9: 迁移 `src/tests/integration/admin-dashboard-page.test.ts`
  - [x] SubTask 3.10: 迁移 `src/tests/routes/admin-api.routes.test.ts`
  - [x] SubTask 3.11: 迁移 `src/tests/utils/response.test.ts`

- [x] Task 4: 更新 vitest.config.ts 配置
  - [x] SubTask 4.1: 确保配置覆盖所有测试目录
  - [x] SubTask 4.2: 添加必要的 setupFiles 配置

- [x] Task 5: 更新 package.json
  - [x] SubTask 5.1: 更新测试脚本使用 Vitest
  - [x] SubTask 5.2: 移除 Jest 相关依赖
  - [x] SubTask 5.3: 移除 Jest 相关脚本

- [x] Task 6: 删除 Jest 配置文件
  - [x] SubTask 6.1: 删除 `jest.config.cjs`
  - [x] SubTask 6.2: 删除 `jest.config.js`
  - [x] SubTask 6.3: 删除 `jest.integration.config.mjs`

- [x] Task 7: 验证迁移结果
  - [x] SubTask 7.1: 运行所有 Vitest 测试，确保全部通过
  - [x] SubTask 7.2: 验证测试数量与迁移前一致
  - [x] SubTask 7.3: 确认无 Jest 残留引用

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1]
- [Task 4] depends on [Task 2, Task 3]
- [Task 5] depends on [Task 4]
- [Task 6] depends on [Task 5]
- [Task 7] depends on [Task 6]
