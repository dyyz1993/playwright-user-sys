import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';

const mockFindByApiKey = vi.fn();
const mockCreateBrowserSession = vi.fn();
const mockHandleSessionDisconnect = vi.fn();

vi.mock('../../../models/user.model.js', () => ({
  UserModel: {
    findByApiKey: mockFindByApiKey,
  },
}));

vi.mock('../../../services/session.service.js', () => ({
  createBrowserSession: mockCreateBrowserSession,
  handleSessionDisconnect: mockHandleSessionDisconnect,
}));

vi.mock('../../../services/memory-store.service.js', () => ({
  memoryStore: {
    getMachine: vi.fn(() => ({ ip: '127.0.0.1' })),
  },
}));

describe('NativeWebSocketProxyService', () => {
  let NativeWebSocketProxyService: any;
  let mockServer: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const mod = await import('../../../services/native-websocket-proxy.service.js');
    NativeWebSocketProxyService = mod.NativeWebSocketProxyService;

    mockServer = Object.assign(new EventEmitter(), {
      listen: vi.fn(),
      close: vi.fn((cb) => cb?.()),
    });
  });

  afterEach(() => {
    mockServer.removeAllListeners();
  });

  it('WS-01: 构造时应该注册upgrade事件监听', () => {
    const service = new NativeWebSocketProxyService(mockServer);
    expect(mockServer.listenerCount('upgrade')).toBeGreaterThan(0);
    service.close();
  });

  it('WS-02: 没有HTTP服务器时应抛出错误', () => {
    expect(() => new NativeWebSocketProxyService(null)).toThrow();
  });

  it('WS-03: 非ws/connect路径的upgrade应该被忽略', () => {
    const service = new NativeWebSocketProxyService(mockServer);

    const mockSocket = new EventEmitter() as any;
    mockSocket.destroyed = false;
    mockSocket.writable = true;
    mockSocket.write = vi.fn();
    mockSocket.destroy = vi.fn();

    const mockRequest = {
      url: '/ws/other-path?apiKey=test-key',
      headers: {},
    };

    mockServer.emit('upgrade', mockRequest, mockSocket, Buffer.alloc(0));

    expect(mockFindByApiKey).not.toHaveBeenCalled();
    service.close();
  });

  it('WS-04: close应该移除所有upgrade监听器', () => {
    const service = new NativeWebSocketProxyService(mockServer);
    expect(mockServer.listenerCount('upgrade')).toBeGreaterThan(0);

    service.close();
    expect(mockServer.listenerCount('upgrade')).toBe(0);
  });

  it('WS-05: close应该清理所有活动连接', () => {
    const service = new NativeWebSocketProxyService(mockServer);

    const activeConnections = (service as any).activeConnections;
    activeConnections.add('sess-001');
    activeConnections.add('sess-002');

    service.close();
    expect(activeConnections.size).toBe(0);
  });

  it('WS-06: 无效API密钥应该拒绝连接', async () => {
    const service = new NativeWebSocketProxyService(mockServer);

    mockFindByApiKey.mockResolvedValue(null);

    const mockSocket = new EventEmitter() as any;
    mockSocket.destroyed = false;
    mockSocket.writable = true;
    mockSocket.write = vi.fn();
    mockSocket.destroy = vi.fn();

    const mockRequest = {
      url: '/ws/connect?apiKey=invalid-key',
      headers: {},
    };

    mockServer.emit('upgrade', mockRequest, mockSocket, Buffer.alloc(0));

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockFindByApiKey).toHaveBeenCalledWith('invalid-key');
    service.close();
  });

  it('WS-07: 有效连接应该创建会话', async () => {
    const service = new NativeWebSocketProxyService(mockServer);

    mockFindByApiKey.mockResolvedValue({ id: 1, username: 'testuser' });
    mockCreateBrowserSession.mockResolvedValue({
      sessionId: 'sess-001',
      machineId: 'machine-001',
      browserWSEndpoint: 'ws://127.0.0.1:9222',
      directUrl: 'ws://127.0.0.1:9222/devtools/browser/sess-001',
    });

    const mockSocket = new EventEmitter() as any;
    mockSocket.destroyed = false;
    mockSocket.writable = true;
    mockSocket.write = vi.fn();
    mockSocket.destroy = vi.fn();

    const mockRequest = {
      url: '/ws/connect?apiKey=valid-key&width=1920&height=1080',
      headers: {},
    };

    mockServer.emit('upgrade', mockRequest, mockSocket, Buffer.alloc(0));

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockFindByApiKey).toHaveBeenCalledWith('valid-key');
    expect(mockCreateBrowserSession).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        viewport: { width: 1920, height: 1080 },
      }),
      true
    );
    service.close();
  });

  it('WS-08: 连接参数验证应该拒绝无效参数', async () => {
    const service = new NativeWebSocketProxyService(mockServer);

    const mockSocket = new EventEmitter() as any;
    mockSocket.destroyed = false;
    mockSocket.writable = true;
    mockSocket.write = vi.fn();
    mockSocket.destroy = vi.fn();

    const mockRequest = {
      url: '/ws/connect',
      headers: {},
    };

    mockServer.emit('upgrade', mockRequest, mockSocket, Buffer.alloc(0));

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockFindByApiKey).not.toHaveBeenCalled();
    service.close();
  });
});
