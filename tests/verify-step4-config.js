/**
 * 步骤4验证脚本: 配置和脚本更新
 *
 * 验证 package.json 脚本更新为新入口点
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

console.log('\n=== 步骤4验证: 配置和脚本更新 ===\n');

// 读取 package.json
const pkgPath = join(rootDir, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

// 1. 验证开发脚本更新
console.log('1. 验证开发脚本');

test('dev 脚本使用新入口点', () => {
  assert.ok(pkg.scripts.dev, 'dev 脚本不存在');
  assert.ok(pkg.scripts.dev.includes('src/manager/server.ts'), `dev 脚本未使用新入口点: ${pkg.scripts.dev}`);
});

test('dev:env 脚本使用新入口点', () => {
  assert.ok(pkg.scripts['dev:env'], 'dev:env 脚本不存在');
  assert.ok(pkg.scripts['dev:env'].includes('src/manager/server.ts'), `dev:env 未使用新入口点`);
});

test('dev:server 脚本使用新入口点', () => {
  assert.ok(pkg.scripts['dev:server'], 'dev:server 脚本不存在');
  assert.ok(pkg.scripts['dev:server'].includes('src/manager/server.ts'), `dev:server 未使用新入口点`);
});

test('dev:machine 脚本使用新入口点', () => {
  assert.ok(pkg.scripts['dev:machine'], 'dev:machine 脚本不存在');
  assert.ok(pkg.scripts['dev:machine'].includes('src/machine/server.ts'), `dev:machine 未使用新入口点`);
});

// 2. 验证启动脚本更新
console.log('\n2. 验证启动脚本');

test('start 脚本指向新编译路径', () => {
  assert.ok(pkg.scripts.start, 'start 脚本不存在');
  assert.ok(pkg.scripts.start.includes('dist/manager/server.js'), `start 未指向新路径: ${pkg.scripts.start}`);
});

test('start:server 脚本使用新入口点', () => {
  assert.ok(pkg.scripts['start:server'], 'start:server 脚本不存在');
  assert.ok(pkg.scripts['start:server'].includes('src/manager/server.ts'), `start:server 未使用新入口点`);
});

test('start:machine 脚本使用新入口点', () => {
  assert.ok(pkg.scripts['start:machine'], 'start:machine 脚本不存在');
  assert.ok(pkg.scripts['start:machine'].includes('src/machine/server.ts'), `start:machine 未使用新入口点`);
});

// 3. 验证 pre 脚本（符号链接设置）
console.log('\n3. 验证 pre 脚本');

test('predev 脚本存在', () => {
  assert.ok(pkg.scripts['predev'], 'predev 脚本不存在');
  assert.ok(pkg.scripts['predev'].includes('setup-aliases.sh'), 'predev 未调用 setup-aliases.sh');
});

test('predev:server 脚本存在', () => {
  assert.ok(pkg.scripts['predev:server'], 'predev:server 脚本不存在');
  assert.ok(pkg.scripts['predev:server'].includes('setup-aliases.sh'), 'predev:server 未调用 setup-aliases.sh');
});

test('predev:machine 脚本存在', () => {
  assert.ok(pkg.scripts['predev:machine'], 'predev:machine 脚本不存在');
  assert.ok(pkg.scripts['predev:machine'].includes('setup-aliases.sh'), 'predev:machine 未调用 setup-aliases.sh');
});

test('prestart:server 脚本存在', () => {
  assert.ok(pkg.scripts['prestart:server'], 'prestart:server 脚本不存在');
  assert.ok(pkg.scripts['prestart:server'].includes('setup-aliases.sh'), 'prestart:server 未调用 setup-aliases.sh');
});

test('prestart:machine 脚本存在', () => {
  assert.ok(pkg.scripts['prestart:machine'], 'prestart:machine 脚本不存在');
  assert.ok(pkg.scripts['prestart:machine'].includes('setup-aliases.sh'), 'prestart:machine 未调用 setup-aliases.sh');
});

// 4. 验证 tsconfig.json 路径映射
console.log('\n4. 验证 TypeScript 配置');

const tsconfigPath = join(rootDir, 'tsconfig.json');
const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8'));

test('tsconfig.json 包含 paths 配置', () => {
  assert.ok(tsconfig.compilerOptions?.paths, 'paths 配置不存在');
});

test('@shared/* 路径映射存在', () => {
  assert.ok(tsconfig.compilerOptions.paths['@shared/*'], '@shared/* 路径映射不存在');
  assert.ok(tsconfig.compilerOptions.paths['@shared/*'].includes('src/shared/*'), '@shared/* 映射路径不正确');
});

test('@manager/* 路径映射存在', () => {
  assert.ok(tsconfig.compilerOptions.paths['@manager/*'], '@manager/* 路径映射不存在');
  assert.ok(tsconfig.compilerOptions.paths['@manager/*'].includes('src/manager/*'), '@manager/* 映射路径不正确');
});

test('@machine/* 路径映射存在', () => {
  assert.ok(tsconfig.compilerOptions.paths['@machine/*'], '@machine/* 路径映射不存在');
  assert.ok(tsconfig.compilerOptions.paths['@machine/*'].includes('src/machine/*'), '@machine/* 映射路径不正确');
});

// 5. 验证向后兼容入口点
console.log('\n5. 验证向后兼容');

test('src/server.ts 存在', () => {
  const path = join(rootDir, 'src/server.ts');
  assert.ok(existsSync(path), 'src/server.ts 不存在');
});

test('src/server.ts 导入自 manager', () => {
  const path = join(rootDir, 'src/server.ts');
  const content = readFileSync(path, 'utf-8');
  assert.ok(content.includes("from './manager/app.js'"), 'src/server.ts 未导入自 manager');
});

test('src/machine/index.ts 存在', () => {
  const path = join(rootDir, 'src/machine/index.ts');
  assert.ok(existsSync(path), 'src/machine/index.ts 不存在');
});

test('src/machine/index.ts 重新导出', () => {
  const path = join(rootDir, 'src/machine/index.ts');
  const content = readFileSync(path, 'utf-8');
  assert.ok(content.includes("from './app.js'"), 'src/machine/index.ts 未重新导出');
});

// 6. 验证符号链接设置脚本
console.log('\n6. 验证符号链接设置脚本');

test('scripts/setup-aliases.sh 脚本存在', () => {
  const path = join(rootDir, 'scripts/setup-aliases.sh');
  assert.ok(existsSync(path), 'scripts/setup-aliases.sh 不存在');
});

test('setup-aliases.sh 是可执行的', () => {
  const path = join(rootDir, 'scripts/setup-aliases.sh');
  const content = readFileSync(path, 'utf-8');
  assert.ok(content.includes('#!/bin/bash'), '脚本不是 bash 脚本');
  assert.ok(content.includes('Creating symlink:'), '脚本不包含 symlink 创建逻辑');
});

// 7. 验证 .nvmrc 文件
console.log('\n7. 验证 Node 版本配置');

test('.nvmrc 文件存在', () => {
  const path = join(rootDir, '.nvmrc');
  assert.ok(existsSync(path), '.nvmrc 文件不存在');
});

test('.nvmrc 指定 Node 20', () => {
  const path = join(rootDir, '.nvmrc');
  const content = readFileSync(path, 'utf-8').trim();
  assert.ok(content.includes('20'), `.nvmrc 未指定 Node 20: ${content}`);
});

// 总结
console.log('\n=== 测试结果 ===');
console.log(`总计: ${testsRun} 个测试`);
console.log(`通过: ${testsPassed} 个`);
console.log(`失败: ${testsFailed} 个`);

if (testsFailed === 0) {
  console.log('\n✅ 步骤4验证通过！');
  console.log('\n配置和脚本更新完成:');
  console.log('  - package.json: 所有脚本使用新入口点');
  console.log('  - tsconfig.json: 路径映射配置正确');
  console.log('  - 向后兼容: 原入口点保留并正确重新导出');
  console.log('  - 符号链接脚本: setup-aliases.sh 正确配置');
  console.log('  - Node 版本: .nvmrc 指定 v20');
  process.exit(0);
} else {
  console.log('\n❌ 存在失败的测试，请检查');
  process.exit(1);
}
