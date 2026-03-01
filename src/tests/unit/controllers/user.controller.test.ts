/**
 * User Controller 单元测试
 * 测试用户控制器的业务逻辑
 *
 * 注意: 此测试使用 Mock 策略
 * - 真实执行: Controller 的业务逻辑
 * - Mock: Models 层、响应工具
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserRole, UserStatus } from '../../../shared/types/index.js';

// Mock 所有依赖
vi.mock('../../../models/user.model.js', () => ({
  UserModel: {
    findByUsername: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    resetApiKey: vi.fn(),
    findAll: vi.fn(),
  },
}));

vi.mock('../../../models/operation-log.model.js', () => ({
  OperationLogModel: {
    create: vi.fn(),
  },
}));

vi.mock('../../../utils/response.js', () => ({
  sendSuccess: vi.fn((reply, data, message, statusCode) => {
    reply.status = vi.fn().mockReturnValue(reply);
    reply.send = vi.fn().mockReturnValue(reply);
    return reply;
  }),
  sendError: vi.fn((reply, message, statusCode) => {
    reply.status = vi.fn().mockReturnValue(reply);
    reply.send = vi.fn().mockReturnValue(reply);
    return reply;
  }),
  sendCreated: vi.fn((reply, data, message) => {
    reply.status = vi.fn().mockReturnValue(reply);
    reply.send = vi.fn().mockReturnValue(reply);
    return reply;
  }),
  sendNoContent: vi.fn((reply) => {
    reply.status = vi.fn().mockReturnValue(reply);
    reply.send = vi.fn().mockReturnValue(reply);
    return reply;
  }),
  sendPaginated: vi.fn((reply, data) => {
    reply.status = vi.fn().mockReturnValue(reply);
    reply.send = vi.fn().mockReturnValue(reply);
    return reply;
  }),
}));

vi.mock('../../../models/session.model.js', () => ({
  SessionModel: {
    getUserSessionStats: vi.fn(),
  },
}));

describe('UserController', () => {
  let UserModel: any;
  let OperationLogModel: any;
  let SessionModel: any;
  let sendSuccess: any;
  let sendError: any;
  let sendCreated: any;
  let sendNoContent: any;
  let sendPaginated: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // 获取mock实例
    const userModule = await import('../../../models/user.model.js');
    UserModel = userModule.UserModel;

    const operationLogModule = await import('../../../models/operation-log.model.js');
    OperationLogModel = operationLogModule.OperationLogModel;

    const sessionModule = await import('../../../models/session.model.js');
    SessionModel = sessionModule.SessionModel;

    const responseModule = await import('../../../utils/response.js');
    sendSuccess = responseModule.sendSuccess;
    sendError = responseModule.sendError;
    sendCreated = responseModule.sendCreated;
    sendNoContent = responseModule.sendNoContent;
    sendPaginated = responseModule.sendPaginated;
  });

  // ========================================
  // USER-01: 创建用户成功
  // ========================================
  it('应该成功创建用户', async () => {
    const mockUser = {
      id: 2,
      username: 'newuser',
      email: 'newuser@example.com',
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      credits: 100,
      api_key: 'new-api-key',
      webhook_url: null,
      created_at: new Date(),
    };

    vi.mocked(UserModel.findByUsername).mockResolvedValue(null);
    vi.mocked(UserModel.create).mockResolvedValue(mockUser);
    vi.mocked(OperationLogModel.create).mockResolvedValue(undefined);

    const { createUser } = await import('../../../controllers/user.controller.js');

    const request = {
      user: {
        id: 1,
        role: UserRole.ADMIN,
      },
      body: {
        username: 'newuser',
        password: 'password123',
        email: 'newuser@example.com',
        role: UserRole.USER,
        credits: 100,
      },
      log: {
        error: vi.fn(),
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await createUser(request, reply);

    expect(UserModel.findByUsername).toHaveBeenCalledWith('newuser');
    expect(UserModel.create).toHaveBeenCalled();
    expect(OperationLogModel.create).toHaveBeenCalled();
    expect(sendCreated).toHaveBeenCalledWith(
      reply,
      expect.objectContaining({
        id: 2,
        username: 'newuser',
      })
    );
  });

  // ========================================
  // USER-02: 创建用户-用户名已存在
  // ========================================
  it('用户名已存在时应该返回409错误', async () => {
    const existingUser = {
      id: 1,
      username: 'existinguser',
    };

    vi.mocked(UserModel.findByUsername).mockResolvedValue(existingUser);

    const { createUser } = await import('../../../controllers/user.controller.js');

    const request = {
      user: {
        id: 1,
        role: UserRole.ADMIN,
      },
      body: {
        username: 'existinguser',
        password: 'password123',
      },
      log: {
        error: vi.fn(),
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await createUser(request, reply);

    expect(sendError).toHaveBeenCalledWith(reply, '用户名已存在', 409);
  });

  // ========================================
  // USER-03: 创建用户-参数验证失败
  // ========================================
  it('参数验证失败时应该返回400错误', async () => {
    const { createUser } = await import('../../../controllers/user.controller.js');

    const request = {
      user: {
        id: 1,
        role: UserRole.ADMIN,
      },
      body: {
        // Missing required username field
        password: 'password123',
      },
      log: {
        error: vi.fn(),
      },
    };

    const reply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    await createUser(request, reply);

    // Zod validation should fail and trigger error response
    expect(sendError).toHaveBeenCalledWith(reply, expect.stringContaining('无效的请求数据'), 400);
  });

  // ========================================
  // USER-04: 获取所有用户
  // ========================================
  it('应该成功获取所有用户', async () => {
    const mockUsers = {
      items: [
        {
          id: 1,
          username: 'user1',
          email: 'user1@example.com',
          role: UserRole.USER,
          status: UserStatus.ACTIVE,
          credits: 100,
          created_at: new Date(),
        },
        {
          id: 2,
          username: 'user2',
          email: 'user2@example.com',
          role: UserRole.USER,
          status: UserStatus.ACTIVE,
          credits: 50,
          created_at: new Date(),
        },
      ],
      total: 2,
      page: 1,
      limit: 10,
      totalPages: 1,
    };

    vi.mocked(UserModel.findAll).mockResolvedValue(mockUsers);

    const { getAllUsers } = await import('../../../controllers/user.controller.js');

    const request = {
      user: {
        id: 1,
        role: UserRole.ADMIN,
      },
      query: {
        page: '1',
        limit: '10',
      },
      log: {
        error: vi.fn(),
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await getAllUsers(request, reply);

    expect(UserModel.findAll).toHaveBeenCalledWith({ page: '1', limit: '10' });
    expect(sendPaginated).toHaveBeenCalledWith(
      reply,
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.not.objectContaining({
            api_key: expect.any(String),
          }),
        ]),
      })
    );
  });

  // ========================================
  // USER-05: 获取用户详情成功
  // ========================================
  it('应该成功获取用户详情', async () => {
    const mockUser = {
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      credits: 100,
      webhook_url: null,
      api_key: 'test-api-key',
      created_at: new Date(),
    };

    vi.mocked(UserModel.findById).mockResolvedValue(mockUser);

    const { getUserById } = await import('../../../controllers/user.controller.js');

    const request = {
      user: {
        id: 1,
        role: UserRole.ADMIN,
      },
      params: {
        id: '1',
      },
      log: {
        error: vi.fn(),
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await getUserById(request, reply);

    expect(UserModel.findById).toHaveBeenCalledWith(1);
    expect(sendSuccess).toHaveBeenCalledWith(
      reply,
      expect.objectContaining({
        id: 1,
        username: 'testuser',
      })
    );
  });

  // ========================================
  // USER-06: 获取用户详情-无效ID
  // ========================================
  it('无效的用户ID应该返回400错误', async () => {
    const { getUserById } = await import('../../../controllers/user.controller.js');

    const request = {
      user: {
        id: 1,
        role: UserRole.ADMIN,
      },
      params: {
        id: 'invalid',
      },
      log: {
        error: vi.fn(),
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await getUserById(request, reply);

    expect(sendError).toHaveBeenCalledWith(reply, '无效的用户 ID', 400);
  });

  // ========================================
  // USER-07: 获取用户详情-不存在
  // ========================================
  it('用户不存在应该返回404错误', async () => {
    vi.mocked(UserModel.findById).mockResolvedValue(null);

    const { getUserById } = await import('../../../controllers/user.controller.js');

    const request = {
      user: {
        id: 1,
        role: UserRole.ADMIN,
      },
      params: {
        id: '999',
      },
      log: {
        error: vi.fn(),
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await getUserById(request, reply);

    expect(sendError).toHaveBeenCalledWith(reply, '用户不存在', 404);
  });

  // ========================================
  // USER-08: 更新用户成功
  // ========================================
  it('应该成功更新用户', async () => {
    const existingUser = {
      id: 1,
      username: 'testuser',
      email: 'old@example.com',
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      credits: 100,
    };

    const updatedUser = {
      ...existingUser,
      email: 'new@example.com',
    };

    vi.mocked(UserModel.findById).mockResolvedValue(existingUser);
    vi.mocked(UserModel.update).mockResolvedValue(updatedUser);
    vi.mocked(OperationLogModel.create).mockResolvedValue(undefined);

    const { updateUser } = await import('../../../controllers/user.controller.js');

    const request = {
      user: {
        id: 1, // Admin
        role: UserRole.ADMIN,
      },
      params: {
        id: '1',
      },
      body: {
        email: 'new@example.com',
      },
      log: {
        error: vi.fn(),
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await updateUser(request, reply);

    expect(UserModel.update).toHaveBeenCalledWith(1, { email: 'new@example.com' });
    expect(OperationLogModel.create).toHaveBeenCalled();
    expect(sendSuccess).toHaveBeenCalledWith(
      reply,
      expect.objectContaining({
        email: 'new@example.com',
      })
    );
  });

  // ========================================
  // USER-09: 更新用户-不存在
  // ========================================
  it('更新不存在的用户应该返回404错误', async () => {
    vi.mocked(UserModel.findById).mockResolvedValue(null);

    const { updateUser } = await import('../../../controllers/user.controller.js');

    const request = {
      user: {
        id: 1,
        role: UserRole.ADMIN,
      },
      params: {
        id: '999',
      },
      body: {
        email: 'new@example.com',
      },
      log: {
        error: vi.fn(),
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await updateUser(request, reply);

    expect(sendError).toHaveBeenCalledWith(reply, '用户不存在', 404);
  });

  // ========================================
  // USER-10: 重置API Key成功
  // ========================================
  it('应该成功重置用户API Key', async () => {
    const existingUser = {
      id: 1,
      username: 'testuser',
    };

    const newApiKey = 'new-generated-api-key';

    vi.mocked(UserModel.findById).mockResolvedValue(existingUser);
    vi.mocked(UserModel.resetApiKey).mockResolvedValue(newApiKey);
    vi.mocked(OperationLogModel.create).mockResolvedValue(undefined);

    const { resetApiKey } = await import('../../../controllers/user.controller.js');

    const request = {
      user: {
        id: 1,
        role: UserRole.ADMIN,
      },
      params: {
        id: '1',
      },
      log: {
        error: vi.fn(),
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await resetApiKey(request, reply);

    expect(UserModel.resetApiKey).toHaveBeenCalledWith(1);
    expect(OperationLogModel.create).toHaveBeenCalled();
    expect(sendSuccess).toHaveBeenCalledWith(reply, { api_key: newApiKey });
  });

  // ========================================
  // USER-11: 删除用户成功
  // ========================================
  it('应该成功删除用户', async () => {
    const existingUser = {
      id: 2,
      username: 'todelete',
      role: UserRole.USER,
    };

    vi.mocked(UserModel.findById).mockResolvedValue(existingUser);
    vi.mocked(UserModel.delete).mockResolvedValue(true);
    vi.mocked(OperationLogModel.create).mockResolvedValue(undefined);

    const { deleteUser } = await import('../../../controllers/user.controller.js');

    const request = {
      user: {
        id: 1,
        role: UserRole.ADMIN,
      },
      params: {
        id: '2',
      },
      log: {
        error: vi.fn(),
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await deleteUser(request, reply);

    expect(UserModel.delete).toHaveBeenCalledWith(2);
    expect(OperationLogModel.create).toHaveBeenCalled();
    expect(sendNoContent).toHaveBeenCalledWith(reply);
  });

  // ========================================
  // USER-12: 删除管理员用户
  // ========================================
  it('不应该允许删除管理员用户', async () => {
    const adminUser = {
      id: 1,
      username: 'admin',
      role: UserRole.ADMIN,
    };

    vi.mocked(UserModel.findById).mockResolvedValue(adminUser);

    const { deleteUser } = await import('../../../controllers/user.controller.js');

    const request = {
      user: {
        id: 2,
        role: UserRole.ADMIN,
      },
      params: {
        id: '1',
      },
      log: {
        error: vi.fn(),
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await deleteUser(request, reply);

    expect(sendError).toHaveBeenCalledWith(reply, '不允许删除管理员账号', 403);
    expect(UserModel.delete).not.toHaveBeenCalled();
  });

  // ========================================
  // USER-13: 删除用户-不存在
  // ========================================
  it('删除不存在的用户应该返回404错误', async () => {
    vi.mocked(UserModel.findById).mockResolvedValue(null);

    const { deleteUser } = await import('../../../controllers/user.controller.js');

    const request = {
      user: {
        id: 1,
        role: UserRole.ADMIN,
      },
      params: {
        id: '999',
      },
      log: {
        error: vi.fn(),
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await deleteUser(request, reply);

    expect(sendError).toHaveBeenCalledWith(reply, '用户不存在', 404);
  });

  // ========================================
  // USER-14: 获取用户会话统计
  // ========================================
  it('应该成功获取用户会话统计', async () => {
    const existingUser = {
      id: 1,
      username: 'testuser',
    };

    const mockStats = {
      total_sessions: 10,
      total_duration: 3600,
      total_credits_used: 60,
    };

    vi.mocked(UserModel.findById).mockResolvedValue(existingUser);
    vi.mocked(SessionModel.getUserSessionStats).mockResolvedValue(mockStats);

    const { getUserSessionStats } = await import('../../../controllers/user.controller.js');

    const request = {
      user: {
        id: 1,
        role: UserRole.ADMIN,
      },
      params: {
        id: '1',
      },
      log: {
        error: vi.fn(),
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await getUserSessionStats(request, reply);

    expect(SessionModel.getUserSessionStats).toHaveBeenCalledWith(1);
    expect(sendSuccess).toHaveBeenCalledWith(reply, mockStats);
  });
});
