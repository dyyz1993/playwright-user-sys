import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../machine/grpc/system-info.js', () => ({
  getCpuUsage: vi.fn().mockReturnValue(45.5),
  getMemoryUsage: vi.fn().mockReturnValue(62.3),
  getDiskUsage: vi.fn().mockResolvedValue(55.1),
}));

vi.mock('../../../../machine/health.service.js', () => ({
  setGrpcConnected: vi.fn(),
}));

vi.mock('../../../../machine/browser.service.js', () => ({
  browserService: {
    getActiveSessions: vi.fn().mockReturnValue(3),
    closeBrowser: vi.fn().mockResolvedValue(true),
    closeAllBrowsers: vi.fn().mockResolvedValue(undefined),
    takeScreenshot: vi.fn().mockResolvedValue('http://example.com/screenshot.png'),
  },
}));

vi.mock('@shared/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('machine/grpc ConnectionManager', () => {
  let ConnectionManager: ReturnType<typeof vi.fn>;
  let onDisconnected: ReturnType<typeof vi.fn>;
  let onReconnectNeeded: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    onDisconnected = vi.fn();
    onReconnectNeeded = vi.fn();

    const mod = await import('../../../../machine/grpc/connection-manager.js');
    ConnectionManager = mod.ConnectionManager;
  });

  it('should initialize with correct machine ID', () => {
    const cm = new ConnectionManager('machine-001', onDisconnected, onReconnectNeeded);
    expect(cm.isConnected()).toBe(false);
  });

  it('should track connected state', () => {
    const cm = new ConnectionManager('machine-001', onDisconnected, onReconnectNeeded);

    cm.setConnected(true);
    expect(cm.isConnected()).toBe(true);

    cm.setConnected(false);
    expect(cm.isConnected()).toBe(false);
  });

  it('should store call reference', () => {
    const cm = new ConnectionManager('machine-001', onDisconnected, onReconnectNeeded);
    expect(cm.getCall()).toBeNull();

    const mockCall = { write: vi.fn(), on: vi.fn(), end: vi.fn() };
    cm.setCall(mockCall as unknown as Record<string, unknown>);
    expect(cm.getCall()).toBe(mockCall);
  });

  it('should stop heartbeat interval', () => {
    const cm = new ConnectionManager('machine-001', onDisconnected, onReconnectNeeded);
    cm.startHeartbeat();
    cm.stopHeartbeat();
    expect(cm.isConnected()).toBe(false);
  });

  it('should cancel zombie stream when connected but no manager data arrives for over 95s', async () => {
    vi.useFakeTimers();
    try {
      const cm = new ConnectionManager('machine-001', onDisconnected, onReconnectNeeded);
      cm.setConnected(true);

      const mockCall = {
        on: vi.fn(),
        write: vi.fn().mockReturnValue(true),
        end: vi.fn(),
        cancel: vi.fn(),
      };
      cm.setupStreamHandlers(mockCall as unknown as Record<string, unknown>);
      cm.startHeartbeat();

      // 95 秒阈值内不应 cancel（60s < 95s）
      await vi.advanceTimersByTimeAsync(60000);
      expect(mockCall.cancel).not.toHaveBeenCalled();

      // 超过 95 秒（第 4 个 30s tick = 120s）应 cancel 僵尸流触发重连
      await vi.advanceTimersByTimeAsync(70000);
      expect(mockCall.cancel).toHaveBeenCalled();

      cm.stopHeartbeat();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should reset staleness clock when a new stream is set up', async () => {
    vi.useFakeTimers();
    try {
      const cm = new ConnectionManager('machine-001', onDisconnected, onReconnectNeeded);
      cm.setConnected(true);

      const firstCall = {
        on: vi.fn(),
        write: vi.fn().mockReturnValue(true),
        end: vi.fn(),
        cancel: vi.fn(),
      };
      cm.setupStreamHandlers(firstCall as unknown as Record<string, unknown>);
      cm.startHeartbeat();

      // 模拟长时间断线：旧流时间戳已远超 95s
      await vi.advanceTimersByTimeAsync(200000);
      expect(firstCall.cancel).toHaveBeenCalled();

      // 重连建立新流：staleness 应从现在重新起算，60s 内不应误杀新流
      const secondCall = {
        on: vi.fn(),
        write: vi.fn().mockReturnValue(true),
        end: vi.fn(),
        cancel: vi.fn(),
      };
      cm.setupStreamHandlers(secondCall as unknown as Record<string, unknown>);
      cm.setConnected(true);
      await vi.advanceTimersByTimeAsync(60000);
      expect(secondCall.cancel).not.toHaveBeenCalled();

      cm.stopHeartbeat();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should call onDisconnected when stream ends', () => {
    const cm = new ConnectionManager('machine-001', onDisconnected, onReconnectNeeded);

    const mockCall = {
      on: vi.fn((event: string, handler: Function) => {
        if (event === 'end') {
          (mockCall as unknown as Record<string, unknown>)._endHandler = handler;
        }
      }),
      write: vi.fn(),
      end: vi.fn(),
    };

    cm.setupStreamHandlers(mockCall as unknown as Record<string, unknown>);

    const endHandler = (mockCall as unknown as Record<string, unknown>)._endHandler;
    if (endHandler) endHandler();

    expect(onDisconnected).toHaveBeenCalled();
    expect(cm.isConnected()).toBe(false);
  });

  it('should call onReconnectNeeded on stream error', () => {
    const cm = new ConnectionManager('machine-001', onDisconnected, onReconnectNeeded);

    const mockCall = {
      on: vi.fn((event: string, handler: Function) => {
        if (event === 'error') {
          (mockCall as unknown as Record<string, unknown>)._errorHandler = handler;
        }
      }),
      write: vi.fn(),
      end: vi.fn(),
    };

    cm.setupStreamHandlers(mockCall as unknown as Record<string, unknown>);

    const errorHandler = (mockCall as unknown as Record<string, unknown>)._errorHandler;
    if (errorHandler) errorHandler(new Error('test error'));

    expect(onReconnectNeeded).toHaveBeenCalled();
    expect(cm.isConnected()).toBe(false);
  });

  it('should handle heartbeat request messages', async () => {
    const cm = new ConnectionManager('machine-001', onDisconnected, onReconnectNeeded);
    cm.setConnected(true);

    const mockWrite = vi.fn().mockReturnValue(true);
    const mockCall = {
      on: vi.fn(),
      write: mockWrite,
      end: vi.fn(),
    };
    cm.setCall(mockCall as unknown as Record<string, unknown>);

    const message = {
      heartbeat_request: {
        timestamp: Date.now(),
      },
    };

    const handlers: Record<string, Function> = {};
    mockCall.on = vi.fn((event: string, handler: Function) => {
      handlers[event] = handler;
    });

    cm.setupStreamHandlers(mockCall as unknown as Record<string, unknown>);

    if (handlers['data']) {
      await handlers['data'](message);
    }

    expect(mockWrite).toHaveBeenCalled();
    const writtenData = mockWrite.mock.calls[0][0];
    expect(writtenData.machine_id).toBe('machine-001');
    expect(writtenData.heartbeat).toBeDefined();
  });

  it('should handle close_browser messages', async () => {
    const { browserService } = await import('../../../../machine/browser.service.js');
    const cm = new ConnectionManager('machine-001', onDisconnected, onReconnectNeeded);
    cm.setConnected(true);

    const mockCall = {
      on: vi.fn(),
      write: vi.fn().mockReturnValue(true),
      end: vi.fn(),
    };

    const handlers: Record<string, Function> = {};
    mockCall.on = vi.fn((event: string, handler: Function) => {
      handlers[event] = handler;
    });

    cm.setupStreamHandlers(mockCall as unknown as Record<string, unknown>);

    const message = {
      close_browser: {
        session_id: 'session-123',
      },
    };

    if (handlers['data']) {
      await handlers['data'](message);
    }

    expect(browserService.closeBrowser).toHaveBeenCalledWith('session-123');
  });

  it('should handle close_browser errors with unknown type', async () => {
    const { browserService } = await import('../../../../machine/browser.service.js');
    const { logger } = await import('@shared/utils/logger.js');

    vi.mocked(browserService.closeBrowser).mockRejectedValueOnce(new Error('close failed'));

    const cm = new ConnectionManager('machine-001', onDisconnected, onReconnectNeeded);
    cm.setConnected(true);

    const mockCall = {
      on: vi.fn(),
      write: vi.fn().mockReturnValue(true),
      end: vi.fn(),
    };

    const handlers: Record<string, Function> = {};
    mockCall.on = vi.fn((event: string, handler: Function) => {
      handlers[event] = handler;
    });

    cm.setupStreamHandlers(mockCall as unknown as Record<string, unknown>);

    const message = {
      close_browser: {
        session_id: 'session-err',
      },
    };

    if (handlers['data']) {
      await handlers['data'](message);
    }

    await new Promise((r) => setTimeout(r, 10));

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('应管理端要求关闭浏览器出错'), expect.any(Error));
  });

  it('should handle screenshot errors with unknown type', async () => {
    const { browserService } = await import('../../../../machine/browser.service.js');
    const { logger } = await import('@shared/utils/logger.js');

    vi.mocked(browserService.takeScreenshot).mockRejectedValueOnce(new Error('screenshot failed'));

    const cm = new ConnectionManager('machine-001', onDisconnected, onReconnectNeeded);
    cm.setConnected(true);

    const mockCall = {
      on: vi.fn(),
      write: vi.fn().mockReturnValue(true),
      end: vi.fn(),
    };

    const handlers: Record<string, Function> = {};
    mockCall.on = vi.fn((event: string, handler: Function) => {
      handlers[event] = handler;
    });

    cm.setupStreamHandlers(mockCall as unknown as Record<string, unknown>);

    const message = {
      request_screenshot: {
        session_id: 'session-ss-err',
      },
    };

    if (handlers['data']) {
      await handlers['data'](message);
    }

    await new Promise((r) => setTimeout(r, 10));

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('截图失败'), expect.any(Error));
  });
});
