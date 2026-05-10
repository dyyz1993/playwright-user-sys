import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from '@shared/utils/logger.js';

const DEFAULT_TEMP_DIR = 'data/temp';
const DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export class FileService {
  private tempDir: string;
  private maxFileSize: number;

  constructor(options?: { tempDir?: string; maxFileSize?: number }) {
    this.tempDir = options?.tempDir ?? DEFAULT_TEMP_DIR;
    this.maxFileSize = options?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  }

  async storeChunk(sessionId: string, fileId: string, chunkData: Buffer, chunkIndex: number): Promise<void> {
    const dir = path.join(this.tempDir, sessionId, fileId);
    await fs.mkdir(dir, { recursive: true });
    const chunkPath = path.join(dir, `${String(chunkIndex).padStart(6, '0')}.chunk`);
    await fs.writeFile(chunkPath, chunkData);
  }

  async completeFile(sessionId: string, fileId: string, filename: string): Promise<string> {
    const dir = path.join(this.tempDir, sessionId, fileId);
    const finalDir = path.join(this.tempDir, sessionId);
    await fs.mkdir(finalDir, { recursive: true });

    const safeName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${path.basename(filename)}`;
    const finalPath = path.join(finalDir, safeName);

    const chunks = await fs.readdir(dir);
    chunks.sort();

    const writeStream = fsSync.createWriteStream(finalPath);
    for (const chunkFile of chunks) {
      const chunkPath = path.join(dir, chunkFile);
      const data = await fs.readFile(chunkPath);
      writeStream.write(data);
      await fs.unlink(chunkPath).catch(() => {});
    }

    return new Promise((resolve, reject) => {
      writeStream.end(() => {
        fs.rm(dir, { recursive: true }).catch(() => {});
        resolve(finalPath);
      });
      writeStream.on('error', reject);
    });
  }

  async downloadFromUrl(
    sessionId: string,
    url: string,
    options?: { filename?: string; timeout?: number }
  ): Promise<{ filePath: string; size: number }> {
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error(`不支持的协议: ${parsedUrl.protocol}`);
    }

    const finalDir = path.join(this.tempDir, sessionId);
    await fs.mkdir(finalDir, { recursive: true });

    const filename = options?.filename || path.basename(parsedUrl.pathname) || `download-${Date.now()}`;
    const safeName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${path.basename(filename)}`;
    const filePath = path.join(finalDir, safeName);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options?.timeout ?? 60000);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`下载失败: HTTP ${response.status} ${response.statusText}`);
      }

      const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
      if (contentLength > this.maxFileSize) {
        throw new Error(`文件大小 ${contentLength} 超过限制 ${this.maxFileSize}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length > this.maxFileSize) {
        throw new Error(`文件大小 ${buffer.length} 超过限制 ${this.maxFileSize}`);
      }

      await fs.writeFile(filePath, buffer);
      return { filePath, size: buffer.length };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async storeFile(sessionId: string, filename: string, data: Buffer): Promise<string> {
    if (data.length > this.maxFileSize) {
      throw new Error(`文件大小 ${data.length} 超过限制 ${this.maxFileSize}`);
    }

    const finalDir = path.join(this.tempDir, sessionId);
    await fs.mkdir(finalDir, { recursive: true });

    const safeName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${path.basename(filename)}`;
    const filePath = path.join(finalDir, safeName);
    await fs.writeFile(filePath, data);
    return filePath;
  }

  async cleanupSessionFiles(sessionId: string): Promise<void> {
    const sessionDir = path.join(this.tempDir, sessionId);
    try {
      await fs.rm(sessionDir, { recursive: true });
      logger.info(`已清理会话临时文件: ${sessionId}`);
    } catch (error: unknown) {
      const err = error as Error & { code?: string };
      if (err.code !== 'ENOENT') {
        logger.warn(`清理会话临时文件失败: ${sessionId}`, error);
      }
    }
  }

  async cleanupExpiredFiles(maxAgeMs?: number): Promise<number> {
    const age = maxAgeMs ?? DEFAULT_MAX_AGE_MS;
    const cutoff = Date.now() - age;
    let cleanedCount = 0;

    try {
      const entries = await fs.readdir(this.tempDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const dirPath = path.join(this.tempDir, entry.name);
          const stat = await fs.stat(dirPath);
          if (stat.mtimeMs < cutoff) {
            await fs.rm(dirPath, { recursive: true });
            cleanedCount++;
          }
        }
      }
    } catch (error: unknown) {
      const err = error as Error & { code?: string };
      if (err.code !== 'ENOENT') {
        logger.warn('清理过期临时文件失败:', error);
      }
    }

    return cleanedCount;
  }

  validateFilePath(filePath: string): boolean {
    const resolved = path.resolve(filePath);
    const tempDir = path.resolve(this.tempDir);
    return resolved.startsWith(tempDir);
  }
}

export const fileService = new FileService();
