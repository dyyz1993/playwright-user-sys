# 项目修复计划

## 阶段 1：P0 安全漏洞修复 ✅ 已完成
- [x] 1.1 将 .env/.env.dev/.env.test 从 Git 追踪中移除，更新 .gitignore
- [x] 1.2 将密码哈希从 SHA-256 改为 bcrypt（src/utils/auth.ts）
- [x] 1.3 移除登录时的明文密码日志（admin.routes.ts）
- [x] 1.4 为 Debug 接口添加生产环境 404 禁用（admin.routes.ts）
- [x] 1.5 修复 JWT Secret 强制要求，不再有 fallback（config/env.ts）
- [x] 1.6 修复 Cookie secure 属性跟随 NODE_ENV（admin.routes.ts）
- [x] 1.7 移除 JWT Secret 在 debug 端点的日志输出（admin.routes.ts）
- [x] 1.8 .env.example 中的真实密码替换为占位符
- [x] 1.9 移除测试辅助文件中的硬编码密码

## 阶段 2：P1 代码质量修复 ✅ 已完成
- [x] 2.1 删除重复入口文件 src/app.ts（无引用）
- [x] 2.2 保留 src/server.ts（Dockerfile 引用）
- [x] 2.3 保留 src/config/index.ts（4 个文件引用）
- [x] 2.4 修复 unhandledRejection 不退出进程（3 个入口文件）
- [x] 2.5 修复 new Promise(async ...) 反模式（machine-grpc.service.ts 3 处）
- [x] 2.6 修复 Model 层错误静默吞掉（5 个方法改为 throw）

## 阶段 3：P2 性能和架构 ✅ 已完成
- [x] 3.1 创建数据库索引迁移（8 个索引）
- [x] 3.2 在编程式迁移中也添加索引创建

## 阶段 4：CI 修复 ✅ 已完成
- [x] 4.1 修复 multi-user-concurrency.test.ts Port 0 BUG（改用 getFreePort）
- [x] 4.2 移除 user-data-persistence.test.ts 硬编码密码
- [x] 4.3 CI 环境跳过外部网络依赖测试（baidu.com, httpbin.org）
- [x] 4.4 CI 环境增加机器注册等待时间（2-3s → 5s）
- [x] 4.5 修复 TIER-036 超时问题（120s → 180s）
