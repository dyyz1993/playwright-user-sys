import * as grpc from '@grpc/grpc-js';
import { logger } from '@shared/utils/logger.js';
import { withDeadline } from './connection-types.js';
import type { ConnectionPool } from './connection-pool.js';
import type {
  ManagerMessage,
  SessionResponse,
  SessionStatusUpdate,
  MachineStatusResponse,
  TransferFileResponse,
  FileInjectResponse,
} from '../../shared/types/grpc.js';

export class ConnectionCommands {
  constructor(private pool: ConnectionPool) {}

  sendCloseBrowserCommand(machineId: string, sessionId: string): void {
    try {
      const call = this.pool.get(machineId);
      if (!call) {
        logger.warn(`无法发送关闭浏览器命令，机器未连接: ${machineId}`);
        return;
      }

      call.write({ close_browser: { session_id: sessionId } });
      logger.info(`已发送关闭浏览器命令 (${machineId}, ${sessionId})`);
    } catch (error: unknown) {
      logger.error(`发送关闭浏览器命令失败 (${machineId}, ${sessionId}):`, error);
    }
  }

  sendRestartCommand(machineId: string): void {
    const call = this.pool.get(machineId);
    if (!call) {
      logger.warn(`无法发送重启命令，机器未连接: ${machineId}`);
      return;
    }

    try {
      call.write({ restart: { timestamp: Date.now() } });
      logger.info(`重启命令已发送 (${machineId})`);
    } catch (error: unknown) {
      logger.error(`发送重启命令失败 (${machineId}):`, error);
    }
  }

  sendShutdownCommand(machineId: string): void {
    const call = this.pool.get(machineId);
    if (!call) {
      logger.warn(`无法发送关闭命令，机器未连接: ${machineId}`);
      return;
    }

    try {
      call.write({ shutdown: { timestamp: Date.now(), permanent: true } });
      logger.info(`永久关闭命令已发送 (${machineId})`);
    } catch (error: unknown) {
      logger.error(`发送永久关闭命令失败 (${machineId}):`, error);
    }
  }

  sendHeartbeatRequest(machineId: string): void {
    const call = this.pool.get(machineId);
    if (!call) {
      logger.warn(`无法发送心跳请求，机器未连接: ${machineId}`);
      return;
    }

    try {
      call.write({ heartbeat_request: { timestamp: Date.now() } });
      logger.debug(`心跳请求已发送 (${machineId})`);
    } catch (error: unknown) {
      logger.error(`发送心跳请求失败 (${machineId}):`, error);
    }
  }

