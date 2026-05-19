import { WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';
import { logger } from '@shared/utils/logger.js';
import { CONFIG } from '../config.js';
import { sendResponse, sendNotification } from './events-helpers.js';
import { activeEventConnections } from './events-types.js';
import type { FileUploadStartData, FileUploadChunkData } from './events-types.js';

export async function handleFileUploadStart(
  ws: WebSocket,
  sessionId: string,
  data: FileUploadStartData
): Promise<void> {
  try {
    logger.info(`Starting file upload for session ${sessionId}: ${data.filename}`);

    const sessionTempDir = path.join(CONFIG.tempDir, sessionId);
    if (!fs.existsSync(sessionTempDir)) {
      fs.mkdirSync(sessionTempDir, { recursive: true });
    }

    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const fileName = uniqueSuffix + '-' + path.basename(data.filename);
    const filePath = path.join(sessionTempDir, fileName);

    const uploadState = {
      filePath: filePath,
      fileName: data.filename,
      totalChunks: data.totalChunks,
      receivedChunks: 0,
      fileSize: data.size,
    };

    const connectionInfo = activeEventConnections.get(ws);
    if (connectionInfo) {
      if (!connectionInfo.config.uploadStates) {
        connectionInfo.config.uploadStates = {};
      }
      connectionInfo.config.uploadStates[fileName] = uploadState;
    }

    logger.info(`File upload started for session ${sessionId}: ${filePath}`);

    sendResponse(ws, 'fileUploadStart', {
      success: true,
      filepath: filePath,
      filename: data.filename,
      size: data.size,
    });
  } catch (error: unknown) {
    logger.error(`Failed to start file upload for session ${sessionId}:`, error);
    sendResponse(ws, 'fileUploadStart', {
      success: false,
      error: (error as Error).message,
    });
  }
}

export async function handleFileUploadChunk(
  ws: WebSocket,
  sessionId: string,
  data: FileUploadChunkData
): Promise<void> {
  try {
    logger.info(`Receiving file chunk ${data.chunkIndex} for session ${sessionId}`);

    const connectionInfo = activeEventConnections.get(ws);
    if (!connectionInfo) {
      throw new Error('Connection info not found');
    }

    const uploadStates = connectionInfo.config.uploadStates;
    if (!uploadStates) {
      throw new Error('No active file upload');
    }

    const fileName = Object.keys(uploadStates)[0];
    if (!fileName) {
      throw new Error('No active file upload');
    }

    const uploadState = uploadStates[fileName];

    const chunkBuffer = Buffer.from(data.chunk, 'base64');
    try {
      fs.appendFileSync(uploadState.filePath, chunkBuffer);
    } catch (writeError: unknown) {
      logger.error('Failed to append file chunk', { error: writeError, filepath: uploadState.filePath });
      throw writeError;
    }

    uploadState.receivedChunks++;

    logger.info(`Received chunk ${data.chunkIndex + 1}/${uploadState.totalChunks} for session ${sessionId}`);

    if (data.isLast) {
      delete uploadStates[fileName];
      logger.info(`File upload completed for session ${sessionId}: ${uploadState.filePath}`);
    }

    sendResponse(ws, 'fileUploadChunk', {
      success: true,
      chunkIndex: data.chunkIndex,
    });
  } catch (error: unknown) {
    logger.error(`Failed to handle file chunk for session ${sessionId}:`, error);
    sendResponse(ws, 'fileUploadChunk', {
      success: false,
      error: (error as Error).message,
    });
  }
}

export async function handleFileList(ws: WebSocket, sessionId: string, requestType: string): Promise<void> {
  try {
    const tempDir = path.join(CONFIG.tempDir, sessionId);
    const files: Array<{
      name: string;
      size: number;
      type: string;
      lastModified: string;
      machineFilePath: string;
    }> = [];
    try {
      const entries = await fs.promises.readdir(tempDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() || entry.isSymbolicLink()) continue;
        const filePath = path.join(tempDir, entry.name);
        try {
          const stat = await fs.promises.stat(filePath);
          const ext = path.extname(entry.name).toLowerCase();
          const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(ext);
          var displayName = entry.name.replace(/^\d+-[a-f0-9]+-/, '');
          files.push({
            name: displayName,
            size: stat.size,
            type: isImage ? 'image' : 'file',
            lastModified: stat.mtime.toISOString(),
            machineFilePath: filePath,
          });
        } catch (e: unknown) {
          logger.debug('Failed to stat file for file list:', (e as Error)?.message);
        }
      }
    } catch (e: unknown) {
      logger.debug('Failed to read temp dir for file list:', (e as Error)?.message);
    }
    files.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
    sendResponse(ws, requestType, { success: true, files });
  } catch (err: unknown) {
    logger.error('Failed to list files:', err);
    sendResponse(ws, requestType, { success: false, files: [], error: String(err) });
  }
}

