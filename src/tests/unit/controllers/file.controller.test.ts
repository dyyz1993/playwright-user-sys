import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockExistsSync = vi.fn().mockReturnValue(true);
const mockMkdirSync = vi.fn();
const mockReaddir = vi.fn().mockResolvedValue([]);
const mockStat = vi.fn().mockResolvedValue({ size: 1024, mtime: new Date(), ctime: new Date() });
const mockUnlink = vi.fn().mockResolvedValue(undefined);
const mockCreateWriteStream = vi.fn().mockReturnValue({ on: vi.fn(), pipe: vi.fn() });

const fsOverrides = {
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  createWriteStream: mockCreateWriteStream,
  promises: {
    readdir: mockReaddir,
    stat: mockStat,
    unlink: mockUnlink,
  },
};

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  const mergedDefault = { ...(actual as any).default, ...fsOverrides };
  return {
    ...actual,
    ...fsOverrides,
    default: mergedDefault,
  };
});

vi.mock('../../../utils/response.js', () => ({
  sendSuccess: vi.fn((reply, _data, _message) => {
    reply.status = vi.fn().mockReturnValue(reply);
    reply.send = vi.fn().mockReturnValue(reply);
    return reply;
  }),
  sendError: vi.fn((reply, _message, _code) => {
    reply.status = vi.fn().mockReturnValue(reply);
    reply.send = vi.fn().mockReturnValue(reply);
    return reply;
  }),
}));

