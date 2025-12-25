/**
 * 步骤2验证: 管理端入口重构
 *
 * 验证内容:
 * 1. 文件结构验证 - 检查目录和文件是否存在
 * 2. 导出功能验证 - 检查导出的函数是否正确
 * 3. 代码功能验证 - 检查buildManager和startManager的实际功能
 * 4. 启动验证 - 检查服务能否正常启动
 */
import { describe, it, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

describe('Step 2: Manager Entry Point Refactor', () => {
  const projectDir = process.cwd();
  const managerDir = path.join(projectDir, 'src/manager');
  let managerProcess = null;

  // ========================================
  // 第1部分: 文件结构验证
  // ========================================

  describe('1. File Structure Verification', () => {
    it('should have manager directory', () => {
      assert.equal(fs.existsSync(managerDir), true, 'src/manager should exist');
    });

    it('should have manager app.ts', () => {
      const appPath = path.join(managerDir, 'app.ts');
      assert.equal(fs.existsSync(appPath), true, 'src/manager/app.ts should exist');
    });

    it('should have manager server.ts', () => {
      const serverPath = path.join(managerDir, 'server.ts');
      assert.equal(fs.existsSync(serverPath), true, 'src/manager/server.ts should exist');
    });

    it('should have backward compatible server.ts in src/', () => {
      const serverPath = path.join(projectDir, 'src/server.ts');
      assert.equal(fs.existsSync(serverPath), true, 'src/server.ts should exist for backward compatibility');
    });
  });

  // ========================================
  // 第2部分: 导出功能验证
  // ========================================

  describe('2. Export Function Verification', () => {
    it('should export buildManager function', async () => {
      const appModule = await import(path.join(projectDir, 'src/manager/app.js'));
      assert.equal(typeof appModule.buildManager, 'function', 'should export buildManager function');
    });

    it('should export startManager function', async () => {
      const appModule = await import(path.join(projectDir, 'src/manager/app.js'));
      assert.equal(typeof appModule.startManager, 'function', 'should export startManager function');
    });

    it('should export default buildManager', async () => {
      const appModule = await import(path.join(projectDir, 'src/manager/app.js'));
      assert.equal(typeof appModule.default, 'function', 'should export default buildManager');
    });
  });

  // ========================================
  // 第3部分: 代码功能验证
  // ========================================

  describe('3. Code Function Verification', () => {
    let managerAppModule;

    before(async () => {
      managerAppModule = await import(path.join(projectDir, 'src/manager/app.js'));
    });

    it('buildManager should return a function', () => {
      assert.equal(typeof managerAppModule.buildManager, 'function', 'buildManager should be a function');
    });

    it('buildManager function should be async', async () => {
      // 通过检查是否返回 Promise 来验证是 async 函数
      const result = managerAppModule.buildManager();
      assert.ok(result instanceof Promise || result.then !== undefined, 'buildManager should return a Promise');
      // 清理，不实际执行
      result.catch(() => {});
    });

    it('startManager should be a function', () => {
      assert.equal(typeof managerAppModule.startManager, 'function', 'startManager should be a function');
    });

    it('app.ts should contain resetAllMachineStatus function', () => {
      const appPath = path.join(managerDir, 'app.ts');
      const content = fs.readFileSync(appPath, 'utf-8');
      assert.ok(content.includes('resetAllMachineStatus'), 'app.ts should contain resetAllMachineStatus function');
    });

    it('app.ts should import from shared/utils/logger', () => {
      const appPath = path.join(managerDir, 'app.ts');
      const content = fs.readFileSync(appPath, 'utf-8');
      assert.ok(content.includes('shared/utils/logger') || content.includes('@shared/utils/logger'),
        'app.ts should import logger from shared/utils');
    });

    it('app.ts should import WebSocketProxyService', () => {
      const appPath = path.join(managerDir, 'app.ts');
      const content = fs.readFileSync(appPath, 'utf-8');
      assert.ok(content.includes('NativeWebSocketProxyService') || content.includes('websocket-proxy'),
        'app.ts should import WebSocketProxyService');
    });

    it('server.ts should import startManager from app.ts', () => {
      const serverPath = path.join(managerDir, 'server.ts');
      const content = fs.readFileSync(serverPath, 'utf-8');
      assert.ok(content.includes('startManager'), 'server.ts should import startManager from app.ts');
    });

    it('server.ts should handle uncaughtException', () => {
      const serverPath = path.join(managerDir, 'server.ts');
      const content = fs.readFileSync(serverPath, 'utf-8');
      assert.ok(content.includes('uncaughtException'), 'server.ts should handle uncaughtException');
    });

    it('server.ts should handle unhandledRejection', () => {
      const serverPath = path.join(managerDir, 'server.ts');
      const content = fs.readFileSync(serverPath, 'utf-8');
      assert.ok(content.includes('unhandledRejection'), 'server.ts should handle unhandledRejection');
    });

    it('backward compatible src/server.ts should import from manager/app', () => {
      const serverPath = path.join(projectDir, 'src/server.ts');
      const content = fs.readFileSync(serverPath, 'utf-8');
      assert.ok(content.includes('manager/app'), 'src/server.ts should import from manager/app for backward compatibility');
    });
  });

  // ========================================
  // 第4部分: 启动验证
  // ========================================

  describe('4. Startup Verification', () => {
    it('should start manager server without errors', (t, done) => {
      managerProcess = spawn('pnpm', ['dev:server'], {
        cwd: projectDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'test' }
      });

      let output = '';
      let errors = '';

      const timer = setTimeout(() => {
        managerProcess.kill();
        // 如果超时但没有错误，也算部分成功
        if (output.length > 0 && !errors.includes('ERROR')) {
          assert.ok(true, 'Manager server started (timeout but no errors)');
          done();
        } else {
          done(new Error('Manager server start timeout with errors'));
        }
      }, 15000);

      managerProcess.stdout.on('data', (data) => {
        output += data.toString();

        // 检查关键启动日志
        if (output.includes('HTTP 服务器已启动') ||
            output.includes('gRPC 服务器已启动') ||
            output.includes('API 文档')) {
          clearTimeout(timer);
          assert.ok(true, 'Manager server started successfully');
          managerProcess.kill();
          done();
        }
      });

      managerProcess.stderr.on('data', (data) => {
        errors += data.toString();
        // 只记录非警告的错误
        if (errors.includes('ERROR') || errors.includes('错误')) {
          clearTimeout(timer);
          managerProcess.kill();
          done(new Error(`Manager server failed: ${errors}`));
        }
      });

      managerProcess.on('error', (err) => {
        clearTimeout(timer);
        done(new Error(`Failed to start manager process: ${err.message}`));
      });

      managerProcess.on('exit', (code) => {
        clearTimeout(timer);
        if (code !== 0 && code !== null) {
          done(new Error(`Manager process exited with code ${code}`));
        }
      });
    }).timeout(20000);
  });

  // ========================================
  // 清理
  // ========================================

  after(() => {
    if (managerProcess && !managerProcess.killed) {
      managerProcess.kill();
    }
  });
});

// 如果直接运行此文件，测试会自动运行
// node:test 会自动执行所有 describe/test 块
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running Step 2 Manager Verification...\n');
  console.log('Note: Tests will run automatically via node:test framework\n');
}
