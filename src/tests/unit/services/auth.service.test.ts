/**
 * AuthService 单元测试
 * 测试认证服务的业务逻辑
 *
 * Mock 策略:
 * - Mock: UserModel, auth utils, db, logger
 * - 真实执行: authenticateUser / webLogin 业务逻辑
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../models/user.model.js', () => ({
  UserModel: {
    findByUsername: vi.fn(),
  },
}));

vi.mock('../../../config/database.js', () => {
  const dbFn = vi.fn();
  (dbFn as unknown as Record<string, unknown>).transaction = vi.fn();
  return { db: dbFn };
});

vi.mock('../../../utils/auth.js', () => ({
  verifyPasswordWithMigration: vi.fn(),
  hashPassword: vi.fn(),
  generateToken: vi.fn(),
}));

vi.mock('../../../shared/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('AuthService', () => {
  let authenticateUser: ReturnType<typeof vi.fn>;
  let webLogin: ReturnType<typeof vi.fn>;
  let UserModel: ReturnType<typeof vi.fn>;
  let db: ReturnType<typeof vi.fn>;
  let verifyPasswordWithMigration: ReturnType<typeof vi.fn>;
  let hashPassword: ReturnType<typeof vi.fn>;
  let generateToken: ReturnType<typeof vi.fn>;

  const mockActiveUser = {
    id: 1,
    username: 'testuser',
    password: '$2a$10$hashedpassword',
    email: 'test@example.com',
    role: 'user',
    status: 'active',
    credits: 100,
    api_key: 'api-key-123',
    webhook_url: null,
    created_at: new Date(),
  };

  const mockAdminUser = {
    ...mockActiveUser,
    id: 2,
    username: 'admin',
    role: 'admin',
  };

  function setupDbMock(shouldReject = false) {
    const insertFn = vi.fn().mockReturnValue({
      catch: shouldReject
        ? vi.fn((handler: Function) => {
            handler(new Error('DB error'));
            return Promise.resolve(undefined);
          })
        : vi.fn().mockResolvedValue(undefined),
    });
    vi.mocked(db).mockReturnValue({ insert: insertFn });
    return { insertFn };
  }

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await import('../../../services/auth.service.js');
    authenticateUser = module.authenticateUser;
    webLogin = module.webLogin;

    const userModule = await import('../../../models/user.model.js');
    UserModel = userModule.UserModel;

    const dbModule = await import('../../../config/database.js');
    db = dbModule.db;

    const authModule = await import('../../../utils/auth.js');
    verifyPasswordWithMigration = authModule.verifyPasswordWithMigration;
    hashPassword = authModule.hashPassword;
    generateToken = authModule.generateToken;
  });

  // ========================================
  // AUTH-01: 登录成功 - 普通用户
  // ========================================
  it('应该成功认证普通用户', async () => {
    vi.mocked(UserModel.findByUsername).mockResolvedValue(mockActiveUser);
    vi.mocked(verifyPasswordWithMigration).mockResolvedValue({ valid: true, needsMigration: false });
    vi.mocked(generateToken).mockReturnValue('jwt-token-123');
    const { insertFn } = setupDbMock();

    const result = await authenticateUser('testuser', 'password123', '127.0.0.1');

    expect(result.user.id).toBe(1);
    expect(result.user.username).toBe('testuser');
    expect(result.user.role).toBe('user');
    expect(result.token).toBe('jwt-token-123');
    expect(UserModel.findByUsername).toHaveBeenCalledWith('testuser');
    expect(verifyPasswordWithMigration).toHaveBeenCalledWith('password123', '$2a$10$hashedpassword');
    expect(generateToken).toHaveBeenCalledWith({
      id: 1,
      username: 'testuser',
      role: 'user',
    });
  });

  // ========================================
  // AUTH-02: 登录成功 - 管理员
  // ========================================
  it('应该成功认证管理员用户', async () => {
    vi.mocked(UserModel.findByUsername).mockResolvedValue(mockAdminUser);
    vi.mocked(verifyPasswordWithMigration).mockResolvedValue({ valid: true, needsMigration: false });
    vi.mocked(generateToken).mockReturnValue('admin-jwt-token');
    setupDbMock();

    const result = await authenticateUser('admin', 'adminpass');

    expect(result.user.role).toBe('admin');
    expect(generateToken).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin' }));
  });

  // ========================================
  // AUTH-03: 用户不存在
  // ========================================
  it('用户不存在时应该抛出错误', async () => {
    vi.mocked(UserModel.findByUsername).mockResolvedValue(null);

    await expect(authenticateUser('nonexistent', 'password')).rejects.toThrow('用户名或密码错误');
    expect(verifyPasswordWithMigration).not.toHaveBeenCalled();
    expect(generateToken).not.toHaveBeenCalled();
  });

  // ========================================
  // AUTH-04: 密码错误
  // ========================================
  it('密码错误时应该抛出错误', async () => {
    vi.mocked(UserModel.findByUsername).mockResolvedValue(mockActiveUser);
    vi.mocked(verifyPasswordWithMigration).mockResolvedValue({ valid: false, needsMigration: false });

    await expect(authenticateUser('testuser', 'wrongpassword')).rejects.toThrow('用户名或密码错误');
    expect(generateToken).not.toHaveBeenCalled();
  });

  // ========================================
  // AUTH-05: 账户被禁用
  // ========================================
  it('账户被禁用时应该抛出错误', async () => {
    const disabledUser = { ...mockActiveUser, status: 'inactive' };
    vi.mocked(UserModel.findByUsername).mockResolvedValue(disabledUser);

    await expect(authenticateUser('testuser', 'password123')).rejects.toThrow('账户已被禁用');
    expect(verifyPasswordWithMigration).not.toHaveBeenCalled();
    expect(generateToken).not.toHaveBeenCalled();
  });

  // ========================================
  // AUTH-06: 密码迁移（SHA-256 → bcrypt）
  // ========================================
  it('需要密码迁移时应该更新密码', async () => {
    vi.mocked(UserModel.findByUsername).mockResolvedValue(mockActiveUser);
    vi.mocked(verifyPasswordWithMigration).mockResolvedValue({ valid: true, needsMigration: true });
    vi.mocked(hashPassword).mockResolvedValue('$2a$10$newhashed');
    vi.mocked(generateToken).mockReturnValue('jwt-token-migrated');

    const trxUpdate = vi.fn().mockResolvedValue(1);
    const trxFn = vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ update: trxUpdate }) });
    vi.mocked(db.transaction).mockImplementation(async (fn: Function) => fn(trxFn));

    setupDbMock();

    const result = await authenticateUser('testuser', 'password123');

    expect(hashPassword).toHaveBeenCalledWith('password123');
    expect(db.transaction).toHaveBeenCalled();
    expect(result.token).toBe('jwt-token-migrated');
  });

  // ========================================
  // AUTH-07: Token 生成包含正确 payload
  // ========================================
  it('应该生成包含正确信息的 token', async () => {
    vi.mocked(UserModel.findByUsername).mockResolvedValue(mockActiveUser);
    vi.mocked(verifyPasswordWithMigration).mockResolvedValue({ valid: true, needsMigration: false });
    vi.mocked(generateToken).mockReturnValue('generated-token');
    setupDbMock();

    await authenticateUser('testuser', 'password123');

    expect(generateToken).toHaveBeenCalledWith({
      id: 1,
      username: 'testuser',
      role: 'user',
    });
  });

  // ========================================
  // AUTH-08: 操作日志记录
  // ========================================
  it('应该记录登录操作日志', async () => {
    vi.mocked(UserModel.findByUsername).mockResolvedValue(mockActiveUser);
    vi.mocked(verifyPasswordWithMigration).mockResolvedValue({ valid: true, needsMigration: false });
    vi.mocked(generateToken).mockReturnValue('token');
    const { insertFn } = setupDbMock();

    await authenticateUser('testuser', 'password123', '192.168.1.1');

    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        admin_id: 1,
        action: 'login',
      })
    );

    const details = JSON.parse(insertFn.mock.calls[0][0].details);
    expect(details.username).toBe('testuser');
    expect(details.role).toBe('user');
    expect(details.ip).toBe('192.168.1.1');
  });

  // ========================================
  // AUTH-09: 操作日志失败不应影响登录
  // ========================================
  it('操作日志写入失败不应影响登录', async () => {
    vi.mocked(UserModel.findByUsername).mockResolvedValue(mockActiveUser);
    vi.mocked(verifyPasswordWithMigration).mockResolvedValue({ valid: true, needsMigration: false });
    vi.mocked(generateToken).mockReturnValue('token');
    setupDbMock(true);

    const result = await authenticateUser('testuser', 'password123');

    expect(result).toBeTruthy();
    expect(result.token).toBe('token');
  });

  // ========================================
  // AUTH-10: webLogin 委托给 authenticateUser
  // ========================================
  it('webLogin 应该委托给 authenticateUser', async () => {
    vi.mocked(UserModel.findByUsername).mockResolvedValue(mockActiveUser);
    vi.mocked(verifyPasswordWithMigration).mockResolvedValue({ valid: true, needsMigration: false });
    vi.mocked(generateToken).mockReturnValue('token');
    setupDbMock();

    const result = await webLogin('testuser', 'password123', '10.0.0.1');

    expect(result.user.username).toBe('testuser');
    expect(result.token).toBe('token');
  });

  // ========================================
  // AUTH-11: 无 IP 地址时也能正常登录
  // ========================================
  it('不传 IP 地址时应该正常登录', async () => {
    vi.mocked(UserModel.findByUsername).mockResolvedValue(mockActiveUser);
    vi.mocked(verifyPasswordWithMigration).mockResolvedValue({ valid: true, needsMigration: false });
    vi.mocked(generateToken).mockReturnValue('token');
    const { insertFn } = setupDbMock();

    const result = await authenticateUser('testuser', 'password123');

    expect(result.token).toBe('token');
    const details = JSON.parse(insertFn.mock.calls[0][0].details);
    expect(details.ip).toBeUndefined();
  });

  // ========================================
  // AUTH-12: 用户 email 为 null 时返回 null
  // ========================================
  it('用户 email 为空字符串时返回 null', async () => {
    const userNoEmail = { ...mockActiveUser, email: '' };
    vi.mocked(UserModel.findByUsername).mockResolvedValue(userNoEmail);
    vi.mocked(verifyPasswordWithMigration).mockResolvedValue({ valid: true, needsMigration: false });
    vi.mocked(generateToken).mockReturnValue('token');
    setupDbMock();

    const result = await authenticateUser('testuser', 'password123');

    expect(result.user.email).toBeNull();
  });
});
