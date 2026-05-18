import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../config/database.js', () => ({
  db: {
    raw: vi.fn(),
  },
}));

vi.mock('@shared/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../models/session/session-stats.model.js', () => ({
  statsMethods: {
    countActiveSessions: vi.fn(),
    countAll: vi.fn(),
  },
}));

vi.mock('../../../models/machine.model.js', () => ({
  MachineModel: {
    countAll: vi.fn(),
    countOnline: vi.fn(),
  },
}));

describe('HealthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkDatabase', () => {
    it('should return ok when DB query succeeds', async () => {
      const { db } = await import('../../../config/database.js');
      vi.mocked(db.raw).mockResolvedValue([{ '1': 1 }]);

      const { checkDatabase } = await import('../../../services/health.service.js');
      const result = await checkDatabase();

      expect(result.status).toBe('ok');
      expect(result.responseTime).toBeTypeOf('number');
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
      expect(db.raw).toHaveBeenCalledWith('SELECT 1');
    });

    it('should return error when DB query fails', async () => {
      const { db } = await import('../../../config/database.js');
      vi.mocked(db.raw).mockRejectedValue(new Error('Connection refused'));

      const { checkDatabase } = await import('../../../services/health.service.js');
      const result = await checkDatabase();

      expect(result.status).toBe('error');
      expect(result.error).toBe('Connection refused');
    });

    it('should include responseTime on success', async () => {
      const { db } = await import('../../../config/database.js');
      vi.mocked(db.raw).mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve([{ '1': 1 }]), 10)));

      const { checkDatabase } = await import('../../../services/health.service.js');
      const result = await checkDatabase();

      expect(result.status).toBe('ok');
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('checkWebSocket', () => {
    it('should return ok with active connection count', async () => {
      const { checkWebSocket } = await import('../../../services/health.service.js');
      const result = checkWebSocket(5);

      expect(result.status).toBe('ok');
      expect(result.activeConnections).toBe(5);
    });

    it('should return ok with zero connections', async () => {
      const { checkWebSocket } = await import('../../../services/health.service.js');
      const result = checkWebSocket(0);

      expect(result.status).toBe('ok');
      expect(result.activeConnections).toBe(0);
    });
  });

  describe('checkGrpc', () => {
    it('should return ok when machines are connected', async () => {
      const { checkGrpc } = await import('../../../services/health.service.js');
      const result = await checkGrpc(
        () => ['machine-1', 'machine-2'],
        async () => 2
      );

      expect(result.status).toBe('ok');
      expect(result.machines).toBe(2);
    });

    it('should return disabled when no machines connected', async () => {
      const { checkGrpc } = await import('../../../services/health.service.js');
      const result = await checkGrpc(
        () => [],
        async () => 0
      );

      expect(result.status).toBe('disabled');
      expect(result.machines).toBe(0);
    });

    it('should return error on exception', async () => {
      const { checkGrpc } = await import('../../../services/health.service.js');
      const result = await checkGrpc(
        () => {
          throw new Error('gRPC unavailable');
        },
        async () => 0
      );

      expect(result.status).toBe('error');
      expect(result.error).toBe('gRPC unavailable');
    });
  });

  describe('getHealthStatus', () => {
    it('should return ok when all components are healthy', async () => {
      const { db } = await import('../../../config/database.js');
      vi.mocked(db.raw).mockResolvedValue([{ '1': 1 }]);

      const { getHealthStatus } = await import('../../../services/health.service.js');
      const result = await getHealthStatus({
        getActiveWsConnections: () => 3,
        getGrpcActiveConnections: () => ['m1'],
        getRegisteredMachineCount: async () => 1,
        getSqliteClient: () => 'better-sqlite3',
      });

      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
      expect(result.uptime).toBeTypeOf('number');
      expect(result.components.database.status).toBe('ok');
      expect(result.components.websocket.status).toBe('ok');
      expect(result.components.websocket.activeConnections).toBe(3);
      expect(result.components.grpc.status).toBe('ok');
      expect(result.components.grpc.machines).toBe(1);
    });

    it('should return degraded when DB fails', async () => {
      const { db } = await import('../../../config/database.js');
      vi.mocked(db.raw).mockRejectedValue(new Error('DB down'));

      const { getHealthStatus } = await import('../../../services/health.service.js');
      const result = await getHealthStatus({
        getActiveWsConnections: () => 0,
        getGrpcActiveConnections: () => [],
        getRegisteredMachineCount: async () => 0,
      });

      expect(result.status).toBe('degraded');
      expect(result.components.database.status).toBe('error');
      expect(result.components.database.error).toBe('DB down');
    });

    it('should return degraded when gRPC fails', async () => {
      const { db } = await import('../../../config/database.js');
      vi.mocked(db.raw).mockResolvedValue([{ '1': 1 }]);

      const { getHealthStatus } = await import('../../../services/health.service.js');
      const result = await getHealthStatus({
        getActiveWsConnections: () => 0,
        getGrpcActiveConnections: () => {
          throw new Error('gRPC down');
        },
        getRegisteredMachineCount: async () => 0,
      });

      expect(result.status).toBe('degraded');
      expect(result.components.grpc.status).toBe('error');
    });

    it('should return ok when gRPC is disabled (no machines) but others healthy', async () => {
      const { db } = await import('../../../config/database.js');
      vi.mocked(db.raw).mockResolvedValue([{ '1': 1 }]);

      const { getHealthStatus } = await import('../../../services/health.service.js');
      const result = await getHealthStatus({
        getActiveWsConnections: () => 0,
        getGrpcActiveConnections: () => [],
        getRegisteredMachineCount: async () => 0,
      });

      expect(result.status).toBe('ok');
      expect(result.components.grpc.status).toBe('disabled');
    });

    it('should work with default deps (no arguments)', async () => {
      const { db } = await import('../../../config/database.js');
      vi.mocked(db.raw).mockResolvedValue([{ '1': 1 }]);

      const { getHealthStatus } = await import('../../../services/health.service.js');
      const result = await getHealthStatus();

      expect(result.status).toBe('ok');
      expect(result.components.database.status).toBe('ok');
      expect(result.components.websocket.activeConnections).toBe(0);
      expect(result.components.grpc.status).toBe('disabled');
      expect(result.dbType).toBeDefined();
      expect(result.dbDriver).toBeDefined();
    });
  });

  describe('getMetrics', () => {
    it('should return metrics with all required fields', async () => {
      const { statsMethods } = await import('../../../models/session/session-stats.model.js');
      const { MachineModel } = await import('../../../models/machine.model.js');
      vi.mocked(statsMethods.countActiveSessions).mockResolvedValue(3);
      vi.mocked(statsMethods.countAll).mockResolvedValue(10);
      vi.mocked(MachineModel.countAll).mockResolvedValue(5);
      vi.mocked(MachineModel.countOnline).mockResolvedValue(2);

      const { getMetrics } = await import('../../../services/health.service.js');
      const result = await getMetrics({ getActiveWsConnections: () => 7 });

      expect(result.timestamp).toBeDefined();
      expect(typeof result.uptime).toBe('number');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
      expect(result.memory).toBeDefined();
      expect(typeof result.memory.rss).toBe('number');
      expect(typeof result.memory.heapUsed).toBe('number');
      expect(typeof result.memory.heapTotal).toBe('number');
      expect(typeof result.memory.external).toBe('number');
      expect(result.sessions).toEqual({ active: 3, total: 10 });
      expect(result.machines).toEqual({ registered: 5, online: 2 });
      expect(result.websocket).toEqual({ activeConnections: 7 });
    });

    it('should use process.memoryUsage() for memory data', async () => {
      const { statsMethods } = await import('../../../models/session/session-stats.model.js');
      const { MachineModel } = await import('../../../models/machine.model.js');
      vi.mocked(statsMethods.countActiveSessions).mockResolvedValue(0);
      vi.mocked(statsMethods.countAll).mockResolvedValue(0);
      vi.mocked(MachineModel.countAll).mockResolvedValue(0);
      vi.mocked(MachineModel.countOnline).mockResolvedValue(0);

      const memSpy = vi.spyOn(process, 'memoryUsage');
      const fakeMem = { rss: 100, heapUsed: 50, heapTotal: 80, external: 10, arrayBuffers: 5 };
      memSpy.mockReturnValue(fakeMem as NodeJS.MemoryUsage);

      const { getMetrics } = await import('../../../services/health.service.js');
      const result = await getMetrics();

      expect(memSpy).toHaveBeenCalled();
      expect(result.memory.rss).toBe(100);
      expect(result.memory.heapUsed).toBe(50);
      expect(result.memory.heapTotal).toBe(80);
      expect(result.memory.external).toBe(10);
      memSpy.mockRestore();
    });

    it('should use process.uptime() for uptime', async () => {
      const { statsMethods } = await import('../../../models/session/session-stats.model.js');
      const { MachineModel } = await import('../../../models/machine.model.js');
      vi.mocked(statsMethods.countActiveSessions).mockResolvedValue(0);
      vi.mocked(statsMethods.countAll).mockResolvedValue(0);
      vi.mocked(MachineModel.countAll).mockResolvedValue(0);
      vi.mocked(MachineModel.countOnline).mockResolvedValue(0);

      const uptimeSpy = vi.spyOn(process, 'uptime');
      uptimeSpy.mockReturnValue(12345.67);

      const { getMetrics } = await import('../../../services/health.service.js');
      const result = await getMetrics();

      expect(uptimeSpy).toHaveBeenCalled();
      expect(result.uptime).toBe(12345.67);
      uptimeSpy.mockRestore();
    });

    it('should handle missing session/machine deps gracefully', async () => {
      const { getMetrics } = await import('../../../services/health.service.js');
      const result = await getMetrics();

      expect(result.sessions).toEqual({ active: 0, total: 0 });
      expect(result.machines).toEqual({ registered: 0, online: 0 });
      expect(result.websocket).toEqual({ activeConnections: 0 });
    });

    it('should return ISO timestamp', async () => {
      const { statsMethods } = await import('../../../models/session/session-stats.model.js');
      const { MachineModel } = await import('../../../models/machine.model.js');
      vi.mocked(statsMethods.countActiveSessions).mockResolvedValue(0);
      vi.mocked(statsMethods.countAll).mockResolvedValue(0);
      vi.mocked(MachineModel.countAll).mockResolvedValue(0);
      vi.mocked(MachineModel.countOnline).mockResolvedValue(0);

      const { getMetrics } = await import('../../../services/health.service.js');
      const result = await getMetrics();

      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});
