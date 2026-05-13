import { logger } from '@shared/utils/logger.js';

export class FileTransferService {
  async transferToMachine(
    fileBuffer: Buffer,
    filename: string,
    sessionId: string,
    machineId: string
  ): Promise<{ success: boolean; machineFilePath?: string; size?: number; error?: string }> {
    try {
      const { connectionManager } = await import('./machine-grpc/index.js');
      const result = await connectionManager.transferFile(machineId, sessionId, filename, fileBuffer);
      logger.info(`文件传输成功: ${filename} → Machine ${machineId}`);
      return {
        success: result.success,
        machineFilePath: result.machine_file_path,
        size: result.size,
        error: result.error || undefined,
      };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error(`文件传输失败: ${filename} → Machine ${machineId}:`, error);
      return { success: false, error: errMsg };
    }
  }

  async downloadAndInject(
    sessionId: string,
    machineId: string,
    url: string,
    selector: string,
    options?: { frameSelector?: string; filename?: string; timeout?: number }
  ): Promise<any> {
    const { connectionManager } = await import('./machine-grpc/index.js');
    const result = await connectionManager.downloadAndInjectFile(machineId, {
      sessionId,
      url,
      selector,
      ...options,
    });
    logger.info(`URL 文件注入: ${url} → session ${sessionId}`);
    return result;
  }

  async injectFile(
    sessionId: string,
    machineId: string,
    machineFilePath: string,
    selector: string,
    frameSelector?: string
  ): Promise<any> {
    const { connectionManager } = await import('./machine-grpc/index.js');
    const result = await connectionManager.injectFile(machineId, {
      sessionId,
      machineFilePath,
      selector,
      frameSelector,
    });
    logger.info(`文件注入: ${machineFilePath} → session ${sessionId}`);
    return {
      success: result.success,
      error: result.error || '',
      machine_file_path: result.machine_file_path || '',
      filename: result.filename || '',
      size: result.size || 0,
    };
  }
}

export const fileTransferService = new FileTransferService();
