/**
 * UserService 单元测试
 * 测试用户管理服务的业务逻辑
 *
 * Mock 策略:
 * - Mock: db (knex), UserModel, SessionModel, hashPassword, uuid, logger
 * - 真实执行: createUser, updateUser, deleteUser, addCredits, resetApiKey 等业务逻辑
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserRole, UserStatus } from '../../../shared/types/index.js';

vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('mock-uuid-key'),
}));

vi.mock('../../../config/database.js', () => {
  const dbFn = vi.fn();
  (dbFn as any).transaction = vi.fn();
  return { db: dbFn };
});

vi.mock('../../../models/user.model.js', () => ({
  UserModel: {
    findById: vi.fn(),
    findByUsername: vi.fn(),
    findByApiKey: vi.fn(),
    findAll: vi.fn(),
    getStats: vi.fn(),
    getCreditsStats: vi.fn(),
    countAll: vi.fn(),
    sumAllCredits: vi.fn(),
    countNewUsers: vi.fn(),
  },
}));

vi.mock('../../../models/session.model.js', () => ({
  SessionModel: {
    findActiveSessions: vi.fn().mockResolvedValue([]),
    getUserSessionStats: vi.fn(),
  },
}));

vi.mock('../../../utils/auth.js', () => ({
  hashPassword: vi.fn().mockResolvedValue('$2a$10$hashedpassword'),
}));

vi.mock('../../../shared/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('UserService', () => {
  let db: any;
  let UserModel: any;
  let SessionModel: any;
  let hashPassword: any;

  const mockUser = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
    credits: 100,
    api_key: 'api-key-123',
    created_at: new Date(),
    updated_at: new Date(),
  };

  function createTrx(overrides: Record<string, any> = {}) {
    const usersChain = {
      where: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(overrides.user ?? mockUser),
      insert: vi.fn().mockResolvedValue([1]),
      update: vi.fn().mockResolvedValue(1),
      delete: vi.fn().mockResolvedValue(1),
      increment: vi.fn().mockResolvedValue(1),
      decrement: vi.fn().mockResolvedValue(1),
    };
    const logsChain = {
      insert: vi.fn().mockResolvedValue([1]),
    };
    const trx = vi.fn().mockImplementation((table: string) => {
      if (table === 'users') return usersChain;
      if (table === 'operation_logs') return logsChain;
      return { where: vi.fn().mockReturnThis(), first: vi.fn().mockResolvedValue(null) };
    });
    return Object.assign(trx, { usersChain, logsChain });
  }

  beforeEach(async () => {
    vi.clearAllMocks();

    const dbModule = await import('../../../config/database.js');
    db = dbModule.db;

    const userModule = await import('../../../models/user.model.js');
    UserModel = userModule.UserModel;

    const sessionModule = await import('../../../models/session.model.js');
    SessionModel = sessionModule.SessionModel;

    const authModule = await import('../../../utils/auth.js');
    hashPassword = authModule.hashPassword;
  });

  // ========================================
  // USR-01: createUser - 正常创建
  // ========================================
  it('应该成功创建用户', async () => {
    const trx = createTrx();
    trx.usersChain.first.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...mockUser, id: 1 });
    vi.mocked(db.transaction).mockImplementation(async (fn: Function) => fn(trx));

    const { createUser } = await import('../../../services/user.service.js');
    const result = await createUser({ username: 'testuser', password: 'pass123', email: 'test@example.com' });

    expect(result.username).toBe('testuser');
    expect(trx.usersChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'testuser',
        email: 'test@example.com',
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      })
    );
    expect(hashPassword).toHaveBeenCalledWith('pass123');
  });

  // ========================================
  // USR-02: createUser - 用户名已存在
  // ========================================
  it('用户名已存在时应该抛出错误', async () => {
    const trx = createTrx();
    trx.usersChain.first.mockResolvedValueOnce(mockUser);
    vi.mocked(db.transaction).mockImplementation(async (fn: Function) => fn(trx));

    const { createUser } = await import('../../../services/user.service.js');
    await expect(createUser({ username: 'testuser', password: 'pass' })).rejects.toThrow('用户名 "testuser" 已存在');
  });

  // ========================================
  // USR-03: createUser - 带 adminId 记录操作日志
  // ========================================
  it('创建用户时带 adminId 应该记录操作日志', async () => {
    const trx = createTrx();
    trx.usersChain.first.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...mockUser, id: 1 });
    vi.mocked(db.transaction).mockImplementation(async (fn: Function) => fn(trx));

    const { createUser } = await import('../../../services/user.service.js');
    await createUser({ username: 'testuser', password: 'pass' }, 1);

    expect(trx.logsChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        admin_id: 1,
        action: '创建用户',
      })
    );
  });

  // ========================================
  // USR-04: updateUser - 正常更新
  // ========================================
  it('应该成功更新用户', async () => {
    const trx = createTrx();
    const updatedUser = { ...mockUser, email: 'new@example.com' };
    trx.usersChain.first.mockResolvedValueOnce(mockUser).mockResolvedValueOnce(updatedUser);
    vi.mocked(db.transaction).mockImplementation(async (fn: Function) => fn(trx));

    const { updateUser } = await import('../../../services/user.service.js');
    const result = await updateUser(1, { email: 'new@example.com' });

    expect(result).not.toBeNull();
    expect(result!.email).toBe('new@example.com');
    expect(trx.usersChain.update).toHaveBeenCalled();
  });

  // ========================================
  // USR-05: updateUser - 用户不存在返回 null
  // ========================================
  it('更新不存在的用户应该返回 null', async () => {
    const trx = createTrx();
    trx.usersChain.first.mockResolvedValueOnce(null);
    vi.mocked(db.transaction).mockImplementation(async (fn: Function) => fn(trx));

    const { updateUser } = await import('../../../services/user.service.js');
    const result = await updateUser(999, { email: 'a@b.com' });

    expect(result).toBeNull();
  });

  // ========================================
  // USR-06: updateUser - 更新密码时应该 hash
  // ========================================
  it('更新密码时应该调用 hashPassword', async () => {
    const trx = createTrx();
    trx.usersChain.first.mockResolvedValueOnce(mockUser).mockResolvedValueOnce(mockUser);
    vi.mocked(db.transaction).mockImplementation(async (fn: Function) => fn(trx));

    const { updateUser } = await import('../../../services/user.service.js');
    await updateUser(1, { password: 'newpass' });

    expect(hashPassword).toHaveBeenCalledWith('newpass');
  });

  // ========================================
  // USR-07: deleteUser - 正常删除
  // ========================================
  it('应该成功删除用户', async () => {
    const trx = createTrx();
    trx.usersChain.first.mockResolvedValue(mockUser);
    trx.usersChain.delete.mockResolvedValue(1);
    vi.mocked(db.transaction).mockImplementation(async (fn: Function) => fn(trx));

    const { deleteUser } = await import('../../../services/user.service.js');
    const result = await deleteUser(1);

    expect(result).toBe(true);
    expect(trx.usersChain.delete).toHaveBeenCalled();
  });

  // ========================================
  // USR-08: deleteUser - 用户有活跃会话
  // ========================================
  it('用户有活跃会话时应该抛出错误', async () => {
    vi.mocked(SessionModel.findActiveSessions).mockResolvedValueOnce([{ id: 'sess-1', user_id: 1 }]);

    const { deleteUser } = await import('../../../services/user.service.js');
    await expect(deleteUser(1)).rejects.toThrow('该用户有活跃会话，请先释放所有会话后再删除');
  });

  // ========================================
  // USR-09: deleteUser - 不允许删除管理员
  // ========================================
  it('不允许删除管理员账号', async () => {
    const trx = createTrx();
    const adminUser = { ...mockUser, role: UserRole.ADMIN };
    trx.usersChain.first.mockResolvedValue(adminUser);
    vi.mocked(db.transaction).mockImplementation(async (fn: Function) => fn(trx));

    const { deleteUser } = await import('../../../services/user.service.js');
    await expect(deleteUser(1)).rejects.toThrow('不允许删除管理员账号');
  });

  // ========================================
  // USR-10: deleteUser - 用户不存在
  // ========================================
  it('删除不存在的用户应该抛出错误', async () => {
    const trx = createTrx();
    trx.usersChain.first.mockResolvedValue(null);
    vi.mocked(db.transaction).mockImplementation(async (fn: Function) => fn(trx));

    const { deleteUser } = await import('../../../services/user.service.js');
    await expect(deleteUser(999)).rejects.toThrow('用户不存在');
  });

  // ========================================
  // USR-11: addCredits - 正常充值
  // ========================================
  it('应该成功添加点数', async () => {
    const trx = createTrx();
    trx.usersChain.first.mockResolvedValueOnce(mockUser).mockResolvedValueOnce({ ...mockUser, credits: 200 });
    vi.mocked(db.transaction).mockImplementation(async (fn: Function) => fn(trx));

    const { addCredits } = await import('../../../services/user.service.js');
    const result = await addCredits(1, 100);

    expect(result).not.toBeNull();
    expect(trx.usersChain.increment).toHaveBeenCalledWith('credits', 100);
  });

  // ========================================
  // USR-12: addCredits - 用户不存在
  // ========================================
  it('充值时用户不存在应该返回 null', async () => {
    const trx = createTrx();
    trx.usersChain.first.mockResolvedValueOnce(null);
    vi.mocked(db.transaction).mockImplementation(async (fn: Function) => fn(trx));

    const { addCredits } = await import('../../../services/user.service.js');
    const result = await addCredits(999, 100);

    expect(result).toBeNull();
  });

  // ========================================
  // USR-13: resetApiKey - 正常重置
  // ========================================
  it('应该成功重置 API Key', async () => {
    const trx = createTrx();
    trx.usersChain.first.mockResolvedValue(mockUser);
    vi.mocked(db.transaction).mockImplementation(async (fn: Function) => fn(trx));

    const { resetApiKey } = await import('../../../services/user.service.js');
    const result = await resetApiKey(1);

    expect(result).toBe('mock-uuid-key');
    expect(trx.usersChain.update).toHaveBeenCalledWith(expect.objectContaining({ api_key: 'mock-uuid-key' }));
  });

  // ========================================
  // USR-14: resetApiKey - 用户不存在
  // ========================================
  it('重置 API Key 时用户不存在应该抛出错误', async () => {
    const trx = createTrx();
    trx.usersChain.first.mockResolvedValue(null);
    vi.mocked(db.transaction).mockImplementation(async (fn: Function) => fn(trx));

    const { resetApiKey } = await import('../../../services/user.service.js');
    await expect(resetApiKey(999)).rejects.toThrow('用户不存在');
  });

  // ========================================
  // USR-15: listUsers - 委托给 UserModel
  // ========================================
  it('listUsers 应该委托给 UserModel.findAll', async () => {
    const mockResult = { items: [mockUser], total: 1, page: 1, limit: 20, totalPages: 1 };
    vi.mocked(UserModel.findAll).mockResolvedValue(mockResult as any);

    const { listUsers } = await import('../../../services/user.service.js');
    const result = await listUsers({ page: '1', limit: '20' });

    expect(UserModel.findAll).toHaveBeenCalledWith({ page: '1', limit: '20' });
    expect(result).toEqual(mockResult);
  });

  // ========================================
  // USR-16: getUserById - 委托给 UserModel
  // ========================================
  it('getUserById 应该委托给 UserModel.findById', async () => {
    vi.mocked(UserModel.findById).mockResolvedValue(mockUser as any);

    const { getUserById } = await import('../../../services/user.service.js');
    const result = await getUserById(1);

    expect(UserModel.findById).toHaveBeenCalledWith(1);
    expect(result).toEqual(mockUser);
  });

  // ========================================
  // USR-17: exportUsersCsv - CSV 导出
  // ========================================
  it('应该正确导出 CSV', async () => {
    vi.mocked(UserModel.findAll).mockResolvedValue({
      items: [mockUser],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    } as any);

    const { exportUsersCsv } = await import('../../../services/user.service.js');
    const csv = await exportUsersCsv({});

    expect(csv).toContain('ID');
    expect(csv).toContain('用户名');
    expect(csv).toContain('testuser');
    expect(csv).toContain('普通用户');
  });

  // ========================================
  // USR-18: batchDeleteUsers - 批量删除
  // ========================================
  it('应该批量删除用户（排除管理员和活跃会话）', async () => {
    const trx = createTrx();
    trx.usersChain.first.mockResolvedValue({ ...mockUser, id: 1 });
    trx.usersChain.delete.mockResolvedValue(1);
    vi.mocked(db.transaction).mockImplementation(async (fn: Function) => fn(trx));

    const { batchDeleteUsers } = await import('../../../services/user.service.js');
    const result = await batchDeleteUsers([1, 2], 1);

    expect(result.deleted).toContain(1);
  });

  // ========================================
  // USR-19: batchRecharge - 批量充值
  // ========================================
  it('应该批量充值', async () => {
    const trx = createTrx();
    trx.usersChain.first.mockResolvedValue({ ...mockUser, id: 1 });
    vi.mocked(db.transaction).mockImplementation(async (fn: Function) => fn(trx));

    const { batchRecharge } = await import('../../../services/user.service.js');
    const result = await batchRecharge([1], 50, 1);

    expect(result.recharged).toContain(1);
  });

  // ========================================
  // USR-20: batchRecharge - 用户不存在时标记 failed
  // ========================================
  it('批量充值时用户不存在应该标记为 failed', async () => {
    const trx = createTrx();
    trx.usersChain.first.mockResolvedValue(null);
    vi.mocked(db.transaction).mockImplementation(async (fn: Function) => fn(trx));

    const { batchRecharge } = await import('../../../services/user.service.js');
    const result = await batchRecharge([999], 50);

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].error).toBe('用户不存在');
  });
});
