/**
 * AdminSessionService 单元测试
 * 测试管理员会话管理服务的业务逻辑
 *
 * Mock 策略:
 * - Mock: SessionModel, MachineModel, UserModel, connectionManager, createWebhookEvent
 * - 真实执行: batchReleaseSessions, listSessions, getSessionStats, getSessionDetail 等业务逻辑
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionStatus, WebhookEventType } from '../../../shared/types/index.js';

vi.mock('../../../models/session/index.js', () => ({
  SessionModel: {
    findById: vi.fn(),
    markDisconnected: vi.fn(),
    findByUserId: vi.fn(),
    paginateSorted: vi.fn(),
    getStats: vi.fn(),
    getDetailById: vi.fn(),
    findActiveSessions: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../../models/machine.model.js', () => ({
  MachineModel: {
    decrementInstanceCount: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock('../../../models/user.model.js', () => ({
  UserModel: {
    findById: vi.fn(),
  },
}));

vi.mock('../../../services/machine-grpc/index.js', () => ({
  connectionManager: {
    closeBrowser: vi.fn(),
    launchBrowser: vi.fn(),
    isConnected: vi.fn(),
    sendRestartCommand: vi.fn(),
  },
}));

vi.mock('../../../utils/webhook.js', () => ({
  createWebhookEvent: vi.fn().mockResolvedValue(undefined),
}));

describe('AdminSessionService', () => {
  let SessionModel: ReturnType<typeof vi.fn>;
  let MachineModel: ReturnType<typeof vi.fn>;
  let UserModel: ReturnType<typeof vi.fn>;
  let connectionManager: ReturnType<typeof vi.fn>;
  let createWebhookEvent: ReturnType<typeof vi.fn>;

  const mockSession = {
    id: 'session-001',
    user_id: 1,
    machine_id: 'machine-001',
    status: SessionStatus.CONNECTED,
    start_time: new Date(Date.now() - 5 * 60 * 1000),
    created_at: new Date(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const sessionModule = await import('../../../models/session/index.js');
    SessionModel = sessionModule.SessionModel;

    const machineModule = await import('../../../models/machine.model.js');
    MachineModel = machineModule.MachineModel;

    const userModule = await import('../../../models/user.model.js');
    UserModel = userModule.UserModel;

    const grpcModule = await import('../../../services/machine-grpc/index.js');
    connectionManager = grpcModule.connectionManager;

    const webhookModule = await import('../../../utils/webhook.js');
    createWebhookEvent = webhookModule.createWebhookEvent;
  });

  // ========================================
  // AS-01: batchReleaseSessions - 正常释放
  // ========================================
  it('应该成功批量释放会话', async () => {
    vi.mocked(SessionModel.findById).mockResolvedValue(mockSession);
    vi.mocked(connectionManager.closeBrowser).mockResolvedValue(undefined);
    vi.mocked(SessionModel.markDisconnected).mockResolvedValue(undefined);
    vi.mocked(createWebhookEvent).mockResolvedValue(undefined);

    const { batchReleaseSessions } = await import('../../../services/admin-session.service.js');
    const result = await batchReleaseSessions(['session-001']);

    expect(result.released).toContain('session-001');
    expect(result.failed).toHaveLength(0);
    expect(connectionManager.closeBrowser).toHaveBeenCalledWith('machine-001', 'session-001');
    expect(MachineModel.decrementInstanceCount).toHaveBeenCalledWith('machine-001');
    expect(createWebhookEvent).toHaveBeenCalledWith(
      1,
      WebhookEventType.SESSION_DISCONNECTED,
      expect.objectContaining({ session_id: 'session-001' })
    );
  });

  // ========================================
  // AS-02: batchReleaseSessions - 会话不存在
  // ========================================
  it('会话不存在时应该标记为 failed', async () => {
    vi.mocked(SessionModel.findById).mockResolvedValue(null);

    const { batchReleaseSessions } = await import('../../../services/admin-session.service.js');
    const result = await batchReleaseSessions(['nonexistent']);

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].error).toBe('会话不存在');
  });

  // ========================================
  // AS-03: batchReleaseSessions - 已断开会话直接标记 released
  // ========================================
  it('已断开的会话应该直接标记为 released', async () => {
    vi.mocked(SessionModel.findById).mockResolvedValue({
      ...mockSession,
      status: SessionStatus.DISCONNECTED,
    });

    const { batchReleaseSessions } = await import('../../../services/admin-session.service.js');
    const result = await batchReleaseSessions(['session-001']);

    expect(result.released).toContain('session-001');
    expect(connectionManager.closeBrowser).not.toHaveBeenCalled();
  });

  // ========================================
  // AS-04: batchReleaseSessions - ERROR 状态也直接标记
  // ========================================
  it('ERROR 状态的会话应该直接标记为 released', async () => {
    vi.mocked(SessionModel.findById).mockResolvedValue({
      ...mockSession,
      status: SessionStatus.ERROR,
    });

    const { batchReleaseSessions } = await import('../../../services/admin-session.service.js');
    const result = await batchReleaseSessions(['session-001']);

    expect(result.released).toContain('session-001');
  });

  // ========================================
  // AS-05: batchReleaseSessions - 无 machine_id 的会话
  // ========================================
  it('无 machine_id 的会话应该直接标记断开', async () => {
    vi.mocked(SessionModel.findById).mockResolvedValue({
      ...mockSession,
      machine_id: null,
    });
    vi.mocked(SessionModel.markDisconnected).mockResolvedValue(undefined);

    const { batchReleaseSessions } = await import('../../../services/admin-session.service.js');
    const result = await batchReleaseSessions(['session-001']);

    expect(result.released).toContain('session-001');
    expect(SessionModel.markDisconnected).toHaveBeenCalled();
    expect(connectionManager.closeBrowser).not.toHaveBeenCalled();
  });

  // ========================================
  // AS-06: batchReleaseSessions - 机器关闭失败仍标记 released
  // ========================================
  it('关闭浏览器失败时仍应标记为 released（优雅降级）', async () => {
    vi.mocked(SessionModel.findById).mockResolvedValue(mockSession);
    vi.mocked(connectionManager.closeBrowser).mockRejectedValue(new Error('连接失败'));
    vi.mocked(SessionModel.markDisconnected).mockResolvedValue(undefined);

    const { batchReleaseSessions } = await import('../../../services/admin-session.service.js');
    const result = await batchReleaseSessions(['session-001']);

    expect(result.released).toContain('session-001');
    expect(SessionModel.markDisconnected).toHaveBeenCalled();
  });

  // ========================================
  // AS-07: getUserSessions - 委托给 SessionModel
  // ========================================
  it('getUserSessions 应该委托给 SessionModel.findByUserId', async () => {
    const mockResult = { items: [mockSession], total: 1 };
    vi.mocked(SessionModel.findByUserId).mockResolvedValue(mockResult as unknown as Record<string, unknown>);

    const { getUserSessions } = await import('../../../services/admin-session.service.js');
    const result = await getUserSessions(1, { page: '1', limit: '20' });

    expect(SessionModel.findByUserId).toHaveBeenCalledWith(1, { page: '1', limit: '20' });
    expect(result).toEqual(mockResult);
  });

  // ========================================
  // AS-08: findUserById - 委托给 UserModel
  // ========================================
  it('findUserById 应该委托给 UserModel.findById', async () => {
    vi.mocked(UserModel.findById).mockResolvedValue({ id: 1, username: 'test' });

    const { findUserById } = await import('../../../services/admin-session.service.js');
    const result = await findUserById(1);

    expect(UserModel.findById).toHaveBeenCalledWith(1);
    expect(result).toEqual({ id: 1, username: 'test' });
  });

  // ========================================
  // AS-09: listSessions - 正常查询
  // ========================================
  it('listSessions 应该正确解析参数并查询', async () => {
    const mockResult = { items: [], total: 0, page: 1, limit: 20, totalPages: 0 };
    vi.mocked(SessionModel.paginateSorted).mockResolvedValue(mockResult as unknown as Record<string, unknown>);

    const { listSessions } = await import('../../../services/admin-session.service.js');
    const result = await listSessions({ page: '2', limit: '10', sort: 'created_at', order: 'desc' });

    expect(SessionModel.paginateSorted).toHaveBeenCalledWith(2, 10, {
      sort: 'created_at',
      order: 'desc',
      filters: undefined,
    });
    expect(result).toEqual(mockResult);
  });

  // ========================================
  // AS-10: listSessions - 带 status 过滤
  // ========================================
  it('listSessions 应该支持 status 过滤', async () => {
    vi.mocked(SessionModel.paginateSorted).mockResolvedValue({} as unknown as Record<string, unknown>);

    const { listSessions } = await import('../../../services/admin-session.service.js');
    await listSessions({ page: '1', limit: '20', sort: 'created_at', order: 'desc', status: 'connected' });

    expect(SessionModel.paginateSorted).toHaveBeenCalledWith(
      1,
      20,
      expect.objectContaining({
        filters: expect.objectContaining({ status: 'connected' }),
      })
    );
  });

  // ========================================
  // AS-11: getSessionStats - 委托给 SessionModel
  // ========================================
  it('getSessionStats 应该委托给 SessionModel.getStats', async () => {
    const mockStats = { total: 100, connected: 10 };
    vi.mocked(SessionModel.getStats).mockResolvedValue(mockStats as unknown as Record<string, unknown>);

    const { getSessionStats } = await import('../../../services/admin-session.service.js');
    const result = await getSessionStats({});

    expect(SessionModel.getStats).toHaveBeenCalledWith(undefined);
    expect(result).toEqual(mockStats);
  });

  // ========================================
  // AS-12: getSessionDetail - 委托给 SessionModel
  // ========================================
  it('getSessionDetail 应该委托给 SessionModel.getDetailById', async () => {
    vi.mocked(SessionModel.getDetailById).mockResolvedValue(mockSession as unknown as Record<string, unknown>);

    const { getSessionDetail } = await import('../../../services/admin-session.service.js');
    const result = await getSessionDetail('session-001');

    expect(SessionModel.getDetailById).toHaveBeenCalledWith('session-001');
    expect(result).toEqual(mockSession);
  });

  // ========================================
  // AS-13: refreshSessionStatus - 指定 sessionIds
  // ========================================
  it('refreshSessionStatus 指定 sessionIds 应该返回对应状态', async () => {
    vi.mocked(SessionModel.findById).mockResolvedValue({ id: 's1', status: 'connected' });

    const { refreshSessionStatus } = await import('../../../services/admin-session.service.js');
    const result = await refreshSessionStatus(['s1']);

    expect(result).toEqual([{ id: 's1', status: 'connected' }]);
  });

  // ========================================
  // AS-14: refreshSessionStatus - 无 sessionIds 查全部活跃
  // ========================================
  it('refreshSessionStatus 无 sessionIds 应该查询全部活跃会话', async () => {
    vi.mocked(SessionModel.findActiveSessions).mockResolvedValue([{ id: 's1', status: 'connected' }]);

    const { refreshSessionStatus } = await import('../../../services/admin-session.service.js');
    const result = await refreshSessionStatus();

    expect(SessionModel.findActiveSessions).toHaveBeenCalled();
    expect(result).toEqual([{ id: 's1', status: 'connected' }]);
  });

  // ========================================
  // AS-15: refreshSessionStatus - 指定不存在的 sessionId 忽略
  // ========================================
  it('refreshSessionStatus 指定的 sessionId 不存在时应该忽略', async () => {
    vi.mocked(SessionModel.findById).mockResolvedValue(null);

    const { refreshSessionStatus } = await import('../../../services/admin-session.service.js');
    const result = await refreshSessionStatus(['nonexistent']);

    expect(result).toEqual([]);
  });
});