  async launchBrowser(
    machineId: string,
    sessionId: string,
    options: {
      userAgent?: string;
      proxy?: string;
      viewport?: { width: number; height: number };
      args?: string[];
      storageStatePath?: string;
      storageState?: {
        cookies?: Array<{
          name: string;
          value: string;
          domain: string;
          path: string;
          expires?: number;
          httpOnly?: boolean;
          secure?: boolean;
          sameSite?: string;
        }>;
        origins?: Array<{
          origin: string;
          localStorage: Record<string, string> | Array<{ name: string; value: string }>;
        }>;
      };
      sharedUserData?: boolean | string;
      timezone?: string;
      proxyBypass?: string;
      userDataDir?: string;
      userId?: number;
    }
  ): Promise<SessionResponse> {
    if (!this.pool.has(machineId)) {
      throw new Error(`机器未连接: ${machineId}`);
    }

    const client = await this.pool.getClient(machineId);
    if (!client) {
      throw new Error(`无法获取机器的 gRPC 客户端: ${machineId}`);
    }

    logger.info(`向机器 ${machineId} 发送启动浏览器请求 (sessionId: ${sessionId})`);

    const protoOptions: Record<string, unknown> = {};

    if (options.userAgent) protoOptions.user_agent = options.userAgent;
    if (options.proxy) protoOptions.proxy = options.proxy;
    if (options.viewport) protoOptions.viewport = { width: options.viewport.width, height: options.viewport.height };
    if (options.args && Array.isArray(options.args)) protoOptions.args = options.args;
    if (options.storageStatePath) protoOptions.storage_state_path = options.storageStatePath;

    if (options.storageState) {
      const storageState: Record<string, unknown> = {};
      if (options.storageState.cookies && Array.isArray(options.storageState.cookies)) {
        storageState.cookies = options.storageState.cookies.map((cookie: Record<string, unknown>) => ({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
          expires: cookie.expires,
          http_only: cookie.httpOnly,
          secure: cookie.secure,
          same_site: cookie.sameSite,
        }));
      }
      if (options.storageState.origins && Array.isArray(options.storageState.origins)) {
        storageState.origins = options.storageState.origins.map((origin: Record<string, unknown>) => ({
          origin: origin.origin,
          localStorage: origin.localStorage,
        }));
      }
      protoOptions.storage_state = storageState;
    }

    if (options.sharedUserData !== undefined) protoOptions.shared_user_data = options.sharedUserData;
    if (options.timezone) protoOptions.timezone = options.timezone;
    if (options.proxyBypass) protoOptions.proxy_bypass = options.proxyBypass;
    if (options.userDataDir) {
      protoOptions.user_data_dir = options.userDataDir;
      logger.warn(`userDataDir 参数已废弃，客户端传递了自定义路径: ${options.userDataDir}`);
    }

    logger.info(`转换后的 proto 浏览器选项:`, protoOptions);

    const request = { session_id: sessionId, options: protoOptions, user_id: options.userId || 0 };
    const metadata = new grpc.Metadata();
    metadata.set('machine_id', machineId);

    return withDeadline(
      new Promise((resolve, reject) => {
        client.LaunchBrowser(request, metadata, (error: unknown, response: SessionResponse) => {
          if (error) {
            logger.error(`启动浏览器失败 (${machineId}, ${sessionId}):`, error);
            reject(error);
            return;
          }
          logger.info(`浏览器启动成功 (${machineId}, ${sessionId}, port: ${response.port})`);
          resolve(response);
        });
      }),
      30000,
      `LaunchBrowser ${machineId}`
    );
  }

  async closeBrowser(machineId: string, sessionId: string): Promise<boolean> {
    if (!this.pool.has(machineId)) {
      throw new Error(`机器未连接: ${machineId}`);
    }

    const client = await this.pool.getClient(machineId);
    if (!client) {
      throw new Error(`无法获取机器的 gRPC 客户端: ${machineId}`);
    }

    logger.info(`向机器 ${machineId} 发送关闭浏览器请求 (sessionId: ${sessionId})`);

    const request = { session_id: sessionId };
    const metadata = new grpc.Metadata();
    metadata.set('machine_id', machineId);

    return withDeadline(
      new Promise((resolve, reject) => {
        client.CloseBrowser(request, metadata, (error: unknown, response: SessionStatusUpdate) => {
          if (error) {
            logger.error(`关闭浏览器失败 (${machineId}, ${sessionId}):`, error);
            reject(error);
            return;
          }
          const success = response.status === 'closed';
          logger.info(`浏览器关闭${success ? '成功' : '失败'} (${machineId}, ${sessionId})`);
          resolve(success);
        });
      }),
      30000,
      `CloseBrowser ${machineId}`
    );
  }

  async requestScreenshot(machineId: string, sessionId: string): Promise<void> {
    const call = this.pool.get(machineId);
    if (!call) {
      throw new Error(`机器未连接: ${machineId}`);
    }

    const message: ManagerMessage = { request_screenshot: { session_id: sessionId } };
    logger.info(`向机器 ${machineId} 发送截图请求 (sessionId: ${sessionId})`);
    call.write(message);
  }

