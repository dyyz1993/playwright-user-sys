/**
 * MemoryStoreService 单元测试
 * 测试内存存储服务的状态管理和业务逻辑
 *
 * Bug记录: MemoryStoreService 类未导出
 * 问题描述: src/services/memory-store.service.ts 只导出了 memoryStore 实例，没有导出类本身
 * 当前行为: 无法访问 MemoryStoreService 类来调用 getInstance()
 * 预期行为: 应该导出类以便测试和扩展性使用
 *
 * 注意: 此测试使用 Mock 策略
 * - 真实执行: MemoryStoreService 的业务逻辑
 * - Mock: Models 层、connectionManager、定时器
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { SessionStatus } from '../../../shared/types/index.js';

// Mock Models
vi.mock('../../../models/machine.model.js', () => ({
  MachineModel: {
    findAll: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../../../models/session.model.js', () => ({
  SessionModel: {
    findActiveSessions: vi.fn(),
  },
}));

vi.mock('../../../services/machine-grpc.service.js', () => ({
  connectionManager: {
    getActiveConnections: vi.fn(() => []),
    getAllConnectedMachines: vi.fn(() => []),
  },
}));

// 导出 MemoryStoreService 类，现在可以测试单例模式
import { MemoryStoreService } from '../../../services/memory-store.service.js';
import memoryStore from '../../../services/memory-store.service.js';

describe('MemoryStoreService', () => {
  // 由于类未导出，无法访问 getInstance() 进行单例测试
  // MS-01: 单例模式测试被跳过

  let service: any;

  beforeEach(async () => {
    // 重置所有 mock
    vi.clearAllMocks();

    // 使用已导出的 memoryStore 单例实例
    service = memoryStore;

    // 清空内存数据 - 直接访问私有属性
    (service as any).machines.clear();
    (service as any).sessions.clear();
  });

  afterEach(() => {
    // 清理定时器
    vi.useRealTimers();
  });

  // ========================================
  // MS-01: 单例模式
  // ========================================
  it('应该返回单例实例', () => {
    const instance1 = MemoryStoreService.getInstance();
    const instance2 = MemoryStoreService.getInstance();

    expect(instance1).toBe(instance2);
  });

  // ========================================
  // MS-02: 更新机器状态 - 新机器
  // ========================================
  it('应该添加新机器到内存', () => {
    const machineData = {
      machine_id: 'machine-001',
      name: 'test-host',
      ip: '192.168.1.1',
      grpc_port: 50051,
      proxy_port: 8080,
      cpu_usage: 50,
      memory_usage: 60,
      disk_space: 100,
      active_sessions: 2,
      max_sessions: 10,
      last_heartbeat: new Date(),
    };

    service.updateMachineStatus(machineData);

    const machine = service.getMachine('machine-001');
    expect(machine).toBeDefined();
    expect(machine!.name).toBe('test-host');
    expect(machine!.cpu_usage).toBe(50);
  });

  // ========================================
  // MS-03: 更新机器状态 - 已存在
  // ========================================
  it('应该更新已存在的机器', () => {
    // 第一次添加
    service.updateMachineStatus({
      machine_id: 'machine-001',
      name: 'test-host',
      ip: '192.168.1.1',
      cpu_usage: 30,
      active_sessions: 5,
      max_sessions: 10,
      last_heartbeat: new Date(),
    } as any);

    // 第二次更新
    service.updateMachineStatus({
      machine_id: 'machine-001',
      name: 'test-host',
      ip: '192.168.1.1',
      cpu_usage: 50,
      active_sessions: 8,
      max_sessions: 10,
      last_heartbeat: new Date(),
    } as any);

    const machine = service.getMachine('machine-001');
    expect(machine!.cpu_usage).toBe(50); // 更新后的值
    expect(machine!.active_sessions).toBe(8);
  });

  // ========================================
  // MS-04: 更新机器状态 - 指标归一化
  // ========================================
  it('应该正确处理各种CPU使用率值', () => {
    // 测试正常值
    service.updateMachineStatus({
      machine_id: 'machine-001',
      name: 'host1',
      ip: '192.168.1.1',
      cpu_usage: 50.5,
      active_sessions: 0,
      max_sessions: 10,
      last_heartbeat: new Date(),
    } as any);

    const machine = service.getMachine('machine-001');
    expect(machine!.cpu_usage).toBe(50.5);
  });

  // ========================================
  // MS-05: 获取机器信息 - 存在
  // ========================================
  it('应该返回存在的机器信息', () => {
    service.updateMachineStatus({
      machine_id: 'machine-001',
      name: 'test-host',
      ip: '192.168.1.1',
      active_sessions: 0,
      max_sessions: 10,
      last_heartbeat: new Date(),
    } as any);

    const machine = service.getMachine('machine-001');
    expect(machine).toBeDefined();
    expect(machine!.machine_id).toBe('machine-001');
  });

  // ========================================
  // MS-06: 获取机器信息 - 不存在
  // ========================================
  it('获取不存在的机器应该返回undefined', () => {
    const machine = service.getMachine('nonexistent');
    expect(machine).toBeUndefined();
  });

  // ========================================
  // MS-07: 获取所有机器
  // ========================================
  it('应该返回内存中所有机器', () => {
    service.updateMachineStatus({
      machine_id: 'machine-001',
      name: 'host1',
      ip: '192.168.1.1',
      active_sessions: 0,
      max_sessions: 10,
      last_heartbeat: new Date(),
    } as any);

    service.updateMachineStatus({
      machine_id: 'machine-002',
      name: 'host2',
      ip: '192.168.1.2',
      active_sessions: 0,
      max_sessions: 10,
      last_heartbeat: new Date(),
    } as any);

    const machines = service.getAllMachines();
    expect(machines.length).toBe(2);
    expect(machines[0].machine_id).toBe('machine-001');
    expect(machines[1].machine_id).toBe('machine-002');
  });

  // ========================================
  // MS-08: 标记机器离线
  // ========================================
  it('应该标记机器为离线状态', () => {
    service.updateMachineStatus({
      machine_id: 'machine-001',
      name: 'test-host',
      ip: '192.168.1.1',
      grpc_port: 50051,
      active_sessions: 0,
      max_sessions: 10,
      last_heartbeat: new Date(),
    } as any);

    service.markMachineOffline('machine-001');

    const machine = service.getMachine('machine-001');
    expect(machine!.online).toBe(false);
  });

  // ========================================
  // MS-09: 更新会话状态 - 新会话
  // ========================================
  it('应该添加新会话到内存', () => {
    const sessionData = {
      id: 'session-001',
      user_id: 1,
      machine_id: 'machine-001',
      status: SessionStatus.CONNECTED,
      start_time: new Date(),
      last_activity: new Date(),
    };

    service.updateSessionStatus(sessionData as any);

    const session = service.getSession('session-001');
    expect(session).toBeDefined();
    expect(session!.id).toBe('session-001');
    expect(session!.status).toBe(SessionStatus.CONNECTED);
  });

  // ========================================
  // MS-10: 更新会话状态 - 已存在
  // ========================================
  it('应该更新已存在的会话', () => {
    // 第一次添加
    service.updateSessionStatus({
      id: 'session-001',
      user_id: 1,
      machine_id: 'machine-001',
      status: SessionStatus.CREATED,
      start_time: new Date(),
      last_activity: new Date(),
    } as any);

    // 更新状态
    service.updateSessionStatus({
      id: 'session-001',
      user_id: 1,
      machine_id: 'machine-001',
      status: SessionStatus.CONNECTED,
      start_time: new Date(),
      last_activity: new Date(),
    } as any);

    const session = service.getSession('session-001');
    expect(session!.status).toBe(SessionStatus.CONNECTED);
  });

  // ========================================
  // MS-11: 获取会话信息 - 存在
  // ========================================
  it('应该返回存在的会话信息', () => {
    service.updateSessionStatus({
      id: 'session-001',
      user_id: 1,
      machine_id: 'machine-001',
      status: SessionStatus.CONNECTED,
      start_time: new Date(),
      last_activity: new Date(),
    } as any);

    const session = service.getSession('session-001');
    expect(session).toBeDefined();
    expect(session!.id).toBe('session-001');
  });

  // ========================================
  // MS-12: 获取会话信息 - 不存在
  // ========================================
  it('获取不存在的会话应该返回undefined', () => {
    const session = service.getSession('nonexistent');
    expect(session).toBeUndefined();
  });

  // ========================================
  // MS-13: 获取所有会话
  // ========================================
  it('应该返回内存中所有会话', () => {
    service.updateSessionStatus({
      id: 'session-001',
      user_id: 1,
      machine_id: 'machine-001',
      status: SessionStatus.CONNECTED,
      start_time: new Date(),
      last_activity: new Date(),
    } as any);

    service.updateSessionStatus({
      id: 'session-002',
      user_id: 2,
      machine_id: 'machine-001',
      status: SessionStatus.CONNECTED,
      start_time: new Date(),
      last_activity: new Date(),
    } as any);

    const sessions = service.getAllSessions();
    expect(sessions.length).toBe(2);
  });

  // ========================================
  // MS-14: 清理过期会话
  // ========================================
  it('应该移除超时的会话', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    // 创建一个已完成的会话，31分钟前
    const oldTime = new Date('2024-01-01T00:00:00Z');
    oldTime.setMinutes(oldTime.getMinutes() - 31);

    service.updateSessionStatus({
      id: 'old-session',
      user_id: 1,
      machine_id: 'machine-001',
      status: SessionStatus.COMPLETED, // 非活跃状态才能被清理
      start_time: oldTime,
      last_activity: oldTime,
    } as any);

    // 创建一个活跃会话
    service.updateSessionStatus({
      id: 'new-session',
      user_id: 2,
      machine_id: 'machine-001',
      status: SessionStatus.CONNECTED, // 活跃状态不会被清理
      start_time: new Date(),
      last_activity: new Date(),
    } as any);

    // 清理30分钟之前的会话
    service.cleanupOldSessions(30 * 60 * 1000);

    const oldSession = service.getSession('old-session');
    const newSession = service.getSession('new-session');

    expect(oldSession).toBeUndefined(); // 被清理
    expect(newSession).toBeDefined(); // 仍在
  });

  // ========================================
  // MS-16: 加载初始数据
  // ========================================
  it('应该加载初始数据', async () => {
    const { MachineModel } = await import('../../../models/machine.model.js');
    const { SessionModel } = await import('../../../models/session.model.js');

    vi.mocked(MachineModel.findAll).mockResolvedValue({
      items: [
        {
          id: 'machine-001',
          hostname: 'test-host',
          ip: '192.168.1.1',
          cpuUsage: 0,
          memoryUsage: 0,
          diskUsage: 0,
          instanceCount: 0,
          maxInstances: 10,
          grpcPort: 50051,
          proxyPort: 8080,
          status: 'online',
          lastSeen: new Date(),
        },
      ],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    });

    vi.mocked(SessionModel.findActiveSessions).mockResolvedValue([]);

    await service.loadInitialData();

    const machine = service.getMachine('machine-001');
    expect(machine).toBeDefined();
    expect(machine!.name).toBe('test-host');
  });

  // ========================================
  // MS-15: 数据一致性检查
  // ========================================
  it('应该检查数据一致性', async () => {
    const { connectionManager } = await import('../../../services/machine-grpc.service.js');

    vi.mocked(connectionManager.getActiveConnections).mockReturnValue([]);

    const { SessionModel } = await import('../../../models/session.model.js');
    vi.mocked(SessionModel.findActiveSessions).mockResolvedValue([]);

    await service.checkDataConsistency();

    expect(connectionManager.getActiveConnections).toHaveBeenCalled();
    expect(SessionModel.findActiveSessions).toHaveBeenCalled();
  });

  // ========================================
  // MS-16: 更新机器会话计数
  // ========================================
  it('应该正确更新机器的会话计数', () => {
    // 添加机器
    service.updateMachineStatus({
      machine_id: 'machine-001',
      name: 'test-host',
      ip: '192.168.1.1',
      grpc_port: 50051,
      active_sessions: 0,
      max_sessions: 10,
      last_heartbeat: new Date(),
    } as any);

    // 添加活跃会话
    service.updateSessionStatus({
      id: 'session-001',
      user_id: 1,
      machine_id: 'machine-001',
      status: SessionStatus.CONNECTED,
      start_time: new Date(),
      last_activity: new Date(),
    } as any);

    service.updateSessionStatus({
      id: 'session-002',
      user_id: 2,
      machine_id: 'machine-001',
      status: SessionStatus.CONNECTED,
      start_time: new Date(),
      last_activity: new Date(),
    } as any);

    const machine = service.getMachine('machine-001');
    expect(machine!.active_sessions).toBe(2);
  });
});
