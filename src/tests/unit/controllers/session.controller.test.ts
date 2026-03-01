/**
 * Session Controller 单元测试
 * 测试会话控制器的业务逻辑
 *
 * 注意: 此测试使用 Mock 策略
 * - 真实执行: Controller 的业务逻辑
 * - Mock: Models 层、Session 服务、响应工具、配置
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserRole, SessionStatus } from '../../../shared/types/index.js';

// Mock 所有依赖
vi.mock('../../../models/session.model.js', () => ({
  SessionModel: {
    findById: vi.fn(),
    findByUserId: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    markDisconnected: vi.fn(),
  },
}));

vi.mock('../../../models/machine.model.js', () => ({
  MachineModel: {
    decrementInstanceCount: vi.fn(),
  },
}));

vi.mock('../../../models/user.model.js', () => ({
  UserModel: {
    deductCredits: vi.fn(),
    findByApiKey: vi.fn(),
  },
}));

vi.mock('../../../services/session.service.js', () => ({
  createBrowserSession: vi.fn(),
}));

vi.mock('../../../services/machine-grpc.service.js', () => ({
  connectionManager: {
    closeBrowser: vi.fn(),
  },
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
}));

vi.mock('../../../utils/webhook.js', () => ({
  createWebhookEvent: vi.fn(),
}));

vi.mock('../../../config/env.js', () => ({
  env: {
    VITE_FRONTEND_URL: 'http://localhost:5173',
    PUBLIC_MACHINE_ENDPOINT: '',
  },
}));

describe('SessionController', () => {
  let SessionModel: any;
  let MachineModel: any;
  let UserModel: any;
  let createBrowserSession: any;
  let connectionManager: any;
  let sendSuccess: any;
  let sendError: any;
  let sendCreated: any;
  let createWebhookEvent: any;

  beforeEach(async () => {
    vi.resetModules();

    // 获取mock实例
    const sessionModule = await import('../../../models/session.model.js');
    SessionModel = sessionModule.SessionModel;

    const machineModule = await import('../../../models/machine.model.js');
    MachineModel = machineModule.MachineModel;

    const userModule = await import('../../../models/user.model.js');
    UserModel = userModule.UserModel;

    const sessionServiceModule = await import('../../../services/session.service.js');
    createBrowserSession = sessionServiceModule.createBrowserSession;

    const machineGrpcModule = await import('../../../services/machine-grpc.service.js');
    connectionManager = machineGrpcModule.connectionManager;

    const responseModule = await import('../../../utils/response.js');
    sendSuccess = responseModule.sendSuccess;
    sendError = responseModule.sendError;
    sendCreated = responseModule.sendCreated;

    const webhookModule = await import('../../../utils/webhook.js');
    createWebhookEvent = webhookModule.createWebhookEvent;
  });

  // ========================================
  // SESS-01: 创建会话成功
  // ========================================
  it('应该成功创建会话', async () => {
    const mockSessionResult = {
      sessionId: 'session-123',
      status: SessionStatus.CREATED,
      browserWSEndpoint: 'ws://localhost:9222',
      directUrl: 'ws://localhost:8082?sessionId=session-123',
      created_at: new Date(),
    };

    vi.mocked(createBrowserSession).mockResolvedValue(mockSessionResult);

    const { createSession } = await import('../../../controllers/session.controller.js');

    const request = {
      user: {
        id: 1,
        role: UserRole.USER,
      },
      body: {
        viewport: {
          width: 1280,
          height: 800,
        },
      },
      log: {
        info: vi.fn(),
        error: vi.fn(),
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await createSession(request, reply);

    expect(createBrowserSession).toHaveBeenCalledWith(1, request.body);
    expect(sendCreated).toHaveBeenCalledWith(
      reply,
      expect.objectContaining({
        id: 'session-123',
        status: SessionStatus.CREATED,
        viewerUrl: 'http://localhost:5173/viewer?sessionId=session-123',
      })
    );
  });

  // ========================================
  // SESS-02: 创建会话-未认证
  // ========================================
  it('用户未认证时创建会话应该返回401错误', async () => {
    const { createSession } = await import('../../../controllers/session.controller.js');

    const request = {
      user: null,
      body: {},
      log: {
        info: vi.fn(),
        error: vi.fn(),
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await createSession(request, reply);

    expect(sendError).toHaveBeenCalledWith(reply, '用户未认证', 401);
  });

  // ========================================
  // SESS-03: 创建会话-点数不足
  // ========================================
  it('用户点数不足时创建会话应该返回400错误', async () => {
    vi.mocked(createBrowserSession).mockRejectedValue(new Error('点数不足，请联系管理员充值'));

    const { createSession } = await import('../../../controllers/session.controller.js');

    const request = {
      user: {
        id: 1,
        role: UserRole.USER,
      },
      body: {},
      log: {
        info: vi.fn(),
        error: vi.fn(),
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await createSession(request, reply);

    expect(sendError).toHaveBeenCalledWith(reply, '点数不足，请联系管理员充值', 402);
  });

  // ========================================
  // SESS-04: 获取会话详情成功
  // ========================================
  it('应该成功获取会话详情', async () => {
    const mockSession = {
      id: 'session-123',
      user_id: 1,
      status: SessionStatus.CONNECTED,
      machine_id: 'machine-1',
      port: 9222,
      options: { viewport: { width: 1280, height: 800 } },
      start_time: new Date(),
      end_time: null,
      duration: 0,
      screenshot_url: 'http://example.com/screenshot.png',
      created_at: new Date(),
      updated_at: new Date(),
    };

    vi.mocked(SessionModel.findById).mockResolvedValue(mockSession);

    const { getSession } = await import('../../../controllers/session.controller.js');

    const request = {
      user: {
        id: 1,
        role: UserRole.USER,
      },
      params: {
        id: 'session-123',
      },
      log: {
        error: vi.fn(),
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await getSession(request, reply);

    expect(SessionModel.findById).toHaveBeenCalledWith('session-123');
    expect(sendSuccess).toHaveBeenCalledWith(
      reply,
      expect.objectContaining({
        id: 'session-123',
        status: SessionStatus.CONNECTED,
      })
    );
  });

  // ========================================
  // SESS-05: 获取会话-无权访问
  // ========================================
  it('无权访问会话时应该返回403错误', async () => {
    const mockSession = {
      id: 'session-123',
      user_id: 2, // Different user
      status: SessionStatus.CONNECTED,
    };

    vi.mocked(SessionModel.findById).mockResolvedValue(mockSession);

    const { getSession } = await import('../../../controllers/session.controller.js');

    const request = {
      user: {
        id: 1,
        role: UserRole.USER, // Not admin
      },
      params: {
        id: 'session-123',
      },
      log: {
        error: vi.fn(),
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await getSession(request, reply);

    expect(sendError).toHaveBeenCalledWith(reply, '无权访问此会话', 403);
  });

  // ========================================
  // SESS-06: 获取会话-不存在
  // ========================================
  it('会话不存在时应该返回404错误', async () => {
    vi.mocked(SessionModel.findById).mockResolvedValue(null);

    const { getSession } = await import('../../../controllers/session.controller.js');

    const request = {
      user: {
        id: 1,
        role: UserRole.USER,
      },
      params: {
        id: 'nonexistent-session',
      },
      log: {
        error: vi.fn(),
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await getSession(request, reply);

    expect(sendError).toHaveBeenCalledWith(reply, '会话不存在', 404);
  });

  // ========================================
  // SESS-07: 释放会话成功
  // ========================================
  it('应该成功释放会话', async () => {
    const mockSession = {
      id: 'session-123',
      user_id: 1,
      status: SessionStatus.CONNECTED,
      machine_id: 'machine-1',
      start_time: new Date(),
      duration: 0,
      credits_used: 0,
    };

    const mockUpdatedSession = {
      ...mockSession,
      status: SessionStatus.DISCONNECTED,
      duration: 120,
      credits_used: 2,
    };

    vi.mocked(SessionModel.findById).mockResolvedValueOnce(mockSession).mockResolvedValueOnce(mockUpdatedSession);
    vi.mocked(connectionManager.closeBrowser).mockResolvedValue(undefined);
    vi.mocked(SessionModel.markDisconnected).mockResolvedValue(mockUpdatedSession);
    vi.mocked(createWebhookEvent).mockResolvedValue(undefined);

    const { releaseSession } = await import('../../../controllers/session.controller.js');

    const request = {
      user: {
        id: 1,
        role: UserRole.USER,
      },
      params: {
        id: 'session-123',
      },
      log: {
        info: vi.fn(),
        error: vi.fn(),
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await releaseSession(request, reply);

    expect(connectionManager.closeBrowser).toHaveBeenCalledWith('machine-1', 'session-123');
    expect(SessionModel.markDisconnected).toHaveBeenCalled();
    expect(MachineModel.decrementInstanceCount).toHaveBeenCalledWith('machine-1');
    expect(sendSuccess).toHaveBeenCalled();
  });

  // ========================================
  // SESS-08: 释放会话-已释放
  // ========================================
  it('会话已释放时应该直接返回成功', async () => {
    const mockSession = {
      id: 'session-123',
      user_id: 1,
      status: SessionStatus.DISCONNECTED,
      duration: 120,
      machine_id: 'machine-1',
      start_time: new Date(Date.now() - 120 * 1000),
    };

    vi.mocked(SessionModel.findById).mockResolvedValue(mockSession);
    vi.mocked(SessionModel.markDisconnected).mockResolvedValue({
      id: 'session-123',
      status: SessionStatus.DISCONNECTED,
      duration: 120,
    });

    const { connectionManager } = await import('../../../services/machine-grpc.service.js');
    vi.mocked(connectionManager.closeBrowser).mockResolvedValue(undefined);

    const { releaseSession } = await import('../../../controllers/session.controller.js');

    const request = {
      user: {
        id: 1,
        role: UserRole.USER,
      },
      params: {
        id: 'session-123',
      },
      log: {
        info: vi.fn(),
        error: vi.fn(),
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await releaseSession(request, reply);

    expect(sendSuccess).toHaveBeenCalledWith(
      reply,
      {
        id: 'session-123',
        status: SessionStatus.DISCONNECTED,
        duration: expect.any(Number),
      },
      '会话已释放'
    );
  });

  // ========================================
  // SESS-09: 释放会话-无机器
  // ========================================
  it('会话无关联机器时应该标记为已断开', async () => {
    const mockSession = {
      id: 'session-123',
      user_id: 1,
      status: SessionStatus.CREATED,
      machine_id: null,
      start_time: new Date(),
    };

    vi.mocked(SessionModel.findById).mockResolvedValue(mockSession);
    vi.mocked(SessionModel.markDisconnected).mockResolvedValue({
      id: 'session-123',
      status: SessionStatus.DISCONNECTED,
      duration: 0,
    });

    const { releaseSession } = await import('../../../controllers/session.controller.js');

    const request = {
      user: {
        id: 1,
        role: UserRole.USER,
      },
      params: {
        id: 'session-123',
      },
      log: {
        info: vi.fn(),
        error: vi.fn(),
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await releaseSession(request, reply);

    expect(SessionModel.markDisconnected).toHaveBeenCalledWith('session-123', expect.any(Number));
    expect(sendSuccess).toHaveBeenCalled();
  });

  // ========================================
  // SESS-10: 释放会话-关闭失败
  // ========================================
  it('关闭浏览器失败时应该仍然标记会话为已断开', async () => {
    const mockSession = {
      id: 'session-123',
      user_id: 1,
      status: SessionStatus.CONNECTED,
      machine_id: 'machine-1',
      start_time: new Date(),
      duration: 0,
      credits_used: 0,
    };

    const mockUpdatedSession = {
      ...mockSession,
      status: SessionStatus.DISCONNECTED,
      duration: 120,
      credits_used: 2,
    };

    vi.mocked(SessionModel.findById).mockResolvedValueOnce(mockSession).mockResolvedValueOnce(mockUpdatedSession);
    vi.mocked(connectionManager.closeBrowser).mockRejectedValue(new Error('Connection lost'));
    vi.mocked(SessionModel.markDisconnected).mockResolvedValue(mockUpdatedSession);
    vi.mocked(createWebhookEvent).mockResolvedValue(undefined);

    const { releaseSession } = await import('../../../controllers/session.controller.js');

    const request = {
      user: {
        id: 1,
        role: UserRole.USER,
      },
      params: {
        id: 'session-123',
      },
      log: {
        info: vi.fn(),
        error: vi.fn(),
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await releaseSession(request, reply);

    expect(SessionModel.markDisconnected).toHaveBeenCalled();
    expect(sendSuccess).toHaveBeenCalledWith(
      reply,
      expect.objectContaining({
        status: SessionStatus.DISCONNECTED,
      }),
      '会话已释放（但关闭浏览器实例失败）'
    );
  });

  // ========================================
  // SESS-11: 获取用户会话列表
  // ========================================
  it('应该成功获取用户会话列表', async () => {
    const mockSessions = {
      items: [
        {
          id: 'session-1',
          status: SessionStatus.CONNECTED,
          created_at: new Date(),
        },
        {
          id: 'session-2',
          status: SessionStatus.DISCONNECTED,
          created_at: new Date(),
        },
      ],
      total: 2,
      page: 1,
      limit: 10,
      totalPages: 1,
    };

    vi.mocked(SessionModel.findByUserId).mockResolvedValue(mockSessions);

    const { getUserSessions } = await import('../../../controllers/session.controller.js');

    const request = {
      user: {
        id: 1,
        role: UserRole.USER,
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

    await getUserSessions(request, reply);

    expect(SessionModel.findByUserId).toHaveBeenCalledWith(1, { page: '1', limit: '10' });
    expect(sendSuccess).toHaveBeenCalledWith(reply, mockSessions);
  });

  // ========================================
  // SESS-12: 管理员获取所有会话
  // ========================================
  it('管理员应该成功获取所有会话', async () => {
    const mockSessions = {
      items: [
        {
          id: 'session-1',
          user_id: 1,
          status: SessionStatus.CONNECTED,
        },
        {
          id: 'session-2',
          user_id: 2,
          status: SessionStatus.DISCONNECTED,
        },
      ],
      total: 2,
      page: 1,
      limit: 10,
      totalPages: 1,
    };

    vi.mocked(SessionModel.findAll).mockResolvedValue(mockSessions);

    const { getAllSessions } = await import('../../../controllers/session.controller.js');

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

    await getAllSessions(request, reply);

    expect(SessionModel.findAll).toHaveBeenCalledWith({ page: '1', limit: '10' });
    expect(sendSuccess).toHaveBeenCalledWith(reply, mockSessions);
  });

  // ========================================
  // SESS-13: 非管理员获取所有会话
  // ========================================
  it('非管理员获取所有会话时应该返回403错误', async () => {
    const { getAllSessions } = await import('../../../controllers/session.controller.js');

    const request = {
      user: {
        id: 1,
        role: UserRole.USER, // Not admin
      },
      query: {},
      log: {
        error: vi.fn(),
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await getAllSessions(request, reply);

    expect(sendError).toHaveBeenCalledWith(reply, '无权访问', 403);
  });

  // ========================================
  // SESS-14: 管理员强制关闭会话
  // ========================================
  it('管理员应该成功强制关闭会话', async () => {
    const mockSession = {
      id: 'session-123',
      user_id: 2,
      status: SessionStatus.CONNECTED,
      machine_id: 'machine-1',
      start_time: new Date(),
      duration: 0,
      credits_used: 0,
    };

    const mockUpdatedSession = {
      ...mockSession,
      status: SessionStatus.DISCONNECTED,
      duration: 120,
      credits_used: 2,
    };

    vi.mocked(connectionManager.closeBrowser).mockResolvedValue(undefined);
    vi.mocked(SessionModel.findById).mockResolvedValueOnce(mockSession).mockResolvedValueOnce(mockUpdatedSession);
    vi.mocked(SessionModel.markDisconnected).mockResolvedValue(mockUpdatedSession);
    vi.mocked(createWebhookEvent).mockResolvedValue(undefined);

    const { closeSession } = await import('../../../controllers/session.controller.js');

    const request = {
      user: {
        id: 1,
        role: UserRole.ADMIN,
      },
      params: {
        id: 'session-123',
      },
      log: {
        info: vi.fn(),
        error: vi.fn(),
      },
    } as any;

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    } as any;

    await closeSession(request, reply);

    // 验证会话被标记为断开
    expect(SessionModel.markDisconnected).toHaveBeenCalled();
    // 验证返回成功响应
    expect(sendSuccess).toHaveBeenCalledWith(
      reply,
      expect.objectContaining({
        status: SessionStatus.DISCONNECTED,
      }),
      '会话已关闭'
    );
  });

  // ========================================
  // SESS-15: 获取截图-无效API Key
  // ========================================
  it('无效API Key时获取截图应该返回401错误', async () => {
    const mockSession = {
      id: 'session-123',
      user_id: 1,
      screenshot_url: 'http://example.com/screenshot.png',
    };

    vi.mocked(SessionModel.findById).mockResolvedValue(mockSession);
    vi.mocked(UserModel.findByApiKey).mockResolvedValue(null);

    const { getSessionScreenshot } = await import('../../../controllers/session.controller.js');

    const request = {
      params: {
        id: 'session-123',
      },
      headers: {
        'x-api-key': 'invalid-api-key',
      },
      log: {
        error: vi.fn(),
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await getSessionScreenshot(request, reply);

    expect(UserModel.findByApiKey).toHaveBeenCalledWith('invalid-api-key');
    expect(sendError).toHaveBeenCalledWith(reply, '无效的 API Key', 401);
  });

  // ========================================
  // SESS-16: 获取截图-无权访问
  // ========================================
  it('无权访问会话截图时应该返回403错误', async () => {
    const mockSession = {
      id: 'session-123',
      user_id: 2, // Different user
      screenshot_url: 'http://example.com/screenshot.png',
    };

    const mockUser = {
      id: 1,
    };

    vi.mocked(SessionModel.findById).mockResolvedValue(mockSession);
    vi.mocked(UserModel.findByApiKey).mockResolvedValue(mockUser);

    const { getSessionScreenshot } = await import('../../../controllers/session.controller.js');

    const request = {
      params: {
        id: 'session-123',
      },
      headers: {
        'x-api-key': 'valid-api-key',
      },
      log: {
        error: vi.fn(),
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await getSessionScreenshot(request, reply);

    expect(sendError).toHaveBeenCalledWith(reply, '无权访问该会话', 403);
  });

  // ========================================
  // SESS-17: 获取截图-无截图URL
  // ========================================
  it('会话无截图URL时应该返回404错误', async () => {
    const mockSession = {
      id: 'session-123',
      user_id: 1,
      screenshot_url: null, // No screenshot
    };

    const mockUser = {
      id: 1,
    };

    vi.mocked(SessionModel.findById).mockResolvedValue(mockSession);
    vi.mocked(UserModel.findByApiKey).mockResolvedValue(mockUser);

    const { getSessionScreenshot } = await import('../../../controllers/session.controller.js');

    const request = {
      params: {
        id: 'session-123',
      },
      headers: {
        'x-api-key': 'valid-api-key',
      },
      log: {
        error: vi.fn(),
      },
    };

    const reply = {
      code: vi.fn(),
      send: vi.fn(),
    };

    await getSessionScreenshot(request, reply);

    expect(sendError).toHaveBeenCalledWith(reply, '会话没有截图', 404);
  });
});