  async getMachineStatus(machineId: string): Promise<{
    machine_id: string;
    online: boolean;
    cpu_usage: number;
    memory_usage: number;
    disk_space: number;
    active_sessions: number;
    max_sessions: number;
    timestamp: number;
  }> {
    if (!this.pool.has(machineId)) {
      return {
        machine_id: machineId,
        online: false,
        cpu_usage: 0,
        memory_usage: 0,
        disk_space: 0,
        active_sessions: 0,
        max_sessions: 0,
        timestamp: Date.now(),
      };
    }

    const client = await this.pool.getClient(machineId);
    if (!client) {
      throw new Error(`无法获取机器的 gRPC 客户端: ${machineId}`);
    }

    logger.info(`向机器 ${machineId} 发送获取状态请求`);

    const request = { machine_id: machineId };
    const metadata = new grpc.Metadata();
    metadata.set('machine_id', machineId);

    return withDeadline(
      new Promise((resolve, reject) => {
        client.GetMachineStatus(request, metadata, (error: unknown, response: MachineStatusResponse) => {
          if (error) {
            logger.error(`获取机器状态失败 (${machineId}):`, error);
            reject(error);
            return;
          }
          logger.info(`成功获取机器状态 (${machineId})`);
          resolve({
            machine_id: response.machine_id,
            online: response.online,
            cpu_usage: response.cpu_usage,
            memory_usage: response.memory_usage,
            disk_space: response.disk_space ?? 0,
            active_sessions: response.active_sessions,
            max_sessions: response.max_sessions,
            timestamp: response.timestamp,
          });
        });
      }),
      30000,
      `GetMachineStatus ${machineId}`
    );
  }

  async transferFile(
    machineId: string,
    sessionId: string,
    filename: string,
    data: Buffer
  ): Promise<TransferFileResponse> {
    const client = await this.pool.getClient(machineId);
    if (!client) throw new Error(`Machine ${machineId} 未连接`);
    const metadata = new grpc.Metadata();
    metadata.set('machine_id', machineId);
    return withDeadline(
      new Promise((resolve, reject) => {
        client.TransferFile(
          { session_id: sessionId, filename, data },
          metadata,
          (err: unknown, response: TransferFileResponse) => {
            if (err) return reject(err);
            resolve(response);
          }
        );
      }),
      30000,
      `TransferFile ${machineId}`
    );
  }

  async downloadAndInjectFile(
    machineId: string,
    params: {
      sessionId: string;
      url: string;
      selector: string;
      frameSelector?: string;
      filename?: string;
      timeout?: number;
    }
  ): Promise<FileInjectResponse> {
    const client = await this.pool.getClient(machineId);
    if (!client) throw new Error(`Machine ${machineId} 未连接`);
    const metadata = new grpc.Metadata();
    metadata.set('machine_id', machineId);
    return withDeadline(
      new Promise((resolve, reject) => {
        client.DownloadAndInjectFile(
          {
            session_id: params.sessionId,
            url: params.url,
            selector: params.selector,
            frame_selector: params.frameSelector || '',
            filename: params.filename || '',
            download_timeout: params.timeout || 60000,
          },
          metadata,
          (err: unknown, response: FileInjectResponse) => {
            if (err) return reject(err);
            resolve(response);
          }
        );
      }),
      60000,
      `DownloadAndInjectFile ${machineId}`
    );
  }

  async injectFile(
    machineId: string,
    params: {
      sessionId: string;
      machineFilePath: string;
      selector: string;
      frameSelector?: string;
    }
  ): Promise<FileInjectResponse> {
    const client = await this.pool.getClient(machineId);
    if (!client) throw new Error(`Machine ${machineId} 未连接`);
    const metadata = new grpc.Metadata();
    metadata.set('machine_id', machineId);
    return withDeadline(
      new Promise((resolve, reject) => {
        client.InjectFile(
          {
            session_id: params.sessionId,
            machine_file_path: params.machineFilePath,
            selector: params.selector,
            frame_selector: params.frameSelector || '',
          },
          metadata,
          (err: unknown, response: FileInjectResponse) => {
            if (err) return reject(err);
            resolve(response);
          }
        );
      }),
      30000,
      `InjectFile ${machineId}`
    );
  }
}
