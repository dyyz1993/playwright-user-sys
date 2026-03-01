/**
 * Chromium 锁文件清理测试
 *
 * 场景：Docker 容器重启后，用户数据目录中的 Chromium 锁文件残留，
 * 导致新的浏览器实例无法启动。
 *
 * 锁文件包括：
 * - SingletonLock: 防止多个 Chromium 实例使用同一用户数据目录
 * - SingletonSocket: Unix socket 文件
 * - SingletonCookie: 用于进程间通信的 cookie 文件
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Chromium 锁文件清理', () => {
  let tempDir: string;
  let userDataDir: string;

  const LOCK_FILES = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];

  beforeEach(() => {
    tempDir = join(tmpdir(), `chromium-lock-test-${Date.now()}`);
    userDataDir = join(tempDir, 'user-data', '1', 'shared');
    mkdirSync(userDataDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('模拟 Docker 重启后锁文件残留', () => {
    it('应该能检测到残留的 SingletonLock 文件', () => {
      const lockPath = join(userDataDir, 'SingletonLock');
      writeFileSync(lockPath, '32505-f9dfd5d81529');

      expect(existsSync(lockPath)).toBe(true);
      expect(readFileSync(lockPath, 'utf-8')).toBe('32505-f9dfd5d81529');
    });

    it('应该能检测到所有残留的锁文件', () => {
      LOCK_FILES.forEach((filename) => {
        const filePath = join(userDataDir, filename);
        writeFileSync(filePath, `mock-content-${filename}`);
      });

      LOCK_FILES.forEach((filename) => {
        expect(existsSync(join(userDataDir, filename))).toBe(true);
      });
    });
  });

  describe('ensureUserDataDir 应该清理锁文件', () => {
    it('当目录中存在 SingletonLock 时，应该清理它', async () => {
      const { browserService } = await import('../../src/machine/browser.service.js');

      const lockPath = join(userDataDir, 'SingletonLock');
      writeFileSync(lockPath, '32505-f9dfd5d81529');

      expect(existsSync(lockPath)).toBe(true);

      (browserService as any).ensureUserDataDir(userDataDir);

      expect(existsSync(lockPath)).toBe(false);
    });

    it('当目录中存在所有锁文件时，应该全部清理', async () => {
      const { browserService } = await import('../../src/machine/browser.service.js');

      LOCK_FILES.forEach((filename) => {
        const filePath = join(userDataDir, filename);
        writeFileSync(filePath, `mock-content-${filename}`);
      });

      LOCK_FILES.forEach((filename) => {
        expect(existsSync(join(userDataDir, filename))).toBe(true);
      });

      (browserService as any).ensureUserDataDir(userDataDir);

      LOCK_FILES.forEach((filename) => {
        expect(existsSync(join(userDataDir, filename))).toBe(false);
      });
    });

    it('当目录不存在锁文件时，应该正常工作', async () => {
      const { browserService } = await import('../../src/machine/browser.service.js');

      LOCK_FILES.forEach((filename) => {
        expect(existsSync(join(userDataDir, filename))).toBe(false);
      });

      expect(() => {
        (browserService as any).ensureUserDataDir(userDataDir);
      }).not.toThrow();
    });

    it('当目录不存在时，应该创建目录且不抛出错误', async () => {
      const { browserService } = await import('../../src/machine/browser.service.js');

      const newDir = join(tempDir, 'new-user-data');
      expect(existsSync(newDir)).toBe(false);

      expect(() => {
        (browserService as any).ensureUserDataDir(newDir);
      }).not.toThrow();

      expect(existsSync(newDir)).toBe(true);
    });
  });

  describe('模拟真实场景：Docker 重启后启动浏览器', () => {
    it('当锁文件存在时，启动浏览器应该成功（锁文件被自动清理）', async () => {
      const { browserService } = await import('../../src/machine/browser.service.js');

      LOCK_FILES.forEach((filename) => {
        const filePath = join(userDataDir, filename);
        writeFileSync(filePath, `mock-content-${filename}`);
      });

      const lockPath = join(userDataDir, 'SingletonLock');
      expect(existsSync(lockPath)).toBe(true);

      const result = (browserService as any).ensureUserDataDir(userDataDir);

      expect(existsSync(lockPath)).toBe(false);
    });
  });
});