export async function handleBrowseDir(
  ws: WebSocket,
  eventData: Record<string, unknown>,
  requestType: string
): Promise<void> {
  const requestedPath = (eventData.path as string) || '/';
  const tempDir = path.resolve(CONFIG.tempDir);
  const allowedBasePaths = ['/tmp', tempDir];

  const resolvedPath = path.resolve(requestedPath);
  const isAllowed = allowedBasePaths.some((bp) => resolvedPath.startsWith(bp));

  if (!isAllowed) {
    sendResponse(ws, requestType, { success: false, error: 'Access denied: path not allowed' });
    return;
  }

  try {
    const entries = await fs.promises.readdir(resolvedPath, { withFileTypes: true });
    const items = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(resolvedPath, entry.name);
        try {
          const stat = await fs.promises.stat(fullPath);
          const ext = entry.name.split('.').pop()?.toLowerCase() || '';
          const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif'].includes(ext);
          return {
            name: entry.name,
            path: fullPath,
            isDirectory: entry.isDirectory(),
            isFile: entry.isFile(),
            size: stat.size,
            lastModified: stat.mtimeMs,
            ext,
            isImage,
          };
        } catch {
          return null;
        }
      })
    );

    const validItems = items.filter((item) => item !== null);

    validItems.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    sendResponse(ws, requestType, {
      success: true,
      path: resolvedPath,
      parentPath: path.dirname(resolvedPath),
      items: validItems,
    });
  } catch (err: unknown) {
    sendResponse(ws, requestType, {
      success: false,
      error: (err as Error).message,
      path: resolvedPath,
    });
  }
}

export async function handleGetThumbnail(
  ws: WebSocket,
  eventData: Record<string, unknown>,
  requestType: string
): Promise<void> {
  const filePath = eventData.path as string;

  const tempDir2 = path.resolve(CONFIG.tempDir);
  const resolvedPath2 = path.resolve(filePath);
  const isAllowed2 = resolvedPath2.startsWith('/tmp') || resolvedPath2.startsWith(tempDir2);

  if (!isAllowed2) {
    sendResponse(ws, requestType, { success: false, error: 'Access denied' });
    return;
  }

  try {
    const stat = await fs.promises.stat(resolvedPath2);
    if (!stat.isFile()) {
      sendResponse(ws, requestType, { success: false, error: 'Not a file' });
      return;
    }

    const fileBuffer = await fs.promises.readFile(resolvedPath2);
    const ext = resolvedPath2.split('.').pop()?.toLowerCase() || 'png';
    const mimeType =
      {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp',
        bmp: 'image/bmp',
        svg: 'image/svg+xml',
        ico: 'image/x-icon',
        avif: 'image/avif',
      }[ext] || 'image/png';

    const base64 = fileBuffer.toString('base64');

    sendResponse(ws, requestType, {
      success: true,
      dataUrl: `data:${mimeType};base64,${base64}`,
      size: stat.size,
      name: resolvedPath2.split('/').pop(),
    });
  } catch (err: unknown) {
    sendResponse(ws, requestType, { success: false, error: (err as Error).message });
  }
}

export async function handleFileInjectInBrowser(
  ws: WebSocket,
  sessionId: string,
  data: { filepath: string; selector: string; frameSelector?: string }
): Promise<void> {
  try {
    const { browserInjectService } = await import('../services/browser-inject.service.js');
    const result = await browserInjectService.injectFile({
      sessionId,
      filePath: data.filepath,
      selector: data.selector,
      frameSelector: data.frameSelector,
    });
    sendResponse(ws, 'fileInjectInBrowser', result);
  } catch (error: unknown) {
    logger.error(`WebSocket 文件注入失败 (session: ${sessionId}):`, error);
    sendResponse(ws, 'fileInjectInBrowser', { success: false, error: (error as Error).message });
  }
}

export async function handleInjectFile(
  ws: WebSocket,
  sessionId: string,
  eventData: Record<string, unknown>,
  page: import('puppeteer-core').Page
): Promise<void> {
  if (eventData.fileId) {
    try {
      var tempDir = path.join(CONFIG.tempDir, sessionId);
      var filePath = path.join(tempDir, eventData.fileId as string);
      var exists = await fs.promises
        .access(filePath)
        .then(function () {
          return true;
        })
        .catch(function () {
          return false;
        });
      if (!exists) {
        sendNotification(ws, 'injectResult', { success: false, error: 'File not found' });
        return;
      }
      var selector = (eventData.selector as string) || 'input[type="file"]';
      var inputEl = await page.$(selector);
      if (!inputEl) {
        sendNotification(ws, 'injectResult', { success: false, error: 'No file input found' });
        return;
      }
      await (inputEl as unknown as import('puppeteer-core').ElementHandle<HTMLInputElement>).uploadFile(filePath);
      sendNotification(ws, 'injectResult', { success: true });
    } catch (err: unknown) {
      sendNotification(ws, 'injectResult', { success: false, error: (err as Error).message });
    }
  }
}
