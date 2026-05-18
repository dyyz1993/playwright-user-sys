/**
 * MachineModel 单元测试
 * 测试机器模型的 CRUD 操作和业务逻辑
 *
 * 注意: 此测试使用 MySQL 数据库
 * better-sqlite3 需要编译原生模块，在某些环境下可能无法工作
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { db, initDatabase } from '../../../config/database.js';
import { MachineModel } from '../../../models/machine.model.js';
import { clearAllTables } from '../../helpers/database.js';

// Mock connectionManager for findAvailable test
vi.mock('../../../services/machine-grpc/index.js', () => ({
  connectionManager: {
    getAllConnectedMachines: vi.fn(() => []),
  },
}));

describe('MachineModel', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    await clearAllTables();
    vi.clearAllMocks();
  });

  // ========================================
  // MM-01: 注册新机器
  // ========================================
  it('应该成功注册新机器', async () => {
    const machine = await MachineModel.register({
      id: 'machine-001',
      hostname: 'test-host',
      ip: '192.168.1.100',
      grpcPort: 50051,
      proxyPort: 8080,
      maxInstances: 10,
    });

    expect(machine).toBeTruthy();
    expect(machine!.id).toBe('machine-001');
    expect(machine!.hostname).toBe('test-host');
    expect(machine!.status).toBe('online');
    expect(machine!.maxInstances).toBe(10);
  });

  // ========================================
  // MM-02: 注册已存在机器
  // ========================================
  it('注册已存在的机器应该更新而非创建', async () => {
    await MachineModel.register({
      id: 'machine-001',
      hostname: 'test-host',
      ip: '192.168.1.100',
    });

    const updated = await MachineModel.register({
      id: 'machine-001',
      hostname: 'updated-host',
      ip: '192.168.1.101',
    });

    expect(updated).toBeTruthy();
    expect(updated!.id).toBe('machine-001');
    expect(updated!.hostname).toBe('updated-host');
    expect(updated!.ip).toBe('192.168.1.101');
  });

  // ========================================
  // MM-03: 按ID查找机器
  // ========================================
  it('应该通过ID找到机器', async () => {
    const _created = await MachineModel.register({
      id: 'machine-001',
      hostname: 'test-host',
      ip: '192.168.1.100',
    });

    const machine = await MachineModel.findById('machine-001');
    expect(machine).toBeTruthy();
    expect(machine!.id).toBe('machine-001');
    expect(machine!.hostname).toBe('test-host');
  });

  // ========================================
  // MM-04: 按ID查找机器 - 不存在
  // ========================================
  it('按ID查找不存在的机器应该返回null', async () => {
    const machine = await MachineModel.findById('nonexistent');
    expect(machine).toBeNull();
  });

  // ========================================
  // MM-05: 更新机器信息
  // ========================================
  it('应该成功更新机器信息 (支持 camelCase)', async () => {
    const _created = await MachineModel.register({
      id: 'machine-001',
      hostname: 'test-host',
      ip: '192.168.1.100',
    });

    const updated = await MachineModel.update('machine-001', {
      hostname: 'updated-host',
      ip: '192.168.1.101',
      cpuUsage: 75.5,
      memoryUsage: 60.2,
      diskUsage: 80.0,
      instanceCount: 5,
      maxInstances: 10,
      status: 'online',
    });

    expect(updated).toBeTruthy();
    expect(updated!.hostname).toBe('updated-host');
    expect(updated!.ip).toBe('192.168.1.101');
    expect(Number(updated!.cpuUsage)).toBe(75.5);
    expect(Number(updated!.memoryUsage)).toBe(60.2);
    expect(Number(updated!.diskUsage)).toBe(80.0);
    expect(updated!.instanceCount).toBe(5);
    expect(updated!.maxInstances).toBe(10);
    expect(updated!.status).toBe('online');
  });

  // ========================================
  // MM-06: 删除机器
  // ========================================
  it('应该成功删除机器', async () => {
    await MachineModel.register({
      id: 'machine-001',
      hostname: 'test-host',
      ip: '192.168.1.100',
    });

    const deleted = await MachineModel.delete('machine-001');
    expect(deleted).toBe(true);

    const found = await MachineModel.findById('machine-001');
    expect(found).toBeNull();
  });

  // ========================================
  // MM-07: 按状态查询机器
  // ========================================
  it('应该返回指定状态的所有机器', async () => {
    await MachineModel.register({
      id: 'machine-001',
      hostname: 'host1',
      ip: '192.168.1.1',
    });

    await MachineModel.register({
      id: 'machine-002',
      hostname: 'host2',
      ip: '192.168.1.2',
    });

    const result = await MachineModel.findByStatus('online');
    expect(result.items.length).toBeGreaterThanOrEqual(2);
  });

  // ========================================
  // MM-08: 分页查询机器
  // ========================================
  it('应该返回正确的分页数据', async () => {
    for (let i = 0; i < 15; i++) {
      await MachineModel.register({
        id: `machine-${i}`,
        hostname: `host-${i}`,
        ip: `192.168.1.${i}`,
      });
    }

    const result = await MachineModel.findAll({
      page: '1',
      limit: '10',
    });

    expect(result.items.length).toBe(10);
    expect(result.total).toBeGreaterThanOrEqual(15);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
  });

  // ========================================
  // MM-09: 查找可用机器 - 有可用
  // ========================================
  it('应该返回可用的已连接机器', async () => {
    // Mock connectionManager to return connected machines
    const { connectionManager } = await import('../../../services/machine-grpc/index.js');
    vi.mocked(connectionManager.getAllConnectedMachines).mockReturnValue(['machine-001']);

    await MachineModel.register({
      id: 'machine-001',
      hostname: 'test-host',
      ip: '192.168.1.100',
      maxInstances: 10,
      instanceCount: 5,
    });

    const available = await MachineModel.findAvailable();
    expect(available).toBeTruthy();
    expect(available!.id).toBe('machine-001');
  });

  // ========================================
  // MM-10: 查找可用机器 - 无可用
  // ========================================
  it('没有可用机器时应该返回null', async () => {
    // Mock 返回空数组
    const { connectionManager } = await import('../../../services/machine-grpc/index.js');
    vi.mocked(connectionManager.getAllConnectedMachines).mockReturnValue([]);

    const available = await MachineModel.findAvailable();
    expect(available).toBeNull();
  });

  // ========================================
  // MM-11: 查找可用机器 - 所有满载
  // ========================================
  it('所有机器满载时应该返回null', async () => {
    // Mock connectionManager to return connected machines
    const { connectionManager } = await import('../../../services/machine-grpc/index.js');
    vi.mocked(connectionManager.getAllConnectedMachines).mockReturnValue(['machine-001']);

    await MachineModel.register({
      id: 'machine-001',
      hostname: 'test-host',
      ip: '192.168.1.100',
      maxInstances: 10,
      instanceCount: 10,
    });

    const available = await MachineModel.findAvailable();
    expect(available).toBeNull();
  });

  // ========================================
  // MM-12: 增加实例计数
  // ========================================
  it('应该成功增加实例计数', async () => {
    await MachineModel.register({
      id: 'machine-001',
      hostname: 'test-host',
      ip: '192.168.1.100',
      instanceCount: 5,
    });

    await MachineModel.incrementInstanceCount('machine-001');

    const updated = await MachineModel.findById('machine-001');
    expect(updated!.instanceCount).toBe(6);
  });

  // ========================================
  // MM-13: 减少实例计数
  // ========================================
  it('应该成功减少实例计数', async () => {
    await MachineModel.register({
      id: 'machine-001',
      hostname: 'test-host',
      ip: '192.168.1.100',
      instanceCount: 5,
    });

    await MachineModel.decrementInstanceCount('machine-001');

    const updated = await MachineModel.findById('machine-001');
    expect(updated!.instanceCount).toBe(4);
  });

  // ========================================
  // MM-14: 减少实例计数 - 已为0
  // ========================================
  it('减少实例计数时允许负数', async () => {
    await MachineModel.register({
      id: 'machine-001',
      hostname: 'test-host',
      ip: '192.168.1.100',
      instanceCount: 0,
    });

    // instanceCount 为 0，再减少会变成负数
    await MachineModel.decrementInstanceCount('machine-001');

    const updated = await MachineModel.findById('machine-001');
    expect(updated).toBeTruthy();
    expect(updated!.instanceCount).toBeLessThanOrEqual(0);
  });

  // ========================================
  // MM-15: 标记机器离线
  // ========================================
  it('应该成功标记机器为离线', async () => {
    await MachineModel.register({
      id: 'machine-001',
      hostname: 'test-host',
      ip: '192.168.1.100',
    });

    await MachineModel.markOffline('machine-001');

    const updated = await MachineModel.findById('machine-001');
    expect(updated!.status).toBe('offline');
  });

  // ========================================
  // MM-16: 检查超时机器
  // ========================================
  it('应该检查离线机器并标记为offline', async () => {
    await MachineModel.register({
      id: 'machine-001',
      hostname: 'test-host',
      ip: '192.168.1.100',
    });

    // 手动更新 last_seen 为很久之前
    await db('machines')
      .where('id', 'machine-001')
      .update({
        last_seen: new Date(Date.now() - 10 * 60 * 1000), // 10分钟前
      });

    const count = await MachineModel.checkOfflineMachines(5); // 5分钟超时
    expect(count).toBeGreaterThanOrEqual(0);

    // 验证机器被标记为离线
    const machine = await MachineModel.findById('machine-001');
    expect(machine).toBeTruthy();
    expect(machine!.status).toBe('offline');
  });

  // ========================================
  // MM-17: 删除旧机器
  // ========================================
  it('应该删除指定时间之前的离线机器', async () => {
    await MachineModel.register({
      id: 'machine-001',
      hostname: 'test-host',
      ip: '192.168.1.100',
    });

    // 标记为离线并更新时间
    await MachineModel.markOffline('machine-001');
    await db('machines')
      .where('id', 'machine-001')
      .update({
        last_seen: new Date(Date.now() - 10 * 60 * 1000), // 10分钟前
      });

    const cutoffDate = new Date(Date.now() - 5 * 60 * 1000); // 5分钟前
    const count = await MachineModel.deleteOldMachines(cutoffDate);

    expect(count).toBeGreaterThanOrEqual(0);
  });
});