describe('FileController', () => {
  let sendSuccess: any;
  let sendError: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockReaddir.mockResolvedValue([]);
    mockStat.mockResolvedValue({ size: 1024, mtime: new Date(), ctime: new Date() });
    mockUnlink.mockResolvedValue(undefined);
    mockCreateWriteStream.mockReturnValue({ on: vi.fn(), pipe: vi.fn() });

    const responseModule = await import('../../../utils/response.js');
    sendSuccess = responseModule.sendSuccess;
    sendError = responseModule.sendError;
  });

  describe('uploadFile', () => {
    it('非管理员应该返回403错误', async () => {
      const { uploadFile } = await import('../../../controllers/file.controller.js');

      const request = {
        user: { role: 'user', id: 1 },
        file: vi.fn(),
        log: { error: vi.fn() },
      } as any;

      const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() };

      await uploadFile(request, reply as any);

      expect(sendError).toHaveBeenCalledWith(reply, '需要管理员权限', 403);
    });

    it('未登录用户应该返回403错误', async () => {
      const { uploadFile } = await import('../../../controllers/file.controller.js');

      const request = {
        user: null,
        file: vi.fn(),
        log: { error: vi.fn() },
      } as any;

      const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() };

      await uploadFile(request, reply as any);

      expect(sendError).toHaveBeenCalledWith(reply, '需要管理员权限', 403);
    });

    it('没有上传文件应该返回400错误', async () => {
      const { uploadFile } = await import('../../../controllers/file.controller.js');

      const mockFile = vi.fn().mockResolvedValue(null);
      const request = {
        user: { role: 'admin', id: 1 },
        file: mockFile,
        log: { error: vi.fn() },
      } as any;

      const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() };

      await uploadFile(request, reply as any);

      expect(sendError).toHaveBeenCalledWith(reply, '没有上传文件', 400);
    });

    it('成功上传文件应该返回文件信息', async () => {
      const { uploadFile } = await import('../../../controllers/file.controller.js');

      const mockFileStream = {
        pipe: vi.fn(),
        bytesRead: 1024,
      };

      const mockFile = vi.fn().mockResolvedValue({
        filename: 'test.txt',
        mimetype: 'text/plain',
        file: mockFileStream,
      });

      const request = {
        user: { role: 'admin', id: 1 },
        file: mockFile,
        log: { error: vi.fn() },
      } as any;

      const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() };

      await uploadFile(request, reply as any);

      expect(sendSuccess).toHaveBeenCalledWith(
        reply,
        expect.objectContaining({
          filename: 'test.txt',
          mimetype: 'text/plain',
          size: 1024,
        }),
        '文件上传成功'
      );
    });

    it('上传文件异常应该返回500错误', async () => {
      const { uploadFile } = await import('../../../controllers/file.controller.js');

      const mockFile = vi.fn().mockRejectedValue(new Error('upload error'));

      const request = {
        user: { role: 'admin', id: 1 },
        file: mockFile,
        log: { error: vi.fn() },
      } as any;

      const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() };

      await uploadFile(request, reply as any);

      expect(sendError).toHaveBeenCalledWith(reply, '文件上传失败', 500);
    });
  });

  describe('uploadTempFile', () => {
    it('未登录用户应该返回401错误', async () => {
      const { uploadTempFile } = await import('../../../controllers/file.controller.js');

      const request = {
        user: null,
        file: vi.fn(),
        log: { error: vi.fn() },
      } as any;

      const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() };

      await uploadTempFile(request, reply as any);

      expect(sendError).toHaveBeenCalledWith(reply, '需要认证', 401);
    });

    it('没有上传文件应该返回400错误', async () => {
      const { uploadTempFile } = await import('../../../controllers/file.controller.js');

      const mockFile = vi.fn().mockResolvedValue(null);
      const request = {
        user: { id: 1, role: 'user' },
        file: mockFile,
        log: { error: vi.fn() },
      } as any;

      const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() };

      await uploadTempFile(request, reply as any);

      expect(sendError).toHaveBeenCalledWith(reply, '没有上传文件', 400);
    });

    it('成功上传临时文件应该返回文件路径', async () => {
      const { uploadTempFile } = await import('../../../controllers/file.controller.js');

      const mockFileStream = {
        pipe: vi.fn(),
        bytesRead: 2048,
      };

      const mockFile = vi.fn().mockResolvedValue({
        filename: 'temp-screenshot.png',
        mimetype: 'image/png',
        file: mockFileStream,
      });

      const request = {
        user: { id: 1, role: 'user' },
        file: mockFile,
        log: { error: vi.fn() },
      } as any;

      const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() };

      await uploadTempFile(request, reply as any);

      expect(sendSuccess).toHaveBeenCalledWith(
        reply,
        expect.objectContaining({
          filename: 'temp-screenshot.png',
          mimetype: 'image/png',
          size: 2048,
          filepath: expect.stringContaining('temp'),
        }),
        '临时文件上传成功'
      );
    });

    it('临时文件上传异常应该返回500错误', async () => {
      const { uploadTempFile } = await import('../../../controllers/file.controller.js');

      const mockFile = vi.fn().mockRejectedValue(new Error('temp upload error'));

      const request = {
        user: { id: 1, role: 'user' },
        file: mockFile,
        log: { error: vi.fn() },
      } as any;

      const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() };

      await uploadTempFile(request, reply as any);

      expect(sendError).toHaveBeenCalledWith(reply, '临时文件上传失败', 500);
    });
  });

  describe('getFileList', () => {
    it('非管理员应该返回403错误', async () => {
      const { getFileList } = await import('../../../controllers/file.controller.js');

      const request = {
        user: { role: 'user', id: 1 },
        log: { error: vi.fn() },
      } as any;

      const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() };

      await getFileList(request, reply as any);

      expect(sendError).toHaveBeenCalledWith(reply, '需要管理员权限', 403);
    });

    it('成功获取文件列表', async () => {
      const { getFileList } = await import('../../../controllers/file.controller.js');

      mockReaddir.mockResolvedValue(['file1.txt', 'file2.png']);
      mockStat.mockResolvedValue({ size: 1024, mtime: new Date('2024-01-01') });

      const request = {
        user: { role: 'admin', id: 1 },
        log: { error: vi.fn() },
      } as any;

      const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() };

      await getFileList(request, reply as any);

      expect(sendSuccess).toHaveBeenCalledWith(
        reply,
        expect.arrayContaining([
          expect.objectContaining({
            filename: 'file1.txt',
            url: '/uploads/file1.txt',
            size: 1024,
          }),
          expect.objectContaining({
            filename: 'file2.png',
            url: '/uploads/file2.png',
            size: 1024,
          }),
        ])
      );
    });

    it('读取目录异常应该返回500错误', async () => {
      const { getFileList } = await import('../../../controllers/file.controller.js');

      mockReaddir.mockRejectedValue(new Error('read dir error'));

      const request = {
        user: { role: 'admin', id: 1 },
        log: { error: vi.fn() },
      } as any;

      const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() };

      await getFileList(request, reply as any);

      expect(sendError).toHaveBeenCalledWith(reply, '获取文件列表失败', 500);
    });
  });

  describe('cleanupTempFiles', () => {
    it('未登录用户应该返回401错误', async () => {
      const { cleanupTempFiles } = await import('../../../controllers/file.controller.js');

      const request = {
        user: null,
        query: {},
        log: { error: vi.fn() },
      } as any;

      const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() };

      await cleanupTempFiles(request, reply as any);

      expect(sendError).toHaveBeenCalledWith(reply, '需要认证', 401);
    });

    it('成功清理临时文件', async () => {
      const { cleanupTempFiles } = await import('../../../controllers/file.controller.js');

      const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue(['old-file.tmp']);
      mockStat.mockResolvedValue({ ctime: oldDate });

      const request = {
        user: { id: 1, role: 'user' },
        query: { hours: '24' },
        log: { error: vi.fn() },
      } as any;

      const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() };

      await cleanupTempFiles(request, reply as any);

      expect(mockUnlink).toHaveBeenCalled();
      expect(sendSuccess).toHaveBeenCalledWith(
        reply,
        expect.objectContaining({
          deletedCount: 1,
        }),
        '临时文件清理完成'
      );
    });

    it('不删除新文件', async () => {
      const { cleanupTempFiles } = await import('../../../controllers/file.controller.js');

      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue(['recent-file.tmp']);
      mockStat.mockResolvedValue({ ctime: new Date() });

      const request = {
        user: { id: 1, role: 'user' },
        query: { hours: '24' },
        log: { error: vi.fn() },
      } as any;

      const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() };

      await cleanupTempFiles(request, reply as any);

      expect(mockUnlink).not.toHaveBeenCalled();
      expect(sendSuccess).toHaveBeenCalledWith(
        reply,
        expect.objectContaining({
          deletedCount: 0,
        }),
        '临时文件清理完成'
      );
    });

    it('临时目录不存在时返回0', async () => {
      const { cleanupTempFiles } = await import('../../../controllers/file.controller.js');

      mockExistsSync.mockReturnValue(false);

      const request = {
        user: { id: 1, role: 'user' },
        query: {},
        log: { error: vi.fn() },
      } as any;

      const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() };

      await cleanupTempFiles(request, reply as any);

      expect(sendSuccess).toHaveBeenCalledWith(
        reply,
        expect.objectContaining({
          deletedCount: 0,
        }),
        '临时文件清理完成'
      );
    });

    it('清理异常应该返回500错误', async () => {
      const { cleanupTempFiles } = await import('../../../controllers/file.controller.js');

      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockRejectedValue(new Error('cleanup error'));

      const request = {
        user: { id: 1, role: 'user' },
        query: {},
        log: { error: vi.fn() },
      } as any;

      const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() };

      await cleanupTempFiles(request, reply as any);

      expect(sendError).toHaveBeenCalledWith(reply, '清理临时文件失败', 500);
    });
  });
});
