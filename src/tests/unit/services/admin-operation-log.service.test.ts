/**
 * AdminOperationLogService 单元测试
 * 测试管理员操作日志服务的业务逻辑
 *
 * Mock 策略:
 * - Mock: OperationLogModel, UserModel, logger
 * - 真实执行: getUserOperationLogs, listOperationLogs, getOperationLogStats, createOperationLog 等业务逻辑
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../models/operation-log.model.js', () => ({
  OperationLogModel: {
    findByTargetUserId: vi.fn(),
    paginate: vi.fn(),
    getStats: vi.fn(),
    create: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../../../models/user.model.js', () => ({
  UserModel: {
    findById: vi.fn(),
  },
}));

vi.mock('../../../shared/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('AdminOperationLogService', () => {
  let OperationLogModel: any;
  let UserModel: any;

  const mockUser = {
    id: 1,
    username: 'testuser',
    role: 'user',
    status: 'active',
  };

  const mockLogs = {
    items: [
      {
        id: 1,
        admin_id: 2,
        action: '创建用户',
        details: { username: 'testuser' },
        target_user_id: 1,
        created_at: new Date(),
      },
    ],
    total: 1,
    page: 1,
    limit: 20,
    totalPages: 1,
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const logModule = await import('../../../models/operation-log.model.js');
    OperationLogModel = logModule.OperationLogModel;

    const userModule = await import('../../../models/user.model.js');
    UserModel = userModule.UserModel;
  });

  // ========================================
  // OPL-01: getUserOperationLogs - 正常查询
  // ========================================
  it('应该成功获取用户操作日志', async () => {
    vi.mocked(UserModel.findById).mockResolvedValue(mockUser);
    vi.mocked(OperationLogModel.findByTargetUserId).mockResolvedValue(mockLogs);

    const { getUserOperationLogs } = await import('../../../services/admin-operation-log.service.js');
    const result = await getUserOperationLogs(1, { page: '1', limit: '20' });

    expect(UserModel.findById).toHaveBeenCalledWith(1);
    expect(OperationLogModel.findByTargetUserId).toHaveBeenCalledWith(1, { page: '1', limit: '20' });
    expect(result).toEqual(mockLogs);
  });

  // ========================================
  // OPL-02: getUserOperationLogs - 用户不存在
  // ========================================
  it('用户不存在时应该抛出错误', async () => {
    vi.mocked(UserModel.findById).mockResolvedValue(null);

    const { getUserOperationLogs } = await import('../../../services/admin-operation-log.service.js');
    await expect(getUserOperationLogs(999, { page: '1', limit: '20' })).rejects.toThrow('用户不存在');
    expect(OperationLogModel.findByTargetUserId).not.toHaveBeenCalled();
  });

  // ========================================
  // OPL-03: findUserById - 委托给 UserModel
  // ========================================
  it('findUserById 应该委托给 UserModel.findById', async () => {
    vi.mocked(UserModel.findById).mockResolvedValue(mockUser);

    const { findUserById } = await import('../../../services/admin-operation-log.service.js');
    const result = await findUserById(1);

    expect(UserModel.findById).toHaveBeenCalledWith(1);
    expect(result).toEqual(mockUser);
  });

  // ========================================
  // OPL-04: listOperationLogs - 正常查询
  // ========================================
  it('listOperationLogs 应该委托给 OperationLogModel.paginate', async () => {
    vi.mocked(OperationLogModel.paginate).mockResolvedValue(mockLogs);

    const { listOperationLogs } = await import('../../../services/admin-operation-log.service.js');
    const result = await listOperationLogs(1, 20, { action: 'login' });

    expect(OperationLogModel.paginate).toHaveBeenCalledWith(1, 20, { action: 'login' });
    expect(result).toEqual(mockLogs);
  });

  // ========================================
  // OPL-05: listOperationLogs - 空 filters
  // ========================================
  it('listOperationLogs 空 filters 应该正常查询', async () => {
    vi.mocked(OperationLogModel.paginate).mockResolvedValue(mockLogs);

    const { listOperationLogs } = await import('../../../services/admin-operation-log.service.js');
    const result = await listOperationLogs(1, 20, {});

    expect(OperationLogModel.paginate).toHaveBeenCalledWith(1, 20, {});
    expect(result).toEqual(mockLogs);
  });

  // ========================================
  // OPL-06: getOperationLogStats - 委托给 Model
  // ========================================
  it('getOperationLogStats 应该委托给 OperationLogModel.getStats', async () => {
    const mockStats = { total: 100, today: 10 };
    vi.mocked(OperationLogModel.getStats).mockResolvedValue(mockStats);

    const { getOperationLogStats } = await import('../../../services/admin-operation-log.service.js');
    const result = await getOperationLogStats({});

    expect(OperationLogModel.getStats).toHaveBeenCalledWith({});
    expect(result).toEqual(mockStats);
  });

  // ========================================
  // OPL-07: createOperationLog - 正常创建
  // ========================================
  it('createOperationLog 应该调用 OperationLogModel.create', async () => {
    const { createOperationLog } = await import('../../../services/admin-operation-log.service.js');
    const data = { admin_id: 1, action: '测试操作', details: { key: 'value' } };

    await createOperationLog(data);

    expect(OperationLogModel.create).toHaveBeenCalledWith(data);
  });

  // ========================================
  // OPL-08: createOperationLog - 不带 details
  // ========================================
  it('createOperationLog 不带 details 应该正常调用', async () => {
    const { createOperationLog } = await import('../../../services/admin-operation-log.service.js');
    const data = { admin_id: 1, action: '简单操作' };

    await createOperationLog(data);

    expect(OperationLogModel.create).toHaveBeenCalledWith(data);
  });

  // ========================================
  // OPL-09: createOperationLog - 日志创建失败不应抛错
  // ========================================
  it('createOperationLog 日志创建失败时不应抛出错误（fire-and-forget）', async () => {
    vi.mocked(OperationLogModel.create).mockRejectedValue(new Error('DB error'));

    const { createOperationLog } = await import('../../../services/admin-operation-log.service.js');
    const data = { admin_id: 1, action: '测试操作' };

    await expect(createOperationLog(data)).resolves.toBeUndefined();
  });
});
