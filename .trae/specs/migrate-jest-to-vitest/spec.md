# Jest 迁移到 Vitest 规范

## Why
项目同时使用 Jest 和 Vitest 两个测试框架，增加了维护成本和依赖复杂度。统一使用 Vitest 可以简化配置、提升测试速度、并减少依赖数量。

## What Changes
- 将所有使用 `@jest/globals` 的测试文件迁移到 Vitest
- 将所有 `jest.fn()`、`jest.mock()` 等 Jest API 替换为 Vitest 等效 API
- 删除 Jest 相关配置文件和依赖
- 更新 package.json 中的测试脚本

## Impact
- Affected specs: 测试框架配置
- Affected code:
  - `src/tests/integration/credits-deduction.test.ts`
  - `src/tests/integration/credits-monitor.test.ts`
  - `src/tests/sdk/client.test.ts`
  - `src/tests/api/*.test.ts` (使用全局 Jest API 的文件)
  - `jest.config.cjs`
  - `jest.config.js`
  - `jest.integration.config.mjs`
  - `vitest.config.ts`
  - `package.json`

## ADDED Requirements

### Requirement: 统一测试框架为 Vitest
系统应使用 Vitest 作为唯一的测试框架，所有测试文件必须使用 Vitest API。

#### Scenario: Jest API 迁移
- **WHEN** 测试文件使用 `@jest/globals` 导入
- **THEN** 应替换为 `vitest` 导入

#### Scenario: Jest Mock 迁移
- **WHEN** 测试文件使用 `jest.fn()` 或 `jest.mock()`
- **THEN** 应替换为 `vi.fn()` 或 `vi.mock()`

#### Scenario: 全局 Jest API 迁移
- **WHEN** 测试文件使用全局 `describe`、`it`、`expect`、`beforeAll` 等
- **THEN** 应从 `vitest` 显式导入这些函数

### Requirement: 清理 Jest 相关配置和依赖
系统应移除所有 Jest 相关的配置文件和 npm 依赖。

#### Scenario: 删除配置文件
- **WHEN** 存在 `jest.config.cjs`、`jest.config.js`、`jest.integration.config.mjs`
- **THEN** 应删除这些文件

#### Scenario: 移除 npm 依赖
- **WHEN** package.json 包含 jest、ts-jest、babel-jest、@types/jest 依赖
- **THEN** 应移除这些依赖

### Requirement: 更新测试脚本
系统应更新 package.json 中的测试脚本以使用 Vitest。

#### Scenario: 统一测试命令
- **WHEN** 执行 `npm test`
- **THEN** 应运行 Vitest 而非 Jest

## MODIFIED Requirements

### Requirement: Vitest 配置扩展
Vitest 配置应覆盖所有测试目录，包括之前由 Jest 管理的测试文件。

## REMOVED Requirements

### Requirement: Jest 测试框架支持
**Reason**: 统一使用 Vitest 作为唯一测试框架
**Migration**: 所有 Jest 测试迁移到 Vitest
