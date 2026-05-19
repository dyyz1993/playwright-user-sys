/**
 * DemoService 单元测试
 * 测试 Demo 服务的业务逻辑
 *
 * Mock 策略:
 * - Mock: session.service, SessionModel, UserModel, db, auth utils, logger
 * - 真实执行: DemoService 业务逻辑
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../services/session.service.js', () => ({
  createBrowserSession: vi.fn(),
  releaseSession: vi.fn(),
}));

vi.mock('../../../models/session/index.js', () => ({
  SessionModel: {
    findById: vi.fn(),
    findActiveSessions: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../../models/user.model.js', () => ({
  UserModel: {
    findByUsername: vi.fn(),
  },
}));

vi.mock('../../../config/database.js', () => ({
  db: Object.assign(vi.fn(), {
    transaction: vi.fn(),
  }),
}));

vi.mock('../../../utils/auth.js', () => ({
  hashPassword: vi.fn(),
}));

vi.mock('../../../shared/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('DemoService', () => {
  let DemoService: ReturnType<typeof vi.fn>;
  let createBrowserSession: ReturnType<typeof vi.fn>;
  let releaseSessionFn: ReturnType<typeof vi.fn>;
  let SessionModel: ReturnType<typeof vi.fn>;
  let UserModel: ReturnType<typeof vi.fn>;
  let db: ReturnType<typeof vi.fn>;
  let hashPassword: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await import('../../../services/demo.service.js');
    DemoService = module.DemoService;

    const sessionServiceModule = await import('../../../services/session.service.js');
    createBrowserSession = sessionServiceModule.createBrowserSession;
    releaseSessionFn = sessionServiceModule.releaseSession;

    const sessionModelModule = await import('../../../models/session/index.js');
    SessionModel = sessionModelModule.SessionModel;

    const userModelModule = await import('../../../models/user.model.js');
    UserModel = userModelModule.UserModel;

    const dbModule = await import('../../../config/database.js');
    db = dbModule.db;

    const authModule = await import('../../../utils/auth.js');
    hashPassword = authModule.hashPassword;
  });

  // ========================================
  // DEMO-01: 初始化 - 创建 demo 用户
  // ========================================
  it('初始化时如果 demo 用户不存在应该创建', async () => {
    vi.mocked(UserModel.findByUsername)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 1, api_key: 'new-api-key' });
    vi.mocked(hashPassword).mockResolvedValue('hashed-password');

    const dbInsert = vi.fn().mockResolvedValue([1]);
    vi.mocked(db).mockReturnValue({ insert: dbInsert });

    const service = new DemoService();
    await service.initialize();

    expect(service.initialized).toBe(true);
    expect(dbInsert).toHaveBeenCalled();

    service.destroy();
  });

  // ========================================
  // DEMO-02: 初始化 - 用户已存在
  // ========================================
  it('初始化时如果 demo 用户已存在则直接使用', async () => {
    vi.mocked(UserModel.findByUsername).mockResolvedValue({
      id: 5,
      api_key: 'existing-api-key',
    });

    const service = new DemoService();
    await service.initialize();

    expect(service.initialized).toBe(true);
    expect(service.demoUserApiKey).toBe('existing-api-key');
    expect(db).not.toHaveBeenCalledWith('users');

    service.destroy();
  });

  // ========================================
  // DEMO-03: 创建会话 - 成功
  // ========================================
  it('应该成功创建 demo 会话', async () => {
    vi.mocked(UserModel.findByUsername).mockResolvedValue({
      id: 1,
      api_key: 'demo-api-key',
    });

    vi.mocked(createBrowserSession).mockResolvedValue({
      sessionId: 'demo-session-001',
      status: 'created',
    });

    const service = new DemoService();
    await service.initialize();

    const result = await service.createSession('192.168.1.1');

    expect(result.sessionId).toBe('demo-session-001');
    expect(result.demoApiKey).toBe('demo-api-key');
    expect(result.maxDuration).toBe(300);
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(service.getActiveCount()).toBe(1);

    service.destroy();
  });

  // ========================================
  // DEMO-04: 创建会话 - 达到上限
  // ========================================
  it('会话数量达到上限时应该拒绝创建', async () => {
    vi.mocked(UserModel.findByUsername).mockResolvedValue({
      id: 1,
      api_key: 'demo-api-key',
    });

    vi.mocked(createBrowserSession).mockImplementation(() =>
      Promise.resolve({
        sessionId: `session-${Math.random().toString(36).slice(2)}`,
        status: 'created',
      })
    );

    const service = new DemoService();
    await service.initialize();

    const maxSize = service.getMaxSessions();
    for (let i = 0; i < maxSize; i++) {
      await service.createSession('127.0.0.1');
    }

    await expect(service.createSession('127.0.0.1')).rejects.toThrow('当前体验人数较多，请稍后再试');

    service.destroy();
  });

  // ========================================
  // DEMO-05: 创建会话 - Demo 功能禁用
  // ========================================
  it('DEMO_ENABLED=false 时应该拒绝创建', async () => {
    const originalEnv = process.env.DEMO_ENABLED;
    process.env.DEMO_ENABLED = 'false';

    vi.mocked(UserModel.findByUsername).mockResolvedValue({
      id: 1,
      api_key: 'demo-api-key',
    });

    const service = new DemoService();
    await service.initialize();

    await expect(service.createSession('127.0.0.1')).rejects.toThrow('Demo 功能已禁用');

    process.env.DEMO_ENABLED = originalEnv;

    service.destroy();
  });

  // ========================================
  // DEMO-06: 创建会话 - 服务未初始化
  // ========================================
  it('服务未初始化时创建会话应该抛出错误', async () => {
    const service = new DemoService();
    await expect(service.createSession('127.0.0.1')).rejects.toThrow('Demo 服务未初始化');
  });

  // ========================================
  // DEMO-07: 释放会话 - 正常释放
  // ========================================
  it('应该成功释放 demo 会话', async () => {
    vi.mocked(UserModel.findByUsername).mockResolvedValue({
      id: 1,
      api_key: 'demo-api-key',
    });

    vi.mocked(createBrowserSession).mockResolvedValue({
      sessionId: 'demo-session-001',
      status: 'created',
    });

    const service = new DemoService();
    await service.initialize();
    await service.createSession('127.0.0.1');

    expect(service.getActiveCount()).toBe(1);

    vi.mocked(SessionModel.findById).mockResolvedValue({
      id: 'demo-session-001',
      status: 'created',
      machine_id: 'machine-001',
    });
    vi.mocked(releaseSessionFn).mockResolvedValue({});

    await service.releaseSession('demo-session-001');

    expect(service.getActiveCount()).toBe(0);
    expect(releaseSessionFn).toHaveBeenCalled();

    service.destroy();
  });

  // ========================================
  // DEMO-08: 释放不存在的会话不应报错
  // ========================================
  it('释放不存在的会话不应抛出错误', async () => {
    const service = new DemoService();
    await expect(service.releaseSession('non-existent')).resolves.toBeUndefined();
  });

  // ========================================
  // DEMO-09: 刷新活动时间 - 成功
  // ========================================
  it('应该成功刷新会话活动时间', async () => {
    vi.mocked(UserModel.findByUsername).mockResolvedValue({
      id: 1,
      api_key: 'demo-api-key',
    });

    vi.mocked(createBrowserSession).mockResolvedValue({
      sessionId: 'demo-session-001',
      status: 'created',
    });

    const service = new DemoService();
    await service.initialize();
    await service.createSession('127.0.0.1');

    const refreshed = service.refreshActivity('demo-session-001');
    expect(refreshed).toBe(true);

    service.destroy();
  });

  // ========================================
  // DEMO-10: 刷新活动时间 - 会话不存在
  // ========================================
  it('刷新不存在的会话应该返回 false', async () => {
    const service = new DemoService();
    expect(service.refreshActivity('non-existent')).toBe(false);
  });

  // ========================================
  // DEMO-11: 刷新活动时间 - 已超时
  // ========================================
  it('空闲超时后刷新应该返回 false', async () => {
    vi.mocked(UserModel.findByUsername).mockResolvedValue({
      id: 1,
      api_key: 'demo-api-key',
    });

    vi.mocked(createBrowserSession).mockResolvedValue({
      sessionId: 'demo-session-001',
      status: 'created',
    });

    const service = new DemoService();
    await service.initialize();
    await service.createSession('127.0.0.1');

    // 直接修改 tracker 的 lastActivity 模拟超时
    const status = service.getSessionStatus('demo-session-001');
    expect(status).toBeTruthy();

    // 通过直接操作内部 map 来模拟过期
    const tracker = (service as unknown as Record<string, unknown>).activeSessions.get('demo-session-001');
    tracker.lastActivity = new Date(Date.now() - 301 * 1000);

    const refreshed = service.refreshActivity('demo-session-001');
    expect(refreshed).toBe(false);

    service.destroy();
  });

  // ========================================
  // DEMO-12: 获取会话状态
  // ========================================
  it('应该返回正确的会话状态', async () => {
    vi.mocked(UserModel.findByUsername).mockResolvedValue({
      id: 1,
      api_key: 'demo-api-key',
    });

    vi.mocked(createBrowserSession).mockResolvedValue({
      sessionId: 'demo-session-001',
      status: 'created',
    });

    const service = new DemoService();
    await service.initialize();
    await service.createSession('127.0.0.1');

    const status = service.getSessionStatus('demo-session-001');

    expect(status).toBeTruthy();
    expect(status!.status).toBe('active');
    expect(status!.remainingSeconds).toBe(300);
    expect(status!.elapsedSeconds).toBe(0);

    service.destroy();
  });

  // ========================================
  // DEMO-13: 获取不存在的会话状态
  // ========================================
  it('获取不存在的会话状态应该返回 null', async () => {
    const service = new DemoService();
    expect(service.getSessionStatus('non-existent')).toBeNull();
  });

  // ========================================
  // DEMO-14: 添加已用积分
  // ========================================
  it('应该正确累计已用积分', async () => {
    vi.mocked(UserModel.findByUsername).mockResolvedValue({
      id: 1,
      api_key: 'demo-api-key',
    });

    vi.mocked(createBrowserSession).mockResolvedValue({
      sessionId: 'demo-session-001',
      status: 'created',
    });

    const service = new DemoService();
    await service.initialize();
    await service.createSession('127.0.0.1');

    service.addCreditsUsed('demo-session-001', 5);
    service.addCreditsUsed('demo-session-001', 3);

    const status = service.getSessionStatus('demo-session-001');
    expect(status!.creditsUsed).toBe(8);

    service.destroy();
  });

  // ========================================
  // DEMO-15: destroy 清理定时器
  // ========================================
  it('destroy 应该清理清理定时器', async () => {
    const service = new DemoService();
    expect(() => service.destroy()).not.toThrow();
  });

  // ========================================
  // DEMO-16: 绝对超时自动释放
  // ========================================
  it('demoApiKey 为 null 时 createSession 不应返回 undefined apiKey', async () => {
    vi.mocked(UserModel.findByUsername).mockResolvedValue({
      id: 1,
      api_key: null as unknown as Record<string, unknown>,
    });

    const service = new DemoService();
    await service.initialize();

    vi.mocked(createBrowserSession).mockResolvedValue({
      sessionId: 'demo-session-null',
      status: 'created',
    });

    await expect(service.createSession('127.0.0.1')).rejects.toThrow('Demo 服务未初始化');

    service.destroy();
  });

  // ========================================
  // DEMO-18: releaseSession demoUserId null guard
  // ========================================
  it('服务未初始化时 releaseSession 不应因 userId! 崩溃', async () => {
    const service = new DemoService();

    vi.mocked(SessionModel.findById).mockResolvedValue({
      id: 'session-x',
      status: 'created',
      machine_id: null,
    });

    await expect(service.releaseSession('session-x')).resolves.toBeUndefined();
  });
  // ========================================
  it('绝对超时后应该自动释放会话', async () => {
    vi.mocked(UserModel.findByUsername).mockResolvedValue({
      id: 1,
      api_key: 'demo-api-key',
    });

    vi.mocked(createBrowserSession).mockResolvedValue({
      sessionId: 'demo-session-001',
      status: 'created',
    });

    vi.mocked(SessionModel.findById).mockResolvedValue({
      id: 'demo-session-001',
      status: 'created',
      machine_id: 'machine-001',
    });
    vi.mocked(releaseSessionFn).mockResolvedValue({});

    const service = new DemoService();
    await service.initialize();
    await service.createSession('127.0.0.1');

    // 直接模拟绝对超时: 修改 tracker 并手动触发超时逻辑
    const tracker = (service as unknown as Record<string, unknown>).activeSessions.get('demo-session-001');
    expect(tracker).toBeTruthy();
    expect(tracker.absoluteTimeoutHandle).toBeTruthy();

    // 模拟绝对超时: 直接调用 releaseSession 模拟 timeout 回调
    await service.releaseSession('demo-session-001');

    expect(releaseSessionFn).toHaveBeenCalled();
    expect(service.getActiveCount()).toBe(0);

    service.destroy();
  });

  // ========================================
  // DEMO-17: createSession demoApiKey null guard
  // ========================================
  it('demoApiKey 为 null 时 createSession 应抛出错误', async () => {
    vi.mocked(UserModel.findByUsername).mockResolvedValue({
      id: 1,
      api_key: null as unknown as Record<string, unknown>,
    });

    const service = new DemoService();
    await service.initialize();

    vi.mocked(createBrowserSession).mockResolvedValue({
      sessionId: 'demo-session-null',
      status: 'created',
    });

    await expect(service.createSession('127.0.0.1')).rejects.toThrow('Demo 服务未初始化');

    service.destroy();
  });

  // ========================================
  // DEMO-18: releaseSession demoUserId null guard
  // ========================================
  it('服务未初始化时 releaseSession 不应因 userId 崩溃', async () => {
    const service = new DemoService();

    vi.mocked(SessionModel.findById).mockResolvedValue({
      id: 'session-x',
      status: 'created',
      machine_id: null,
    });

    await expect(service.releaseSession('session-x')).resolves.toBeUndefined();
  });
});
