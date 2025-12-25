/**
 * 步骤5集成测试验证脚本
 *
 * 验证重构后的代码结构和导入关系
 */

import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// 测试计数器
let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  testsRun++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    testsPassed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
    testsFailed++;
  }
}

console.log('\n=== 步骤5集成测试验证 ===\n');

// 1. 验证文件结构
console.log('1. 验证文件结构');

test('src/manager/server.ts 存在', () => {
  const path = join(rootDir, 'src/manager/server.ts');
  assert.ok(existsSync(path), '文件不存在');
});

test('src/manager/app.ts 存在', () => {
  const path = join(rootDir, 'src/manager/app.ts');
  assert.ok(existsSync(path), '文件不存在');
});

test('src/machine/server.ts 存在', () => {
  const path = join(rootDir, 'src/machine/server.ts');
  assert.ok(existsSync(path), '文件不存在');
});

test('src/machine/app.ts 存在', () => {
  const path = join(rootDir, 'src/machine/app.ts');
  assert.ok(existsSync(path), '文件不存在');
});

test('src/shared 目录存在', () => {
  const path = join(rootDir, 'src/shared');
  assert.ok(existsSync(path), '目录不存在');
});

// 2. 验证向后兼容文件
console.log('\n2. 验证向后兼容文件');

test('src/server.ts 存在 (向后兼容)', () => {
  const path = join(rootDir, 'src/server.ts');
  assert.ok(existsSync(path), '文件不存在');
});

test('src/machine/index.ts 存在 (向后兼容)', () => {
  const path = join(rootDir, 'src/machine/index.ts');
  assert.ok(existsSync(path), '文件不存在');
});

// 3. 验证配置文件
console.log('\n3. 验证配置文件');

test('tsconfig.json 包含路径映射', () => {
  const path = join(rootDir, 'tsconfig.json');
  const content = readFileSync(path, 'utf-8');
  const config = JSON.parse(content);

  assert.ok(config.compilerOptions?.paths, 'paths 配置不存在');
  assert.ok(config.compilerOptions.paths['@shared/*'], '@shared/* 路径映射不存在');
  assert.ok(config.compilerOptions.paths['@manager/*'], '@manager/* 路径映射不存在');
  assert.ok(config.compilerOptions.paths['@machine/*'], '@machine/* 路径映射不存在');
});

test('package.json 脚本更新为新入口点', () => {
  const path = join(rootDir, 'package.json');
  const content = readFileSync(path, 'utf-8');
  const pkg = JSON.parse(content);

  assert.ok(pkg.scripts.dev, 'dev 脚本不存在');
  assert.ok(pkg.scripts.dev.includes('src/manager/server.ts'), 'dev 未使用新入口点');
  assert.ok(pkg.scripts['dev:machine'], 'dev:machine 脚本不存在');
  assert.ok(pkg.scripts['dev:machine'].includes('src/machine/server.ts'), 'dev:machine 未使用新入口点');
});

// 4. 验证共享代码
console.log('\n4. 验证共享代码');

test('src/shared/protos/machine_service.proto 存在', () => {
  const path = join(rootDir, 'src/shared/protos/machine_service.proto');
  assert.ok(existsSync(path), 'proto文件不存在');
});

test('src/shared/types/index.ts 存在', () => {
  const path = join(rootDir, 'src/shared/types/index.ts');
  assert.ok(existsSync(path), 'types文件不存在');
});

test('src/shared/utils/logger.ts 存在', () => {
  const path = join(rootDir, 'src/shared/utils/logger.ts');
  assert.ok(existsSync(path), 'logger文件不存在');
});

// 5. 验证内容正确性
console.log('\n5. 验证内容正确性');

test('src/manager/server.ts 导入自 app.ts', () => {
  const path = join(rootDir, 'src/manager/server.ts');
  const content = readFileSync(path, 'utf-8');
  assert.ok(content.includes("from './app.js'"), '未正确导入 app.ts');
});

test('src/server.ts 导入自 manager/app.ts', () => {
  const path = join(rootDir, 'src/server.ts');
  const content = readFileSync(path, 'utf-8');
  assert.ok(content.includes("from './manager/app.js'"), '未正确导入 manager/app.ts');
});

test('src/machine/server.ts 导入自 app.ts', () => {
  const path = join(rootDir, 'src/machine/server.ts');
  const content = readFileSync(path, 'utf-8');
  assert.ok(content.includes("from './app.js'"), '未正确导入 app.ts');
});

test('src/machine/index.ts 重新导出 app.ts', () => {
  const path = join(rootDir, 'src/machine/index.ts');
  const content = readFileSync(path, 'utf-8');
  assert.ok(content.includes("from './app.js'"), '未正确重新导出 app.ts');
});

// 6. 验证 TypeScript 路径别名使用
console.log('\n6. 验证 TypeScript 路径别名使用');

test('src/manager/app.ts 使用 @shared 导入', () => {
  const path = join(rootDir, 'src/manager/app.ts');
  const content = readFileSync(path, 'utf-8');
  assert.ok(content.includes('@shared/'), '未使用 @shared 路径别名');
});

test('src/machine/app.ts 使用 @shared 导入', () => {
  const path = join(rootDir, 'src/machine/app.ts');
  const content = readFileSync(path, 'utf-8');
  assert.ok(content.includes('@shared/'), '未使用 @shared 路径别名');
});

// 7. 验证符号链接脚本
console.log('\n7. 验证符号链接脚本');

test('scripts/setup-aliases.sh 存在', () => {
  const path = join(rootDir, 'scripts/setup-aliases.sh');
  assert.ok(existsSync(path), '脚本不存在');
});

// 总结
console.log('\n=== 测试结果 ===');
console.log(`总计: ${testsRun} 个测试`);
console.log(`通过: ${testsPassed} 个`);
console.log(`失败: ${testsFailed} 个`);

if (testsFailed === 0) {
  console.log('\n✅ 步骤5集成测试验证通过！');
  console.log('\n重构完成摘要:');
  console.log('  - 步骤1: 共享代码目录 (src/shared/) ✅');
  console.log('  - 步骤2: 管理端入口 (src/manager/) ✅');
  console.log('  - 步骤3: 机器端入口 (src/machine/) ✅');
  console.log('  - 步骤4: 配置和脚本更新 ✅');
  console.log('  - 向后兼容: src/server.ts, src/machine/index.ts ✅');
  process.exit(0);
} else {
  console.log('\n❌ 存在失败的测试，请检查');
  process.exit(1);
}
