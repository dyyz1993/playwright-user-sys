import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import retry from 'async-retry';
import os from 'os';
import { browserService } from '../browser.service.js';
import { logger } from '@shared/utils/logger.js';
import { MachineConfig, CONFIG } from '../config.js';

// gRPC 重连退避计数器
let grpcReconnectAttempts = 0;
import { ConnectionManager } from './connection-manager.js';
import { getCpuUsage, getMemoryUsage, getDiskSpace, getLocalIpAddress } from './system-info.js';
import { serviceImplementation } from './service-handlers.js';
import type { RegisterRequest, RegisterResponse, MachineMessage, ManagerMessage } from '../../shared/types/grpc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const protoPath = path.resolve(__dirname, '../../shared/protos/machine_service.proto');
const packageDefinition = protoLoader.loadSync(protoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

interface MachineServiceConstructor {
  service: grpc.ServiceDefinition;
  new (address: string, credentials: grpc.ChannelCredentials): MachineServiceClient;
}

interface MachineServiceClient {
  Register(request: RegisterRequest, callback: (err: unknown, response: RegisterResponse) => void): void;
  Connect(): grpc.ClientDuplexStream<MachineMessage, ManagerMessage>;
}

const protoDef = grpc.loadPackageDefinition(packageDefinition).machine as unknown as {
  MachineService: MachineServiceConstructor;
};
const proto = protoDef.MachineService;

let serverConfig: MachineConfig = CONFIG;

export function setGrpcServerConfig(config: MachineConfig): void {
  serverConfig = config;
  logger.info('gRPC 服务器配置已更新:', {
    machineId: config.machineId,
    grpcPort: config.grpcPort,
  });
}

export function getServerConfig(): MachineConfig {
  return serverConfig;
}

let _grpcClientInstance: GrpcClient | null = null;

export class GrpcClient extends EventEmitter {
  private client!: MachineServiceClient;
  private connectionManager: ConnectionManager;
  private config: MachineConfig;

  constructor(config: MachineConfig = CONFIG) {
    super();
    this.config = config;
    _grpcClientInstance = this;
    this.initClient();

    this.connectionManager = new ConnectionManager(
      config.machineId,
      () => this.emit('disconnected'),
      () => this.emit('error', new Error('UNAVAILABLE'))
    );

    browserService.on('sessionActivity', (sessionId: string, duration: number) => {
      this.sendSessionStatus(sessionId, 'active', duration);
    });

    browserService.on('sessionConnected', (sessionId: string) => {
      this.sendSessionStatus(sessionId, 'connected', 0);
    });

    browserService.on('sessionDisconnected', (sessionId: string, duration: number) => {
      this.sendSessionStatus(sessionId, 'disconnected', duration);
    });

    browserService.on('sessionClosed', (sessionId: string, duration: number) => {
      this.sendSessionStatus(sessionId, 'closed', duration);
    });

    browserService.on('sessionScreenshot', (sessionId: string, screenshotUrl: string) => {
      this.sendSessionScreenshot(sessionId, screenshotUrl);
    });
  }

  private initClient() {
    this.client = new proto(this.config.managerHost, grpc.credentials.createInsecure());
  }

  isConnected(): boolean {
    return this.connectionManager.isConnected();
  }

  async register(): Promise<RegisterResponse> {
    try {
      const diskSpace = await getDiskSpace();

      const systemInfo = {
        os: os.platform(),
        cpu: os.cpus()[0].model,
        memory: os.totalmem(),
        disk: diskSpace,
      };

      return new Promise((resolve, reject) => {
        const request = {
          machine_id: this.config.machineId,
          name: this.config.machineName,
          ip_address: getLocalIpAddress(),
          grpc_port: this.config.grpcPort,
          proxy_port: this.config.proxyPort,
          max_sessions: this.config.maxSessions,
          system_info: systemInfo,
        };

        logger.info('注册机器:', request);

        this.client.Register(request, (err: unknown, response: RegisterResponse) => {
          if (err) {
            logger.error('注册失败:', err);
            reject(err);
          } else {
            logger.info('注册成功:', response);
            resolve(response);
          }
        });
      });
    } catch (error) {
      logger.error('注册时获取系统信息失败:', error);
      return new Promise((resolve, reject) => {
        const systemInfo = {
          os: os.platform(),
          cpu: os.cpus()[0].model,
          memory: os.totalmem(),
          disk: 1000000000,
        };

        const request: RegisterRequest = {
          machine_id: this.config.machineId,
          name: this.config.machineName,
          ip_address: getLocalIpAddress(),
          grpc_port: this.config.grpcPort,
          proxy_port: this.config.proxyPort,
          max_sessions: this.config.maxSessions,
          system_info: systemInfo,
        };

        logger.info('使用默认磁盘空间注册机器:', request);

        this.client.Register(request, (err: unknown, response: RegisterResponse) => {
          if (err) {
            logger.error('注册失败:', err);
            reject(err);
          } else {
            logger.info('注册成功:', response);
            resolve(response);
          }
        });
      });
    }
  }

  async connect(): Promise<void> {
    try {
      await retry(
        async () => {
          return new Promise<void>((resolve, reject) => {
            try {
              if (this.connectionManager.isConnected()) {
                const existingCall = this.connectionManager.getCall();
                if (existingCall) {
                  logger.info('取消现有连接');
                  try {
                    existingCall.cancel();
                  } catch (cancelError) {
                    logger.warn('取消连接时出错:', cancelError);
                  }
                  this.connectionManager.setConnected(false);
                }
              }

              logger.info('尝试连接到管理端...');

              const call = this.client.Connect();
              this.connectionManager.setupStreamHandlers(call);
              this.connectionManager.setConnected(true);
              this.emit('connected');

              this.connectionManager.sendInitialHeartbeat();
              this.connectionManager.startHeartbeat();

              resolve();
            } catch (error) {
              logger.error('连接到管理端失败:', error);
              reject(error);
            }
          });
        },
        {
          retries: 5,
          factor: 2,
          minTimeout: 1000,
          maxTimeout: 60000,
          onRetry: (error, attempt) => {
            logger.warn(`连接失败，第 ${attempt} 次重试:`, error);
          },
        }
      );
    } catch (error: unknown) {
      logger.error('连接到管理端失败，已达到最大重试次数:', error);

      const errMsg = error instanceof Error ? error.message : '';
      if (errMsg && errMsg.includes('UNAVAILABLE: Connection dropped')) {
        logger.warn('检测到 gRPC 连接断开错误，将在内部处理而不抛出异常');

        setTimeout(() => {
          this.reconnect();
        }, 10000);

        return;
      }

      throw error;
    }
  }

  async reconnect(): Promise<void> {
    try {
      const { getMachineServer } = await import('../index.js');
      const machineServer = getMachineServer();
      const machineState = machineServer?.getState();

      if (!machineServer || machineState === 'shutting_down' || machineState === 'stopped') {
        logger.warn(`机器端当前状态为 ${machineState || 'undefined'}，取消重连`);
        return;
      }

      logger.info('尝试重新连接到管理端...');
      await this.connect();
      logger.info('重新连接成功');
    } catch (error) {
      logger.error('重新连接失败:', error);
      throw error;
    }
  }

  sendSessionStatus(sessionId: string, status: string, duration: number): void {
    if (!this.connectionManager.isConnected()) {
      logger.warn(`无法发送会话状态更新，未连接到管理服务器`);
      return;
    }

    const call = this.connectionManager.getCall();
    if (!call) return;

    try {
      let finalDuration = duration;

      if (finalDuration === 0 && status === 'closed') {
        const sessions = browserService['sessions'];
        const session = sessions.get(sessionId);

        if (session && session.startTime) {
          const now = Date.now();
          finalDuration = Math.floor((now - session.startTime) / 1000);
          logger.info(
            `发送会话状态更新时计算持续时间 (sessionId: ${sessionId}): 开始时间=${new Date(session.startTime).toISOString()}, 当前时间=${new Date(now).toISOString()}, 持续时间=${finalDuration}秒`
          );
        }
      }

      const message = {
        machine_id: this.config.machineId,
        session_status: {
          session_id: sessionId,
          status: status,
          duration: finalDuration,
        },
      };

      const writeResult = call.write(message);
      if (writeResult === false) {
        logger.warn(`发送状态更新缓冲区已满，等待排空`);
      } else {
        logger.info(`已发送会话状态更新 (sessionId: ${sessionId}, status: ${status}, duration: ${finalDuration}s)`);
      }
    } catch (error) {
      logger.error(`发送会话状态更新失败:`, error);
    }
  }

  sendSessionScreenshot(sessionId: string, screenshotUrl: string): void {
    if (!this.connectionManager.isConnected()) {
      logger.warn(`无法发送会话截图更新，未连接到管理服务器`);
      return;
    }

    const call = this.connectionManager.getCall();
    if (!call) return;

    try {
      const message = {
        machine_id: this.config.machineId,
        session_screenshot: {
          session_id: sessionId,
          screenshot_url: screenshotUrl,
        },
      };

      const writeResult = call.write(message);
      if (writeResult === false) {
        logger.warn(`发送截图更新缓冲区已满，等待排空`);
      } else {
        logger.info(`已发送会话截图更新 (sessionId: ${sessionId}, screenshotUrl: ${screenshotUrl})`);
      }
    } catch (error) {
      logger.error(`发送会话截图更新失败:`, error);
    }
  }
}

export const grpcClient = new GrpcClient();

export async function startGrpcClient(): Promise<void> {
  try {
    await grpcClient.register();
    await grpcClient.connect();
    return;
  } catch (error: unknown) {
    logger.error('启动 gRPC 客户端失败:', error);

    const errMsg = error instanceof Error ? error.message : '';
    const isGrpcConnectionError =
      errMsg &&
      (errMsg.includes('UNAVAILABLE: Connection dropped') ||
        errMsg.includes('UNAVAILABLE: No connection established') ||
        errMsg.includes('ECONNREFUSED') ||
        errMsg.includes('UNAVAILABLE'));

    if (isGrpcConnectionError) {
      logger.warn('检测到 gRPC 连接错误，将在内部处理而不抛出异常');

      // 带指数退避的重连：10s → 20s → 40s → 80s（上限 80s）
      const baseDelay = 10000;
      const jitter = Math.random() * 3000; // 添加 0-3s 随机抖动
      const backoffDelay = Math.min(baseDelay * Math.pow(2, grpcReconnectAttempts), 80000) + jitter;
      grpcReconnectAttempts++;

      setTimeout(async () => {
        try {
          const { getMachineServer } = await import('../index.js');
          const machineServer = getMachineServer();
          const machineState = machineServer?.getState();

          if (!machineServer || machineState === 'shutting_down' || machineState === 'stopped') {
            logger.warn(`机器端当前状态为 ${machineState || 'undefined'}，取消 gRPC 客户端重连`);
            return;
          }

          logger.info(`尝试重新启动 gRPC 客户端 (第 ${grpcReconnectAttempts} 次)...`);
          await startGrpcClient();
          grpcReconnectAttempts = 0; // 重置退避计数器
          logger.info('gRPC 客户端重新启动成功');
        } catch (reconnectError) {
          logger.error('gRPC 客户端重新启动失败:', reconnectError);

          try {
            const { getMachineServer: getServer } = await import('../index.js');
            const server = getServer();
            const state = server?.getState();

            if (server && state !== 'shutting_down' && state !== 'stopped') {
              // 下一次重连会在外层的指数退避中自动调度
              setTimeout(() => startGrpcClient(), Math.min(baseDelay * Math.pow(2, grpcReconnectAttempts), 80000));
            }
          } catch (stateError) {
            logger.error('获取机器端状态失败:', stateError);
            setTimeout(() => startGrpcClient(), Math.min(baseDelay * Math.pow(2, grpcReconnectAttempts), 80000));
          }
        }
      }, backoffDelay);

      return;
    }

    throw error;
  }
}

export function startGrpcServer(port: number = 50052): void {
  logger.info(`开始启动 gRPC 服务器，端口: ${port}`);
  const server = new grpc.Server();
  server.addService(proto.service, serviceImplementation);

  server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (bindErr) => {
    if (bindErr) {
      logger.error('绑定 gRPC 服务器失败:', bindErr);
      return;
    }

    logger.info(`gRPC 服务器已启动并绑定到端口 ${port}`);
  });
}

export { CONFIG };
