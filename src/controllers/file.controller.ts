import { FastifyRequest, FastifyReply } from 'fastify';
import { sendSuccess, sendError } from '../utils/response.js';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env.js';
import { WebSocket } from 'ws';

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
    // 检查是否是管理员（这里可以根据需要调整权限）
    if (!request.user || request.user.role !== 'admin') {
      return sendError(reply, '需要管理员权限', 403);
    }

    // 获取上传的文件
    const file = await request.file();
    
    if (!file) {
      return sendError(reply, '没有上传文件', 400);
    }

    // 生成唯一文件名
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const fileName = uniqueSuffix + '-' + file.filename;
    const filePath = path.join(uploadDir, fileName);

    // 保存文件
    await file.file.pipe(fs.createWriteStream(filePath));

    // 返回文件信息
    const fileUrl = `/uploads/${fileName}`;
    
    return sendSuccess(reply, {
      filename: file.filename,
      savedFilename: fileName,
      url: fileUrl,
      mimetype: file.mimetype,
      size: file.file.bytesRead
    }, '文件上传成功');
  } catch (error) {
    request.log.error('文件上传失败:', error);
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

    // 生成唯一文件名
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const fileName = uniqueSuffix + '-' + file.filename;
    const filePath = path.join(tempDir, fileName);

    // 保存文件
    await file.file.pipe(fs.createWriteStream(filePath));

    // 返回文件信息
    const fileUrl = `/temp/${fileName}`;
    
    return sendSuccess(reply, {
      filename: file.filename,
      savedFilename: fileName,
      url: fileUrl,
      filepath: filePath, // 返回文件在服务器上的绝对路径，供CDP使用
      mimetype: file.mimetype,
      size: file.file.bytesRead
    }, '临时文件上传成功');
  } catch (error) {
    request.log.error('临时文件上传失败:', error);
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
    const files = fs.readdirSync(uploadDir);
    
    // 获取文件详细信息
    const fileList = files.map(filename => {
      const filePath = path.join(uploadDir, filename);
      const stat = fs.statSync(filePath);
      
      return {
        filename,
        url: `/uploads/${filename}`,
        size: stat.size,
        uploadedAt: stat.mtime
      };
    });

    return sendSuccess(reply, fileList);
  } catch (error) {
    request.log.error('获取文件列表失败:', error);
    return sendError(reply, '获取文件列表失败', 500);
  }
}

/**
 * 清理临时文件
 */
export async function cleanupTempFiles(request: FastifyRequest, reply: FastifyReply) {
  try {
    // 验证用户权限
    if (!request.user) {
      return sendError(reply, '需要认证', 401);
    }

    // 获取指定时间之前的临时文件（默认24小时之前）
    const hours = parseInt((request.query as any).hours || '24');
    const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);

    let deletedCount = 0;
    
    // 读取临时目录中的文件
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      
      for (const filename of files) {
        const filePath = path.join(tempDir, filename);
        const stat = fs.statSync(filePath);
        
        // 如果文件创建时间早于截止时间，则删除
        if (stat.ctime.getTime() < cutoffTime) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      }
    }

    return sendSuccess(reply, {
      deletedCount,
      message: `已清理 ${deletedCount} 个临时文件`
    }, '临时文件清理完成');
  } catch (error) {
    request.log.error('清理临时文件失败:', error);
    return sendError(reply, '清理临时文件失败', 500);
  }
}

export default {
  uploadFile,
  uploadTempFile,
  getFileList,
  cleanupTempFiles
};