# TSX 运行时路径映射支持修复总结

## 任务完成

已成功修复 tsx 运行时对 `@shared/*` 等路径别名的支持问题。

## 问题描述

- **问题**: tsx 4.19.4 不支持 `tsconfig.json` 中配置的 `paths` 别名
- **表现**: 运行时报错 `Cannot find module '@shared/utils/logger.js'`
- **影响**: 步骤1重构中创建的 `src/shared/` 目录无法通过 `@shared/*` 别名导入

## 解决方案

采用**符号链接 (symlink)** 方案，在 `node_modules/` 中创建指向实际目录的符号链接。

### 实现细节

1. **创建设置脚本** (`scripts/setup-aliases.sh`)
   - 读取 `tsconfig.json` 中的 `paths` 配置
   - 在 `node_modules/` 中创建对应的符号链接
   - 支持所有路径别名: `@shared/*`, `@manager/*`, `@machine/*`, `@/*`

2. **配置自动化执行**
   - 在 `package.json` 中添加 `pre*` 脚本
   - 每个使用 `tsx` 的命令都会自动先执行设置脚本
   - 用户无需手动干预，透明化处理

3. **创建的符号链接**
   ```bash
   node_modules/@       → src/
   node_modules/@shared → src/shared/
   node_modules/@manager → src/manager/
   node_modules/@machine → src/machine/
   ```

## 文件修改清单

### 新增文件
- `/Users/xuyingzhou/Project/study-node-ts/playwright-user-sys/scripts/setup-aliases.sh` - 路径别名设置脚本
- `/Users/xuyingzhou/Project/study-node-ts/playwright-user-sys/docs/tsx-path-mapping-setup.md` - 详细文档

### 修改文件
- `/Users/xuyingzhou/Project/study-node-ts/playwright-user-sys/package.json` - 添加 `pre*` 脚本

### 添加的 npm 脚本

所有使用 `tsx` 的脚本都添加了对应的 `pre*` 前置脚本：

```json
"predev": "bash scripts/setup-aliases.sh"
"predev:server": "bash scripts/setup-aliases.sh"
"predev:machine": "bash scripts/setup-aliases.sh"
"predev:minimal": "bash scripts/setup-aliases.sh"
"pretest:sqlite": "bash scripts/setup-aliases.sh"
"pretest:mysql": "bash scripts/setup-aliases.sh"
"prestart:server": "bash scripts/setup-aliases.sh"
"prestart:machine": "bash scripts/setup-aliases.sh"
"precreate-test-user": "bash scripts/setup-aliases.sh"
"preclient-demo": "bash scripts/setup-aliases.sh"
"premigrate": "bash scripts/setup-aliases.sh"
"premigrate:proxy-port": "bash scripts/setup-aliases.sh"
"preverify-credits": "bash scripts/setup-aliases.sh"
"pretest:sdk": "bash scripts/setup-aliases.sh"
"setup:aliases": "bash scripts/setup-aliases.sh"  // 手动执行命令
```

## 验证结果

### 测试1: 基本路径别名解析
```bash
# 创建测试文件
import { logger } from '@shared/utils/logger.js';
logger.info('SUCCESS: Path alias @shared/* is working!');

# 运行测试
npx tsx test-alias.ts

# 结果: 成功! 无别名错误
```

### 测试2: 所有路径别名
```bash
# 测试 @shared, @manager, @machine 等所有别名
npx tsx test-all-aliases.ts

# 结果: 成功! 所有别名正常工作
```

### 测试3: 实际服务启动
```bash
# 启动开发服务器
pnpm dev

# 结果: 无 "Cannot find module '@shared/*'" 错误
# 服务器正常启动
```

## 使用方式

### 正常开发（推荐）
```bash
pnpm dev           # 自动设置别名并启动开发服务器
pnpm dev:server    # 启动管理端服务
pnpm dev:machine   # 启动机器端服务
```

### 手动设置别名
```bash
pnpm setup:aliases
```

### 验证别名设置
```bash
ls -la node_modules/@shared
# 应显示: @shared -> /path/to/src/shared
```

## 方案优势

1. **零外部依赖**: 不需要安装额外的包 (如 tsconfig-paths)
2. **兼容性好**: 利用 Node.js 原生模块解析机制
3. **自动化**: 透明化处理，用户无感知
4. **可维护**: 脚本可复用，易于调试
5. **幂等性**: 可重复执行，不会产生副作用

## 其他方案对比

| 方案 | 优点 | 缺点 | 选择结果 |
|------|------|------|----------|
| tsconfig-paths | 标准方案 | 需要额外包，lockfile损坏 | ❌ 未采用 |
| tsx升级(4.17+) | 原生支持 | 需要更新依赖，兼容性未知 | ❌ 未采用 |
| tsc-alias | 编译时处理 | 需要修改构建流程 | ❌ 未采用 |
| **symlink方案** | **简单可靠，零依赖** | **需要设置步骤** | ✅ **已采用** |

## 注意事项

1. **不要直接运行 tsx**: 始终使用 `pnpm dev` 等脚本，确保别名设置
2. **Git忽略**: 符号链接会被 Git 识别，但不会提交到仓库（在 .gitignore 中）
3. **跨平台**: 符号链接在 Windows 上需要管理员权限或开发者模式
4. **IDE支持**: 大多数 IDE (如 VSCode) 会自动识别符号链接

## 故障排查

如果遇到 "Cannot find module" 错误：

1. **重新设置别名**
   ```bash
   pnpm setup:aliases
   ```

2. **检查符号链接**
   ```bash
   ls -la node_modules/@shared
   ```

3. **验证 tsconfig.json 配置**
   ```bash
   cat tsconfig.json | grep -A5 paths
   ```

4. **清理并重新安装**
   ```bash
   rm -rf node_modules/@shared node_modules/@manager node_modules/@machine
   pnpm setup:aliases
   ```

## 后续优化建议

1. 考虑在项目 README 中添加路径别名使用说明
2. 如果 tsx 后续版本原生支持 paths，可以移除此方案
3. 对于 Windows 用户，可以提供备用方案（如使用 junction）

## 总结

✅ **任务完成**: tsx 运行时路径映射支持已修复
✅ **测试通过**: 所有路径别名正常工作
✅ **文档完善**: 已添加详细使用说明
✅ **无副作用**: 不影响现有功能

项目现在可以正常使用 `@shared/*` 等路径别名进行开发了！
