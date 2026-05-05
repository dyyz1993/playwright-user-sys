/**
 * SessionService 单元测试
 * 测试会话服务的业务逻辑
 *
 * 注意: 此测试使用 Mock 策略
 * - 真实执行: SessionService 的业务逻辑
 * - Mock: Models 层、connectionManager、logger、createWebhookEvent
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionStatus, WebhookEventType } from '../../../shared/types/index.js';

// Mock 所有依赖
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
    decrementInstanceCount: vi.fn(),
  },
}));

vi.mock('../../../services/machine-grpc.service.js', () => ({
  connectionManager: {
    launchBrowser: vi.fn(),
    closeBrowser: vi.fn(),
  },
}));

vi.mock('../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
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
  let UserModel: any;
  let SessionModel: any;
  let MachineModel: any;
  let connectionManager: any;
  let createWebhookEvent: any;

  beforeEach(async () => {
    // 重置所有 mock
    vi.clearAllMocks();

    // 动态导入服务模块
    const module = await import('../../../services/session.service.js');
    createBrowserSession = module.createBrowserSession;
    handleSessionDisconnect = module.handleSessionDisconnect;

    // 获取 mock 实例
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
  });

  // ========================================
  // SS-01: 创建会话 - 正常流程
  // ========================================
  it('应该成功创建浏览器会话', async () => {
    // 配置 Mock
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

    // 调用服务
    const result = await createBrowserSession(1, { viewport: { width: 1920, height: 1080 } });

    // 验证结果
    expect(result.sessionId).toBe('session-001');
    expect(result.status).toBe(SessionStatus.CREATED);
    expect(result.machineId).toBe('machine-001');
    expect(result.browserWSEndpoint).toBe('ws://localhost:9222');
    expect(result.directUrl).toContain('sessionId=session-001');

    // 验证调用
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

    // 使用 isWebSocketDirect = true
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
    // 动态修改 env mock
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

    // 验证错误时更新会话状态
    expect(SessionModel.update).toHaveBeenCalledWith('session-001', {
      status: SessionStatus.ERROR,
    });
  });

  // ========================================
  // SS-08: 处理会话断开 - 正常流程
  // ========================================
  it('应该正确处理会话断开连接', async () => {
    const startTime = new Date(Date.now() - 5 * 60 * 1000); // 5分钟前开始

    // 第一次调用 findById 返回活跃会话
    vi.mocked(SessionModel.findById).mockResolvedValueOnce({
      id: 'session-001',
      user_id: 1,
      machine_id: 'machine-001',
      status: SessionStatus.CONNECTED,
      start_time: startTime,
      credits_used: 0,
    });

    vi.mocked(connectionManager.closeBrowser).mockResolvedValue(undefined);

    // markDisconnected 返回会话但不包含 credits_used (需要第二次 findById 获取)
    vi.mocked(SessionModel.markDisconnected).mockResolvedValue({
      id: 'session-001',
      duration: 300,
    });

    vi.mocked(MachineModel.decrementInstanceCount).mockResolvedValue(undefined);

    vi.mocked(createWebhookEvent).mockResolvedValue(undefined);

    vi.mocked(UserModel.deductCredits).mockResolvedValue(undefined);

    // 第二次调用 findById 返回更新后的会话，credits_used 仍为 0
    vi.mocked(SessionModel.findById).mockResolvedValueOnce({
      id: 'session-001',
      user_id: 1,
      machine_id: 'machine-001',
      status: SessionStatus.DISCONNECTED,
      duration: 300,
      credits_used: 0, // markDisconnected 没有设置 credits_used，所以仍为 0
    });

    await handleSessionDisconnect('session-001', 1, 'machine-001');

    // 验证调用
    expect(connectionManager.closeBrowser).toHaveBeenCalledWith('machine-001', 'session-001');
    expect(SessionModel.markDisconnected).toHaveBeenCalledWith('session-001', expect.any(Number));
    expect(MachineModel.decrementInstanceCount).toHaveBeenCalledWith('machine-001');
    expect(createWebhookEvent).toHaveBeenCalledWith(1, WebhookEventType.SESSION_DISCONNECTED, expect.any(Object));
    expect(UserModel.deductCredits).toHaveBeenCalledWith(1, 5); // 5分钟 = 5点
  });

  // ========================================
  // SS-09: 处理会话断开 - 会话已断开
  // ========================================
  it('会话已断开时不应该重复处理', async () => {
    vi.mocked(SessionModel.findById).mockResolvedValue({
      id: 'session-001',
      status: SessionStatus.DISCONNECTED,
    });

    await handleSessionDisconnect('session-001', 1, 'machine-001');

    // 不应该调用这些方法
    expect(connectionManager.closeBrowser).not.toHaveBeenCalled();
    expect(SessionModel.markDisconnected).not.toHaveBeenCalled();
    expect(MachineModel.decrementInstanceCount).not.toHaveBeenCalled();
  });
});
