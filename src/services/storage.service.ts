import { readdir, stat, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { STORAGE_CONFIG, StorageLimitType } from '../config/storage.config.js';
import { logger } from '../shared/utils/logger.js';

/**
 * Storage statistics for a user
 */
export interface UserStorageStats {
  /** Total size of all sessions in bytes */
  sessionsSize: number;
  /** Total size of shared data in bytes */
  sharedSize: number;
  /** Combined total size in bytes */
  totalSize: number;
}

/**
 * Storage limit check result
 */
export interface StorageLimitCheck {
  /** Whether user can create a new session */
  canCreateSession: boolean;
  /** Whether user can create shared data */
  canCreateShared: boolean;
  /** Reason if limit exceeded */
  reason?: string;
  /** Current storage statistics */
  stats?: UserStorageStats;
}

/**
 * Service for managing user storage limits and cleanup
 */
export class StorageService {
  /**
   * Format bytes to human-readable string
   * @param bytes - Number of bytes
   * @param decimals - Number of decimal places (default: 2)
   * @returns Formatted string (e.g., "1.5 GB")
   */
  static formatBytes(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Calculate directory size recursively
   * @param dirPath - Absolute path to directory
   * @returns Total size in bytes
   */
  static async getDirectorySize(dirPath: string): Promise<number> {
    try {
      // Check if directory exists
      if (!existsSync(dirPath)) {
        return 0;
      }

      let totalSize = 0;
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // Recursively calculate subdirectory size
          totalSize += await this.getDirectorySize(fullPath);
        } else if (entry.isFile()) {
          // Get file size
          try {
            const stats = await stat(fullPath);
            totalSize += stats.size;
          } catch (error) {
            // File might have been deleted, skip it
            logger.warn(`Failed to stat file ${fullPath}: ${error}`);
          }
        }
      }

      return totalSize;
    } catch (error) {
      // Directory doesn't exist or cannot be accessed
      logger.warn(`Failed to calculate directory size for ${dirPath}: ${error}`);
      return 0;
    }
  }

  /**
   * Get user storage statistics
   * @param userId - User ID
   * @returns Storage statistics
   */
  static async getUserStorageStats(userId: number): Promise<UserStorageStats> {
    const basePath = join(process.cwd(), 'data', 'user-data', String(userId));
    const sessionsPath = join(basePath, 'sessions');
    const sharedPath = join(basePath, 'shared');

    // Calculate sizes in parallel
    const [sessionsSize, sharedSize] = await Promise.all([
      this.getDirectorySize(sessionsPath),
      this.getDirectorySize(sharedPath),
    ]);

    return {
      sessionsSize,
      sharedSize,
      totalSize: sessionsSize + sharedSize,
    };
  }

  /**
   * Check if user storage exceeds limits
   * @param userId - User ID
   * @param additionalSessionSize - Optional additional session size to check
   * @returns Storage limit check result
   */
  static async checkUserStorageLimit(userId: number, additionalSessionSize: number = 0): Promise<StorageLimitCheck> {
    const stats = await this.getUserStorageStats(userId);

    // Check total storage limit
    if (stats.totalSize + additionalSessionSize > STORAGE_CONFIG.MAX_TOTAL_SIZE_PER_USER) {
      return {
        canCreateSession: false,
        canCreateShared: false,
        reason:
          `Total storage limit exceeded. Current: ${this.formatBytes(stats.totalSize)}, ` +
          `Limit: ${this.formatBytes(STORAGE_CONFIG.MAX_TOTAL_SIZE_PER_USER)}`,
        stats,
      };
    }

    // Check shared storage limit
    if (stats.sharedSize > STORAGE_CONFIG.MAX_SHARED_SIZE_PER_USER) {
      return {
        canCreateSession: true,
        canCreateShared: false,
        reason:
          `Shared storage limit exceeded. Current: ${this.formatBytes(stats.sharedSize)}, ` +
          `Limit: ${this.formatBytes(STORAGE_CONFIG.MAX_SHARED_SIZE_PER_USER)}`,
        stats,
      };
    }

    // Check if adding a new session would exceed limits
    const projectedSessionsSize = stats.sessionsSize + additionalSessionSize;
    const projectedTotal = stats.totalSize + additionalSessionSize;

    const canCreateSession =
      projectedTotal <= STORAGE_CONFIG.MAX_TOTAL_SIZE_PER_USER &&
      additionalSessionSize <= STORAGE_CONFIG.MAX_SESSION_SIZE;

    // Can always create shared if within limits
    const canCreateShared = true;

    if (!canCreateSession && additionalSessionSize > 0) {
      return {
        canCreateSession: false,
        canCreateShared,
        reason:
          additionalSessionSize > STORAGE_CONFIG.MAX_SESSION_SIZE
            ? `Session size exceeds maximum limit of ${this.formatBytes(STORAGE_CONFIG.MAX_SESSION_SIZE)}`
            : `Insufficient storage space. Available: ${this.formatBytes(STORAGE_CONFIG.MAX_TOTAL_SIZE_PER_USER - stats.totalSize)}`,
        stats,
      };
    }

    return {
      canCreateSession,
      canCreateShared,
      stats,
    };
  }

  /**
   * Cleanup user session(s)
   * @param userId - User ID
   * @param sessionId - Optional specific session ID to cleanup (if not provided, cleans all sessions)
   */
  static async cleanupUserSessions(userId: number, sessionId?: string): Promise<void> {
    const sessionsBasePath = join(process.cwd(), 'data', 'user-data', String(userId), 'sessions');

    if (!existsSync(sessionsBasePath)) {
      logger.info(`Sessions directory does not exist for user ${userId}`);
      return;
    }

    try {
      if (sessionId) {
        // Cleanup specific session
        const sessionPath = join(sessionsBasePath, sessionId);
        if (existsSync(sessionPath)) {
          await rm(sessionPath, { recursive: true, force: true });
          logger.info(`Cleaned up session ${sessionId} for user ${userId}`);
        }
      } else {
        // Cleanup all sessions
        await rm(sessionsBasePath, { recursive: true, force: true });
        logger.info(`Cleaned up all sessions for user ${userId}`);
      }
    } catch (error) {
      logger.error(`Failed to cleanup sessions for user ${userId}: ${error}`);
      throw error;
    }
  }

  /**
   * Cleanup user shared data
   * @param userId - User ID
   */
  static async cleanupUserShared(userId: number): Promise<void> {
    const sharedPath = join(process.cwd(), 'data', 'user-data', String(userId), 'shared');

    if (!existsSync(sharedPath)) {
      logger.info(`Shared directory does not exist for user ${userId}`);
      return;
    }

    try {
      await rm(sharedPath, { recursive: true, force: true });
      logger.info(`Cleaned up shared data for user ${userId}`);
    } catch (error) {
      logger.error(`Failed to cleanup shared data for user ${userId}: ${error}`);
      throw error;
    }
  }

  /**
   * Cleanup old shared data based on last modified time
   * Scans all users and removes shared data older than SHARED_CLEANUP_AGE_DAYS
   * @returns Number of directories cleaned up
   */
  static async cleanupOldSharedData(): Promise<number> {
    const userDataPath = join(process.cwd(), 'data', 'user-data');
    let cleanedCount = 0;

    if (!existsSync(userDataPath)) {
      logger.info('User data directory does not exist');
      return cleanedCount;
    }

    try {
      const users = await readdir(userDataPath, { withFileTypes: true });
      const cutoffTime = Date.now() - STORAGE_CONFIG.SHARED_CLEANUP_AGE_DAYS * 24 * 60 * 60 * 1000;

      for (const user of users) {
        if (!user.isDirectory()) continue;

        const userId = user.name;
        const sharedPath = join(userDataPath, userId, 'shared');

        if (!existsSync(sharedPath)) continue;

        try {
          const stats = await stat(sharedPath);
          const lastModified = stats.mtimeMs;

          if (lastModified < cutoffTime) {
            await rm(sharedPath, { recursive: true, force: true });
            cleanedCount++;
            logger.info(`Cleaned up old shared data for user ${userId} (last modified: ${stats.mtime.toISOString()})`);
          }
        } catch (error) {
          logger.warn(`Failed to check/cleanup shared data for user ${userId}: ${error}`);
        }
      }

      if (cleanedCount > 0) {
        logger.info(`Cleanup completed: ${cleanedCount} shared directories removed`);
      } else {
        logger.info('No old shared data found to cleanup');
      }
    } catch (error) {
      logger.error(`Failed to cleanup old shared data: ${error}`);
      throw error;
    }

    return cleanedCount;
  }

  /**
   * Get all user IDs from user-data directory
   * @returns Array of user IDs (as numbers)
   */
  static async getAllUserIds(): Promise<number[]> {
    const userDataPath = join(process.cwd(), 'data', 'user-data');

    if (!existsSync(userDataPath)) {
      return [];
    }

    try {
      const entries = await readdir(userDataPath, { withFileTypes: true });
      const userIds: number[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const userId = parseInt(entry.name, 10);
          if (!isNaN(userId)) {
            userIds.push(userId);
          }
        }
      }

      return userIds;
    } catch (error) {
      logger.error(`Failed to get user IDs: ${error}`);
      return [];
    }
  }

  /**
   * Get storage statistics for all users
   * @returns Map of userId to storage statistics
   */
  static async getAllUsersStorageStats(): Promise<Map<number, UserStorageStats>> {
    const userIds = await this.getAllUserIds();
    const statsMap = new Map<number, UserStorageStats>();

    await Promise.all(
      userIds.map(async (userId) => {
        try {
          const stats = await this.getUserStorageStats(userId);
          statsMap.set(userId, stats);
        } catch (error) {
          logger.warn(`Failed to get storage stats for user ${userId}: ${error}`);
        }
      })
    );

    return statsMap;
  }

  /**
   * Get detailed storage statistics for admin API
   * Includes user information and pagination support
   */
  static async getAdminStorageStats(options?: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: 'totalSize' | 'username' | 'sessionsSize' | 'sharedSize';
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    users: Array<{
      userId: number;
      username: string;
      sessionsSize: number;
      sharedSize: number;
      totalSize: number;
      sessionsCount: number;
      isOverLimit: boolean;
    }>;
    total: number;
    page: number;
    limit: number;
  }> {
    const { UserModel } = await import('../models/user.model.js');

    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const search = options?.search;
    const sortBy = options?.sortBy || 'totalSize';
    const sortOrder = options?.sortOrder || 'desc';

    // Get all users with optional search filter
    const { items } = await UserModel.findAll({
      page: 1,
      limit: 10000,
      ...(search && { search }),
    });

    // Calculate storage stats for each user
    const userStats = await Promise.all(
      items.map(async (user) => {
        const stats = await this.getUserStorageStats(user.id);

        // Count sessions directories
        const sessionsPath = join(process.cwd(), 'data', 'user-data', String(user.id), 'sessions');
        let sessionsCount = 0;
        try {
          if (existsSync(sessionsPath)) {
            const entries = await readdir(sessionsPath, { withFileTypes: true });
            sessionsCount = entries.filter((e) => e.isDirectory()).length;
          }
        } catch (error) {
          // Ignore errors
        }

        return {
          userId: user.id,
          username: user.username,
          sessionsSize: stats.sessionsSize,
          sharedSize: stats.sharedSize,
          totalSize: stats.totalSize,
          sessionsCount,
          isOverLimit: stats.totalSize > STORAGE_CONFIG.MAX_TOTAL_SIZE_PER_USER,
        };
      })
    );

    // Sort results
    userStats.sort((a, b) => {
      const comparison = sortOrder === 'asc' ? 1 : -1;
      if (sortBy === 'totalSize') {
        return (a.totalSize - b.totalSize) * comparison;
      } else if (sortBy === 'sessionsSize') {
        return (a.sessionsSize - b.sessionsSize) * comparison;
      } else if (sortBy === 'sharedSize') {
        return (a.sharedSize - b.sharedSize) * comparison;
      } else if (sortBy === 'username') {
        return a.username.localeCompare(b.username) * comparison;
      }
      return 0;
    });

    // Paginate
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedUsers = userStats.slice(startIndex, endIndex);

    return {
      users: paginatedUsers,
      total: userStats.length,
      page,
      limit,
    };
  }

  /**
   * Cleanup user data by admin
   * @param userIds - Array of user IDs to cleanup
   * @param type - Type of cleanup: 'sessions', 'shared', or 'all'
   * @returns Cleanup result with statistics
   */
  static async adminCleanupUserData(
    userIds: number[],
    type: 'sessions' | 'shared' | 'all'
  ): Promise<{
    cleanedUsers: number;
    freedSpace: number;
    details: Array<{
      userId: number;
      username: string;
      freedSpace: number;
    }>;
  }> {
    const { UserModel } = await import('../models/user.model.js');
    const details: Array<{ userId: number; username: string; freedSpace: number }> = [];
    let totalFreedSpace = 0;

    for (const userId of userIds) {
      const user = await UserModel.findById(userId);
      if (!user) continue;

      let freedSpace = 0;

      // Get current stats before cleanup
      const statsBefore = await this.getUserStorageStats(userId);

      // Cleanup sessions
      if (type === 'sessions' || type === 'all') {
        try {
          await this.cleanupUserSessions(userId);
          freedSpace += statsBefore.sessionsSize;
        } catch (error) {
          logger.error(`Error cleaning up sessions for user ${userId}:`, error);
        }
      }

      // Cleanup shared
      if (type === 'shared' || type === 'all') {
        try {
          await this.cleanupUserShared(userId);
          freedSpace += statsBefore.sharedSize;
        } catch (error) {
          logger.error(`Error cleaning up shared data for user ${userId}:`, error);
        }
      }

      if (freedSpace > 0) {
        details.push({
          userId,
          username: user.username,
          freedSpace,
        });
        totalFreedSpace += freedSpace;
      }
    }

    return {
      cleanedUsers: details.length,
      freedSpace: totalFreedSpace,
      details,
    };
  }

  /**
   * Cleanup all old shared data by admin
   * @param days - Number of days (default: from config)
   * @returns Cleanup result
   */
  static async adminCleanupAllOldData(days?: number): Promise<{
    deletedCount: number;
    freedSpace: number;
  }> {
    const cleanupDays = days || STORAGE_CONFIG.SHARED_CLEANUP_AGE_DAYS;
    const userDataPath = join(process.cwd(), 'data', 'user-data');
    let deletedCount = 0;
    let freedSpace = 0;

    if (!existsSync(userDataPath)) {
      return { deletedCount: 0, freedSpace: 0 };
    }

    try {
      const users = await readdir(userDataPath, { withFileTypes: true });
      const cutoffTime = Date.now() - cleanupDays * 24 * 60 * 60 * 1000;

      for (const user of users) {
        if (!user.isDirectory()) continue;

        const userId = user.name;
        const sharedPath = join(userDataPath, userId, 'shared');

        if (!existsSync(sharedPath)) continue;

        try {
          const stats = await stat(sharedPath);
          const lastModified = stats.mtimeMs;

          if (lastModified < cutoffTime) {
            // Calculate size before deletion
            const size = await this.getDirectorySize(sharedPath);
            await rm(sharedPath, { recursive: true, force: true });
            deletedCount++;
            freedSpace += size;
            logger.info(`Cleaned up old shared data for user ${userId} (size: ${this.formatBytes(size)})`);
          }
        } catch (error) {
          logger.warn(`Failed to check/cleanup shared data for user ${userId}: ${error}`);
        }
      }

      logger.info(
        `Admin cleanup completed: ${deletedCount} directories removed, ${this.formatBytes(freedSpace)} freed`
      );
    } catch (error) {
      logger.error(`Failed to cleanup old shared data: ${error}`);
      throw error;
    }

    return { deletedCount, freedSpace };
  }

  /**
   * Get system-wide storage statistics for admin
   */
  static async getSystemStorageStats(): Promise<{
    totalUsers: number;
    totalStorageSize: number;
    uploadsSize: number;
    screenshotsSize: number;
    tempSize: number;
    userStorageSize: number;
  }> {
    const dataPath = join(process.cwd(), 'data');
    const uploadsPath = join(dataPath, 'uploads');
    const screenshotsPath = join(dataPath, 'screenshots');
    const tempPath = join(dataPath, 'temp');
    const userDataPath = join(dataPath, 'user-data');

    const [uploadsSize, screenshotsSize, tempSize, userStorageSize] = await Promise.all([
      this.getDirectorySize(uploadsPath),
      this.getDirectorySize(screenshotsPath),
      this.getDirectorySize(tempPath),
      this.getDirectorySize(userDataPath),
    ]);

    // Get total user count
    const userIds = await this.getAllUserIds();

    return {
      totalUsers: userIds.length,
      totalStorageSize: uploadsSize + screenshotsSize + tempSize + userStorageSize,
      uploadsSize,
      screenshotsSize,
      tempSize,
      userStorageSize,
    };
  }
}
