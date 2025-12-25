/**
 * 步骤3验证脚本: 机器端入口重构
 *
 * 验证 src/machine/ 目录结构
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

console.log('\n=== 步骤3验证: 机器端入口重构 ===\n');

// 1. 验证文件结构
console.log('1. 验证文件结构');

test('src/machine/app.ts 存在', () => {
  const path = join(rootDir, 'src/machine/app.ts');
  assert.ok(existsSync(path), 'src/machine/app.ts 不存在');
});

test('src/machine/server.ts 存在', () => {
  const path = join(rootDir, 'src/machine/server.ts');
  assert.ok(existsSync(path), 'src/machine/server.ts 不存在');
});

test('src/machine/index.ts 存在 (向后兼容)', () => {
  const path = join(rootDir, 'src/machine/index.ts');
  assert.ok(existsSync(path), 'src/machine/index.ts 不存在');
});

// 2. 验证 app.ts 内容
console.log('\n2. 验证 app.ts 内容');

test('app.ts 导出 MachineServer 类', () => {
  const path = join(rootDir, 'src/machine/app.ts');
  const content = readFileSync(path, 'utf-8');
  assert.ok(content.includes('export class MachineServer'), '未导出 MachineServer 类');
});

test('app.ts 导出 MachineState 枚举', () => {
  const path = join(rootDir, 'src/machine/app.ts');
  const content = readFileSync(path, 'utf-8');
  assert.ok(content.includes('export enum MachineState'), '未导出 MachineState 枚举');
});

test('app.ts 导出 startMachine 函数', () => {
  const path = join(rootDir, 'src/machine/app.ts');
  const content = readFileSync(path, 'utf-8');
  assert.ok(content.includes('export async function startMachine'), '未导出 startMachine 函数');
});

test('app.ts 导出 stopMachine 函数', () => {
  const path = join(rootDir, 'src/machine/app.ts');
  const content = readFileSync(path, 'utf-8');
  assert.ok(content.includes('export async function stopMachine'), '未导出 stopMachine 函数');
});

test('app.ts 使用 @shared 路径别名', () => {
  const path = join(rootDir, 'src/machine/app.ts');
  const content = readFileSync(path, 'utf-8');
  assert.ok(content.includes('@shared/'), '未使用 @shared 路径别名');
});

// 3. 验证 server.ts 内容
console.log('\n3. 验证 server.ts 内容');

test('server.ts 导入 startMachine', () => {
  const path = join(rootDir, 'src/machine/server.ts');
  const content = readFileSync(path, 'utf-8');
  assert.ok(content.includes("from './app.js'"), '未正确导入 app.ts');
});

test('server.ts 调用 startMachine', () => {
  const path = join(rootDir, 'src/machine/server.ts');
  const content = readFileSync(path, 'utf-8');
  assert.ok(content.includes('startMachine()'), '未调用 startMachine');
});

test('server.ts 处理未捕获异常', () => {
  const path = join(rootDir, 'src/machine/server.ts');
  const content = readFileSync(path, 'utf-8');
  assert.ok(content.includes('uncaughtException'), '未处理 uncaughtException');
});

test('server.ts 处理未处理的 Promise 拒绝', () => {
  const path = join(rootDir, 'src/machine/server.ts');
  const content = readFileSync(path, 'utf-8');
  assert.ok(content.includes('unhandledRejection'), '未处理 unhandledRejection');
});

// 4. 验证 index.ts 向后兼容
console.log('\n4. 验证 index.ts 向后兼容');

test('index.ts 重新导出 MachineServer', () => {
  const path = join(rootDir, 'src/machine/index.ts');
  const content = readFileSync(path, 'utf-8');
  assert.ok(content.includes('MachineServer'), '未重新导出 MachineServer');
});

test('index.ts 重新导出 MachineState', () => {
  const path = join(rootDir, 'src/machine/index.ts');
  const content = readFileSync(path, 'utf-8');
  assert.ok(content.includes('MachineState'), '未重新导出 MachineState');
});

test('index.ts 重新导出 startMachine', () => {
  const path = join(rootDir, 'src/machine/index.ts');
  const content = readFileSync(path, 'utf-8');
  assert.ok(content.includes('startMachine'), '未重新导出 startMachine');
});

test('index.ts 重新导出 stopMachine', () => {
  const path = join(rootDir, 'src/machine/index.ts');
  const content = readFileSync(path, 'utf-8');
  assert.ok(content.includes('stopMachine'), '未重新导出 stopMachine');
});

test('index.ts 从 app.ts 导入', () => {
  const path = join(rootDir, 'src/machine/index.ts');
  const content = readFileSync(path, 'utf-8');
  assert.ok(content.includes("from './app.js'"), '未从 app.ts 导入');
});

// 5. 验证 MachineServer 类方法
console.log('\n5. 验证 MachineServer 类方法');

test('MachineServer 有 start 方法', () => {
  const path = join(rootDir, 'src/machine/app.ts');
  const content = readFileSync(path, 'utf-8');
  assert.ok(content.includes('async start()'), '缺少 start 方法');
});

test('MachineServer 有 stop 方法', () => {
  const path = join(rootDir, 'src/machine/app.ts');
  const content = readFileSync(path, 'utf-8');
  assert.ok(content.includes('async stop()'), '缺少 stop 方法');
});

test('MachineServer 有 restart 方法', () => {
  const path = join(rootDir, 'src/machine/app.ts');
  const content = readFileSync(path, 'utf-8');
  assert.ok(content.includes('async restart()'), '缺少 restart 方法');
});

test('MachineServer 有 getState 方法', () => {
  const path = join(rootDir, 'src/machine/app.ts');
  const content = readFileSync(path, 'utf-8');
  assert.ok(content.includes('getState()'), '缺少 getState 方法');
});

// 6. 验证依赖导入
console.log('\n6. 验证依赖导入');

test('app.ts 导入 CONFIG', () => {
  const path = join(rootDir, 'src/machine/app.ts');
  const content = readFileSync(path, 'utf-8');
  assert.ok(content.includes("from './config.js'"), '未导入 CONFIG');
});

test('app.ts 导入 browserService', () => {
  const path = join(rootDir, 'src/machine/app.ts');
  const content = readFileSync(path, 'utf-8');
  assert.ok(content.includes("from './browser.service.js'"), '未导入 browserService');
});

test('app.ts 导入 proxyService', () => {
  const path = join(rootDir, 'src/machine/app.ts');
  const content = readFileSync(path, 'utf-8');
  assert.ok(content.includes("from './proxy.service.js'"), '未导入 proxyService');
});

test('app.ts 导入 grpcService', () => {
  const path = join(rootDir, 'src/machine/app.ts');
  const content = readFileSync(path, 'utf-8');
  assert.ok(content.includes("from './grpc.service.js'"), '未导入 grpcService');
});

// 总结
console.log('\n=== 测试结果 ===');
console.log(`总计: ${testsRun} 个测试`);
console.log(`通过: ${testsPassed} 个`);
console.log(`失败: ${testsFailed} 个`);

if (testsFailed === 0) {
  console.log('\n✅ 步骤3验证通过！');
  console.log('\n机器端入口重构完成:');
  console.log('  - src/machine/app.ts: MachineServer 类 + startMachine/stopMachine 函数');
  console.log('  - src/machine/server.ts: 新入口点');
  console.log('  - src/machine/index.ts: 向后兼容重新导出');
  process.exit(0);
} else {
  console.log('\n❌ 存在失败的测试，请检查');
  process.exit(1);
}
