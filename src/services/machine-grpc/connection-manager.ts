import * as grpc from '@grpc/grpc-js';
import { EventEmitter } from 'events';
import { logger } from '@shared/utils/logger.js';
import { MachineModel } from '../../models/machine.model.js';
import type {
  MachineMessage,
  ManagerMessage,
  Heartbeat,
  SessionScreenshot,
  SessionStatusUpdate,
  SessionResponse,
  MachineStatusResponse,
  MachineServiceClient,
  MachineProtoPackage,
  TransferFileResponse,
  FileInjectResponse,
} from '../../shared/types/grpc.js';
import { calculateCreditsUsed } from '@shared/utils/credits-calculator.js';

function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`gRPC call timeout: ${label} (${ms}ms)`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export class MachineConnectionManager extends EventEmitter {
  private connections: Map<string, grpc.ServerDuplexStream<MachineMessage, ManagerMessage>> = new Map();
  private pendingRequests: Map<string, { resolve: Function; reject: Function; timer: NodeJS.Timeout }> = new Map();
  private clients: Map<string, MachineServiceClient> = new Map();
  private proto: MachineProtoPackage | null = null;

  setProto(proto: MachineProtoPackage): void {
    this.proto = proto;
  }

  addConnection(machineId: string, call: grpc.ServerDuplexStream<MachineMessage, ManagerMessage>): void {
    if (this.connections.has(machineId)) {
      this.removeConnection(machineId);
    }

    this.connections.set(machineId, call);
    logger.info(`机器连接已添加: ${machineId}`);

    call.on('data', (message: MachineMessage) => {
      try {
        this.handleMachineMessage(machineId, message);
      } catch (error) {
        logger.error(`处理机器消息时出错 (${machineId}):`, error);
      }
    });

    call.on('end', () => {
      logger.info(`机器连接已结束: ${machineId}`);
      this.removeConnection(machineId);
    });

    call.on('error', (error: unknown) => {
      logger.error(`机器连接错误 (${machineId}):`, error);
      this.removeConnection(machineId);
    });

    MachineModel.update(machineId, { status: 'online' })
      .then(() => {
        logger.info(`机器状态已更新为在线: ${machineId}`);
      })
      .catch((error) => {
        logger.error(`更新机器状态失败 (${machineId}):`, error);
      });

    this.sendHeartbeatRequest(machineId);
  }

  async removeConnection(machineId: string): Promise<void> {
    const call = this.connections.get(machineId);
    if (call) {
      try {
        call.end();
      } catch (error) {
        logger.error(`结束机器连接时出错 (${machineId}):`, error);
      }
    }

    this.connections.delete(machineId);
    logger.info(`机器连接已移除: ${machineId}`);

    try {
      await MachineModel.update(machineId, { status: 'offline' });
      logger.info(`机器状态已更新为离线: ${machineId}`);

      try {
        const { memoryStore } = await import('../memory-store.service.js');
        memoryStore.markMachineOffline(machineId);
        logger.info(`内存存储中的机器状态已更新为离线: ${machineId}`);
      } catch (memoryError) {
        logger.error(`更新内存存储中的机器状态失败 (${machineId}):`, memoryError);
      }
    } catch (error) {
      logger.error(`更新机器状态失败 (${machineId}):`, error);
    }
  }

  isConnected(machineId: string): boolean {
    return this.connections.has(machineId);
  }

  getAllConnectedMachines(): string[] {
    return Array.from(this.connections.keys());
  }

  getActiveConnections(): string[] {
    return this.getAllConnectedMachines();
  }

  getConnection(machineId: string) {
    return this.connections.get(machineId);
  }

  async getClient(machineId: string): Promise<MachineServiceClient | null> {
    if (this.clients.has(machineId)) {
      return this.clients.get(machineId) ?? null;
    }

    try {
      const machine = await MachineModel.findById(machineId);
      if (!machine) {
        logger.error(`找不到机器: ${machineId}`);
        return null;
      }

      const address = `${machine.ip}:${machine.grpcPort || 50052}`;
      logger.info(`创建到机器 ${machineId} 的 gRPC 客户端 (${address})`);

      const options = {
        'grpc.keepalive_time_ms': 30000,
        'grpc.keepalive_timeout_ms': 10000,
        'grpc.keepalive_permit_without_calls': 1,
        'grpc.http2.min_time_between_pings_ms': 15000,
        'grpc.http2.max_pings_without_data': 0,
        'grpc.max_reconnect_backoff_ms': 10000,
      };

      if (!this.proto) {
        throw new Error('gRPC proto 未初始化');
      }
      const client = new this.proto.MachineService(address, grpc.credentials.createInsecure(), options);
      this.clients.set(machineId, client);

      return client;
    } catch (error) {
      logger.error(`创建 gRPC 客户端失败 (${machineId}):`, error);
      return null;
    }
  }

  sendCloseBrowserCommand(machineId: string, sessionId: string): void {
    try {
      const call = this.connections.get(machineId);
      if (!call) {
        logger.warn(`无法发送关闭浏览器命令，机器未连接: ${machineId}`);
        return;
      }

      const message = {
        close_browser: {
          session_id: sessionId,
        },
      };

      call.write(message);
      logger.info(`已发送关闭浏览器命令 (${machineId}, ${sessionId})`);
    } catch (error) {
      logger.error(`发送关闭浏览器命令失败 (${machineId}, ${sessionId}):`, error);
    }
  }

  sendRestartCommand(machineId: string): void {
    const call = this.connections.get(machineId);
    if (!call) {
      logger.warn(`无法发送重启命令，机器未连接: ${machineId}`);
      return;
    }

    try {
      const message = {
        restart: {
          timestamp: Date.now(),
        },
      };

      call.write(message);
      logger.info(`重启命令已发送 (${machineId})`);
    } catch (error) {
      logger.error(`发送重启命令失败 (${machineId}):`, error);
    }
  }

  sendShutdownCommand(machineId: string): void {
    const call = this.connections.get(machineId);
    if (!call) {
      logger.warn(`无法发送关闭命令，机器未连接: ${machineId}`);
      return;
    }

    try {
      const message = {
        shutdown: {
          timestamp: Date.now(),
          permanent: true,
        },
      };

      call.write(message);
      logger.info(`永久关闭命令已发送 (${machineId})`);
    } catch (error) {
      logger.error(`发送永久关闭命令失败 (${machineId}):`, error);
    }
  }

  sendHeartbeatRequest(machineId: string): void {
    const call = this.connections.get(machineId);
    if (!call) {
      logger.warn(`无法发送心跳请求，机器未连接: ${machineId}`);
      return;
    }

    try {
      const message = {
        heartbeat_request: {
          timestamp: Date.now(),
        },
      };

      call.write(message);
      logger.debug(`心跳请求已发送 (${machineId})`);
    } catch (error) {
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
    if (!this.isConnected(machineId)) {
      throw new Error(`机器未连接: ${machineId}`);
    }

    const client = await this.getClient(machineId);
    if (!client) {
      throw new Error(`无法获取机器的 gRPC 客户端: ${machineId}`);
    }

    logger.info(`向机器 ${machineId} 发送启动浏览器请求 (sessionId: ${sessionId})`);

    const protoOptions: Record<string, unknown> = {};

    if (options.userAgent) {
      protoOptions.user_agent = options.userAgent;
    }

    if (options.proxy) {
      protoOptions.proxy = options.proxy;
    }

    if (options.viewport) {
      protoOptions.viewport = {
        width: options.viewport.width,
        height: options.viewport.height,
      };
    }

    if (options.args && Array.isArray(options.args)) {
      protoOptions.args = options.args;
    }

    if (options.storageStatePath) {
      protoOptions.storage_state_path = options.storageStatePath;
    }

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

    if (options.sharedUserData !== undefined) {
      protoOptions.shared_user_data = options.sharedUserData;
    }

    if (options.timezone) {
      protoOptions.timezone = options.timezone;
    }

    if (options.proxyBypass) {
      protoOptions.proxy_bypass = options.proxyBypass;
    }

    if (options.userDataDir) {
      protoOptions.user_data_dir = options.userDataDir;
      logger.warn(`userDataDir 参数已废弃，客户端传递了自定义路径: ${options.userDataDir}`);
    }

    logger.info(`转换后的 proto 浏览器选项:`, protoOptions);

    const request = {
      session_id: sessionId,
      options: protoOptions,
      user_id: options.userId || 0,
    };

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
    if (!this.isConnected(machineId)) {
      throw new Error(`机器未连接: ${machineId}`);
    }

    const client = await this.getClient(machineId);
    if (!client) {
      throw new Error(`无法获取机器的 gRPC 客户端: ${machineId}`);
    }

    logger.info(`向机器 ${machineId} 发送关闭浏览器请求 (sessionId: ${sessionId})`);

    const request = {
      session_id: sessionId,
    };

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
    const call = this.connections.get(machineId);
    if (!call) {
      throw new Error(`机器未连接: ${machineId}`);
    }

    const message: ManagerMessage = {
      request_screenshot: { session_id: sessionId },
    };

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
    if (!this.isConnected(machineId)) {
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

    const client = await this.getClient(machineId);
    if (!client) {
      throw new Error(`无法获取机器的 gRPC 客户端: ${machineId}`);
    }

    logger.info(`向机器 ${machineId} 发送获取状态请求`);

    const request = {
      machine_id: machineId,
    };

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
    const client = await this.getClient(machineId);
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
    const client = await this.getClient(machineId);
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
    const client = await this.getClient(machineId);
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

  private async handleMachineMessage(machineId: string, message: MachineMessage): Promise<void> {
    try {
      logger.debug(`收到机器消息 (${machineId}): ${JSON.stringify(message)}`);

      if (message.heartbeat) {
        await this.handleHeartbeat(machineId, message.heartbeat);
      } else if (message.session_status) {
        await this.handleSessionStatus(machineId, message.session_status);
      } else if (message.session_screenshot) {
        await this.handleSessionScreenshot(machineId, message.session_screenshot);
      } else {
        logger.warn(`收到未知类型的消息 (${machineId}): ${JSON.stringify(message)}`);
      }
    } catch (error) {
      logger.error(`处理机器消息时出错 (${machineId}):`, error);
    }
  }

  private async handleHeartbeat(machineId: string, heartbeat: Heartbeat): Promise<void> {
    try {
      logger.debug(`收到心跳 (${machineId}): ${JSON.stringify(heartbeat)}`);

      const { memoryStore } = await import('../memory-store.service.js');

      const machine = await MachineModel.findById(machineId);

      logger.debug(`findById 返回: machine=${machine ? '存在' : 'null'}`);

      if (machine) {
        logger.debug(`machine.grpcPort=${machine.grpcPort}`);

        memoryStore.updateMachineStatus({
          machine_id: machineId,
          name: machine.hostname,
          ip: machine.ip,
          grpc_port: machine.grpcPort || 50052,
          proxy_port: machine.proxyPort || 8080,
          cpu_usage: heartbeat.cpu_usage,
          memory_usage: heartbeat.memory_usage,
          disk_space: heartbeat.disk_usage || 0,
          active_sessions: heartbeat.active_sessions,
          max_sessions: machine.maxInstances,
          last_heartbeat: new Date(),
        });
      } else {
        logger.warn(`机器 ${machineId} 在数据库中不存在，跳过内存更新`);
      }

      await MachineModel.update(machineId, {
        cpuUsage: heartbeat.cpu_usage,
        memoryUsage: heartbeat.memory_usage,
        instanceCount: heartbeat.active_sessions,
        status: 'online',
      });

      logger.debug(`机器状态已更新 (${machineId})`);
    } catch (error) {
      logger.error(`处理心跳时出错 (${machineId}):`, error);
    }
  }

  private async handleSessionScreenshot(machineId: string, screenshot: SessionScreenshot): Promise<void> {
    const { session_id, screenshot_url } = screenshot;
    try {
      logger.info(`收到会话截图更新 (${machineId}, ${session_id}): ${screenshot_url}`);

      const { SessionModel } = await import('../../models/session.model.js');
      const session = await SessionModel.findById(session_id);
      if (!session) {
        logger.warn(`会话不存在 (${session_id})`);
        return;
      }

      await SessionModel.update(session_id, {
        screenshot_url,
      });

      logger.info(`会话截图已更新 (${session_id}): ${screenshot_url}`);
    } catch (error) {
      logger.error(`处理会话截图更新时出错 (${machineId}, ${session_id}):`, error);
    }
  }

  private async handleSessionStatus(machineId: string, status: SessionStatusUpdate): Promise<void> {
    const { SessionModel } = await import('../../models/session.model.js');
    const { UserModel } = await import('../../models/user.model.js');
    const { SessionStatus } = await import('@shared/types/index.js');
    const { createWebhookEvent } = await import('../../utils/webhook.js');
    const { WebhookEventType } = await import('@shared/types/index.js');

    const { session_id, status: sessionStatus, duration: reportedDuration } = status;
    try {
      let duration = reportedDuration;
      logger.info(
        `收到会话状态更新 (${machineId}, ${session_id}): ${sessionStatus}, 持续时间: ${duration}秒, 数据源: 机器端`
      );

      const session = await SessionModel.findById(session_id);
      if (!session) {
        logger.warn(`会话不存在 (${session_id})`);
        return;
      }

      if (duration === 0 && session.start_time) {
        const now = new Date();
        const startTime = new Date(session.start_time);
        const calculatedDuration = Math.floor((now.getTime() - startTime.getTime()) / 1000);

        if (calculatedDuration > 0) {
          duration = calculatedDuration;
          logger.info(
            `会话状态更新: 根据开始时间计算持续时间 (${session_id}): 开始时间=${startTime.toISOString()}, 当前时间=${now.toISOString()}, 持续时间=${duration}秒`
          );
        }
      }

      switch (sessionStatus) {
        case 'connected':
          const now = new Date();

          if (session.start_time) {
            await SessionModel.update(session_id, {
              status: SessionStatus.CONNECTED,
            });
            logger.info(`会话已有开始时间，不覆盖 (${session_id}): ${new Date(session.start_time).toISOString()}`);
          } else {
            await SessionModel.update(session_id, {
              status: SessionStatus.CONNECTED,
              start_time: now,
            });
            logger.info(`会话设置开始时间 (${session_id}): ${now.toISOString()}`);
          }

          await createWebhookEvent(session.user_id, WebhookEventType.SESSION_CONNECTED, {
            session_id,
            connected_at: new Date(),
          });

          logger.info(`用户已连接到会话，开始计费 (${session_id})`);
          break;

        case 'disconnected':
          await SessionModel.markDisconnected(session_id, duration);
          logger.info(`机器端报告用户已断开会话连接，已调用 markDisconnected 完成扣费 (${session_id})`);
          break;

        case 'active':
          const minutes = calculateCreditsUsed(duration);

          if (session.duration > 0 || session.credits_used > 0) {
            const newDuration = Math.max(session.duration, duration);
            const newCreditsUsed = Math.max(session.credits_used, minutes);

            await SessionModel.update(session_id, {
              duration: newDuration,
              credits_used: newCreditsUsed,
            });

            logger.info(
              `会话活动更新，保留最大值 (${session_id}): 持续时间=${newDuration}秒, 消耗点数=${newCreditsUsed}点`
            );
          } else {
            await SessionModel.update(session_id, {
              duration,
              credits_used: minutes,
            });

            logger.info(`会话活动更新 (${session_id}): 持续时间=${duration}秒, 消耗点数=${minutes}点`);
          }

          const user = await UserModel.findById(session.user_id);

          if (user && user.credits < minutes) {
            logger.warn(`用户点数不足 (${session.user_id}), 剩余: ${user.credits}, 已使用: ${minutes}点`);

            this.sendCloseBrowserCommand(machineId, session_id);

            await createWebhookEvent(session.user_id, WebhookEventType.CREDITS_DEPLETED, {
              session_id,
              credits_remaining: user.credits,
              credits_used: minutes,
            });
          } else if (user && user.credits < minutes + 5) {
            await createWebhookEvent(session.user_id, WebhookEventType.CREDITS_LOW, {
              session_id,
              credits_remaining: user.credits,
              credits_used: minutes,
            });
          }

          logger.info(`会话活动更新 (${session_id}): 连接时长 ${duration}秒, 已使用 ${minutes}点`);
          break;

        case 'closed':
          if (session.status === SessionStatus.DISCONNECTED || session.status === SessionStatus.ERROR) {
            logger.info(`会话已断开，跳过重复处理 (${session_id}), 当前状态: ${session.status}`);
            break;
          }

          await SessionModel.markDisconnected(session_id, duration);

          await MachineModel.decrementInstanceCount(machineId);

          await createWebhookEvent(session.user_id, WebhookEventType.SESSION_DISCONNECTED, {
            session_id,
            duration,
            disconnected_at: new Date(),
          });

          logger.info(`浏览器实例已关闭，已调用 markDisconnected 完成扣费 (${session_id})`);
          break;

        case 'error':
          const errorMinutes = calculateCreditsUsed(duration);

          if (session.duration > 0 || session.credits_used > 0) {
            await SessionModel.update(session_id, {
              status: SessionStatus.ERROR,
              end_time: new Date(),
            });
            logger.info(
              `会话已有持续时间和消耗点数，只更新状态和结束时间 (${session_id}): 持续时间=${session.duration}秒, 消耗点数=${session.credits_used}点`
            );
          } else {
            await SessionModel.update(session_id, {
              status: SessionStatus.ERROR,
              end_time: new Date(),
              duration,
              credits_used: errorMinutes,
            });
            logger.info(
              `会话没有持续时间和消耗点数，更新所有字段 (${session_id}): 持续时间=${duration}秒, 消耗点数=${errorMinutes}点`
            );
          }

          await MachineModel.decrementInstanceCount(machineId);

          await createWebhookEvent(session.user_id, WebhookEventType.SESSION_ERROR, {
            session_id,
            duration,
            error_at: new Date(),
          });

          logger.info(`会话出错，计费完成 (${session_id}): ${duration}秒, ${errorMinutes}点`);
          break;
      }
    } catch (error) {
      logger.error(`处理会话状态更新时出错 (${machineId}, ${status.session_id}):`, error);
    }
  }
}
