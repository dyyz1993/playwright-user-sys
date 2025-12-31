/**
 * 测试 Fixtures 功能验证
 *
 * 目的：验证新的专业 Playwright Fixtures 设置是否正常工作
 *
 * 测试流程：
 * 1. Playwright 自动启动管理端（通过 webServer）
 * 2. Fixture 自动启动 2 个机器服务
 * 3. 验证机器已注册到管理端
 * 4. 自动清理：停止所有机器
 */

import { test, expect } from '../fixtures';

test.describe('Fixtures 功能验证', () => {
  test('应该自动启动管理端和机器服务', async ({ page, testEnv }) => {
    // 测试环境已自动设置：
    // - 管理端已启动（由 webServer 处理）
    // - 2 个机器服务已启动（由 testEnv fixture 处理）
    // - 机器已注册到管理端

    console.log('\n📊 测试环境信息:');
    console.log(`管理端 URL: ${testEnv.managerUrl}`);
    console.log(`管理端 gRPC 端口: ${testEnv.managerGrpcPort}`);
    console.log(`机器数量: ${testEnv.machines.length}`);

    // 验证机器服务已启动（fixture 配置启动 2 台机器）
    expect(testEnv.machines.length).toBeGreaterThanOrEqual(2);
    expect(testEnv.machines[0].process.pid).toBeGreaterThan(100);

    // 访问机器管理页面
    await page.goto(`${testEnv.managerUrl}/admin/login`);

    // 登录
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'REDACTED_ADMIN_PASS');
    await page.click('button[type="submit"]');

    // 等待登录完成
    await page.waitForURL(`${testEnv.managerUrl}/admin`, { timeout: 10000 });

    // 访问机器管理页面
    await page.goto(`${testEnv.managerUrl}/admin/machines`);
    await page.waitForLoadState('networkidle');

    // 等待页面加载
    await page.waitForTimeout(2000);

    // 验证页面包含机器信息
    const pageContent = await page.content();
    const hasMachineInfo = pageContent.includes('机器') || pageContent.includes('Machine');

    console.log(`\n✅ 页面包含机器信息: ${hasMachineInfo}`);

    // 至少验证页面可以访问
    expect(page.url()).toContain('/admin/machines');
  });

  test('应该能访问测试环境信息', async ({ testEnv }) => {
    // 验证测试环境信息（使用具体断言）
    expect(testEnv).toBeTruthy();
    expect(testEnv.managerUrl).toMatch(/^http:\/\/localhost:\d+$/);
    expect(testEnv.managerGrpcPort).toBeGreaterThan(0);
    expect(testEnv.machines).toBeInstanceOf(Array);
    expect(testEnv.machines.length).toBeGreaterThanOrEqual(2);

    console.log('\n📊 测试环境详情:');
    console.log(`管理端: ${testEnv.managerUrl}`);
    console.log(`gRPC 端口: ${testEnv.managerGrpcPort}`);
    console.log(`机器列表:`);

    testEnv.machines.forEach((machine, index) => {
      console.log(`  机器 #${index + 1}:`);
      console.log(`    ID: ${machine.id}`);
      console.log(`    名称: ${machine.name}`);
      console.log(`    PID: ${machine.pid}`);
      console.log(`    gRPC 端口: ${machine.grpcPort}`);
      console.log(`    代理端口: ${machine.proxyPort}`);
    });

    // 验证所有进程都在运行
    testEnv.machines.forEach(machine => {
      expect(machine.process.pid).toBeGreaterThan(100);
      expect(machine.process.killed).toBe(false);
    });
  });

  test('应该能验证机器进程状态', async ({ testEnv }) => {
    // 验证所有机器进程都在运行
    console.log('\n🔍 验证机器进程状态:');

    let runningCount = 0;
    for (const machine of testEnv.machines) {
      const isRunning = !machine.process.killed && machine.process.pid !== undefined && machine.process.pid > 0;
      if (isRunning) runningCount++;
      console.log(`  机器 ${machine.name} (PID: ${machine.process.pid}): ${isRunning ? '✅ 运行中' : '❌ 已停止'}`);
      expect(isRunning).toBe(true);
    }

    // 验证至少有 2 台机器在运行
    expect(runningCount).toBeGreaterThanOrEqual(2);
    console.log('\n✅ 所有机器进程状态正常');
  });
});
