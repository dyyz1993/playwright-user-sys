import { FastifyRequest, FastifyReply } from 'fastify';
import { sendSuccess, sendError, getSafeErrorMessage } from '../utils/response.js';
import { CleanupTempFilesQueryRoute } from '@shared/types/routes.js';
import { SessionModel } from '../models/session/index.js';
import { logger } from '@shared/utils/logger.js';
import { validateFileUpload } from '../utils/file-validation.js';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import path from 'path';

// 确保上传目录存在
const uploadDir = path.join(process.cwd(), 'data', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 临时文件目录（用于CDP文件上传）
const tempDir = path.join(process.cwd(), 'data', 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

/**
 * 上传文件
 */
export async function uploadFile(request: FastifyRequest, reply: FastifyReply) {
  try {
    if (!request.user || request.user.role !== 'admin') {
      return sendError(reply, '需要管理员权限', 403);
    }

    const file = await request.file();

    if (!file) {
      return sendError(reply, '没有上传文件', 400);
    }

    // Validate file security
    try {
      const contentLength = request.headers['content-length'];
      const fileSize = contentLength ? parseInt(contentLength, 10) : 0;
      validateFileUpload(file.filename, file.mimetype, fileSize);
    } catch (validationError: unknown) {
      return sendError(reply, validationError instanceof Error ? validationError.message : '文件验证失败', 400);
    }

    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const fileName = uniqueSuffix + '-' + path.basename(file.filename);
    const filePath = path.join(uploadDir, fileName);

    await pipeline(file.file, fs.createWriteStream(filePath));

    const fileUrl = `/uploads/${fileName}`;

    cleanupExpiredUploads().catch((err) => logger.warn('后台清理过期文件失败', { error: err.message }));

    return sendSuccess(
      reply,
      {
        filename: file.filename,
        savedFilename: fileName,
        url: fileUrl,
        mimetype: file.mimetype,
        size: file.file.bytesRead,
      },
      '文件上传成功'
    );
  } catch (error: unknown) {
    request.log.error({ err: error }, '文件上传失败');
    return sendError(reply, '文件上传失败', 500);
  }
}

/**
 * 为CDP上传临时文件
 */
export async function uploadTempFile(request: FastifyRequest, reply: FastifyReply) {
  try {
    // 验证用户权限（这里可以是任何已认证用户）
    if (!request.user) {
      return sendError(reply, '需要认证', 401);
    }

    // 获取上传的文件
    const file = await request.file();

    if (!file) {
      return sendError(reply, '没有上传文件', 400);
    }

    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const fileName = uniqueSuffix + '-' + path.basename(file.filename);
    const filePath = path.join(tempDir, fileName);

    // 保存文件
    await pipeline(file.file, fs.createWriteStream(filePath));

    // 返回文件信息
    const fileUrl = `/temp/${fileName}`;

    return sendSuccess(
      reply,
      {
        filename: file.filename,
        savedFilename: fileName,
        url: fileUrl,
        filepath: filePath, // 返回文件在服务器上的绝对路径，供CDP使用
        mimetype: file.mimetype,
        size: file.file.bytesRead,
      },
      '临时文件上传成功'
    );
  } catch (error: unknown) {
    request.log.error({ err: error }, '临时文件上传失败');
    return sendError(reply, '临时文件上传失败', 500);
  }
}

/**
 * 获取已上传的文件列表
 */
export async function getFileList(request: FastifyRequest, reply: FastifyReply) {
  try {
    // 检查是否是管理员
    if (!request.user || request.user.role !== 'admin') {
      return sendError(reply, '需要管理员权限', 403);
    }

    // 读取上传目录中的文件
    const files = await fs.promises.readdir(uploadDir);

    const fileList = await Promise.all(
      files.map(async (filename) => {
        const filePath = path.join(uploadDir, filename);
        const stat = await fs.promises.stat(filePath);
        return { filename, url: `/uploads/${filename}`, size: stat.size, uploadedAt: stat.mtime };
      })
    );

    return sendSuccess(reply, fileList);
  } catch (error: unknown) {
    request.log.error({ err: error }, '获取文件列表失败');
    return sendError(reply, '获取文件列表失败', 500);
  }
}

/**
 * 清理临时文件
 */
export async function cleanupTempFiles(request: FastifyRequest<CleanupTempFilesQueryRoute>, reply: FastifyReply) {
  try {
    if (!request.user) {
      return sendError(reply, '需要认证', 401);
    }

    const hours = parseInt(request.query.hours || '24');
    const cutoffTime = Date.now() - hours * 60 * 60 * 1000;

    let deletedCount = 0;

    // 读取临时目录中的文件
    if (fs.existsSync(tempDir)) {
      const files = await fs.promises.readdir(tempDir);
      for (const filename of files) {
        const filePath = path.join(tempDir, filename);
        const stat = await fs.promises.stat(filePath);
        if (stat.ctime.getTime() < cutoffTime) {
          await fs.promises.unlink(filePath);
          deletedCount++;
        }
      }
    }

    return sendSuccess(
      reply,
      {
        deletedCount,
        message: `已清理 ${deletedCount} 个临时文件`,
      },
      '临时文件清理完成'
    );
  } catch (error: unknown) {
    request.log.error({ err: error }, '清理临时文件失败');
    return sendError(reply, '清理临时文件失败', 500);
  }
}

export async function uploadFileForSession(request: FastifyRequest, reply: FastifyReply) {
  try {
    if (!request.user) {
      return sendError(reply, '需要认证', 401);
    }

    const data = await request.file();
    if (!data) {
      return sendError(reply, '没有上传文件', 400);
    }

    const sessionIdField = data.fields?.sessionId;
    let sessionId: string | undefined;
    if (Array.isArray(sessionIdField)) {
      sessionId = (sessionIdField[0] as { value: string })?.value;
    } else if (sessionIdField && typeof sessionIdField === 'object') {
      sessionId = (sessionIdField as { value: string }).value;
    } else if (typeof sessionIdField === 'string') {
      sessionId = sessionIdField;
    }
    if (!sessionId) {
      try {
        const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
        sessionId = url.searchParams.get('sessionId') || undefined;
      } catch (urlParseError: unknown) {
        logger.debug('URL parsing failed while extracting sessionId', urlParseError);
      }
    }

    if (!sessionId) {
      return sendError(reply, '缺少 sessionId', 400);
    }

    const session = await SessionModel.findById(sessionId);
    if (!session || session.user_id !== request.user.id) {
      return sendError(reply, '会话不存在或不属于该用户', 404);
    }
    if (!['connected', 'created', 'active'].includes(session.status)) {
      return sendError(reply, '会话不是活跃状态', 400);
    }

    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(chunk as Buffer);
    }
    const fileBuffer = Buffer.concat(chunks);

    if (fileBuffer.length > 100 * 1024 * 1024) {
      return sendError(reply, '文件大小超过限制 (100MB)', 400);
    }

    if (!session.machine_id) {
      return sendError(reply, '会话未关联机器', 400);
    }

    const { fileTransferService } = await import('../services/file-transfer.service.js');
    const result = await fileTransferService.transferToMachine(
      fileBuffer,
      data.filename,
      sessionId,
      session.machine_id
    );

    if (!result.success) {
      return sendError(reply, result.error || '文件传输失败', 500);
    }

    return sendSuccess(
      reply,
      {
        fileId: `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        sessionId,
        filename: data.filename,
        size: fileBuffer.length,
        machineFilePath: result.machineFilePath,
      },
      '文件上传成功'
    );
  } catch (error: unknown) {
    logger.error('文件上传失败:', error);
    return sendError(reply, getSafeErrorMessage(error) || '文件上传失败', 500);
  }
}

/**
 * 获取会话已上传的文件列表
 */
export async function getSessionFiles(request: FastifyRequest, reply: FastifyReply) {
  try {
    if (!request.user) {
      return sendError(reply, '需要认证', 401);
    }

    const { sessionId } = request.params as { sessionId: string };

    // 验证 sessionId 格式为 UUID，防止路径遍历
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
      return sendError(reply, '无效的会话ID格式', 400);
    }

    const session = await SessionModel.findById(sessionId);
    if (!session || session.user_id !== request.user.id) {
      return sendError(reply, '会话不存在或不属于该用户', 404);
    }

    const sessionTempDir = path.join(tempDir, sessionId);

    if (!fs.existsSync(sessionTempDir)) {
      return sendSuccess(reply, { files: [] });
    }

    const entries = await fs.promises.readdir(sessionTempDir, { withFileTypes: true });
    const files: Array<{ name: string; size: number; type: string; lastModified: string; machineFilePath: string }> =
      [];

    for (const entry of entries) {
      if (entry.isDirectory()) continue;

      const filePath = path.join(sessionTempDir, entry.name);
      try {
        const stat = await fs.promises.stat(filePath);
        if (!stat.isFile()) continue;

        const ext = path.extname(entry.name).toLowerCase();
        const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(ext);

        files.push({
          name: entry.name,
          size: stat.size,
          type: isImage ? 'image' : 'file',
          lastModified: stat.mtime.toISOString(),
          machineFilePath: filePath,
        });
      } catch (e: unknown) {
        logger.debug('Failed to stat file in file list:', (e as Error)?.message);
      }
    }

    files.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());

    return sendSuccess(reply, { files });
  } catch (error: unknown) {
    request.log.error({ err: error }, '获取会话文件列表失败');
    return sendError(reply, '获取会话文件列表失败', 500);
  }
}

export async function cleanupExpiredUploads(): Promise<void> {
  const maxAge = 7 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - maxAge;

  try {
    const entries = fs.readdirSync(uploadDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const filePath = path.join(uploadDir, entry.name);
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
        }
      }
    }
  } catch (error: unknown) {
    logger.debug('Failed to cleanup expired uploads', error);
  }
}

export default {
  uploadFile,
  uploadTempFile,
  getFileList,
  cleanupTempFiles,
  uploadFileForSession,
  getSessionFiles,
};
