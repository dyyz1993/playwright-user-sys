import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../models/machine.model.js', () => ({
  MachineModel: {
    update: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn(),
    decrementInstanceCount: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../../models/session.model.js', () => ({
  SessionModel: {
    findById: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    markDisconnected: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../../models/user.model.js', () => ({
  UserModel: {
    findById: vi.fn(),
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

describe('services/machine-grpc MachineConnectionManager', () => {
  let MachineConnectionManager: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../../../services/machine-grpc/connection-manager.js');
    MachineConnectionManager = mod.MachineConnectionManager;
  });

  it('should initialize with empty connections', () => {
    const cm = new MachineConnectionManager();
    expect(cm.getAllConnectedMachines()).toEqual([]);
    expect(cm.getActiveConnections()).toEqual([]);
  });

  it('should track a new connection', () => {
    const cm = new MachineConnectionManager();
    const mockCall = {
      on: vi.fn(),
      end: vi.fn(),
    };

    cm.addConnection('machine-001', mockCall as any);

    expect(cm.isConnected('machine-001')).toBe(true);
    expect(cm.getAllConnectedMachines()).toContain('machine-001');
  });

  it('should replace existing connection for same machine', () => {
    const cm = new MachineConnectionManager();
    const mockCall1 = { on: vi.fn(), end: vi.fn() };
    const mockCall2 = { on: vi.fn(), end: vi.fn() };

    cm.addConnection('machine-001', mockCall1 as any);
    cm.addConnection('machine-001', mockCall2 as any);

    expect(cm.isConnected('machine-001')).toBe(true);
    expect(cm.getConnection('machine-001')).toBe(mockCall2);
  });

  it('should remove connection', async () => {
    const cm = new MachineConnectionManager();
    const mockCall = { on: vi.fn(), end: vi.fn() };

    cm.addConnection('machine-001', mockCall as any);
    expect(cm.isConnected('machine-001')).toBe(true);

    await cm.removeConnection('machine-001');
    expect(cm.isConnected('machine-001')).toBe(false);
  });

  it('should return null for non-existent connection', () => {
    const cm = new MachineConnectionManager();
    expect(cm.getConnection('non-existent')).toBeUndefined();
  });

  it('should send close browser command to connected machine', () => {
    const cm = new MachineConnectionManager();
    const mockWrite = vi.fn();
    const mockCall = { on: vi.fn(), end: vi.fn(), write: mockWrite };

    cm.addConnection('machine-001', mockCall as any);
    cm.sendCloseBrowserCommand('machine-001', 'session-123');

    expect(mockWrite).toHaveBeenCalledWith({
      close_browser: { session_id: 'session-123' },
    });
  });

  it('should not send command to disconnected machine', () => {
    const cm = new MachineConnectionManager();
    const mockWrite = vi.fn();

    cm.sendCloseBrowserCommand('machine-001', 'session-123');
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('should send restart command', () => {
    const cm = new MachineConnectionManager();
    const mockWrite = vi.fn();
    const mockCall = { on: vi.fn(), end: vi.fn(), write: mockWrite };

    cm.addConnection('machine-001', mockCall as any);
    cm.sendRestartCommand('machine-001');

    expect(mockWrite).toHaveBeenCalledWith({
      restart: { timestamp: expect.any(Number) },
    });
  });

  it('should send shutdown command', () => {
    const cm = new MachineConnectionManager();
    const mockWrite = vi.fn();
    const mockCall = { on: vi.fn(), end: vi.fn(), write: mockWrite };

    cm.addConnection('machine-001', mockCall as any);
    cm.sendShutdownCommand('machine-001');

    expect(mockWrite).toHaveBeenCalledWith({
      shutdown: { timestamp: expect.any(Number), permanent: true },
    });
  });

  it('should send heartbeat request', () => {
    const cm = new MachineConnectionManager();
    const mockWrite = vi.fn();
    const mockCall = { on: vi.fn(), end: vi.fn(), write: mockWrite };

    cm.addConnection('machine-001', mockCall as any);
    cm.sendHeartbeatRequest('machine-001');

    expect(mockWrite).toHaveBeenCalledWith({
      heartbeat_request: { timestamp: expect.any(Number) },
    });
  });

  it('should throw when launching browser on disconnected machine', async () => {
    const cm = new MachineConnectionManager();

    await expect(cm.launchBrowser('machine-001', 'session-123', {})).rejects.toThrow('机器未连接');
  });

  it('should throw when closing browser on disconnected machine', async () => {
    const cm = new MachineConnectionManager();

    await expect(cm.closeBrowser('machine-001', 'session-123')).rejects.toThrow('机器未连接');
  });

  it('should return offline status for disconnected machine', async () => {
    const cm = new MachineConnectionManager();

    const status = await cm.getMachineStatus('machine-001');

    expect(status.online).toBe(false);
    expect(status.machine_id).toBe('machine-001');
    expect(status.cpu_usage).toBe(0);
    expect(status.active_sessions).toBe(0);
  });

  it('should track multiple machines', () => {
    const cm = new MachineConnectionManager();

    cm.addConnection('machine-001', { on: vi.fn(), end: vi.fn() } as any);
    cm.addConnection('machine-002', { on: vi.fn(), end: vi.fn() } as any);

    expect(cm.getAllConnectedMachines().length).toBe(2);
    expect(cm.isConnected('machine-001')).toBe(true);
    expect(cm.isConnected('machine-002')).toBe(true);
  });

  it('should set and store proto reference', () => {
    const cm = new MachineConnectionManager();
    const mockProto = { MachineService: vi.fn() };

    cm.setProto(mockProto);

    expect(cm['proto']).toBe(mockProto);
  });
});
