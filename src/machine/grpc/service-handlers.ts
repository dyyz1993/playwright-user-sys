import * as grpc from '@grpc/grpc-js';
import os from 'os';
import { logger } from '@shared/utils/logger.js';
import { browserService } from '../browser.service.js';
import { getCpuUsage } from './system-info.js';
import type {
  LaunchBrowserRequest,
  SessionResponse,
  CloseBrowserRequest,
  SessionStatusUpdate,
  MachineStatusRequest,
  MachineStatusResponse,
  MachineMessage,
  ManagerMessage,
  BrowserOptions,
} from '../../shared/types/grpc.js';
import type { ServerUnaryCall, sendUnaryData, ServerDuplexStream } from '@grpc/grpc-js';

export const serviceImplementation = {
  LaunchBrowser: async (
    call: ServerUnaryCall<LaunchBrowserRequest, SessionResponse>,
    callback: sendUnaryData<SessionResponse>
  ) => {
    try {
      const request = call.request;
      logger.info(`收到启动浏览器请求:`, request);

      const { session_id, user_id } = request;
      const protoOptions = request.options || ({} as BrowserOptions);

      const convertedOptions: Record<string, unknown> = {};

      if (protoOptions.user_agent) {
        convertedOptions.userAgent = protoOptions.user_agent;
      }

      if (protoOptions.proxy) {
        convertedOptions.proxy = protoOptions.proxy;
      }

      if (protoOptions.viewport) {
        convertedOptions.viewport = {
          width: protoOptions.viewport.width,
          height: protoOptions.viewport.height,
        };
      }

      if (protoOptions.args && Array.isArray(protoOptions.args)) {
        convertedOptions.args = protoOptions.args;
      }

      if (protoOptions.storage_state_path) {
        convertedOptions.storageStatePath = protoOptions.storage_state_path;
      }

      if (protoOptions.storage_state) {
        const storageStateData = protoOptions.storage_state;

        if (storageStateData.cookies && Array.isArray(storageStateData.cookies)) {
          convertedOptions.storageState = {
            cookies: storageStateData.cookies.map((cookie) => ({
              name: cookie.name,
              value: cookie.value,
              domain: cookie.domain,
              path: cookie.path,
              expires: cookie.expires,
              httpOnly: cookie.http_only,
              secure: cookie.secure,
              sameSite: cookie.same_site,
            })),
            origins:
              storageStateData.origins?.map((origin) => ({
                origin: origin.origin,
                localStorage: origin.localStorage,
              })) || [],
          };
        }
      }

      if (protoOptions.shared_user_data !== undefined) {
        convertedOptions.sharedUserData = protoOptions.shared_user_data;
      }

      if (protoOptions.timezone) {
        convertedOptions.timezone = protoOptions.timezone;
      }

      if (protoOptions.proxy_bypass) {
        convertedOptions.proxyBypass = protoOptions.proxy_bypass;
      }

      if (protoOptions.user_data_dir) {
        convertedOptions.userDataDir = protoOptions.user_data_dir;
        logger.warn(`user_data_dir 参数已废弃，客户端传递了自定义路径: ${protoOptions.user_data_dir}`);
      }

      if (user_id) {
        convertedOptions.userId = user_id;
      }

      logger.info(`转换后的浏览器选项:`, convertedOptions);

      try {
        const result = await browserService.launchBrowser(session_id, convertedOptions);
        logger.info(`浏览器启动成功 (sessionId: ${session_id}, port: ${result.port})`);

        callback(null, {
          session_id,
          success: true,
          browser_ws_endpoint: result.browserWSEndpoint,
          port: result.port,
          error: '',
        });
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : '启动浏览器失败';
        logger.error(`启动浏览器失败 (sessionId: ${session_id}):`, error);

        callback({
          code: grpc.status.FAILED_PRECONDITION,
          message: errMsg,
        });
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '处理启动浏览器请求失败';
      logger.error('处理启动浏览器请求失败:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: errMsg,
      });
    }
  },

  CloseBrowser: async (
    call: ServerUnaryCall<CloseBrowserRequest, SessionStatusUpdate>,
    callback: sendUnaryData<SessionStatusUpdate>
  ) => {
    try {
      const request = call.request;
      logger.info(`收到关闭浏览器请求:`, request);

      const { session_id } = request;

      try {
        const success = await browserService.closeBrowser(session_id);
        logger.info(`浏览器关闭${success ? '成功' : '失败'} (sessionId: ${session_id})`);

        callback(null, {
          session_id,
          status: success ? 'closed' : 'error',
          error: success ? '' : '关闭浏览器失败',
          duration: 0,
        });
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : '关闭浏览器失败';
        logger.error(`关闭浏览器失败 (sessionId: ${session_id}):`, error);
        callback(null, {
          session_id,
          status: 'error',
          error: errMsg,
          duration: 0,
        });
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '处理关闭浏览器请求失败';
      logger.error('处理关闭浏览器请求失败:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: errMsg,
      });
    }
  },

  GetMachineStatus: async (
    call: ServerUnaryCall<MachineStatusRequest, MachineStatusResponse>,
    callback: sendUnaryData<MachineStatusResponse>
  ) => {
    const { getServerConfig } = await import('./index.js');
    try {
      const request = call.request;
      logger.info(`收到获取机器状态请求:`, request);

      const cpuUsage = getCpuUsage();
      const serverConfig = getServerConfig();

      callback(null, {
        machine_id: serverConfig.machineId,
        online: true,
        cpu_usage: cpuUsage,
        memory_usage: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100,
        active_sessions: browserService.getActiveSessions(),
        max_sessions: serverConfig.maxSessions,
        timestamp: Date.now(),
      });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '处理获取机器状态请求失败';
      logger.error('处理获取机器状态请求失败:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: errMsg,
      });
    }
  },

  Register: async (call: ServerUnaryCall<any, any>, callback: sendUnaryData<any>) => {
    try {
      const request = call.request;
      logger.info('收到机器注册请求:', request);

      callback(null, {
        success: true,
        message: '注册成功',
      });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '处理机器注册请求失败';
      logger.error('处理机器注册请求失败:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: errMsg,
      });
    }
  },

  Connect: (call: ServerDuplexStream<MachineMessage, ManagerMessage>) => {
    try {
      logger.info('收到新的 Connect 请求');

      call.on('data', (message: MachineMessage) => {
        logger.info('收到消息:', message);

        call.write({
          heartbeat_request: {
            timestamp: Date.now(),
          },
        });
      });

      call.on('end', () => {
        logger.info('连接结束');
        call.end();
      });

      call.on('error', (error: unknown) => {
        logger.error('连接错误:', error);
        call.end();
      });
    } catch (error) {
      logger.error('处理 Connect 请求失败:', error);
      call.end();
    }
  },

  TransferFile: async (call: ServerUnaryCall<any, any>, callback: sendUnaryData<any>) => {
    try {
      const { sessionId, filename, data } = call.request;
      const { fileService } = await import('../services/file.service.js');
      const machineFilePath = await fileService.storeFile(sessionId, filename, Buffer.from(data));
      callback(null, {
        success: true,
        error: '',
        machine_file_path: machineFilePath,
        filename,
        size: Buffer.from(data).length,
      });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '文件传输失败';
      logger.error('文件传输失败:', error);
      callback(null, { success: false, error: errMsg, machine_file_path: '', filename: '', size: 0 });
    }
  },

  DownloadAndInjectFile: async (call: ServerUnaryCall<any, any>, callback: sendUnaryData<any>) => {
    try {
      const { sessionId, url, selector, frameSelector, filename, downloadTimeout } = call.request;
      const { fileService } = await import('../services/file.service.js');
      const { browserInjectService } = await import('../services/browser-inject.service.js');
      const { filePath, size } = await fileService.downloadFromUrl(sessionId, url, {
        filename: filename || undefined,
        timeout: downloadTimeout || undefined,
      });
      const result = await browserInjectService.injectFile({
        sessionId,
        filePath,
        selector,
        frameSelector: frameSelector || undefined,
      });
      callback(null, {
        success: result.success,
        error: result.error || '',
        machine_file_path: filePath,
        filename: filename || '',
        size,
      });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '下载并注入文件失败';
      logger.error('下载并注入文件失败:', error);
      callback(null, { success: false, error: errMsg, machine_file_path: '', filename: '', size: 0 });
    }
  },

  InjectFile: async (call: ServerUnaryCall<any, any>, callback: sendUnaryData<any>) => {
    try {
      const { sessionId, machineFilePath, selector, frameSelector } = call.request;
      const { browserInjectService } = await import('../services/browser-inject.service.js');
      const result = await browserInjectService.injectFile({
        sessionId,
        filePath: machineFilePath,
        selector,
        frameSelector: frameSelector || undefined,
      });
      callback(null, {
        success: result.success,
        error: result.error || '',
        machine_file_path: machineFilePath,
        filename: '',
        size: 0,
      });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '文件注入失败';
      logger.error('文件注入失败:', error);
      callback(null, { success: false, error: errMsg, machine_file_path: '', filename: '', size: 0 });
    }
  },
};
