/**
 * MachineGrpcService 单元测试
 * 测试 machine-grpc 服务导出和 connectionManager
 *
 * Mock 策略:
 * - Mock: @grpc/grpc-js, @grpc/proto-loader, MachineConnectionManager, serviceHandlers
 * - 真实执行: 模块导出逻辑、startGrpcServer
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockServiceDef = { service: {} };
vi.mock('@grpc/grpc-js', () => ({
  Server: vi.fn().mockImplementation(() => ({
    addService: vi.fn(),
    bindAsync: vi.fn(),
  })),
  ServerCredentials: {
    createInsecure: vi.fn().mockReturnValue('insecure'),
  },
  loadPackageDefinition: vi.fn().mockReturnValue({
    machine: {
      MachineService: mockServiceDef,
    },
  }),
}));

vi.mock('@grpc/proto-loader', () => ({
  loadSync: vi.fn().mockReturnValue({}),
}));

vi.mock('../../../shared/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../../machine/grpc/connection-manager.js', () => {
  const mockManager = {
    isConnected: vi.fn().mockReturnValue(false),
    setProto: vi.fn(),
    launchBrowser: vi.fn(),
    closeBrowser: vi.fn(),
    sendRestartCommand: vi.fn(),
  };
  return {
    ConnectionManager: vi.fn().mockImplementation(() => mockManager),
  };
});

vi.mock('../../../machine/grpc/service-handlers.js', () => ({
  serviceImplementation: {},
}));

describe('MachineGrpcService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ========================================
  // GRPC-01: connectionManager 导出
  // ========================================
  it('应该导出 connectionManager 实例', async () => {
    const { connectionManager } = await import('../../../services/machine-grpc/index.js');

    expect(connectionManager).toBeDefined();
    expect(typeof connectionManager.isConnected).toBe('function');
    expect(typeof connectionManager.setProto).toBe('function');
    expect(typeof connectionManager.launchBrowser).toBe('function');
    expect(typeof connectionManager.closeBrowser).toBe('function');
  });

  // ========================================
  // GRPC-02: startGrpcServer 导出
  // ========================================
  it('应该导出 startGrpcServer 函数', async () => {
    const { startGrpcServer } = await import('../../../services/machine-grpc/index.js');

    expect(typeof startGrpcServer).toBe('function');
  });

  // ========================================
  // GRPC-03: startGrpcServer 调用 bindAsync
  // ========================================
  it('startGrpcServer 应该启动 gRPC 服务器', async () => {
    const grpc = await import('@grpc/grpc-js');
    const mockBindAsync = vi.fn();
    const mockAddService = vi.fn();
    vi.mocked(grpc.Server).mockImplementation(
      () =>
        ({
          addService: mockAddService,
          bindAsync: mockBindAsync,
        }) as any
    );

    const { startGrpcServer } = await import('../../../services/machine-grpc/index.js');
    startGrpcServer(50051);

    expect(mockAddService).toHaveBeenCalled();
    expect(mockBindAsync).toHaveBeenCalledWith('0.0.0.0:50051', 'insecure', expect.any(Function));
  });

  // ========================================
  // GRPC-04: connectionManager.isConnected
  // ========================================
  it('connectionManager.isConnected 未连接时应该返回 false', async () => {
    const { connectionManager } = await import('../../../services/machine-grpc/index.js');

    const result = connectionManager.isConnected('nonexistent');

    expect(result).toBe(false);
  });

  // ========================================
  // GRPC-05: connectionManager 有正确的方法
  // ========================================
  it('connectionManager 应该有 launchBrowser 和 closeBrowser 方法', async () => {
    const { connectionManager } = await import('../../../services/machine-grpc/index.js');

    expect(typeof connectionManager.launchBrowser).toBe('function');
    expect(typeof connectionManager.closeBrowser).toBe('function');
    expect(typeof connectionManager.sendRestartCommand).toBe('function');
  });

  // ========================================
  // GRPC-06: default 导出
  // ========================================
  it('应该有 default 导出', async () => {
    const mod = await import('../../../services/machine-grpc/index.js');

    expect(mod.default).toBeDefined();
    expect(mod.default.connectionManager).toBeDefined();
    expect(mod.default.startGrpcServer).toBeDefined();
  });
});
