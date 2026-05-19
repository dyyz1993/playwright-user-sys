import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionStatus, WebhookEventType } from '../../../shared/types/index.js';

vi.mock('../../../models/machine.model.js', () => ({
  MachineModel: {
    update: vi.fn(),
    findByStatus: vi.fn(),
    deleteOldMachines: vi.fn(),
    decrementInstanceCount: vi.fn(),
  },
}));

vi.mock('../../../models/session/index.js', () => ({
  SessionModel: {
    findByMachineId: vi.fn(),
    findActiveSessionsByMachineId: vi.fn(),
    markError: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../../../models/user.model.js', () => ({
  UserModel: {
    deductCredits: vi.fn(),
  },
}));

vi.mock('../../../utils/webhook.js', () => ({
  createWebhookEvent: vi.fn(),
}));

vi.mock('../../../shared/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../services/machine-grpc/index.js', () => ({
  connectionManager: {
    getAllConnectedMachines: vi.fn().mockReturnValue([]),
    getActiveConnections: vi.fn().mockReturnValue([]),
  },
}));

vi.mock('../../../services/memory-store.service.js', () => ({
  memoryStore: {
    getAllMachines: vi.fn().mockReturnValue([]),
    getAllSessions: vi.fn().mockReturnValue([]),
    markMachineOffline: vi.fn(),
    updateSessionStatus: vi.fn(),
    getSession: vi.fn().mockReturnValue(undefined),
    loadInitialData: vi.fn(),
    cleanupOldSessions: vi.fn(),
    getOnlineMachines: vi.fn().mockReturnValue([]),
  },
}));

describe('MachineMonitorService', () => {
  let MachineModel: ReturnType<typeof vi.fn>;
  let SessionModel: ReturnType<typeof vi.fn>;
  let UserModel: ReturnType<typeof vi.fn>;
  let memoryStore: ReturnType<typeof vi.fn>;
  let connectionManager: ReturnType<typeof vi.fn>;
  let logger: ReturnType<typeof vi.fn>;
  let createWebhookEvent: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const machineModule = await import('../../../models/machine.model.js');
    MachineModel = machineModule.MachineModel;

    const sessionModule = await import('../../../models/session/index.js');
    SessionModel = sessionModule.SessionModel;

    const userModule = await import('../../../models/user.model.js');
    UserModel = userModule.UserModel;

    const memoryModule = await import('../../../services/memory-store.service.js');
    memoryStore = memoryModule.memoryStore;

    const grpcModule = await import('../../../services/machine-grpc/index.js');
    connectionManager = grpcModule.connectionManager;

    const loggerModule = await import('../../../shared/utils/logger.js');
    logger = loggerModule.logger;

    const webhookModule = await import('../../../utils/webhook.js');
    createWebhookEvent = webhookModule.createWebhookEvent;
  });

  describe('checkMachineStatus', () => {
    it('心跳超时应该标记机器离线', async () => {
      const oldHeartbeat = new Date(Date.now() - 60000);
      const mockMachines = [
        {
          machine_id: 'm1',
          online: true,
          last_heartbeat: oldHeartbeat,
        },
      ];

      vi.mocked(memoryStore.getAllMachines).mockReturnValue(mockMachines);
      vi.mocked(MachineModel.update).mockResolvedValue(undefined);

      const { checkMachineStatus } = await import('../../../services/machine-monitor.service.js');

      await checkMachineStatus();

      expect(memoryStore.markMachineOffline).toHaveBeenCalledWith('m1');
      expect(MachineModel.update).toHaveBeenCalledWith('m1', { status: 'offline' });
    });

    it('心跳正常的在线机器不应被标记离线', async () => {
      const recentHeartbeat = new Date(Date.now() - 5000);
      const mockMachines = [
        {
          machine_id: 'm1',
          online: true,
          last_heartbeat: recentHeartbeat,
        },
      ];

      vi.mocked(memoryStore.getAllMachines).mockReturnValue(mockMachines);

      const { checkMachineStatus } = await import('../../../services/machine-monitor.service.js');

      await checkMachineStatus();

      expect(memoryStore.markMachineOffline).not.toHaveBeenCalled();
    });

    it('已离线的机器不应被重复处理', async () => {
      const oldHeartbeat = new Date(Date.now() - 60000);
      const mockMachines = [
        {
          machine_id: 'm1',
          online: false,
          last_heartbeat: oldHeartbeat,
        },
      ];

      vi.mocked(memoryStore.getAllMachines).mockReturnValue(mockMachines);

      const { checkMachineStatus } = await import('../../../services/machine-monitor.service.js');

      await checkMachineStatus();

      expect(memoryStore.markMachineOffline).not.toHaveBeenCalled();
    });

    it('内存无数据时应该加载初始数据', async () => {
      vi.mocked(memoryStore.getAllMachines).mockReturnValueOnce([]).mockReturnValueOnce([]);

      const { checkMachineStatus } = await import('../../../services/machine-monitor.service.js');

      await checkMachineStatus();

      expect(memoryStore.loadInitialData).toHaveBeenCalled();
    });

    it('应该清理过期会话', async () => {
      vi.mocked(memoryStore.getAllMachines).mockReturnValue([]);

      const { checkMachineStatus } = await import('../../../services/machine-monitor.service.js');

      await checkMachineStatus();

      expect(memoryStore.cleanupOldSessions).toHaveBeenCalled();
    });

    it('检查异常不应抛出错误', async () => {
      vi.mocked(memoryStore.getAllMachines).mockImplementation(() => {
        throw new Error('unexpected');
      });

      const { checkMachineStatus } = await import('../../../services/machine-monitor.service.js');

      await expect(checkMachineStatus()).resolves.toBeUndefined();
    });
  });

  describe('forceCheckAllMachines', () => {
    it('应该将未连接的在线机器标记为离线', async () => {
      vi.mocked(MachineModel.findByStatus).mockResolvedValue({
        items: [{ id: 'm1' }, { id: 'm2' }],
      });
      vi.mocked(connectionManager.getAllConnectedMachines).mockReturnValue(['m2']);
      vi.mocked(MachineModel.update).mockResolvedValue(undefined);

      const { forceCheckAllMachines } = await import('../../../services/machine-monitor.service.js');

      await forceCheckAllMachines();

      expect(MachineModel.update).toHaveBeenCalledWith('m1', { status: 'offline' });
      expect(memoryStore.markMachineOffline).toHaveBeenCalledWith('m1');
    });

    it('所有机器都已连接时不应该更新', async () => {
      vi.mocked(MachineModel.findByStatus).mockResolvedValue({
        items: [{ id: 'm1' }],
      });
      vi.mocked(connectionManager.getAllConnectedMachines).mockReturnValue(['m1']);

      const { forceCheckAllMachines } = await import('../../../services/machine-monitor.service.js');

      await forceCheckAllMachines();

      expect(MachineModel.update).not.toHaveBeenCalled();
    });

    it('检查异常不应抛出错误', async () => {
      vi.mocked(MachineModel.findByStatus).mockRejectedValue(new Error('db error'));

      const { forceCheckAllMachines } = await import('../../../services/machine-monitor.service.js');

      await expect(forceCheckAllMachines()).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('cleanupOldMachines', () => {
    it('应该删除超过阈值的离线机器', async () => {
      vi.mocked(MachineModel.deleteOldMachines).mockResolvedValue(3);

      const { cleanupOldMachines } = await import('../../../services/machine-monitor.service.js');

      await cleanupOldMachines(30);

      expect(MachineModel.deleteOldMachines).toHaveBeenCalledWith(expect.any(Date));
    });

    it('使用默认阈值30天', async () => {
      vi.mocked(MachineModel.deleteOldMachines).mockResolvedValue(0);

      const { cleanupOldMachines } = await import('../../../services/machine-monitor.service.js');

      await cleanupOldMachines();

      const calledDate = MachineModel.deleteOldMachines.mock.calls[0][0] as Date;
      const daysDiff = Math.round((Date.now() - calledDate.getTime()) / (1000 * 60 * 60 * 24));
      expect(daysDiff).toBe(30);
    });

    it('清理异常不应抛出错误', async () => {
      vi.mocked(MachineModel.deleteOldMachines).mockRejectedValue(new Error('db error'));

      const { cleanupOldMachines } = await import('../../../services/machine-monitor.service.js');

      await expect(cleanupOldMachines()).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('startMachineMonitor', () => {
    it('应该返回定时器ID', async () => {
      const { startMachineMonitor } = await import('../../../services/machine-monitor.service.js');

      const timerId = await startMachineMonitor(60000);

      expect(timerId).toBeDefined();
      expect(typeof timerId).toBe('object');

      clearInterval(timerId);
    });

    it('应该加载初始数据并执行检查', async () => {
      vi.mocked(memoryStore.loadInitialData).mockResolvedValue(undefined);

      const { startMachineMonitor } = await import('../../../services/machine-monitor.service.js');

      const timerId = await startMachineMonitor(60000);

      expect(memoryStore.loadInitialData).toHaveBeenCalled();

      clearInterval(timerId);
    });
  });

  describe('stopMachineMonitor', () => {
    it('应该清除定时器', async () => {
      const { stopMachineMonitor } = await import('../../../services/machine-monitor.service.js');

      const mockTimer = setTimeout(() => {}, 10000);
      stopMachineMonitor(mockTimer);

      expect(logger.debug).toHaveBeenCalledWith('机器监控服务已停止');

      clearTimeout(mockTimer);
    });

    it('空定时器不应报错', async () => {
      const { stopMachineMonitor } = await import('../../../services/machine-monitor.service.js');

      stopMachineMonitor(null as unknown as Record<string, unknown>);

      expect(logger.debug).not.toHaveBeenCalled();
    });
  });
});
