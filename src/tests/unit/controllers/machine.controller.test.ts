import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';

vi.mock('../../../models/machine.model.js', () => ({
  MachineModel: {
    register: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    markOffline: vi.fn(),
    healthCheck: vi.fn(),
    batchHealthCheck: vi.fn(),
    deleteOldMachines: vi.fn(),
    findByStatus: vi.fn(),
    decrementInstanceCount: vi.fn(),
  },
}));

vi.mock('../../../models/session.model.js', () => ({
  SessionModel: {
    findByMachineId: vi.fn(),
    findActiveSessionsByMachineId: vi.fn(),
  },
}));

vi.mock('../../../services/memory-store.service.js', () => ({
  memoryStore: {
    getAllMachines: vi.fn().mockReturnValue([]),
    getMachine: vi.fn().mockReturnValue(undefined),
    getOnlineMachines: vi.fn().mockReturnValue([]),
    getAllSessions: vi.fn().mockReturnValue([]),
    removeMachine: vi.fn(),
    markMachineOffline: vi.fn(),
  },
}));

vi.mock('../../../services/machine-grpc.service.js', () => ({
  connectionManager: {
    isConnected: vi.fn(),
    sendRestartCommand: vi.fn(),
    sendShutdownCommand: vi.fn(),
    removeConnection: vi.fn(),
    getAllConnectedMachines: vi.fn().mockReturnValue([]),
  },
}));

vi.mock('../../../services/machine-monitor.service.js', () => ({
  forceCheckAllMachines: vi.fn(),
  cleanupOldMachines: vi.fn(),
}));

vi.mock('../../../utils/response.js', () => ({
  sendSuccess: vi.fn((reply, _data, _message, _statusCode) => {
    reply.status = vi.fn().mockReturnValue(reply);
    reply.send = vi.fn().mockReturnValue(reply);
    return reply;
  }),
  sendError: vi.fn((reply, _message, _statusCode) => {
    reply.status = vi.fn().mockReturnValue(reply);
    reply.send = vi.fn().mockReturnValue(reply);
    return reply;
  }),
  sendCreated: vi.fn((reply, _data, _message) => {
    reply.status = vi.fn().mockReturnValue(reply);
    reply.send = vi.fn().mockReturnValue(reply);
    return reply;
  }),
  sendPaginated: vi.fn((reply, _data) => {
    reply.status = vi.fn().mockReturnValue(reply);
    reply.send = vi.fn().mockReturnValue(reply);
    return reply;
  }),
}));

