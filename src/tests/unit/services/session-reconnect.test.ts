import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { SessionStatus } from '@shared/types/index.js';
import { isSessionReconnectable } from '../../../services/websocket-proxy/validation.js';

const mockFindByApiKey = vi.fn();
const mockFindById = vi.fn();
const mockSessionUpdate = vi.fn();
const mockIncrementInstanceCount = vi.fn();
const mockDecrementInstanceCount = vi.fn();
const mockProxyWs = vi.fn();
const mockHandleSessionDisconnect = vi.fn();

vi.mock('../../../models/user.model.js', () => ({
  UserModel: { findByApiKey: mockFindByApiKey, findById: vi.fn() },
}));
vi.mock('../../../models/session/index.js', () => ({
  SessionModel: { findById: mockFindById, update: mockSessionUpdate, markDisconnected: vi.fn() },
}));
vi.mock('../../../models/machine.model.js', () => ({
  MachineModel: {
    incrementInstanceCount: mockIncrementInstanceCount,
    decrementInstanceCount: mockDecrementInstanceCount,
    findById: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock('../../../utils/webhook.js', () => ({ createWebhookEvent: vi.fn() }));
vi.mock('../../../services/memory-store.service.js', () => ({
  memoryStore: { getMachine: vi.fn(() => ({ ip: '127.0.0.1', proxy_port: 8082 })) },
}));
vi.mock('../../../services/session.service.js', () => ({
  createBrowserSession: vi.fn(),
  handleSessionDisconnect: mockHandleSessionDisconnect,
}));
vi.mock('http-proxy', () => ({
  default: {
    createProxyServer: vi.fn(() => ({ ws: mockProxyWs, web: vi.fn(), on: vi.fn(), close: vi.fn() })),
  },
}));

function disconnectedSession(status: SessionStatus = SessionStatus.DISCONNECTED) {
  return { id: 'sess-reconnect', user_id: 1, machine_id: 'machine-1', status };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('session reconnect policy', () => {
  it('treats keepalive-window sessions as reconnectable and terminal states as closed', () => {
    expect(isSessionReconnectable(SessionStatus.CREATED)).toBe(true);
    expect(isSessionReconnectable(SessionStatus.CONNECTED)).toBe(true);
    expect(isSessionReconnectable(SessionStatus.DISCONNECTED)).toBe(true);
    expect(isSessionReconnectable(SessionStatus.EXPIRED)).toBe(false);
    expect(isSessionReconnectable(SessionStatus.ERROR)).toBe(false);
    expect(isSessionReconnectable(SessionStatus.COMPLETED)).toBe(false);
  });
});

describe('CDP proxy reconnect during keepalive', () => {
  let mockServer: EventEmitter;
  let mockSocket: EventEmitter & { write: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
  let NativeWebSocketProxyService: {
    new (server: unknown): { close(): void; activeConnections: Set<string> };
  };

  beforeEach(async () => {
    mockFindByApiKey.mockResolvedValue({ id: 1, status: 'active' });
    const mod = await import('../../../services/native-websocket-proxy.service.js');
    NativeWebSocketProxyService = mod.NativeWebSocketProxyService as never;
    mockServer = new EventEmitter();
    mockSocket = Object.assign(new EventEmitter(), {
      destroyed: false,
      writable: true,
      write: vi.fn(),
      destroy: vi.fn(),
    });
  });

  async function upgrade() {
    const service = new NativeWebSocketProxyService(mockServer);
    mockServer.emit(
      'upgrade',
      { url: '/ws/connect?sessionId=sess-reconnect&apiKey=key-1', headers: {} },
      mockSocket,
      Buffer.alloc(0)
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    return service;
  }

  it('lets a disconnected session reconnect while the machine still keeps the browser alive', async () => {
    mockFindById.mockResolvedValue(disconnectedSession());
    const service = await upgrade();
    expect(mockSocket.write).not.toHaveBeenCalledWith(expect.stringContaining('410'));
    expect(mockProxyWs).toHaveBeenCalled();
    service.close();
  });

  it('still rejects sessions that reached a terminal state', async () => {
    mockFindById.mockResolvedValue(disconnectedSession(SessionStatus.COMPLETED));
    const service = await upgrade();
    expect(mockSocket.write).toHaveBeenCalledWith(expect.stringContaining('410'));
    expect(mockProxyWs).not.toHaveBeenCalled();
    service.close();
  });

  it('keeps the session alive when the proxied client socket closes', async () => {
    mockFindById.mockResolvedValue(disconnectedSession());
    const service = await upgrade();
    expect(service.activeConnections.has('sess-reconnect')).toBe(true);

    mockSocket.emit('close');

    expect(service.activeConnections.has('sess-reconnect')).toBe(false);
    expect(mockHandleSessionDisconnect).not.toHaveBeenCalled();
    service.close();
  });
});

describe('machine status handler on reconnect', () => {
  async function handleConnected(sessionStatus: SessionStatus) {
    mockFindById.mockResolvedValue({
      ...disconnectedSession(sessionStatus),
      start_time: new Date(),
      duration: 0,
      credits_used: 0,
    });
    const { ConnectionMessageHandler } = await import('../../../services/machine-grpc/connection-message-handler.js');
    const handler = new ConnectionMessageHandler({} as never);
    await handler.handle('machine-1', {
      session_status: { session_id: 'sess-reconnect', status: 'connected', duration: 3 },
    } as never);
  }

  it('restores the machine instance count when a disconnected session reconnects', async () => {
    await handleConnected(SessionStatus.DISCONNECTED);
    expect(mockIncrementInstanceCount).toHaveBeenCalledWith('machine-1');
    expect(mockDecrementInstanceCount).not.toHaveBeenCalled();
    expect(mockSessionUpdate).toHaveBeenCalledWith('sess-reconnect', { status: SessionStatus.CONNECTED });
  });

  it('does not double-count the first connection of a freshly created session', async () => {
    await handleConnected(SessionStatus.CREATED);
    expect(mockIncrementInstanceCount).not.toHaveBeenCalled();
  });
});
