/**
 * Playwright 全局测试设置
 * 在所有测试运行前启动管理端和多个机器服务
 */

import { FullConfig } from '@playwright/test';
import {
  startTestEnvironment,
  cleanupTestEnvironment,
  exportTestEnv,
} from './tests/helpers/test-env.js';

// 保存环境信息供测试使用
export let testManagerUrl: string;
export let testMachinesCount: number = 2; // 默认启动 2 个机器

async function globalSetup(config: FullConfig) {
  console.log('\n');
  console.log('╔═════════════════════════════════════════════╗');
  console.log('║     Playwright 全局测试设置                 ║');
  console.log('╚═════════════════════════════════════════════╝');
  console.log('');

  // 从环境变量读取机器数量，默认 2 个
  const machineCount = parseInt(process.env.TEST_MACHINE_COUNT || '2', 10);

  // 启动完整测试环境（管理端 + 机器）
  const env = await startTestEnvironment(machineCount);

  // 导出环境变量
  exportTestEnv();
  testManagerUrl = process.env.BASE_URL || '';
  testMachinesCount = machineCount;

  console.log(`📍 测试环境变量:`);
  console.log(`   BASE_URL = ${testManagerUrl}`);
  console.log(`   MANAGER_GRPC_URL = ${process.env.MANAGER_GRPC_URL}`);
  console.log(`   机器数量 = ${machineCount}`);
  console.log('');
}

async function globalTeardown(config: FullConfig) {
  await cleanupTestEnvironment();
}

export default globalSetup;
export { globalTeardown };
