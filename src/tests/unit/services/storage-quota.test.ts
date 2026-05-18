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

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;
const MAX_TOTAL = 5 * GB;

describe('Storage Quota - 配额用尽场景', () => {
  let StorageService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../../services/storage.service.js');
    StorageService = mod.StorageService;
  });

  async function mockUserStorage(sessionsSize: number, sharedSize: number) {
    const { existsSync } = await import('fs');
    const { readdir, stat } = await import('fs/promises');

    vi.mocked(existsSync).mockImplementation((p: string) => {
      if (typeof p === 'string' && p.includes('sessions')) return sessionsSize > 0;
      if (typeof p === 'string' && p.includes('shared')) return sharedSize > 0;
      return false;
    });

    vi.mocked(readdir).mockResolvedValue([{ name: 'data.bin', isDirectory: () => false, isFile: () => true }] as any);

    vi.mocked(stat).mockImplementation((_p: string) => {
      const pathStr = String(_p);
      if (pathStr.includes('sessions')) return Promise.resolve({ size: sessionsSize } as any);
      if (pathStr.includes('shared')) return Promise.resolve({ size: sharedSize } as any);
      return Promise.resolve({ size: 0 } as any);
    });
  }

  async function mockEmptyStorage() {
    const { existsSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValue(false);
  }

  it('SQ-01: 用户存储未超限时应该允许创建会话', async () => {
    await mockEmptyStorage();

    const result = await StorageService.checkUserStorageLimit(1, 100 * MB);

    expect(result.canCreateSession).toBe(true);
    expect(result.canCreateShared).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('SQ-02: 用户存储已达上限时应该拒绝所有操作', async () => {
    await mockUserStorage(5 * GB, 0);

    const result = await StorageService.checkUserStorageLimit(1, 1 * MB);

    expect(result.canCreateSession).toBe(false);
    expect(result.canCreateShared).toBe(false);
    expect(result.reason).toContain('Total storage limit exceeded');
  });

  it('SQ-03: 已用空间 + 新文件恰好等于配额时应该允许', async () => {
    const usedSize = MAX_TOTAL - 100 * MB;
    await mockUserStorage(usedSize, 0);

    const result = await StorageService.checkUserStorageLimit(1, 100 * MB);

    expect(result.canCreateSession).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('SQ-04: 已用空间 + 新文件超过配额时应该拒绝', async () => {
    const usedSize = MAX_TOTAL - 50 * MB;
    await mockUserStorage(usedSize, 0);

    const result = await StorageService.checkUserStorageLimit(1, 100 * MB);

    expect(result.canCreateSession).toBe(false);
    expect(result.reason).toContain('Total storage limit exceeded');
  });

  it('SQ-05: 配额为 0 时任何上传都应该被拒绝', async () => {
    const { STORAGE_CONFIG } = await import('../../../config/storage.config.js');
    (STORAGE_CONFIG as any).MAX_TOTAL_SIZE_PER_USER = 0;

    await mockEmptyStorage();

    const result = await StorageService.checkUserStorageLimit(1, 1);

    expect(result.canCreateSession).toBe(false);
    expect(result.canCreateShared).toBe(false);

    (STORAGE_CONFIG as any).MAX_TOTAL_SIZE_PER_USER = MAX_TOTAL;
  });

  it('SQ-06: 已用空间恰好等于配额但无新增时仍允许', async () => {
    await mockUserStorage(MAX_TOTAL, 0);

    const result = await StorageService.checkUserStorageLimit(1, 0);

    expect(result.canCreateSession).toBe(true);
    expect(result.canCreateShared).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('SQ-07: 超出配额 1 字节也应该被拒绝', async () => {
    await mockUserStorage(MAX_TOTAL + 1, 0);

    const result = await StorageService.checkUserStorageLimit(1, 0);

    expect(result.canCreateSession).toBe(false);
    expect(result.canCreateShared).toBe(false);
    expect(result.reason).toContain('Total storage limit exceeded');
  });

  it('SQ-08: 单个会话超过 500MB 限制应该被拒绝', async () => {
    await mockEmptyStorage();

    const result = await StorageService.checkUserStorageLimit(1, 501 * MB);

    expect(result.canCreateSession).toBe(false);
    expect(result.reason).toContain('Session size exceeds maximum limit');
  });

  it('SQ-09: 共享空间超限时应该禁止创建共享但允许会话', async () => {
    await mockUserStorage(0, 3 * GB);

    const result = await StorageService.checkUserStorageLimit(1, 0);

    expect(result.canCreateSession).toBe(true);
    expect(result.canCreateShared).toBe(false);
    expect(result.reason).toContain('Shared storage limit exceeded');
  });

  it('SQ-10: 拒绝时应该返回准确的当前存储统计', async () => {
    await mockUserStorage(4 * GB, 2 * GB);

    const result = await StorageService.checkUserStorageLimit(1, 2 * GB);

    expect(result.stats).toBeDefined();
    expect(result.stats.sessionsSize).toBe(4 * GB);
    expect(result.stats.sharedSize).toBe(2 * GB);
    expect(result.stats.totalSize).toBe(6 * GB);
  });

  it('SQ-11: 相同输入的多次配额检查结果应该一致', async () => {
    await mockUserStorage(3 * GB, 1 * GB);

    const result1 = await StorageService.checkUserStorageLimit(1, 100 * MB);
    const result2 = await StorageService.checkUserStorageLimit(1, 100 * MB);

    expect(result1.canCreateSession).toBe(result2.canCreateSession);
    expect(result1.canCreateShared).toBe(result2.canCreateShared);
    expect(result1.reason).toBe(result2.reason);
  });
});
