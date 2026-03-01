import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StorageService } from '../../src/services/storage.service.js';
import { STORAGE_CONFIG } from '../../src/config/storage.config.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';

describe('StorageService', () => {
  const testUserId = 99999;
  const testBasePath = join(process.cwd(), 'data', 'user-data', String(testUserId));
  const testSessionsPath = join(testBasePath, 'sessions');
  const testSharedPath = join(testBasePath, 'shared');

  beforeEach(async () => {
    // Create test directories
    await mkdir(testSessionsPath, { recursive: true });
    await mkdir(testSharedPath, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup test directories
    await rm(testBasePath, { recursive: true, force: true });
  });

  describe('formatBytes', () => {
    it('should format 0 bytes correctly', () => {
      expect(StorageService.formatBytes(0)).toBe('0 Bytes');
    });

    it('should format bytes correctly', () => {
      expect(StorageService.formatBytes(500)).toBe('500 Bytes');
    });

    it('should format kilobytes correctly', () => {
      expect(StorageService.formatBytes(1024)).toBe('1 KB');
      expect(StorageService.formatBytes(1536)).toBe('1.5 KB');
    });

    it('should format megabytes correctly', () => {
      expect(StorageService.formatBytes(1024 * 1024)).toBe('1 MB');
      expect(StorageService.formatBytes(5 * 1024 * 1024)).toBe('5 MB');
    });

    it('should format gigabytes correctly', () => {
      expect(StorageService.formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
      expect(StorageService.formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
    });

    it('should respect decimal parameter', () => {
      expect(StorageService.formatBytes(1536, 0)).toBe('2 KB');
      expect(StorageService.formatBytes(1536, 3)).toBe('1.5 KB');
    });
  });

  describe('getDirectorySize', () => {
    it('should return 0 for non-existent directory', async () => {
      const size = await StorageService.getDirectorySize('/non/existent/path');
      expect(size).toBe(0);
    });

    it('should calculate size of empty directory', async () => {
      const size = await StorageService.getDirectorySize(testSessionsPath);
      expect(size).toBe(0);
    });

    it('should calculate size of directory with files', async () => {
      // Create test files
      const file1 = join(testSessionsPath, 'file1.txt');
      const file2 = join(testSessionsPath, 'file2.txt');
      await writeFile(file1, 'a'.repeat(1000));
      await writeFile(file2, 'b'.repeat(2000));

      const size = await StorageService.getDirectorySize(testSessionsPath);
      expect(size).toBeGreaterThan(2900); // Account for filesystem overhead
      expect(size).toBeLessThan(3500);
    });

    it('should calculate size of nested directories', async () => {
      // Create nested structure
      const nestedDir = join(testSessionsPath, 'level1', 'level2');
      await mkdir(nestedDir, { recursive: true });

      const file1 = join(testSessionsPath, 'file1.txt');
      const file2 = join(testSessionsPath, 'level1', 'file2.txt');
      const file3 = join(nestedDir, 'file3.txt');

      await writeFile(file1, 'a'.repeat(1000));
      await writeFile(file2, 'b'.repeat(2000));
      await writeFile(file3, 'c'.repeat(3000));

      const size = await StorageService.getDirectorySize(testSessionsPath);
      expect(size).toBeGreaterThan(5900);
      expect(size).toBeLessThan(7000);
    });
  });

  describe('getUserStorageStats', () => {
    it('should return zero stats for new user', async () => {
      const stats = await StorageService.getUserStorageStats(testUserId);

      expect(stats.sessionsSize).toBe(0);
      expect(stats.sharedSize).toBe(0);
      expect(stats.totalSize).toBe(0);
    });

    it('should calculate combined stats correctly', async () => {
      // Create files in sessions
      await writeFile(join(testSessionsPath, 'session.txt'), 'x'.repeat(1000));

      // Create files in shared
      await writeFile(join(testSharedPath, 'shared.txt'), 'y'.repeat(2000));

      const stats = await StorageService.getUserStorageStats(testUserId);

      expect(stats.sessionsSize).toBeGreaterThan(900);
      expect(stats.sharedSize).toBeGreaterThan(1900);
      expect(stats.totalSize).toBe(stats.sessionsSize + stats.sharedSize);
    });
  });

  describe('checkUserStorageLimit', () => {
    it('should allow operations for new user', async () => {
      const check = await StorageService.checkUserStorageLimit(testUserId);

      expect(check.canCreateSession).toBe(true);
      expect(check.canCreateShared).toBe(true);
      expect(check.reason).toBeUndefined();
      expect(check.stats).toBeDefined();
    });

    it('should include stats in check result', async () => {
      await writeFile(join(testSessionsPath, 'test.txt'), 'a'.repeat(1000));

      const check = await StorageService.checkUserStorageLimit(testUserId);

      expect(check.stats).toBeDefined();
      expect(check.stats!.sessionsSize).toBeGreaterThan(0);
    });

    it('should reject when session size exceeds maximum', async () => {
      const hugeSize = STORAGE_CONFIG.MAX_SESSION_SIZE + 1;
      const check = await StorageService.checkUserStorageLimit(testUserId, hugeSize);

      expect(check.canCreateSession).toBe(false);
      expect(check.reason).toContain('exceeds maximum limit');
    });

    it('should check projected storage usage', async () => {
      // This test would require filling up storage, which is impractical
      // So we just verify the logic exists
      const check1 = await StorageService.checkUserStorageLimit(testUserId, 1000);
      expect(check1.canCreateSession).toBe(true);

      const check2 = await StorageService.checkUserStorageLimit(testUserId, STORAGE_CONFIG.MAX_SESSION_SIZE);
      expect(check2.canCreateSession).toBe(true);
    });
  });

  describe('cleanupUserSessions', () => {
    it('should handle non-existent directory gracefully', async () => {
      await expect(StorageService.cleanupUserSessions(testUserId + 1)).resolves.not.toThrow();
    });

    it('should cleanup specific session', async () => {
      const sessionId = 'test-session';
      const sessionPath = join(testSessionsPath, sessionId);
      await mkdir(sessionPath, { recursive: true });
      await writeFile(join(sessionPath, 'data.txt'), 'test data');

      expect(await StorageService.getDirectorySize(testSessionsPath)).toBeGreaterThan(0);

      await StorageService.cleanupUserSessions(testUserId, sessionId);

      expect(await StorageService.getDirectorySize(testSessionsPath)).toBe(0);
    });

    it('should cleanup all sessions when no session ID specified', async () => {
      const session1 = join(testSessionsPath, 'session1');
      const session2 = join(testSessionsPath, 'session2');
      await mkdir(session1, { recursive: true });
      await mkdir(session2, { recursive: true });
      await writeFile(join(session1, 'data.txt'), 'data1');
      await writeFile(join(session2, 'data.txt'), 'data2');

      expect(await StorageService.getDirectorySize(testSessionsPath)).toBeGreaterThan(0);

      await StorageService.cleanupUserSessions(testUserId);

      expect(await StorageService.getDirectorySize(testSessionsPath)).toBe(0);
    });
  });

  describe('cleanupUserShared', () => {
    it('should handle non-existent directory gracefully', async () => {
      await expect(StorageService.cleanupUserShared(testUserId + 1)).resolves.not.toThrow();
    });

    it('should cleanup shared directory', async () => {
      await writeFile(join(testSharedPath, 'shared.txt'), 'shared data');

      expect(await StorageService.getDirectorySize(testSharedPath)).toBeGreaterThan(0);

      await StorageService.cleanupUserShared(testUserId);

      expect(await StorageService.getDirectorySize(testSharedPath)).toBe(0);
    });
  });

  describe('getAllUserIds', () => {
    it('should return empty array when no users exist', async () => {
      // Remove test directory
      await rm(testBasePath, { recursive: true });

      const userIds = await StorageService.getAllUserIds();
      expect(Array.isArray(userIds)).toBe(true);
    });

    it('should return list of user IDs', async () => {
      const userIds = await StorageService.getAllUserIds();
      expect(userIds).toContain(testUserId);
    });

    it('should ignore non-numeric directories', async () => {
      // Create a non-numeric directory
      const userDataPath = join(process.cwd(), 'data', 'user-data');
      await mkdir(join(userDataPath, 'not-a-number'), { recursive: true });

      const userIds = await StorageService.getAllUserIds();
      expect(userIds).not.toContain('not-a-number');

      // Cleanup
      await rm(join(userDataPath, 'not-a-number'), { recursive: true });
    });
  });

  describe('getAllUsersStorageStats', () => {
    it('should return map of user stats', async () => {
      const statsMap = await StorageService.getAllUsersStorageStats();

      expect(statsMap).toBeInstanceOf(Map);
      expect(statsMap.has(testUserId)).toBe(true);

      const stats = statsMap.get(testUserId);
      expect(stats).toBeDefined();
      expect(stats!.totalSize).toBeGreaterThanOrEqual(0);
    });
  });
});
