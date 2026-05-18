import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionStatus, WebhookEventType } from '../../../shared/types/index.js';

const mockFindActiveSessions = vi.fn();
const mockMarkDisconnected = vi.fn();
const mockBatchUpdate = vi.fn();
const mockFindById = vi.fn();
const mockDeductCredits = vi.fn();
const mockDecrementInstanceCount = vi.fn();
const mockGetActiveConnections = vi.fn<() => string[]>(() => []);
const mockCloseBrowser = vi.fn();
const mockSendCloseBrowserCommand = vi.fn();
const mockCreateWebhookEvent = vi.fn();

vi.mock('../../../models/session/index.js', () => ({
  SessionModel: {
    findActiveSessions: mockFindActiveSessions,
    markDisconnected: mockMarkDisconnected,
    batchUpdate: mockBatchUpdate,
  },
}));

vi.mock('../../../models/user.model.js', () => ({
  UserModel: {
    findById: mockFindById,
    deductCredits: mockDeductCredits,
  },
}));

vi.mock('../../../models/machine.model.js', () => ({
  MachineModel: {
    decrementInstanceCount: mockDecrementInstanceCount,
  },
}));

vi.mock('../../../services/machine-grpc/index.js', () => ({
  connectionManager: {
    getActiveConnections: mockGetActiveConnections,
    closeBrowser: mockCloseBrowser,
    sendCloseBrowserCommand: mockSendCloseBrowserCommand,
  },
}));

vi.mock('../../../utils/webhook.js', () => ({
  createWebhookEvent: mockCreateWebhookEvent,
}));

vi.mock('../../../config/database.js', () => ({
  db: {
    transaction: vi.fn((fn) =>
      fn({
        commit: vi.fn(),
        rollback: vi.fn(),
      })
    ),
  },
}));

