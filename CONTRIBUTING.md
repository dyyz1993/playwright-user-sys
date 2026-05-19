# 贡献指南

感谢你对 Playwright User Sys 项目的关注！

## 开发环境搭建

### 前置要求
- Node.js 20+
- pnpm 10+

### 快速开始
```bash
git clone https://github.com/dyyz1993/playwright-user-sys.git
cd playwright-user-sys
pnpm install
cp .env.dev.example .env.dev
pnpm dev
```

## 开发流程

1. Fork 仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交改动 (`git commit -m 'feat: add amazing feature'`)
4. 推送分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` 新功能
- `fix:` 修复 bug
- `docs:` 文档变更
- `refactor:` 代码重构
- `test:` 测试相关
- `chore:` 构建/工具变更

## 代码规范

- TypeScript strict mode（运行 `pnpm build` 检查类型）
- ESLint + Prettier（运行 `pnpm lint` 检查）
- 所有用户输入必须验证（Zod schema）
- 禁止 `any` 类型（除第三方库必需）
- 错误必须处理，禁止空 catch

## 测试要求

- 新功能必须有对应测试
- 运行 `pnpm test:unit` 确保通过
- 提交前运行 `pnpm check:all`

## PR 检查清单

- [ ] 代码通过 lint 和类型检查
- [ ] 新功能有对应测试
- [ ] 没有引入新的 `any` 类型
- [ ] 提交信息遵循 Conventional Commits
- [ ] 文档已更新（如适用）

## 问题反馈

- 使用 GitHub Issues 报告 bug
- 提供复现步骤和环境信息
- 标注合适的 label
