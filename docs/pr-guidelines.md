# PR 检查规范

## 强制要求（Branch Protection Rules）

以下规则需要在 GitHub repo Settings > Branches > Add rule 中配置：

### 1. 受保护分支

- `main`
- `develop`

### 2. 要求合并前检查通过

- ✅ 构建通过（`pnpm build`）
- ✅ 单元测试通过（`pnpm test:unit`）
- ✅ ESLint 通过（`pnpm lint`）

### 3. 要求最新代码

- 要求在合并前更新分支（Require branches to be up-to-date）

### 4. 要求审核

- 至少 1 个 reviewer approve
- 可选的：要求来自 CODEOWNERS

### 5. 不允许直接推送

- 不允许直接 push 到受保护分支（需要通过 PR）
