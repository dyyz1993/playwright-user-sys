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
  let ConnectionManager: any;
  let onDisconnected: any;
  let onReconnectNeeded: any;

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
    cm.setCall(mockCall as any);
    expect(cm.getCall()).toBe(mockCall);
  });

  it('should stop heartbeat interval', () => {
    const cm = new ConnectionManager('machine-001', onDisconnected, onReconnectNeeded);
    cm.startHeartbeat();
    cm.stopHeartbeat();
    expect(cm.isConnected()).toBe(false);
  });

  it('should call onDisconnected when stream ends', () => {
    const cm = new ConnectionManager('machine-001', onDisconnected, onReconnectNeeded);

    const mockCall = {
      on: vi.fn((event: string, handler: Function) => {
        if (event === 'end') {
          (mockCall as any)._endHandler = handler;
        }
      }),
      write: vi.fn(),
      end: vi.fn(),
    };

    cm.setupStreamHandlers(mockCall as any);

    const endHandler = (mockCall as any)._endHandler;
    if (endHandler) endHandler();

    expect(onDisconnected).toHaveBeenCalled();
    expect(cm.isConnected()).toBe(false);
  });

  it('should call onReconnectNeeded on stream error', () => {
    const cm = new ConnectionManager('machine-001', onDisconnected, onReconnectNeeded);

    const mockCall = {
      on: vi.fn((event: string, handler: Function) => {
        if (event === 'error') {
          (mockCall as any)._errorHandler = handler;
        }
      }),
      write: vi.fn(),
      end: vi.fn(),
    };

    cm.setupStreamHandlers(mockCall as any);

    const errorHandler = (mockCall as any)._errorHandler;
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
    cm.setCall(mockCall as any);

    const message = {
      heartbeat_request: {
        timestamp: Date.now(),
      },
    };

    const handlers: Record<string, Function> = {};
    mockCall.on = vi.fn((event: string, handler: Function) => {
      handlers[event] = handler;
    });

    cm.setupStreamHandlers(mockCall as any);

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

    cm.setupStreamHandlers(mockCall as any);

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

    cm.setupStreamHandlers(mockCall as any);

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

    cm.setupStreamHandlers(mockCall as any);

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
