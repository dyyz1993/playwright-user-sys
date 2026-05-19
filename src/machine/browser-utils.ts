import fsSync from 'fs';
import path from 'path';
import { FingerprintInjector } from 'fingerprint-injector';
import { BrowserFingerprintWithHeaders, FingerprintGenerator } from 'fingerprint-generator';
import { logger } from '@shared/utils/logger.js';
import type { BrowserOptions } from './types.js';
import { CHROMIUM_LOCK_FILES, CHROMIUM_LOCK_SUBDIRS } from './browser-constants.js';

export function calculateUserDataDir(
  userId: number | undefined,
  sessionId: string,
  sharedUserData: boolean = false
): string {
  const baseDir = path.join(process.cwd(), 'data', 'user-data');

  if (sharedUserData && userId) {
    const sharedDir = path.join(baseDir, String(userId), 'shared');
    logger.info(`使用共享用户数据目录 (userId: ${userId}): ${sharedDir}`);
    return sharedDir;
  } else if (userId) {
    const sessionDir = path.join(baseDir, String(userId), 'sessions', sessionId);
    logger.info(`使用独立用户数据目录 (userId: ${userId}, sessionId: ${sessionId}): ${sessionDir}`);
    return sessionDir;
  } else {
    const sessionDir = path.join(baseDir, 'sessions', sessionId);
    logger.info(`使用兼容模式用户数据目录 (sessionId: ${sessionId}): ${sessionDir}`);
    return sessionDir;
  }
}

export function cleanLockFiles(userDataDir: string): void {
  for (const subDir of CHROMIUM_LOCK_SUBDIRS) {
    const dirPath = subDir ? path.join(userDataDir, subDir) : userDataDir;
    if (!fsSync.existsSync(dirPath)) {
      continue;
    }

    for (const lockFile of CHROMIUM_LOCK_FILES) {
      const lockPath = path.join(dirPath, lockFile);
      try {
        if (fsSync.existsSync(lockPath)) {
          fsSync.unlinkSync(lockPath);
          logger.info(`已清理残留锁文件: ${lockPath}`);
        }
      } catch (error: unknown) {
        logger.warn(`清理锁文件失败 (${lockPath}):`, error);
      }
    }
  }
}

export function ensureUserDataDir(userDataDir: string): void {
  try {
    if (!fsSync.existsSync(userDataDir)) {
      fsSync.mkdirSync(userDataDir, { recursive: true });
      logger.info(`已创建用户数据目录: ${userDataDir}`);
    }

    cleanLockFiles(userDataDir);
  } catch (error: unknown) {
    logger.error(`创建用户数据目录失败 (${userDataDir}):`, error);
    throw error;
  }
}

export function generateFingerprint(options: BrowserOptions = {}): BrowserFingerprintWithHeaders | null {
  try {
    if (options.fingerprintOptions?.enabled === false) {
      logger.info('根据配置禁用指纹注入');
      return null;
    }

    const fingerprintGenerator = new FingerprintGenerator({
      devices: options.fingerprintOptions?.devices || ['desktop'],
      operatingSystems: options.fingerprintOptions?.operatingSystems || ['windows', 'macos', 'linux'],
      browsers: options.fingerprintOptions?.browsers || ['chrome', 'firefox', 'safari'],
    });

    const fingerprint = fingerprintGenerator.getFingerprint();
    logger.info(`成功生成浏览器指纹: ${fingerprint.fingerprint.navigator.userAgent}`);

    return fingerprint;
  } catch (error: unknown) {
    logger.error('生成浏览器指纹失败:', error);
    return null;
  }
}

export function applyFingerprintToPage(
  page: import('puppeteer').Page,
  fingerprint: BrowserFingerprintWithHeaders
): Promise<void> {
  const fingerprintInjector = new FingerprintInjector();
  return fingerprintInjector.attachFingerprintToPuppeteer(
    page as unknown as Parameters<typeof fingerprintInjector.attachFingerprintToPuppeteer>[0],
    fingerprint
  );
}
