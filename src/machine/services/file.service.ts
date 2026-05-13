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
      await fs.unlink(chunkPath).catch((err) => logger.debug('清理临时文件失败', { chunkPath, error: err.message }));
    }

    return new Promise((resolve, reject) => {
      writeStream.end(() => {
        fs.rm(dir, { recursive: true }).catch((err) => logger.debug('清理目录失败', { dir, error: err.message }));
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
    await this.checkDiskSpace(500 * 1024 * 1024);

    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error(`不支持的协议: ${parsedUrl.protocol}`);
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    const blockedPatterns = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '169.254.169.254', 'metadata.google.internal'];
    const blockedPrefixes = [
      '10.',
      '172.16.',
      '172.17.',
      '172.18.',
      '172.19.',
      '172.2',
      '172.30.',
      '172.31.',
      '192.168.',
    ];
    const blockedSuffixes = ['.internal', '.local', '.localhost'];

    if (blockedPatterns.includes(hostname)) {
      throw new Error(`不允许下载内网地址: ${hostname}`);
    }
    if (blockedPrefixes.some((prefix) => hostname.startsWith(prefix))) {
      throw new Error(`不允许下载内网地址: ${hostname}`);
    }
    if (blockedSuffixes.some((suffix) => hostname.endsWith(suffix))) {
      throw new Error(`不允许下载内网地址: ${hostname}`);
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

  async storeFile(
    sessionId: string,
    filename: string,
    data: Buffer
  ): Promise<{ filePath: string; originalName: string; machineFilePath?: string; realPath?: string }> {
    await this.checkDiskSpace(500 * 1024 * 1024);

    if (data.length > this.maxFileSize) {
      throw new Error(`文件大小 ${data.length} 超过限制 ${this.maxFileSize}`);
    }

    const finalDir = path.join(this.tempDir, sessionId);
    await fs.mkdir(finalDir, { recursive: true });

    const safeName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${path.basename(filename)}`;
    const filePath = path.join(finalDir, safeName);
    await fs.writeFile(filePath, data);

    const originalPath = path.join(finalDir, path.basename(filename));
    if (originalPath !== filePath) {
      try {
        await fs.unlink(originalPath);
      } catch {
        /* ignore */
      }
      await fs.symlink(path.resolve(filePath), originalPath);
      return {
        filePath: originalPath,
        originalName: path.basename(filename),
        machineFilePath: originalPath,
        realPath: filePath,
      };
    }

    return { filePath, originalName: path.basename(filename) };
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

  private async checkDiskSpace(minRequiredBytes: number): Promise<void> {
    try {
      const { execSync } = await import('child_process');
      const output = execSync('df -k .', { encoding: 'utf8' });
      const lines = output.trim().split('\n');
      const parts = lines[1].split(/\s+/);
      const availableKB = parseInt(parts[3], 10);
      const availableBytes = availableKB * 1024;

      if (availableBytes < minRequiredBytes) {
        throw new Error(
          `磁盘空间不足: 可用 ${Math.round(availableBytes / 1024 / 1024)}MB，需要至少 ${Math.round(minRequiredBytes / 1024 / 1024)}MB`
        );
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('磁盘空间不足')) {
        throw error;
      }
    }
  }
}

export const fileService = new FileService();
