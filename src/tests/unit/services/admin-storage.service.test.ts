/**
 * AdminStorageService 单元测试
 *
 * Mock 策略:
 * - Mock: UserModel, OperationLogModel, StorageService, logger, fs
 * - 真实执行: getStorageStats, cleanupUserData, cleanupAllOldData, getSystemStorageStats
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../models/user.model.js', () => ({
  UserModel: {
    findById: vi.fn(),
  },
}));

vi.mock('../../../models/operation-log.model.js', () => ({
  OperationLogModel: {
    create: vi.fn(),
  },
}));

vi.mock('../../../services/storage.service.js', () => ({
  StorageService: {
    getUserStorageStats: vi.fn(),
    getAdminStorageStats: vi.fn(),
    adminCleanupUserData: vi.fn(),
    adminCleanupAllOldData: vi.fn(),
    getSystemStorageStats: vi.fn(),
  },
}));

vi.mock('../../../shared/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readdirSync: vi.fn(),
}));

vi.mock('path', () => ({
  join: vi.fn((...args: string[]) => args.join('/')),
}));

describe('AdminStorageService', () => {
  let UserModel: ReturnType<typeof vi.fn>;
  let OperationLogModel: ReturnType<typeof vi.fn>;
  let StorageService: ReturnType<typeof vi.fn>;
  let logger: ReturnType<typeof vi.fn>;
  let fsModule: ReturnType<typeof vi.fn>;

  let getStorageStats: ReturnType<typeof vi.fn>;
  let cleanupUserData: ReturnType<typeof vi.fn>;
  let cleanupAllOldData: ReturnType<typeof vi.fn>;
  let getSystemStorageStats: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const userModule = await import('../../../models/user.model.js');
    UserModel = userModule.UserModel;

    const opLogModule = await import('../../../models/operation-log.model.js');
    OperationLogModel = opLogModule.OperationLogModel;

    const storageModule = await import('../../../services/storage.service.js');
    StorageService = storageModule.StorageService;

    const loggerModule = await import('../../../shared/utils/logger.js');
    logger = loggerModule.logger;

    fsModule = await import('fs');

    const adminStorage = await import('../../../services/admin-storage.service.js');
    getStorageStats = adminStorage.getStorageStats;
    cleanupUserData = adminStorage.cleanupUserData;
    cleanupAllOldData = adminStorage.cleanupAllOldData;
    getSystemStorageStats = adminStorage.getSystemStorageStats;
  });

  // ========================================
  // AS-01: getStorageStats - 按 userId 查询
  // ========================================
  it('应该按 userId 查询返回正确的存储统计', async () => {
    UserModel.findById.mockResolvedValue({ id: 1, username: 'testuser' });
    StorageService.getUserStorageStats.mockResolvedValue({
      sessionsSize: 1024,
      sharedSize: 2048,
      totalSize: 3072,
    });
    fsModule.existsSync.mockReturnValue(false);

    const result = await getStorageStats({ userId: 1 });

    expect(UserModel.findById).toHaveBeenCalledWith(1);
    expect(StorageService.getUserStorageStats).toHaveBeenCalledWith(1);
    expect(result).toEqual({
      users: [
        {
          userId: 1,
          username: 'testuser',
          sessionsSize: 1024,
          sharedSize: 2048,
          totalSize: 3072,
          sessionsCount: 0,
          isOverLimit: false,
        },
      ],
      total: 1,
      page: 1,
      limit: 1,
    });
  });

  // ========================================
  // AS-02: getStorageStats - 用户不存在
  // ========================================
  it('按 userId 查询时用户不存在应该抛出错误', async () => {
    UserModel.findById.mockResolvedValue(null);

    await expect(getStorageStats({ userId: 999 })).rejects.toThrow('用户不存在');
  });

  // ========================================
  // AS-03: getStorageStats - 按 userId 查询且目录存在
  // ========================================
  it('应该正确统计 sessions 目录数', async () => {
    UserModel.findById.mockResolvedValue({ id: 1, username: 'testuser' });
    StorageService.getUserStorageStats.mockResolvedValue({
      sessionsSize: 0,
      sharedSize: 0,
      totalSize: 0,
    });
    fsModule.existsSync.mockReturnValue(true);
    fsModule.readdirSync.mockReturnValue([
      { isDirectory: () => true },
      { isDirectory: () => false },
      { isDirectory: () => true },
    ]);

    const result = await getStorageStats({ userId: 1 });

    expect(result.users[0].sessionsCount).toBe(2);
  });

  // ========================================
  // AS-04: getStorageStats - 超限判断
  // ========================================
  it('超过 5GB 应该标记 isOverLimit 为 true', async () => {
    UserModel.findById.mockResolvedValue({ id: 1, username: 'biguser' });
    StorageService.getUserStorageStats.mockResolvedValue({
      sessionsSize: 3 * 1024 * 1024 * 1024,
      sharedSize: 3 * 1024 * 1024 * 1024,
      totalSize: 6 * 1024 * 1024 * 1024,
    });
    fsModule.existsSync.mockReturnValue(false);

    const result = await getStorageStats({ userId: 1 });

    expect(result.users[0].isOverLimit).toBe(true);
  });

  // ========================================
  // AS-05: getStorageStats - 分页 + 排序参数传递
  // ========================================
  it('不传 userId 时应该调用 getAdminStorageStats 并传递分页排序参数', async () => {
    const mockResult = { users: [], total: 0, page: 1, limit: 10 };
    StorageService.getAdminStorageStats.mockResolvedValue(mockResult);

    const result = await getStorageStats({
      page: 2,
      limit: 20,
      search: 'test',
      sortBy: 'totalSize',
      sortOrder: 'desc',
    });

    expect(StorageService.getAdminStorageStats).toHaveBeenCalledWith({
      page: 2,
      limit: 20,
      search: 'test',
      sortBy: 'totalSize',
      sortOrder: 'desc',
    });
    expect(result).toEqual(mockResult);
  });

  // ========================================
  // AS-06: getStorageStats - 无参数默认
  // ========================================
  it('无参数时应该调用 getAdminStorageStats', async () => {
    StorageService.getAdminStorageStats.mockResolvedValue({ users: [], total: 0 });

    await getStorageStats({});

    expect(StorageService.getAdminStorageStats).toHaveBeenCalledWith({
      page: undefined,
      limit: undefined,
      search: undefined,
      sortBy: undefined,
      sortOrder: undefined,
    });
  });

  // ========================================
  // AS-07: cleanupUserData - 正常清理
  // ========================================
  it('应该调用 StorageService.adminCleanupUserData 并记录日志', async () => {
    const mockResult = { cleanedUsers: 3, freedSpace: 1024 };
    StorageService.adminCleanupUserData.mockResolvedValue(mockResult);
    OperationLogModel.create.mockResolvedValue(undefined);

    const result = await cleanupUserData([1, 2, 3], 'all', 99);

    expect(StorageService.adminCleanupUserData).toHaveBeenCalledWith([1, 2, 3], 'all');
    expect(OperationLogModel.create).toHaveBeenCalledWith({
      admin_id: 99,
      action: '清理用户存储',
      details: {
        type: 'all',
        userIds: [1, 2, 3],
        cleanedUsers: 3,
        freedSpace: 1024,
      },
    });
    expect(result).toEqual(mockResult);
  });

  // ========================================
  // AS-08: cleanupUserData - 日志失败不抛错
  // ========================================
  it('日志记录失败时应该 warn 但不抛错', async () => {
    const mockResult = { cleanedUsers: 1, freedSpace: 512 };
    StorageService.adminCleanupUserData.mockResolvedValue(mockResult);
    OperationLogModel.create.mockRejectedValue(new Error('DB error'));

    const result = await cleanupUserData([1], 'sessions', 1);

    expect(logger.warn).toHaveBeenCalledWith('记录操作日志失败:', expect.any(Error));
    expect(result).toEqual(mockResult);
  });

  // ========================================
  // AS-09: cleanupUserData - type=sessions
  // ========================================
  it('type=sessions 时应该正确传递参数', async () => {
    StorageService.adminCleanupUserData.mockResolvedValue({ cleanedUsers: 0, freedSpace: 0 });
    OperationLogModel.create.mockResolvedValue(undefined);

    await cleanupUserData([5], 'sessions', 10);

    expect(StorageService.adminCleanupUserData).toHaveBeenCalledWith([5], 'sessions');
  });

  // ========================================
  // AS-10: cleanupAllOldData - 按天数清理
  // ========================================
  it('应该调用 StorageService.adminCleanupAllOldData 并传递天数', async () => {
    const mockResult = { deletedCount: 10, freedSpace: 4096 };
    StorageService.adminCleanupAllOldData.mockResolvedValue(mockResult);
    OperationLogModel.create.mockResolvedValue(undefined);

    const result = await cleanupAllOldData(30, 1);

    expect(StorageService.adminCleanupAllOldData).toHaveBeenCalledWith(30);
    expect(OperationLogModel.create).toHaveBeenCalledWith({
      admin_id: 1,
      action: '清理旧数据',
      details: {
        days: 30,
        deletedCount: 10,
        freedSpace: 4096,
      },
    });
    expect(result).toEqual(mockResult);
  });

  // ========================================
  // AS-11: cleanupAllOldData - days=undefined
  // ========================================
  it('days 为 undefined 时应该正确传递', async () => {
    StorageService.adminCleanupAllOldData.mockResolvedValue({ deletedCount: 0, freedSpace: 0 });
    OperationLogModel.create.mockResolvedValue(undefined);

    await cleanupAllOldData(undefined, 1);

    expect(StorageService.adminCleanupAllOldData).toHaveBeenCalledWith(undefined);
  });

  // ========================================
  // AS-12: cleanupAllOldData - 日志失败不抛错
  // ========================================
  it('日志记录失败时应该 warn 但不抛错', async () => {
    StorageService.adminCleanupAllOldData.mockResolvedValue({ deletedCount: 5, freedSpace: 100 });
    OperationLogModel.create.mockRejectedValue(new Error('DB error'));

    const result = await cleanupAllOldData(7, 2);

    expect(logger.warn).toHaveBeenCalledWith('记录操作日志失败:', expect.any(Error));
    expect(result).toEqual({ deletedCount: 5, freedSpace: 100 });
  });

  // ========================================
  // AS-13: getSystemStorageStats - 返回系统统计
  // ========================================
  it('应该返回 StorageService.getSystemStorageStats 的结果', async () => {
    const mockStats = { totalSize: 100000, userCount: 5, avgSize: 20000 };
    StorageService.getSystemStorageStats.mockResolvedValue(mockStats);

    const result = await getSystemStorageStats();

    expect(StorageService.getSystemStorageStats).toHaveBeenCalled();
    expect(result).toEqual(mockStats);
  });
});
