/**
 * AdminMachineService 单元测试
 * 测试管理员机器管理服务的业务逻辑
 *
 * Mock 策略:
 * - Mock: MachineModel, OperationLogModel, connectionManager, uuid, logger
 * - 真实执行: addMachine, updateMachineConfig, batchRestartMachines, getMachineDetail 等业务逻辑
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('mock-machine-uuid'),
}));

vi.mock('../../../models/machine.model.js', () => ({
  MachineModel: {
    getAll: vi.fn().mockResolvedValue([]),
    register: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    getDetailById: vi.fn(),
    healthCheck: vi.fn(),
    batchHealthCheck: vi.fn(),
    decrementInstanceCount: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock('../../../models/operation-log.model.js', () => ({
  OperationLogModel: {
    create: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../../../services/machine-grpc/index.js', () => ({
  connectionManager: {
    isConnected: vi.fn(),
    sendRestartCommand: vi.fn(),
    closeBrowser: vi.fn(),
    launchBrowser: vi.fn(),
  },
}));

vi.mock('../../../shared/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('AdminMachineService', () => {
  let MachineModel: any;
  let OperationLogModel: any;
  let connectionManager: any;

  const mockMachine = {
    id: 'machine-001',
    hostname: 'test-host',
    ip: '192.168.1.100',
    grpcPort: 50051,
    proxyPort: 8080,
    maxInstances: 10,
    instanceCount: 0,
    status: 'online',
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const machineModule = await import('../../../models/machine.model.js');
    MachineModel = machineModule.MachineModel;

    const logModule = await import('../../../models/operation-log.model.js');
    OperationLogModel = logModule.OperationLogModel;

    const grpcModule = await import('../../../services/machine-grpc/index.js');
    connectionManager = grpcModule.connectionManager;
  });

  // ========================================
  // AM-01: addMachine - 正常添加
  // ========================================
  it('应该成功添加机器', async () => {
    vi.mocked(MachineModel.getAll).mockResolvedValue([]);
    vi.mocked(MachineModel.register).mockResolvedValue(mockMachine);

    const { addMachine } = await import('../../../services/admin-machine.service.js');
    const result = await addMachine(
      { hostname: 'test-host', ip: '192.168.1.100', grpcPort: 50051, proxyPort: 8080 },
      1
    );

    expect(result).toEqual(mockMachine);
    expect(MachineModel.register).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'mock-machine-uuid',
        hostname: 'test-host',
        ip: '192.168.1.100',
        maxInstances: 10,
        instanceCount: 0,
      })
    );
    expect(OperationLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        admin_id: 1,
        action: '添加机器',
      })
    );
  });

  // ========================================
  // AM-02: addMachine - IP 已存在
  // ========================================
  it('IP 已存在时应该抛出错误', async () => {
    vi.mocked(MachineModel.getAll).mockResolvedValue([mockMachine]);

    const { addMachine } = await import('../../../services/admin-machine.service.js');
    await expect(addMachine({ hostname: 'another', ip: '192.168.1.100' }, 1)).rejects.toThrow('该IP地址的机器已存在');
  });

  // ========================================
  // AM-03: addMachine - 注册失败
  // ========================================
  it('注册机器失败时应该抛出错误', async () => {
    vi.mocked(MachineModel.getAll).mockResolvedValue([]);
    vi.mocked(MachineModel.register).mockResolvedValue(null);

    const { addMachine } = await import('../../../services/admin-machine.service.js');
    await expect(addMachine({ hostname: 'test', ip: '192.168.1.101' }, 1)).rejects.toThrow('创建机器失败');
  });

  // ========================================
  // AM-04: addMachine - 默认 maxInstances
  // ========================================
  it('未指定 maxInstances 时应该使用默认值 10', async () => {
    vi.mocked(MachineModel.getAll).mockResolvedValue([]);
    vi.mocked(MachineModel.register).mockResolvedValue(mockMachine);

    const { addMachine } = await import('../../../services/admin-machine.service.js');
    await addMachine({ hostname: 'test', ip: '192.168.1.101' }, 1);

    expect(MachineModel.register).toHaveBeenCalledWith(expect.objectContaining({ maxInstances: 10 }));
  });

  // ========================================
  // AM-05: getMachineDetail - 委托给 MachineModel
  // ========================================
  it('getMachineDetail 应该委托给 MachineModel.getDetailById', async () => {
    vi.mocked(MachineModel.getDetailById).mockResolvedValue(mockMachine);

    const { getMachineDetail } = await import('../../../services/admin-machine.service.js');
    const result = await getMachineDetail('machine-001');

    expect(MachineModel.getDetailById).toHaveBeenCalledWith('machine-001');
    expect(result).toEqual(mockMachine);
  });

  // ========================================
  // AM-06: updateMachineConfig - 正常更新
  // ========================================
  it('应该成功更新机器配置', async () => {
    const updatedMachine = { ...mockMachine, hostname: 'new-host' };
    vi.mocked(MachineModel.findById).mockResolvedValue(mockMachine);
    vi.mocked(MachineModel.update).mockResolvedValue(updatedMachine);

    const { updateMachineConfig } = await import('../../../services/admin-machine.service.js');
    const result = await updateMachineConfig('machine-001', { hostname: 'new-host' }, 1);

    expect(result.hostname).toBe('new-host');
    expect(MachineModel.update).toHaveBeenCalledWith('machine-001', { hostname: 'new-host' });
    expect(OperationLogModel.create).toHaveBeenCalledWith(expect.objectContaining({ action: '更新机器配置' }));
  });

  // ========================================
  // AM-07: updateMachineConfig - 机器不存在
  // ========================================
  it('更新不存在的机器应该抛出错误', async () => {
    vi.mocked(MachineModel.findById).mockResolvedValue(null);

    const { updateMachineConfig } = await import('../../../services/admin-machine.service.js');
    await expect(updateMachineConfig('nonexistent', { hostname: 'x' }, 1)).rejects.toThrow('机器不存在');
  });

  // ========================================
  // AM-08: updateMachineConfig - 更新返回 null
  // ========================================
  it('更新机器返回 null 时应该抛出错误', async () => {
    vi.mocked(MachineModel.findById).mockResolvedValue(mockMachine);
    vi.mocked(MachineModel.update).mockResolvedValue(null);

    const { updateMachineConfig } = await import('../../../services/admin-machine.service.js');
    await expect(updateMachineConfig('machine-001', { hostname: 'x' }, 1)).rejects.toThrow('更新机器失败');
  });

  // ========================================
  // AM-09: batchRestartMachines - 正常重启
  // ========================================
  it('应该成功批量重启机器', async () => {
    vi.mocked(MachineModel.findById).mockResolvedValue(mockMachine);
    vi.mocked(connectionManager.isConnected).mockReturnValue(true);
    vi.mocked(connectionManager.sendRestartCommand).mockReturnValue(undefined);
    vi.mocked(MachineModel.update).mockResolvedValue({ ...mockMachine, status: 'offline' });

    const { batchRestartMachines } = await import('../../../services/admin-machine.service.js');
    const result = await batchRestartMachines(['machine-001'], 1);

    expect(result.restarted).toContain('machine-001');
    expect(result.failed).toHaveLength(0);
    expect(connectionManager.sendRestartCommand).toHaveBeenCalledWith('machine-001');
    expect(MachineModel.update).toHaveBeenCalledWith('machine-001', { status: 'offline' });
  });

  // ========================================
  // AM-10: batchRestartMachines - 机器不存在
  // ========================================
  it('机器不存在时应该标记为 failed', async () => {
    vi.mocked(MachineModel.findById).mockResolvedValue(null);

    const { batchRestartMachines } = await import('../../../services/admin-machine.service.js');
    const result = await batchRestartMachines(['nonexistent'], 1);

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].error).toBe('机器不存在');
  });

  // ========================================
  // AM-11: batchRestartMachines - 机器未连接
  // ========================================
  it('机器未连接时应该标记为 failed', async () => {
    vi.mocked(MachineModel.findById).mockResolvedValue(mockMachine);
    vi.mocked(connectionManager.isConnected).mockReturnValue(false);

    const { batchRestartMachines } = await import('../../../services/admin-machine.service.js');
    const result = await batchRestartMachines(['machine-001'], 1);

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].error).toBe('机器未连接，无法发送重启命令');
  });

  // ========================================
  // AM-12: healthCheckMachine - 委托给 MachineModel
  // ========================================
  it('healthCheckMachine 应该委托给 MachineModel.healthCheck', async () => {
    vi.mocked(MachineModel.healthCheck).mockResolvedValue({ healthy: true });

    const { healthCheckMachine } = await import('../../../services/admin-machine.service.js');
    const result = await healthCheckMachine('machine-001');

    expect(MachineModel.healthCheck).toHaveBeenCalledWith('machine-001');
    expect(result).toEqual({ healthy: true });
  });

  // ========================================
  // AM-13: batchHealthCheck - 委托给 MachineModel
  // ========================================
  it('batchHealthCheck 应该委托给 MachineModel.batchHealthCheck', async () => {
    vi.mocked(MachineModel.batchHealthCheck).mockResolvedValue([{ id: 'm1', healthy: true }]);

    const { batchHealthCheck } = await import('../../../services/admin-machine.service.js');
    const result = await batchHealthCheck(['m1']);

    expect(MachineModel.batchHealthCheck).toHaveBeenCalledWith(['m1']);
    expect(result).toEqual([{ id: 'm1', healthy: true }]);
  });
});
