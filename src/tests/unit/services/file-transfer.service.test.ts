/**
 * FileTransferService 单元测试
 * 测试文件传输服务的业务逻辑
 *
 * Mock 策略:
 * - Mock: connectionManager (动态 import), logger
 * - 真实执行: FileTransferService 业务逻辑
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockTransferFile = vi.fn();
const mockDownloadAndInjectFile = vi.fn();
const mockInjectFile = vi.fn();

vi.mock('../../../services/machine-grpc/index.js', () => ({
  connectionManager: {
    transferFile: mockTransferFile,
    downloadAndInjectFile: mockDownloadAndInjectFile,
    injectFile: mockInjectFile,
  },
}));

vi.mock('../../../shared/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('FileTransferService', () => {
  let FileTransferService: any;
  let fileTransferService: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await import('../../../services/file-transfer.service.js');
    FileTransferService = module.FileTransferService;
    fileTransferService = module.fileTransferService;
  });

  // ========================================
  // FT-01: transferToMachine - 成功
  // ========================================
  it('应该成功传输文件到机器', async () => {
    mockTransferFile.mockResolvedValue({
      success: true,
      machine_file_path: '/tmp/uploaded/test.txt',
      size: 1024,
    });

    const buffer = Buffer.from('test content');
    const result = await fileTransferService.transferToMachine(buffer, 'test.txt', 'session-001', 'machine-001');

    expect(result.success).toBe(true);
    expect(result.machineFilePath).toBe('/tmp/uploaded/test.txt');
    expect(result.size).toBe(1024);
  });

  // ========================================
  // FT-02: transferToMachine - 传输失败
  // ========================================
  it('传输失败时应该返回错误信息', async () => {
    mockTransferFile.mockResolvedValue({
      success: false,
      error: '磁盘空间不足',
    });

    const buffer = Buffer.from('test');
    const result = await fileTransferService.transferToMachine(buffer, 'test.txt', 'session-001', 'machine-001');

    expect(result.success).toBe(false);
    expect(result.error).toBe('磁盘空间不足');
  });

  // ========================================
  // FT-03: transferToMachine - 异常捕获
  // ========================================
  it('异常时应该返回错误信息而不抛出', async () => {
    mockTransferFile.mockRejectedValue(new Error('连接超时'));

    const buffer = Buffer.from('test');
    const result = await fileTransferService.transferToMachine(buffer, 'test.txt', 'session-001', 'machine-001');

    expect(result.success).toBe(false);
    expect(result.error).toBe('连接超时');
  });

  // ========================================
  // FT-04: transferToMachine - 非Error异常
  // ========================================
  it('非 Error 类型异常应该转为字符串', async () => {
    mockTransferFile.mockRejectedValue('string error');

    const buffer = Buffer.from('test');
    const result = await fileTransferService.transferToMachine(buffer, 'test.txt', 'session-001', 'machine-001');

    expect(result.success).toBe(false);
    expect(result.error).toBe('string error');
  });

  // ========================================
  // FT-05: downloadAndInject - 成功
  // ========================================
  it('应该成功下载并注入文件', async () => {
    mockDownloadAndInjectFile.mockResolvedValue({
      success: true,
      filePath: '/tmp/downloaded/file.zip',
    });

    const result = await fileTransferService.downloadAndInject(
      'session-001',
      'machine-001',
      'https://example.com/file.zip',
      '#file-input'
    );

    expect(mockDownloadAndInjectFile).toHaveBeenCalledWith('machine-001', {
      sessionId: 'session-001',
      url: 'https://example.com/file.zip',
      selector: '#file-input',
    });
  });

  // ========================================
  // FT-06: downloadAndInject - 带选项
  // ========================================
  it('downloadAndInject 应该传递额外选项', async () => {
    mockDownloadAndInjectFile.mockResolvedValue({ success: true });

    await fileTransferService.downloadAndInject(
      'session-001',
      'machine-001',
      'https://example.com/file.zip',
      '#file-input',
      { frameSelector: 'iframe', filename: 'custom.zip', timeout: 5000 }
    );

    expect(mockDownloadAndInjectFile).toHaveBeenCalledWith('machine-001', {
      sessionId: 'session-001',
      url: 'https://example.com/file.zip',
      selector: '#file-input',
      frameSelector: 'iframe',
      filename: 'custom.zip',
      timeout: 5000,
    });
  });

  // ========================================
  // FT-07: injectFile - 成功
  // ========================================
  it('应该成功注入本地文件到会话', async () => {
    mockInjectFile.mockResolvedValue({
      success: true,
    });

    const result = await fileTransferService.injectFile(
      'session-001',
      'machine-001',
      '/tmp/uploaded/test.txt',
      '#file-input'
    );

    expect(mockInjectFile).toHaveBeenCalledWith('machine-001', {
      sessionId: 'session-001',
      machineFilePath: '/tmp/uploaded/test.txt',
      selector: '#file-input',
      frameSelector: undefined,
    });
  });

  // ========================================
  // FT-08: injectFile - 带 frameSelector
  // ========================================
  it('injectFile 应该支持 frameSelector', async () => {
    mockInjectFile.mockResolvedValue({ success: true });

    await fileTransferService.injectFile(
      'session-001',
      'machine-001',
      '/tmp/test.txt',
      '#file-input',
      'iframe#content'
    );

    expect(mockInjectFile).toHaveBeenCalledWith('machine-001', {
      sessionId: 'session-001',
      machineFilePath: '/tmp/test.txt',
      selector: '#file-input',
      frameSelector: 'iframe#content',
    });
  });

  // ========================================
  // FT-09: 导出单例
  // ========================================
  it('应该导出 fileTransferService 单例', () => {
    expect(fileTransferService).toBeInstanceOf(FileTransferService);
  });
});
