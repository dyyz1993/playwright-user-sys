import { OperationLogModel } from '../models/operation-log.model.js';
import { UserModel } from '../models/user.model.js';
import { join } from 'path';

export async function getStorageStats(query: {
  userId?: number;
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: 'totalSize' | 'username' | 'sessionsSize' | 'sharedSize';
  sortOrder?: 'asc' | 'desc';
}) {
  const { StorageService } = await import('./storage.service.js');

  if (query.userId) {
    const user = await UserModel.findById(query.userId);
    if (!user) {
      throw new Error('用户不存在');
    }

    const stats = await StorageService.getUserStorageStats(query.userId);
    const sessionsPath = join(process.cwd(), 'data', 'user-data', String(query.userId), 'sessions');
    let sessionsCount = 0;
    try {
      const { readdirSync, existsSync } = await import('fs');
      if (existsSync(sessionsPath)) {
        const entries = readdirSync(sessionsPath, { withFileTypes: true });
        sessionsCount = entries.filter((e: { isDirectory: () => boolean }) => e.isDirectory()).length;
      }
    } catch {
      // ignore
    }

    return {
      users: [
        {
          userId: user.id,
          username: user.username,
          sessionsSize: stats.sessionsSize,
          sharedSize: stats.sharedSize,
          totalSize: stats.totalSize,
          sessionsCount,
          isOverLimit: stats.totalSize > 5 * 1024 * 1024 * 1024,
        },
      ],
      total: 1,
      page: 1,
      limit: 1,
    };
  }

  return StorageService.getAdminStorageStats({
    page: query.page,
    limit: query.limit,
    search: query.search,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  });
}

export async function cleanupUserData(userIds: number[], type: 'sessions' | 'shared' | 'all', adminId: number) {
  const { StorageService } = await import('./storage.service.js');
  const result = await StorageService.adminCleanupUserData(userIds, type);

  OperationLogModel.create({
    admin_id: adminId,
    action: '清理用户存储',
    details: {
      type,
      userIds,
      cleanedUsers: result.cleanedUsers,
      freedSpace: result.freedSpace,
    },
  }).catch(() => {});

  return result;
}

export async function cleanupAllOldData(days: number | undefined, adminId: number) {
  const { StorageService } = await import('./storage.service.js');
  const result = await StorageService.adminCleanupAllOldData(days);

  OperationLogModel.create({
    admin_id: adminId,
    action: '清理旧数据',
    details: {
      days,
      deletedCount: result.deletedCount,
      freedSpace: result.freedSpace,
    },
  }).catch(() => {});

  return result;
}

export async function getSystemStorageStats() {
  const { StorageService } = await import('./storage.service.js');
  return StorageService.getSystemStorageStats();
}