describe('CreditsMonitorService', () => {
  let checkSessionCredits: () => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetActiveConnections.mockReturnValue([]);
    mockFindActiveSessions.mockResolvedValue([]);

    const mod = await import('../../../services/credits-monitor.service.js');
    checkSessionCredits = mod.checkSessionCredits;
  });

  it('CM-01: 没有活跃会话时应该正常处理', async () => {
    mockFindActiveSessions.mockResolvedValue([]);
    await checkSessionCredits();
    expect(mockFindActiveSessions).toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it('CM-02: 应该标记不在线机器上的会话为断开', async () => {
    const session = {
      id: 'sess-001',
      user_id: 1,
      machine_id: 'machine-001',
      status: SessionStatus.CONNECTED,
      duration: 0,
      start_time: null,
      credits_used: 0,
    };

    mockFindActiveSessions.mockResolvedValue([session]);
    mockGetActiveConnections.mockReturnValue([]);
    mockMarkDisconnected.mockResolvedValue({ ...session, status: SessionStatus.DISCONNECTED });

    await checkSessionCredits();

    expect(mockMarkDisconnected).toHaveBeenCalledWith('sess-001', 0);
  });

  it('CM-03: 应该扣除用户点数', async () => {
    const now = new Date();
    const startTime = new Date(now.getTime() - 120 * 1000);

    const session = {
      id: 'sess-002',
      user_id: 1,
      machine_id: 'machine-001',
      status: SessionStatus.CONNECTED,
      duration: 0,
      start_time: startTime,
      credits_used: 0,
    };

    const user = { id: 1, username: 'testuser', credits: 100 };

    mockFindActiveSessions.mockResolvedValue([session]);
    mockGetActiveConnections.mockReturnValue(['machine-001']);
    mockFindById.mockResolvedValue(user);
    mockBatchUpdate.mockResolvedValue(1);
    mockDeductCredits.mockResolvedValue({ ...user, credits: 98 });

    await checkSessionCredits();

    expect(mockDeductCredits).toHaveBeenCalled();
    expect(mockBatchUpdate).toHaveBeenCalled();
  });

  it('CM-04: 点数不足时应该关闭所有会话', async () => {
    const now = new Date();
    const startTime = new Date(now.getTime() - 60 * 1000);

    const session = {
      id: 'sess-003',
      user_id: 1,
      machine_id: 'machine-001',
      status: SessionStatus.CONNECTED,
      duration: 0,
      start_time: startTime,
      credits_used: 0,
    };

    const user = { id: 1, username: 'testuser', credits: 100 };

    mockFindActiveSessions.mockResolvedValue([session]);
    mockGetActiveConnections.mockReturnValue(['machine-001']);
    mockFindById.mockResolvedValueOnce(user);
    mockBatchUpdate.mockResolvedValue(1);
    mockDeductCredits.mockResolvedValue({ ...user, credits: 0 });
    mockFindById.mockResolvedValueOnce({ ...user, credits: 0 });
    mockCloseBrowser.mockResolvedValue(true);
    mockMarkDisconnected.mockResolvedValue({ ...session, status: SessionStatus.DISCONNECTED });
    mockDecrementInstanceCount.mockResolvedValue(1);

    await checkSessionCredits();

    expect(mockCloseBrowser).toHaveBeenCalledWith('machine-001', 'sess-003');
    expect(mockMarkDisconnected).toHaveBeenCalled();
    expect(mockDecrementInstanceCount).toHaveBeenCalledWith('machine-001');
    expect(mockCreateWebhookEvent).toHaveBeenCalledWith(
      1,
      WebhookEventType.CREDITS_DEPLETED,
      expect.objectContaining({ credits_remaining: 0 })
    );
  });

  it('CM-05: 点数即将不足时应该发送警告', async () => {
    const now = new Date();
    const startTime = new Date(now.getTime() - 60 * 1000);

    const session = {
      id: 'sess-004',
      user_id: 1,
      machine_id: 'machine-001',
      status: SessionStatus.CONNECTED,
      duration: 0,
      start_time: startTime,
      credits_used: 0,
    };

    const user = { id: 1, username: 'testuser', credits: 100 };

    mockFindActiveSessions.mockResolvedValue([session]);
    mockGetActiveConnections.mockReturnValue(['machine-001']);
    mockFindById.mockResolvedValueOnce(user);
    mockBatchUpdate.mockResolvedValue(1);
    mockDeductCredits.mockResolvedValue({ ...user, credits: 2 });
    mockFindById.mockResolvedValueOnce({ ...user, credits: 2 });

    await checkSessionCredits();

    expect(mockCreateWebhookEvent).toHaveBeenCalledWith(
      1,
      WebhookEventType.CREDITS_LOW,
      expect.objectContaining({ credits_remaining: 2 })
    );
  });

  it('CM-06: 用户不存在时应该跳过处理', async () => {
    const session = {
      id: 'sess-005',
      user_id: 999,
      machine_id: 'machine-001',
      status: SessionStatus.CONNECTED,
      duration: 0,
      start_time: new Date(),
      credits_used: 0,
    };

    mockFindActiveSessions.mockResolvedValue([session]);
    mockGetActiveConnections.mockReturnValue(['machine-001']);
    mockFindById.mockResolvedValue(null);

    await checkSessionCredits();

    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it('CM-07: 关闭浏览器失败时应该发送关闭命令', async () => {
    const now = new Date();
    const startTime = new Date(now.getTime() - 60 * 1000);

    const session = {
      id: 'sess-006',
      user_id: 1,
      machine_id: 'machine-001',
      status: SessionStatus.CONNECTED,
      duration: 0,
      start_time: startTime,
      credits_used: 0,
    };

    const user = { id: 1, username: 'testuser', credits: 100 };

    mockFindActiveSessions.mockResolvedValue([session]);
    mockGetActiveConnections.mockReturnValue(['machine-001']);
    mockFindById.mockResolvedValueOnce(user);
    mockBatchUpdate.mockResolvedValue(1);
    mockDeductCredits.mockResolvedValue({ ...user, credits: 0 });
    mockFindById.mockResolvedValueOnce({ ...user, credits: 0 });
    mockCloseBrowser.mockResolvedValue(false);
    mockMarkDisconnected.mockResolvedValue({ ...session, status: SessionStatus.DISCONNECTED });
    mockDecrementInstanceCount.mockResolvedValue(1);

    await checkSessionCredits();

    expect(mockSendCloseBrowserCommand).toHaveBeenCalledWith('machine-001', 'sess-006');
  });
});
