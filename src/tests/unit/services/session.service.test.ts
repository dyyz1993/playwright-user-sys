/**
 * SessionService 单元测试
 * 测试会话服务的业务逻辑
 *
 * 注意: 此测试使用 Mock 策略
 * - 真实执行: SessionService 的业务逻辑
 * - Mock: Models 层、connectionManager、logger、createWebhookEvent、db
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionStatus, WebhookEventType } from '../../../shared/types/index.js';

vi.mock('../../../models/user.model.js', () => ({
  UserModel: {
    findById: vi.fn(),
    deductCredits: vi.fn(),
  },
}));

vi.mock('../../../models/session.model.js', () => ({
  SessionModel: {
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    markDisconnected: vi.fn(),
    countActiveByUserId: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock('../../../models/machine.model.js', () => ({
  MachineModel: {
    findAvailable: vi.fn(),
    incrementInstanceCount: vi.fn().mockResolvedValue(1),
    decrementInstanceCount: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock('../../../services/machine-grpc.service.js', () => ({
  connectionManager: {
    launchBrowser: vi.fn(),
    closeBrowser: vi.fn(),
  },
}));

function createMockTrx(sessionData: Record<string, unknown> | null) {
  const queryBuilder: Record<string, ReturnType<typeof vi.fn>> = {
    where: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(sessionData),
    whereNotIn: vi.fn().mockReturnThis(),
    update: vi.fn().mockResolvedValue(1),
    decrement: vi.fn().mockResolvedValue(1),
    insert: vi.fn().mockResolvedValue([1]),
    raw: vi.fn((sql: string) => sql),
  };
  const trx = vi.fn().mockReturnValue(queryBuilder);
  return Object.assign(trx, queryBuilder);
}

vi.mock('../../../config/database.js', () => ({
  db: Object.assign(vi.fn(), {
    transaction: vi.fn(),
  }),
}));

vi.mock('../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../../utils/webhook.js', () => ({
  createWebhookEvent: vi.fn(),
}));

vi.mock('../../../config/env.js', () => ({
  env: {
    PUBLIC_MACHINE_ENDPOINT: '',
  },
}));

describe('SessionService', () => {
  let createBrowserSession: any;
  let handleSessionDisconnect: any;
  let releaseSessionFn: any;
  let UserModel: any;
  let SessionModel: any;
  let MachineModel: any;
  let connectionManager: any;
  let createWebhookEvent: any;
  let db: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await import('../../../services/session.service.js');
    createBrowserSession = module.createBrowserSession;
    handleSessionDisconnect = module.handleSessionDisconnect;
    releaseSessionFn = module.releaseSession;

    const userModule = await import('../../../models/user.model.js');
    UserModel = userModule.UserModel;

    const sessionModule = await import('../../../models/session.model.js');
    SessionModel = sessionModule.SessionModel;

    const machineModule = await import('../../../models/machine.model.js');
    MachineModel = machineModule.MachineModel;

    const grpcModule = await import('../../../services/machine-grpc.service.js');
    connectionManager = grpcModule.connectionManager;

    const webhookModule = await import('../../../utils/webhook.js');
    createWebhookEvent = webhookModule.createWebhookEvent;

    const dbModule = await import('../../../config/database.js');
    db = dbModule.db;
  });

  // ========================================
  // SS-01: 创建会话 - 正常流程
  // ========================================
  it('应该成功创建浏览器会话', async () => {
    vi.mocked(UserModel.findById).mockResolvedValue({
      id: 1,
      credits: 100,
    });

    vi.mocked(MachineModel.findAvailable).mockResolvedValue({
      id: 'machine-001',
      ip: '192.168.1.1',
      proxyPort: 8082,
    });

    vi.mocked(SessionModel.create).mockResolvedValue({
      id: 'session-001',
      user_id: 1,
      created_at: new Date(),
    });

    vi.mocked(connectionManager.launchBrowser).mockResolvedValue({
      port: 3000,
      browser_ws_endpoint: 'ws://localhost:9222',
    });

    vi.mocked(SessionModel.update).mockResolvedValue({
      id: 'session-001',
      machine_id: 'machine-001',
      port: 3000,
      status: SessionStatus.CREATED,
    });

    vi.mocked(createWebhookEvent).mockResolvedValue(undefined);

    const result = await createBrowserSession(1, { viewport: { width: 1920, height: 1080 } });

    expect(result.sessionId).toBe('session-001');
    expect(result.status).toBe(SessionStatus.CREATED);
    expect(result.machineId).toBe('machine-001');
    expect(result.browserWSEndpoint).toBe('ws://localhost:9222');
    expect(result.directUrl).toContain('sessionId=session-001');

    expect(UserModel.findById).toHaveBeenCalledWith(1);
    expect(MachineModel.findAvailable).toHaveBeenCalled();
    expect(SessionModel.create).toHaveBeenCalled();
    expect(connectionManager.launchBrowser).toHaveBeenCalledWith('machine-001', 'session-001', expect.any(Object));
    expect(SessionModel.update).toHaveBeenCalledWith(
      'session-001',
      expect.objectContaining({
        machine_id: 'machine-001',
        port: 3000,
        status: SessionStatus.CREATED,
      })
    );
    expect(createWebhookEvent).toHaveBeenCalledWith(1, WebhookEventType.SESSION_CREATED, expect.any(Object));
  });

  // ========================================
  // SS-02: 创建会话 - 用户不存在
  // ========================================
  it('用户不存在时应该抛出错误', async () => {
    vi.mocked(UserModel.findById).mockResolvedValue(null);

    await expect(createBrowserSession(999, {})).rejects.toThrow('用户不存在');

    expect(UserModel.findById).toHaveBeenCalledWith(999);
    expect(MachineModel.findAvailable).not.toHaveBeenCalled();
  });

  // ========================================
  // SS-03: 创建会话 - 点数不足
  // ========================================
  it('点数不足时应该抛出错误', async () => {
    vi.mocked(UserModel.findById).mockResolvedValue({
      id: 1,
      credits: 0,
    });

    await expect(createBrowserSession(1, {})).rejects.toThrow('点数不足');

    expect(MachineModel.findAvailable).not.toHaveBeenCalled();
  });

  // ========================================
  // SS-04: 创建会话 - 无可用机器
  // ========================================
  it('没有可用机器时应该抛出错误', async () => {
    vi.mocked(UserModel.findById).mockResolvedValue({
      id: 1,
      credits: 100,
    });

    vi.mocked(MachineModel.findAvailable).mockResolvedValue(null);

    await expect(createBrowserSession(1, {})).rejects.toThrow('当前没有可用的实例机器');

    expect(SessionModel.create).not.toHaveBeenCalled();
  });

  // ========================================
  // SS-05: 创建会话 - WebSocket 直连模式
  // ========================================
  it('WebSocket 直连模式应该设置 CONNECTED 状态', async () => {
    vi.mocked(UserModel.findById).mockResolvedValue({
      id: 1,
      credits: 100,
    });

    vi.mocked(MachineModel.findAvailable).mockResolvedValue({
      id: 'machine-001',
      ip: '192.168.1.1',
      proxyPort: 8082,
    });

    vi.mocked(SessionModel.create).mockResolvedValue({
      id: 'session-001',
      created_at: new Date(),
    });

    vi.mocked(connectionManager.launchBrowser).mockResolvedValue({
      port: 3000,
      browser_ws_endpoint: 'ws://localhost:9222',
    });

    vi.mocked(SessionModel.update).mockResolvedValue({});

    vi.mocked(createWebhookEvent).mockResolvedValue(undefined);

    const result = await createBrowserSession(1, {}, true);

    expect(result.status).toBe(SessionStatus.CONNECTED);
    expect(SessionModel.update).toHaveBeenCalledWith(
      'session-001',
      expect.objectContaining({
        status: SessionStatus.CONNECTED,
      })
    );
  });

  // ========================================
  // SS-06: 创建会话 - 使用公共端点
  // ========================================
  it('应该使用 PUBLIC_MACHINE_ENDPOINT 构建直连URL', async () => {
    const envModule = await import('../../../config/env.js');
    vi.spyOn(envModule, 'env', 'get').mockReturnValue({
      PUBLIC_MACHINE_ENDPOINT: 'public.example.com:8082',
    } as any);

    vi.mocked(UserModel.findById).mockResolvedValue({
      id: 1,
      credits: 100,
    });

    vi.mocked(MachineModel.findAvailable).mockResolvedValue({
      id: 'machine-001',
      ip: '192.168.1.1',
      proxyPort: 8082,
    });

    vi.mocked(SessionModel.create).mockResolvedValue({
      id: 'session-001',
      created_at: new Date(),
    });

    vi.mocked(connectionManager.launchBrowser).mockResolvedValue({
      port: 3000,
      browser_ws_endpoint: 'ws://localhost:9222',
    });

    vi.mocked(SessionModel.update).mockResolvedValue({});

    vi.mocked(createWebhookEvent).mockResolvedValue(undefined);

    const result = await createBrowserSession(1, {});

    expect(result.directUrl).toBe('ws://public.example.com:8082?sessionId=session-001');
  });

  // ========================================
  // SS-07: 创建会话 - 启动浏览器失败
  // ========================================
  it('启动浏览器失败时应该更新会话状态为 ERROR', async () => {
    vi.mocked(UserModel.findById).mockResolvedValue({
      id: 1,
      credits: 100,
    });

    vi.mocked(MachineModel.findAvailable).mockResolvedValue({
      id: 'machine-001',
      ip: '192.168.1.1',
    });

    vi.mocked(SessionModel.create).mockResolvedValue({
      id: 'session-001',
      created_at: new Date(),
    });

    vi.mocked(connectionManager.launchBrowser).mockRejectedValue(new Error('启动失败'));

    vi.mocked(SessionModel.update).mockResolvedValue({});

    await expect(createBrowserSession(1, {})).rejects.toThrow('启动浏览器实例失败');

    expect(SessionModel.update).toHaveBeenCalledWith('session-001', {
      status: SessionStatus.ERROR,
    });
  });

  // ========================================
  // SS-08: 处理会话断开 - 正常流程
  // ========================================
  it('应该正确处理会话断开连接', async () => {
    const trx = createMockTrx({
      id: 'session-001',
      status: SessionStatus.CONNECTED,
      start_time: new Date(Date.now() - 5 * 60 * 1000),
      created_at: new Date(),
      duration: 0,
      credits_used: 0,
      user_id: 1,
    });

    vi.mocked(db.transaction).mockImplementation(async (fn: Function) => fn(trx));
    vi.mocked(connectionManager.closeBrowser).mockResolvedValue(undefined);
    vi.mocked(createWebhookEvent).mockResolvedValue(undefined);

    await handleSessionDisconnect('session-001', 1, 'machine-001');

    expect(db.transaction).toHaveBeenCalled();
    expect(connectionManager.closeBrowser).toHaveBeenCalledWith('machine-001', 'session-001');
    expect(createWebhookEvent).toHaveBeenCalledWith(1, WebhookEventType.SESSION_DISCONNECTED, expect.any(Object));
  });

  // ========================================
  // SS-09: 处理会话断开 - 会话已断开
  // ========================================
  it('会话已断开时不应该重复处理', async () => {
    const trx = createMockTrx({
      id: 'session-001',
      status: SessionStatus.DISCONNECTED,
      start_time: new Date(),
      created_at: new Date(),
      duration: 300,
      credits_used: 5,
      user_id: 1,
    });

    vi.mocked(db.transaction).mockImplementation(async (fn: Function) => fn(trx));

    await handleSessionDisconnect('session-001', 1, 'machine-001');

    expect(connectionManager.closeBrowser).not.toHaveBeenCalled();
  });

  // ========================================
  // SS-10: releaseSession - 正常释放
  // ========================================
  it('releaseSession 应该在事务中完成所有操作', async () => {
    const trx = createMockTrx({
      id: 'session-001',
      status: SessionStatus.CONNECTED,
      start_time: new Date(Date.now() - 2 * 60 * 1000),
      created_at: new Date(),
      duration: 0,
      credits_used: 0,
      user_id: 1,
    });

    vi.mocked(db.transaction).mockImplementation(async (fn: Function) => fn(trx));

    const result = await releaseSessionFn({
      sessionId: 'session-001',
      userId: 1,
      machineId: 'machine-001',
    });

    expect(result.alreadyDisconnected).toBe(false);
    expect(result.duration).toBe(120);
    expect(result.creditsUsed).toBe(2);
    expect(trx.update).toHaveBeenCalled();
    expect(trx.decrement).toHaveBeenCalled();
    expect(trx.insert).toHaveBeenCalled();
  });

  // ========================================
  // SS-11: releaseSession - 已断开
  // ========================================
  it('releaseSession 已断开的会话返回 alreadyDisconnected', async () => {
    const trx = createMockTrx({
      id: 'session-001',
      status: SessionStatus.DISCONNECTED,
      duration: 100,
      credits_used: 2,
      user_id: 1,
    });

    vi.mocked(db.transaction).mockImplementation(async (fn: Function) => fn(trx));

    const result = await releaseSessionFn({
      sessionId: 'session-001',
      userId: 1,
      machineId: 'machine-001',
    });

    expect(result.alreadyDisconnected).toBe(true);
    expect(result.duration).toBe(100);
    expect(result.creditsUsed).toBe(2);
  });

  // ========================================
  // SS-12: releaseSession - 会话不存在
  // ========================================
  it('releaseSession 不存在的会话应该抛出错误', async () => {
    const queryBuilder = {
      where: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(null),
      whereNotIn: vi.fn().mockReturnThis(),
      update: vi.fn().mockResolvedValue(1),
      decrement: vi.fn().mockResolvedValue(1),
      insert: vi.fn().mockResolvedValue([1]),
      raw: vi.fn((sql: string) => sql),
    };
    const trx = vi.fn().mockReturnValue(queryBuilder);
    Object.assign(trx, queryBuilder);

    vi.mocked(db.transaction).mockImplementation(async (fn: Function) => fn(trx));

    await expect(
      releaseSessionFn({
        sessionId: 'nonexistent',
        userId: 1,
      })
    ).rejects.toThrow('会话不存在');
  });

  // ========================================
  // SS-13: releaseSession - 无机器不减少计数
  // ========================================
  it('releaseSession 无 machineId 时不减少机器实例计数', async () => {
    const trx = createMockTrx({
      id: 'session-001',
      status: SessionStatus.CONNECTED,
      start_time: new Date(),
      created_at: new Date(),
      duration: 0,
      credits_used: 0,
      user_id: 1,
    });

    vi.mocked(db.transaction).mockImplementation(async (fn: Function) => fn(trx));

    const result = await releaseSessionFn({
      sessionId: 'session-001',
      userId: 1,
    });

    expect(result.alreadyDisconnected).toBe(false);
    const updateCalls = vi.mocked(trx.update).mock.calls;
    const machineUpdateCall = updateCalls.find(
      (call: unknown[]) =>
        call.length > 0 &&
        typeof call[0] === 'object' &&
        call[0] !== null &&
        'instance_count' in (call[0] as Record<string, unknown>)
    );
    expect(machineUpdateCall).toBeUndefined();
  });
});