describe('MachineController', () => {
  let MachineModel: any;
  let SessionModel: any;
  let memoryStore: any;
  let connectionManager: any;
  let sendSuccess: any;
  let sendError: any;
  let sendCreated: any;
  let sendPaginated: any;
  let forceCheckAllMachines: any;
  let cleanupOldMachines: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const machineModule = await import('../../../models/machine.model.js');
    MachineModel = machineModule.MachineModel;

    const sessionModule = await import('../../../models/session.model.js');
    SessionModel = sessionModule.SessionModel;

    const memoryModule = await import('../../../services/memory-store.service.js');
    memoryStore = memoryModule.memoryStore;

    const grpcModule = await import('../../../services/machine-grpc.service.js');
    connectionManager = grpcModule.connectionManager;

    const responseModule = await import('../../../utils/response.js');
    sendSuccess = responseModule.sendSuccess;
    sendError = responseModule.sendError;
    sendCreated = responseModule.sendCreated;
    sendPaginated = responseModule.sendPaginated;

    const monitorModule = await import('../../../services/machine-monitor.service.js');
    forceCheckAllMachines = monitorModule.forceCheckAllMachines;
    cleanupOldMachines = monitorModule.cleanupOldMachines;
  });

  describe('registerMachine', () => {
    it('应该成功注册机器', async () => {
      const mockMachine = { id: 'machine-1', hostname: 'test-host', ip: '192.168.1.1' };
      vi.mocked(MachineModel.register).mockResolvedValue(mockMachine);

      const { registerMachine } = await import('../../../controllers/machine.controller.js');

      const request = {
        body: { id: 'machine-1', hostname: 'test-host', ip: '192.168.1.1' },
        log: { error: vi.fn() },
      } as any;

      const reply = {} as any;

      await registerMachine(request, reply);

      expect(MachineModel.register).toHaveBeenCalledWith({
        id: 'machine-1',
        hostname: 'test-host',
        ip: '192.168.1.1',
      });
      expect(sendCreated).toHaveBeenCalledWith(reply, mockMachine);
    });

    it('无效请求数据应该返回400错误', async () => {
      const { registerMachine } = await import('../../../controllers/machine.controller.js');

      const request = {
        body: { id: '', hostname: '', ip: 'invalid-ip' },
        log: { error: vi.fn() },
      } as any;

      const reply = {} as any;

      await registerMachine(request, reply);

      expect(sendError).toHaveBeenCalledWith(reply, expect.stringContaining('无效的请求数据'), 400);
    });

    it('注册异常应该返回500错误', async () => {
      vi.mocked(MachineModel.register).mockRejectedValue(new Error('db error'));

      const { registerMachine } = await import('../../../controllers/machine.controller.js');

      const request = {
        body: { id: 'machine-1', hostname: 'test-host', ip: '192.168.1.1' },
        log: { error: vi.fn() },
      } as any;

      const reply = {} as any;

      await registerMachine(request, reply);

      expect(sendError).toHaveBeenCalledWith(reply, '注册机器失败', 500);
    });
  });

  describe('updateMachineStatus', () => {
    it('应该成功更新机器状态', async () => {
      const existingMachine = { id: 'machine-1', status: 'online' };
      const updatedMachine = { id: 'machine-1', status: 'busy', cpuUsage: 80 };
      vi.mocked(MachineModel.findById).mockResolvedValue(existingMachine);
      vi.mocked(MachineModel.update).mockResolvedValue(updatedMachine);

      const { updateMachineStatus } = await import('../../../controllers/machine.controller.js');

      const request = {
        params: { id: 'machine-1' },
        body: { cpuUsage: 80, memoryUsage: 50, diskUsage: 30 },
        log: { error: vi.fn() },
      } as any;

      const reply = {} as any;

      await updateMachineStatus(request, reply);

      expect(sendSuccess).toHaveBeenCalledWith(reply, updatedMachine);
    });

    it('机器不存在应该返回404错误', async () => {
      vi.mocked(MachineModel.findById).mockResolvedValue(null);

      const { updateMachineStatus } = await import('../../../controllers/machine.controller.js');

      const request = {
        params: { id: 'nonexistent' },
        body: { cpuUsage: 80, memoryUsage: 50, diskUsage: 30 },
        log: { error: vi.fn() },
      } as any;

      const reply = {} as any;

      await updateMachineStatus(request, reply);

      expect(sendError).toHaveBeenCalledWith(reply, '机器不存在', 404);
    });

    it('无效的状态数据应该返回400错误', async () => {
      const { updateMachineStatus } = await import('../../../controllers/machine.controller.js');

      const request = {
        params: { id: 'machine-1' },
        body: { cpuUsage: 200, memoryUsage: 50, diskUsage: 30 },
        log: { error: vi.fn() },
      } as any;

      const reply = {} as any;

      await updateMachineStatus(request, reply);

      expect(sendError).toHaveBeenCalledWith(reply, expect.stringContaining('无效的请求数据'), 400);
    });
  });

  describe('getAllMachines', () => {
    it('从内存获取机器列表并分页', async () => {
      const mockMachines = [
        {
          machine_id: 'm1',
          name: 'host1',
          ip: '10.0.0.1',
          grpc_port: 50051,
          proxy_port: 8080,
          cpu_usage: 50,
          memory_usage: 60,
          disk_space: 70,
          active_sessions: 2,
          max_sessions: 5,
          online: true,
          last_heartbeat: new Date(),
        },
        {
          machine_id: 'm2',
          name: 'host2',
          ip: '10.0.0.2',
          grpc_port: 50052,
          proxy_port: 8081,
          cpu_usage: 30,
          memory_usage: 40,
          disk_space: 50,
          active_sessions: 1,
          max_sessions: 5,
          online: false,
          last_heartbeat: new Date(),
        },
      ];

      vi.mocked(memoryStore.getAllMachines).mockReturnValue(mockMachines);

      const { getAllMachines } = await import('../../../controllers/machine.controller.js');

      const request = {
        query: { page: '1', limit: '10' },
        log: { error: vi.fn() },
      } as any;

      const reply = {} as any;

      await getAllMachines(request, reply);

      expect(sendPaginated).toHaveBeenCalledWith(
        reply,
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              id: 'm1',
              status: 'online',
            }),
          ]),
          total: 2,
        })
      );
    });

    it('内存无数据时从数据库获取', async () => {
      vi.mocked(memoryStore.getAllMachines).mockReturnValue([]);
      const dbResult = { items: [{ id: 'm1', hostname: 'h1' }], total: 1, page: 1, limit: 10, totalPages: 1 };
      vi.mocked(MachineModel.findAll).mockResolvedValue(dbResult);

      const { getAllMachines } = await import('../../../controllers/machine.controller.js');

      const request = {
        query: { page: '1', limit: '10' },
        log: { error: vi.fn() },
      } as any;

      const reply = {} as any;

      await getAllMachines(request, reply);

      expect(MachineModel.findAll).toHaveBeenCalled();
      expect(sendPaginated).toHaveBeenCalledWith(reply, dbResult);
    });
  });

  describe('getMachineById', () => {
    it('从内存获取机器信息', async () => {
      const mockMachine = {
        machine_id: 'm1',
        name: 'host1',
        ip: '10.0.0.1',
        grpc_port: 50051,
        cpu_usage: 50,
        memory_usage: 60,
        disk_space: 70,
        active_sessions: 2,
        max_sessions: 5,
        online: true,
        last_heartbeat: new Date(),
      };
      vi.mocked(memoryStore.getMachine).mockReturnValue(mockMachine);

      const { getMachineById } = await import('../../../controllers/machine.controller.js');

      const request = {
        params: { id: 'm1' },
        log: { error: vi.fn() },
      } as any;

      const reply = {} as any;

      await getMachineById(request, reply);

      expect(sendSuccess).toHaveBeenCalledWith(
        reply,
        expect.objectContaining({
          id: 'm1',
          status: 'online',
        })
      );
    });

    it('内存无数据从数据库获取', async () => {
      vi.mocked(memoryStore.getMachine).mockReturnValue(undefined);
      const dbMachine = { id: 'm1', hostname: 'h1' };
      vi.mocked(MachineModel.findById).mockResolvedValue(dbMachine);

      const { getMachineById } = await import('../../../controllers/machine.controller.js');

      const request = {
        params: { id: 'm1' },
        log: { error: vi.fn() },
      } as any;

      const reply = {} as any;

      await getMachineById(request, reply);

      expect(MachineModel.findById).toHaveBeenCalledWith('m1');
      expect(sendSuccess).toHaveBeenCalledWith(reply, dbMachine);
    });

    it('机器不存在应该返回404错误', async () => {
      vi.mocked(memoryStore.getMachine).mockReturnValue(undefined);
      vi.mocked(MachineModel.findById).mockResolvedValue(null);

      const { getMachineById } = await import('../../../controllers/machine.controller.js');

      const request = {
        params: { id: 'nonexistent' },
        log: { error: vi.fn() },
      } as any;

      const reply = {} as any;

      await getMachineById(request, reply);

      expect(sendError).toHaveBeenCalledWith(reply, '机器不存在', 404);
    });
  });

  describe('markMachineOffline', () => {
    it('应该成功标记机器离线', async () => {
      vi.mocked(MachineModel.findById).mockResolvedValue({ id: 'm1', status: 'online' });
      vi.mocked(MachineModel.markOffline).mockResolvedValue(undefined);

      const { markMachineOffline } = await import('../../../controllers/machine.controller.js');

      const request = {
        params: { id: 'm1' },
        log: { error: vi.fn() },
      } as any;

      const reply = {} as any;

      await markMachineOffline(request, reply);

      expect(MachineModel.markOffline).toHaveBeenCalledWith('m1');
      expect(sendSuccess).toHaveBeenCalledWith(reply, { id: 'm1', status: 'offline' });
    });

    it('机器不存在应该返回404错误', async () => {
      vi.mocked(MachineModel.findById).mockResolvedValue(null);

      const { markMachineOffline } = await import('../../../controllers/machine.controller.js');

      const request = {
        params: { id: 'nonexistent' },
        log: { error: vi.fn() },
      } as any;

      const reply = {} as any;

      await markMachineOffline(request, reply);

      expect(sendError).toHaveBeenCalledWith(reply, '机器不存在', 404);
    });
  });

  describe('healthCheck', () => {
    it('应该成功返回健康检查结果', async () => {
      const mockResult = { status: 'healthy', machineId: 'm1' };
      vi.mocked(MachineModel.healthCheck).mockResolvedValue(mockResult);

      const { healthCheck } = await import('../../../controllers/machine.controller.js');

      const request = {
        params: { id: 'm1' },
        log: { error: vi.fn() },
      } as any;

      const reply = {} as any;

      await healthCheck(request, reply);

      expect(MachineModel.healthCheck).toHaveBeenCalledWith('m1');
      expect(sendSuccess).toHaveBeenCalledWith(reply, mockResult);
    });

    it('健康检查异常应该返回500错误', async () => {
      vi.mocked(MachineModel.healthCheck).mockRejectedValue(new Error('check failed'));

      const { healthCheck } = await import('../../../controllers/machine.controller.js');

      const request = {
        params: { id: 'm1' },
        log: { error: vi.fn() },
      } as any;

      const reply = {} as any;

      await healthCheck(request, reply);

      expect(sendError).toHaveBeenCalledWith(reply, '健康检查失败', 500);
    });
  });

  describe('batchHealthCheck', () => {
    it('应该成功返回批量健康检查结果', async () => {
      const mockResults = [
        { machineId: 'm1', status: 'healthy' },
        { machineId: 'm2', status: 'unhealthy' },
      ];
      vi.mocked(MachineModel.batchHealthCheck).mockResolvedValue(mockResults);

      const { batchHealthCheck } = await import('../../../controllers/machine.controller.js');

      const request = {
        body: { machineIds: ['m1', 'm2'] },
        log: { error: vi.fn() },
      } as any;

      const reply = {} as any;

      await batchHealthCheck(request, reply);

      expect(sendSuccess).toHaveBeenCalledWith(
        reply,
        expect.objectContaining({
          total: 2,
          healthy: 1,
          unhealthy: 1,
        })
      );
    });

    it('空ID列表应该返回400错误', async () => {
      const { batchHealthCheck } = await import('../../../controllers/machine.controller.js');

      const request = {
        body: { machineIds: [] },
        log: { error: vi.fn() },
      } as any;

      const reply = {} as any;

      await batchHealthCheck(request, reply);

      expect(sendError).toHaveBeenCalledWith(reply, '无效的机器 ID 列表', 400);
    });

    it('非数组ID列表应该返回400错误', async () => {
      const { batchHealthCheck } = await import('../../../controllers/machine.controller.js');

      const request = {
        body: { machineIds: 'not-array' },
        log: { error: vi.fn() },
      } as any;

      const reply = {} as any;

      await batchHealthCheck(request, reply);

      expect(sendError).toHaveBeenCalledWith(reply, '无效的机器 ID 列表', 400);
    });
  });

  describe('updateMachineConfig', () => {
    it('应该成功更新机器配置', async () => {
      vi.mocked(MachineModel.findById).mockResolvedValue({ id: 'm1' });
      const updated = { id: 'm1', ip: '10.0.0.5' };
      vi.mocked(MachineModel.update).mockResolvedValue(updated);

      const { updateMachineConfig } = await import('../../../controllers/machine.controller.js');

      const request = {
        params: { id: 'm1' },
        body: { ip: '10.0.0.5' },
        log: { error: vi.fn() },
      } as any;

      const reply = {} as any;

      await updateMachineConfig(request, reply);

      expect(sendSuccess).toHaveBeenCalledWith(reply, updated);
    });

    it('机器不存在应该返回404错误', async () => {
      vi.mocked(MachineModel.findById).mockResolvedValue(null);

      const { updateMachineConfig } = await import('../../../controllers/machine.controller.js');

      const request = {
        params: { id: 'nonexistent' },
        body: { ip: '10.0.0.5' },
        log: { error: vi.fn() },
      } as any;

      const reply = {} as any;

      await updateMachineConfig(request, reply);

      expect(sendError).toHaveBeenCalledWith(reply, '机器不存在', 404);
    });

    it('无效IP地址应该返回400错误', async () => {
      vi.mocked(MachineModel.findById).mockResolvedValue({ id: 'm1' });

      const { updateMachineConfig } = await import('../../../controllers/machine.controller.js');

      const request = {
        params: { id: 'm1' },
        body: { ip: 'not-an-ip' },
        log: { error: vi.fn() },
      } as any;

      const reply = {} as any;

      await updateMachineConfig(request, reply);

      expect(sendError).toHaveBeenCalledWith(reply, '无效的 IP 地址格式', 400);
    });

    it('gRPC端口超出范围应该返回400错误', async () => {
      vi.mocked(MachineModel.findById).mockResolvedValue({ id: 'm1' });

      const { updateMachineConfig } = await import('../../../controllers/machine.controller.js');

      const request = {
        params: { id: 'm1' },
        body: { grpcPort: 99999 },
        log: { error: vi.fn() },
      } as any;

      const reply = {} as any;

      await updateMachineConfig(request, reply);

      expect(sendError).toHaveBeenCalledWith(reply, 'gRPC 端口必须在 1-65535 之间', 400);
    });

    it('代理端口超出范围应该返回400错误', async () => {
      vi.mocked(MachineModel.findById).mockResolvedValue({ id: 'm1' });

      const { updateMachineConfig } = await import('../../../controllers/machine.controller.js');

      const request = {
        params: { id: 'm1' },
        body: { proxyPort: 0 },
        log: { error: vi.fn() },
      } as any;

      const reply = {} as any;

      await updateMachineConfig(request, reply);

      expect(sendError).toHaveBeenCalledWith(reply, '代理端口必须在 1-65535 之间', 400);
    });
  });

  describe('deleteMachine', () => {
    it('机器不存在应该返回404错误', async () => {
      vi.mocked(MachineModel.findById).mockResolvedValue(null);

      const { deleteMachine } = await import('../../../controllers/machine.controller.js');

      const request = {
        params: { id: 'nonexistent' },
        log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      } as any;

      const reply = {
        status: vi.fn().mockReturnValue({
          send: vi.fn(),
        }),
      } as any;

      await deleteMachine(request, reply);

      expect(reply.status).toHaveBeenCalledWith(404);
    });

    it('离线机器应该直接删除', async () => {
      vi.mocked(MachineModel.findById).mockResolvedValue({ id: 'm1', status: 'offline' });
      vi.mocked(MachineModel.delete).mockResolvedValue(true);

      const { deleteMachine } = await import('../../../controllers/machine.controller.js');

      const request = {
        params: { id: 'm1' },
        log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      } as any;

      const reply = {
        status: vi.fn().mockReturnValue({
          send: vi.fn(),
        }),
      } as any;

      await deleteMachine(request, reply);

      expect(MachineModel.delete).toHaveBeenCalledWith('m1');
      expect(memoryStore.removeMachine).toHaveBeenCalledWith('m1');
      expect(reply.status).toHaveBeenCalledWith(200);
    });

    it('数据库删除失败应该返回500错误', async () => {
      vi.mocked(MachineModel.findById).mockResolvedValue({ id: 'm1', status: 'offline' });
      vi.mocked(MachineModel.delete).mockResolvedValue(false);

      const { deleteMachine } = await import('../../../controllers/machine.controller.js');

      const request = {
        params: { id: 'm1' },
        log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      } as any;

      const reply = {
        status: vi.fn().mockReturnValue({
          send: vi.fn(),
        }),
      } as any;

      await deleteMachine(request, reply);

      expect(reply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('refreshMachineStatus', () => {
    it('应该成功刷新机器状态', async () => {
      vi.mocked(forceCheckAllMachines).mockResolvedValue(undefined);
      vi.mocked(memoryStore.getOnlineMachines).mockReturnValue([{ machine_id: 'm1' }]);

      const { refreshMachineStatus } = await import('../../../controllers/machine.controller.js');

      const request = {
        log: { error: vi.fn() },
      } as any;

      const reply = {} as any;

      await refreshMachineStatus(request, reply);

      expect(forceCheckAllMachines).toHaveBeenCalled();
      expect(sendSuccess).toHaveBeenCalledWith(
        reply,
        expect.objectContaining({
          success: true,
          updated: 1,
        })
      );
    });

    it('刷新失败应该返回500错误', async () => {
      vi.mocked(forceCheckAllMachines).mockRejectedValue(new Error('check failed'));

      const { refreshMachineStatus } = await import('../../../controllers/machine.controller.js');

      const request = {
        log: { error: vi.fn() },
      } as any;

      const reply = {} as any;

      await refreshMachineStatus(request, reply);

      expect(sendError).toHaveBeenCalledWith(reply, '强制刷新机器状态失败', 500);
    });
  });

  describe('cleanupOldMachines', () => {
    it('应该成功清理旧机器', async () => {
      vi.mocked(cleanupOldMachines).mockResolvedValue(undefined);

      const { cleanupOldMachines: controllerCleanup } = await import(
        '../../../controllers/machine.controller.js'
      );

      const request = {
        body: { daysThreshold: 60 },
        log: { error: vi.fn() },
      } as any;

      const reply = {} as any;

      await controllerCleanup(request, reply);

      expect(cleanupOldMachines).toHaveBeenCalledWith(60);
      expect(sendSuccess).toHaveBeenCalledWith(
        reply,
        expect.objectContaining({
          success: true,
        })
      );
    });

    it('使用默认阈值清理', async () => {
      vi.mocked(cleanupOldMachines).mockResolvedValue(undefined);

      const { cleanupOldMachines: controllerCleanup } = await import(
        '../../../controllers/machine.controller.js'
      );

      const request = {
        body: {},
        log: { error: vi.fn() },
      } as any;

      const reply = {} as any;

      await controllerCleanup(request, reply);

      expect(cleanupOldMachines).toHaveBeenCalledWith(30);
    });

    it('清理失败应该返回500错误', async () => {
      vi.mocked(cleanupOldMachines).mockRejectedValue(new Error('cleanup failed'));

      const { cleanupOldMachines: controllerCleanup } = await import(
        '../../../controllers/machine.controller.js'
      );

      const request = {
        body: {},
        log: { error: vi.fn() },
      } as any;

      const reply = {} as any;

      await controllerCleanup(request, reply);

      expect(sendError).toHaveBeenCalledWith(reply, '清理旧机器记录失败', 500);
    });
  });

  describe('restartMachine', () => {
    it('机器不存在应该返回404错误', async () => {
      vi.mocked(MachineModel.findById).mockResolvedValue(null);

      const { restartMachine } = await import('../../../controllers/machine.controller.js');

      const request = {
        params: { id: 'nonexistent' },
        log: { error: vi.fn() },
      } as any;

      const reply = {} as any;

      await restartMachine(request, reply);

      expect(sendError).toHaveBeenCalledWith(reply, '机器不存在', 404);
    });

    it('机器未连接应该返回400错误', async () => {
      vi.mocked(MachineModel.findById).mockResolvedValue({ id: 'm1', status: 'offline' });
      vi.mocked(connectionManager.isConnected).mockReturnValue(false);

      const { restartMachine } = await import('../../../controllers/machine.controller.js');

      const request = {
        params: { id: 'm1' },
        log: { error: vi.fn() },
      } as any;

      const reply = {} as any;

      await restartMachine(request, reply);

      expect(sendError).toHaveBeenCalledWith(reply, '机器未连接，无法发送重启命令', 400);
    });

    it('应该成功发送重启命令', async () => {
      vi.mocked(MachineModel.findById).mockResolvedValue({ id: 'm1', status: 'online' });
      vi.mocked(connectionManager.isConnected).mockReturnValue(true);
      vi.mocked(connectionManager.sendRestartCommand).mockReturnValue(undefined);
      vi.mocked(MachineModel.update).mockResolvedValue({ id: 'm1', status: 'offline' });

      const { restartMachine } = await import('../../../controllers/machine.controller.js');

      const request = {
        params: { id: 'm1' },
        log: { error: vi.fn() },
      } as any;

      const reply = {} as any;

      await restartMachine(request, reply);

      expect(connectionManager.sendRestartCommand).toHaveBeenCalledWith('m1');
      expect(sendSuccess).toHaveBeenCalledWith(
        reply,
        expect.objectContaining({
          success: true,
          id: 'm1',
        })
      );
    });
  });
});
