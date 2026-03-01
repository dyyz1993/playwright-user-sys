/**
 * Auth Controller 单元测试
 * 测试认证控制器的业务逻辑
 *
 * 注意: 此测试使用 Mock 策略
 * - 真实执行: Controller 的业务逻辑
 * - Mock: Models 层、认证工具、响应工具
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserStatus, UserRole } from '../../../shared/types/index.js';

// Mock 所有依赖
vi.mock('../../../models/user.model.js', () => ({
  UserModel: {
    findByUsername: vi.fn(),
    findById: vi.fn(),
  },
}));

vi.mock('../../../utils/auth.js', () => ({
  comparePassword: vi.fn(),
  generateToken: vi.fn(() => 'mock-jwt-token'),
}));

vi.mock('../../../utils/response.js', () => ({
  sendSuccess: vi.fn((reply, _data, _code) => {
    reply.code = vi.fn().mockReturnValue(reply);
    reply.send = vi.fn().mockReturnValue(reply);
    return reply;
  }),
  sendError: vi.fn((reply, _message, _code) => {
    reply.code = vi.fn().mockReturnValue(reply);
    reply.send = vi.fn().mockReturnValue(reply);
    return reply;
  }),
}));

vi.mock('../../../config/env.js', () => ({
  env: {
    JWT_SECRET: 'test-secret-key',
  },
}));

describe('AuthController', () => {
  let UserModel: any;
  let comparePassword: any;
  let generateToken: any;
  let sendSuccess: any;
  let sendError: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // 获取mock实例
    const userModule = await import('../../../models/user.model.js');
    UserModel = userModule.UserModel;

    const authModule = await import('../../../utils/auth.js');
    comparePassword = authModule.comparePassword;
    generateToken = authModule.generateToken;

    const responseModule = await import('../../../utils/response.js');
    sendSuccess = responseModule.sendSuccess;
    sendError = responseModule.sendError;
  });

  // ========================================
  // AUTH-01: 正常登录成功
  // ========================================
  it('应该成功登录并返回用户信息和token', async () => {
    const mockUser = {
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      credits: 100,
      password: 'hashed_password',
      created_at: new Date(),
    };

    vi.mocked(UserModel.findByUsername).mockResolvedValue(mockUser);
    vi.mocked(comparePassword).mockResolvedValue(true);
    vi.mocked(generateToken).mockReturnValue('mock-jwt-token');

    const { login } = await import('../../../controllers/auth.controller.js');

    const request = {
      body: {
        username: 'testuser',
        password: 'password123',
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await login(request as any, reply as any);

    expect(UserModel.findByUsername).toHaveBeenCalledWith('testuser');
    expect(comparePassword).toHaveBeenCalledWith('password123', 'hashed_password');
    expect(generateToken).toHaveBeenCalled();
    expect(sendSuccess).toHaveBeenCalledWith(
      reply,
      expect.objectContaining({
        user: expect.objectContaining({
          id: 1,
          username: 'testuser',
        }),
        token: 'mock-jwt-token',
      })
    );
  });

  // ========================================
  // AUTH-02: 用户名不存在
  // ========================================
  it('用户名不存在时应该返回401错误', async () => {
    vi.mocked(UserModel.findByUsername).mockResolvedValue(null);

    const { login } = await import('../../../controllers/auth.controller.js');

    const request = {
      body: {
        username: 'nonexistent',
        password: 'password123',
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await login(request as any, reply as any);

    expect(sendError).toHaveBeenCalledWith(reply, '用户名或密码错误', 401);
  });

  // ========================================
  // AUTH-03: 密码错误
  // ========================================
  it('密码错误时应该返回401错误', async () => {
    const mockUser = {
      id: 1,
      username: 'testuser',
      password: 'hashed_password',
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
    };

    vi.mocked(UserModel.findByUsername).mockResolvedValue(mockUser);
    vi.mocked(comparePassword).mockResolvedValue(false);

    const { login } = await import('../../../controllers/auth.controller.js');

    const request = {
      body: {
        username: 'testuser',
        password: 'wrongpassword',
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await login(request as any, reply as any);

    expect(sendError).toHaveBeenCalledWith(reply, '用户名或密码错误', 401);
  });

  // ========================================
  // AUTH-04: 用户被禁用
  // ========================================
  it('用户被禁用时应该返回403错误', async () => {
    const mockUser = {
      id: 1,
      username: 'testuser',
      password: 'hashed_password',
      role: UserRole.USER,
      status: UserStatus.SUSPENDED,
    };

    vi.mocked(UserModel.findByUsername).mockResolvedValue(mockUser);
    vi.mocked(comparePassword).mockResolvedValue(true);

    const { login } = await import('../../../controllers/auth.controller.js');

    const request = {
      body: {
        username: 'testuser',
        password: 'password123',
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await login(request as any, reply as any);

    expect(sendError).toHaveBeenCalledWith(reply, '用户账号已被禁用', 403);
  });

  // ========================================
  // AUTH-05: 请求参数验证失败
  // ========================================
  it('请求参数验证失败时应该返回400错误', async () => {
    const { login } = await import('../../../controllers/auth.controller.js');

    const request = {
      body: {
        username: '',
      },
      log: {
        error: vi.fn(),
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await login(request as any, reply as any);

    expect(sendError).toHaveBeenCalledWith(reply, expect.stringContaining('无效的请求数据'), 400);
  });

  // ========================================
  // AUTH-06: 获取当前用户成功
  // ========================================
  it('应该成功返回当前用户信息', async () => {
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

    const { getCurrentUser } = await import('../../../controllers/auth.controller.js');

    const request = {
      user: {
        id: 1,
      },
      log: {
        error: vi.fn(),
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await getCurrentUser(request as any, reply as any);

    expect(UserModel.findById).toHaveBeenCalledWith(1);
    expect(sendSuccess).toHaveBeenCalledWith(
      reply,
      expect.objectContaining({
        user: expect.objectContaining({
          id: 1,
          username: 'testuser',
        }),
      })
    );
  });

  // ========================================
  // AUTH-07: 获取当前用户-未登录
  // ========================================
  it('用户未登录时应该返回401错误', async () => {
    const { getCurrentUser } = await import('../../../controllers/auth.controller.js');

    const request = {
      user: null,
      log: {
        error: vi.fn(),
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await getCurrentUser(request as any, reply as any);

    expect(sendError).toHaveBeenCalledWith(reply, '用户未登录', 401);
  });

  // ========================================
  // AUTH-08: 获取当前用户-用户不存在
  // ========================================
  it('用户不存在时应该返回404错误', async () => {
    vi.mocked(UserModel.findById).mockResolvedValue(null);

    const { getCurrentUser } = await import('../../../controllers/auth.controller.js');

    const request = {
      user: {
        id: 1,
      },
      log: {
        error: vi.fn(),
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await getCurrentUser(request as any, reply as any);

    expect(sendError).toHaveBeenCalledWith(reply, '用户不存在', 404);
  });
});
