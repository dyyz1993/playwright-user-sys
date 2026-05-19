/**
 * StorageService 单元测试
 * 测试存储服务的业务逻辑
 *
 * Mock 策略:
 * - Mock: fs/promises, fs, STORAGE_CONFIG, logger, UserModel
 * - 真实执行: StorageService 的格式化、大小计算、限制检查、清理等业务逻辑
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
  stat: vi.fn(),
  rm: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
}));

vi.mock('../../../config/storage.config.js', () => ({
  STORAGE_CONFIG: {
    MAX_SESSION_SIZE: 500 * 1024 * 1024,
    MAX_SHARED_SIZE_PER_USER: 2 * 1024 * 1024 * 1024,
    MAX_TOTAL_SIZE_PER_USER: 5 * 1024 * 1024 * 1024,
    SHARED_CLEANUP_AGE_DAYS: 30,
  },
}));

vi.mock('../../../shared/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('StorageService', () => {
  let StorageService: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await import('../../../services/storage.service.js');
    StorageService = module.StorageService;
  });

  // ========================================
  // ST-01: formatBytes - 基本转换
  // ========================================
  it('应该正确格式化字节为人类可读格式', () => {
    expect(StorageService.formatBytes(0)).toBe('0 Bytes');
    expect(StorageService.formatBytes(1024)).toBe('1 KB');
    expect(StorageService.formatBytes(1024 * 1024)).toBe('1 MB');
    expect(StorageService.formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
  });

  // ========================================
  // ST-02: formatBytes - 自定义小数位
  // ========================================
  it('应该支持自定义小数位', () => {
    expect(StorageService.formatBytes(1536, 0)).toBe('2 KB');
    expect(StorageService.formatBytes(1536, 2)).toBe('1.5 KB');
    expect(StorageService.formatBytes(1536, 4)).toBe('1.5 KB');
  });

  // ========================================
  // ST-03: formatBytes - 负数小数位处理
  // ========================================
  it('负数小数位应该被当作 0 处理', () => {
    expect(StorageService.formatBytes(1536, -1)).toBe('2 KB');
  });

  // ========================================
  // ST-04: getDirectorySize - 目录不存在
  // ========================================
  it('目录不存在时应该返回 0', async () => {
    const { existsSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValue(false);

    const result = await StorageService.getDirectorySize('/nonexistent');

    expect(result).toBe(0);
  });

  // ========================================
  // ST-05: getDirectorySize - 空目录
  // ========================================
  it('空目录应该返回 0', async () => {
    const { existsSync } = await import('fs');
    const { readdir } = await import('fs/promises');

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdir).mockResolvedValue([]);

    const result = await StorageService.getDirectorySize('/empty');

    expect(result).toBe(0);
  });

  // ========================================
  // ST-06: getDirectorySize - 包含文件
  // ========================================
  it('包含文件的目录应该返回文件大小总和', async () => {
    const { existsSync } = await import('fs');
    const { readdir, stat } = await import('fs/promises');

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdir).mockResolvedValue([
      { name: 'a.txt', isDirectory: () => false, isFile: () => true },
      { name: 'b.txt', isDirectory: () => false, isFile: () => true },
    ] as unknown as Record<string, unknown>);
    vi.mocked(stat)
      .mockResolvedValueOnce({ size: 100 } as unknown as Record<string, unknown>)
      .mockResolvedValueOnce({ size: 200 } as unknown as Record<string, unknown>);

    const result = await StorageService.getDirectorySize('/files');

    expect(result).toBe(300);
  });

  // ========================================
  // ST-07: getDirectorySize - stat 失败跳过
  // ========================================
  it('stat 文件失败时应该跳过该文件', async () => {
    const { existsSync } = await import('fs');
    const { readdir, stat } = await import('fs/promises');

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdir).mockResolvedValue([
      { name: 'a.txt', isDirectory: () => false, isFile: () => true },
      { name: 'b.txt', isDirectory: () => false, isFile: () => true },
    ] as unknown as Record<string, unknown>);
    vi.mocked(stat)
      .mockRejectedValueOnce(new Error('permission denied'))
      .mockResolvedValueOnce({ size: 200 } as unknown as Record<string, unknown>);

    const result = await StorageService.getDirectorySize('/files');

    expect(result).toBe(200);
  });

  // ========================================
  // ST-08: getUserStorageStats - 返回正确结构
  // ========================================
  it('getUserStorageStats 应该返回正确的存储统计', async () => {
    const { existsSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValue(false);

    const result = await StorageService.getUserStorageStats(1);

    expect(result).toEqual({
      sessionsSize: 0,
      sharedSize: 0,
      totalSize: 0,
    });
  });

  // ========================================
  // ST-09: checkUserStorageLimit - 未超限
  // ========================================
  it('checkUserStorageLimit 未超限时应该允许创建', async () => {
    const { existsSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValue(false);

    const result = await StorageService.checkUserStorageLimit(1);

    expect(result.canCreateSession).toBe(true);
    expect(result.canCreateShared).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  // ========================================
  // ST-10: checkUserStorageLimit - 总量超限
  // ========================================
  it('checkUserStorageLimit 总量超限时应该禁止所有操作', async () => {
    const { existsSync } = await import('fs');
    const { readdir, stat } = await import('fs/promises');

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdir).mockResolvedValue([
      { name: 'big.txt', isDirectory: () => false, isFile: () => true },
    ] as unknown as Record<string, unknown>);
    vi.mocked(stat).mockResolvedValue({ size: 6 * 1024 * 1024 * 1024 } as unknown as Record<string, unknown>);

    const result = await StorageService.checkUserStorageLimit(1);

    expect(result.canCreateSession).toBe(false);
    expect(result.canCreateShared).toBe(false);
    expect(result.reason).toContain('Total storage limit exceeded');
  });

  // ========================================
  // ST-11: checkUserStorageLimit - 会话大小超限
  // ========================================
  it('checkUserStorageLimit 会话大小超过单个限制时应该禁止', async () => {
    const { existsSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValue(false);

    const result = await StorageService.checkUserStorageLimit(1, 600 * 1024 * 1024);

    expect(result.canCreateSession).toBe(false);
    expect(result.reason).toContain('Session size exceeds maximum limit');
  });

  // ========================================
  // ST-12: cleanupUserSessions - 目录不存在
  // ========================================
  it('cleanupUserSessions 目录不存在时应该直接返回', async () => {
    const { existsSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValue(false);

    const { rm } = await import('fs/promises');

    await StorageService.cleanupUserSessions(1, 'sess-001');

    expect(rm).not.toHaveBeenCalled();
  });

  // ========================================
  // ST-13: cleanupUserSessions - 正常清理指定会话
  // ========================================
  it('cleanupUserSessions 应该删除指定会话目录', async () => {
    const { existsSync } = await import('fs');
    const { rm } = await import('fs/promises');

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(rm).mockResolvedValue(undefined);

    await StorageService.cleanupUserSessions(1, 'sess-001');

    expect(rm).toHaveBeenCalledWith(expect.stringContaining('sessions/sess-001'), { recursive: true, force: true });
  });

  // ========================================
  // ST-14: cleanupUserSessions - 清理所有会话
  // ========================================
  it('cleanupUserSessions 不传 sessionId 应该删除所有会话目录', async () => {
    const { existsSync } = await import('fs');
    const { rm } = await import('fs/promises');

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(rm).mockResolvedValue(undefined);

    await StorageService.cleanupUserSessions(1);

    expect(rm).toHaveBeenCalledWith(expect.stringContaining('sessions'), { recursive: true, force: true });
  });

  // ========================================
  // ST-15: cleanupUserShared - 目录不存在
  // ========================================
  it('cleanupUserShared 目录不存在时应该直接返回', async () => {
    const { existsSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValue(false);

    const { rm } = await import('fs/promises');

    await StorageService.cleanupUserShared(1);

    expect(rm).not.toHaveBeenCalled();
  });

  // ========================================
  // ST-16: cleanupUserShared - 正常清理
  // ========================================
  it('cleanupUserShared 应该删除 shared 目录', async () => {
    const { existsSync } = await import('fs');
    const { rm } = await import('fs/promises');

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(rm).mockResolvedValue(undefined);

    await StorageService.cleanupUserShared(1);

    expect(rm).toHaveBeenCalledWith(expect.stringContaining('shared'), { recursive: true, force: true });
  });

  // ========================================
  // ST-17: getAllUserIds - 目录不存在
  // ========================================
  it('getAllUserIds 目录不存在时应该返回空数组', async () => {
    const { existsSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValue(false);

    const result = await StorageService.getAllUserIds();

    expect(result).toEqual([]);
  });

  // ========================================
  // ST-18: getAllUserIds - 解析用户 ID
  // ========================================
  it('getAllUserIds 应该从目录名解析用户 ID', async () => {
    const { existsSync } = await import('fs');
    const { readdir } = await import('fs/promises');

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdir).mockResolvedValue([
      { name: '1', isDirectory: () => true },
      { name: '2', isDirectory: () => true },
      { name: 'abc', isDirectory: () => true },
      { name: 'notadir.txt', isDirectory: () => false },
    ] as unknown as Record<string, unknown>);

    const result = await StorageService.getAllUserIds();

    expect(result).toEqual([1, 2]);
  });
});
