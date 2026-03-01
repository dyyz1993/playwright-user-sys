import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { EventEmitter } from 'events';
import retry from 'async-retry';
import { exec } from 'child_process';
import { promisify } from 'util';
import { browserService } from './browser.service.js';
import { logger } from '@shared/utils/logger.js';
import { MachineConfig } from './config.js';

// 存储上一次CPU使用情况，用于计算使用率
let lastCpuInfo: { idle: number; total: number } | null = null;

/**
 * 获取 CPU 使用率
 * 返回0-100之间的数值，表示CPU使用百分比
 */
function getCpuUsage(): number {
  try {
    // 获取CPU信息
    const cpus = os.cpus();

    // 如果没有CPU信息，返回0
    if (!cpus || cpus.length === 0) {
      return 0;
    }

    // 计算所有CPU核心的总时间和空闲时间
    let idle = 0;
    let total = 0;

    for (const cpu of cpus) {
      // 累加所有时间类型
      for (const type in cpu.times) {
        total += cpu.times[type as keyof typeof cpu.times];
      }
      // 记录空闲时间
      idle += cpu.times.idle;
    }

    // 如果没有上一次的数据，保存当前数据并返回估计值
    if (!lastCpuInfo) {
      lastCpuInfo = { idle, total };
      // 返回一个基于当前负载的估计值
      const loadavg = os.loadavg()[0]; // 1分钟平均负载
      const cpuCount = cpus.length;
      // 将负载转换为百分比（负载/CPU核心数）
      return Math.min(loadavg / cpuCount * 100, 100);
    }

    // 计算时间差
    const idleDiff = idle - lastCpuInfo.idle;
    const totalDiff = total - lastCpuInfo.total;

    // 更新上一次的数据
    lastCpuInfo = { idle, total };

    // 计算CPU使用率
    const cpuUsage = totalDiff > 0 ? 100 - (idleDiff / totalDiff * 100) : 0;

    // 确保返回值在0-100之间
    return Math.min(Math.max(cpuUsage, 0), 100);
  } catch (error) {
    logger.error('计算CPU使用率失败:', error);
    // 出错时返回一个基于系统负载的估计值
    try {
      const loadavg = os.loadavg()[0]; // 1分钟平均负载
      const cpuCount = os.cpus().length;
      return Math.min(loadavg / cpuCount * 100, 100);
    } catch (e) {
      // 如果连负载也无法获取，返回一个默认值
      return 50; // 默认50%
    }
  }
}

// 获取当前文件的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 导入配置
import { CONFIG } from './config.js';

// 用于服务端实现的全局配置（gRPC服务器端）
let serverConfig: MachineConfig = CONFIG;

/**
 * 设置 gRPC 服务器配置（由 MachineServer 调用）
 * @param config 配置对象
 */
export function setGrpcServerConfig(config: MachineConfig): void {
  serverConfig = config;
  logger.info('gRPC 服务器配置已更新:', {
    machineId: config.machineId,
    grpcPort: config.grpcPort,
  });
}

// 加载 proto 文件
const protoPath = path.resolve(__dirname, '../shared/protos/machine_service.proto');
const packageDefinition = protoLoader.loadSync(protoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const proto = grpc.loadPackageDefinition(packageDefinition).machine as any;

// 导出 grpcClient 实例引用，用于重新初始化
let grpcClientInstance: GrpcClient | null = null;

/**
 * gRPC 客户端类
 * 负责与管理端通信
 */
export class GrpcClient extends EventEmitter {
  private client: any;
  private call: any;
  private connected: boolean = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private config: MachineConfig;  // 实例级配置

  constructor(config: MachineConfig = CONFIG) {
    super();
    this.config = config;
    grpcClientInstance = this;
    this.initClient();

    // 监听浏览器服务的会话事件
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

    // 监听截图事件
    browserService.on('sessionScreenshot', (sessionId: string, screenshotUrl: string) => {
      this.sendSessionScreenshot(sessionId, screenshotUrl);
    });
  }

  /**
   * 初始化 gRPC 客户端
   */
  private initClient() {
    this.client = new proto.MachineService(
      this.config.managerHost,
      grpc.credentials.createInsecure()
    );
  }

  /**
   * 检查是否已连接到管理服务器
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * 向管理服务器注册机器
   */
  async register(): Promise<any> {
    try {
      // 获取磁盘空间
      const diskSpace = await this.getDiskSpace();

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
        ip_address: this.getLocalIpAddress(),
        grpc_port: this.config.grpcPort,
        proxy_port: this.config.proxyPort,
        max_sessions: this.config.maxSessions,
        system_info: systemInfo,
      };

      logger.info('注册机器:', request);

      this.client.Register(request, (err: any, response: any) => {
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
      // 如果获取磁盘空间失败，使用默认值继续注册
      return new Promise((resolve, reject) => {
        const systemInfo = {
          os: os.platform(),
          cpu: os.cpus()[0].model,
          memory: os.totalmem(),
          disk: 1000000000, // 默认1GB
        };

        const request = {
          machine_id: this.config.machineId,
          name: this.config.machineName,
          ip_address: this.getLocalIpAddress(),
          grpc_port: this.config.grpcPort,
          proxy_port: this.config.proxyPort,
          max_sessions: this.config.maxSessions,
          system_info: systemInfo,
        };

        logger.info('使用默认磁盘空间注册机器:', request);

        this.client.Register(request, (err: any, response: any) => {
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

  /**
   * 建立与管理服务器的长连接
   */
  async connect(): Promise<void> {
    try {
      await retry(
        async () => {
          return new Promise<void>((resolve, reject) => {
            try {
              // 如果已经连接，先取消当前连接
              if (this.connected && this.call) {
                logger.info('取消现有连接');
                try {
                  this.call.cancel();
                } catch (cancelError) {
                  logger.warn('取消连接时出错:', cancelError);
                }
                this.connected = false;
              }

              logger.info('尝试连接到管理端...');

              // 创建新的 gRPC 双向流
              this.call = this.client.Connect();

              // 设置数据处理器
              this.call.on('data', (message: any) => {
                try {
                  logger.debug(`收到管理端消息: ${JSON.stringify(message)}`);
                  this.handleManagerMessage(message);
                } catch (dataError) {
                  logger.error('处理管理端消息时出错:', dataError);
                }
              });

              // 设置结束处理器
              this.call.on('end', () => {
                logger.info('管理端关闭了连接');
                this.connected = false;

                // 停止心跳
                this.stopHeartbeat();

                this.emit('disconnected');
                // 不在这里直接重连，而是抛出一个错误，由上层的错误处理机制统一处理
                // 这样可以避免多个地方同时触发重连
                const error = new Error('UNAVAILABLE: Connection closed by server');
                this.emit('error', error);
              });

              // 设置错误处理器
              this.call.on('error', (error: any) => {
                logger.error('连接错误:', error);
                this.connected = false;

                // 停止心跳
                this.stopHeartbeat();

                this.emit('error', error);

                // 如果是连接断开错误，不让异常传播到外部
                if (error && error.message && error.message.includes('UNAVAILABLE: Connection dropped')) {
                  logger.warn('检测到 gRPC 连接断开错误，将在内部处理而不传播异常');

                  // 尝试重新连接
                  setTimeout(() => {
                    this.reconnect();
                  }, 5000); // 5 秒后重试

                  // 解决 Promise，但不传递错误
                  resolve();
                } else {
                  // 其他错误正常拒绝
                  reject(error);
                }
              });

              // 发送第一条消息以建立连接
              const heartbeat = {
                machine_id: this.config.machineId,
                heartbeat: {
                  timestamp: Date.now(),
                  cpu_usage: this.getCpuUsage(),
                  memory_usage: this.getMemoryUsage(),
                  active_sessions: browserService.getActiveSessions(),
                },
              };

              logger.info(`准备发送首次心跳消息: ${JSON.stringify(heartbeat)}`);

              // 发送消息
              const writeResult = this.call.write(heartbeat);
              logger.info(`使用 write 方法发送消息结果: ${writeResult}`);

              this.connected = true;
              this.emit('connected');

              // 启动心跳
              this.startHeartbeat();

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
    } catch (error: any) {
      logger.error('连接到管理端失败，已达到最大重试次数:', error);

      // 如果是连接断开错误，不抛出异常，而是尝试重新连接
      if (error.message && error.message.includes('UNAVAILABLE: Connection dropped')) {
        logger.warn('检测到 gRPC 连接断开错误，将在内部处理而不抛出异常');

        // 尝试重新连接
        setTimeout(() => {
          this.reconnect();
        }, 10000); // 10 秒后重试

        return; // 不抛出异常
      }

      // 其他错误正常抛出
      throw error;
    }
  }

  /**
   * 重新连接到管理服务器
   *
   * 注意：这个方法不应该直接处理重连逻辑，而是交给 MachineServer 的重连机制处理
   * 这里只负责执行单次连接尝试，不应该自己调度重连
   */
  async reconnect(): Promise<void> {
    try {
      // 检查机器端状态
      const machineServer = await import('./index.js').then(m => m.default);
      const machineState = machineServer.getState();

      // 如果机器端正在停止或已停止，不进行重连
      if (machineState === 'shutting_down' || machineState === 'stopped') {
        logger.warn(`机器端当前状态为 ${machineState}，取消重连`);
        return;
      }

      logger.info('尝试重新连接到管理端...');
      await this.connect();
      logger.info('重新连接成功');
    } catch (error) {
      // 只记录错误，不处理重连逻辑
      // 重连逻辑由 MachineServer 的 handleUncaughtException 方法统一处理
      logger.error('重新连接失败:', error);

      // 将错误抛出，由上层调用者处理
      throw error;
    }
  }

  /**
   * 启动心跳
   */
  private startHeartbeat() {
    // 如果已经有心跳定时器，先清除
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // 每 30 秒发送一次心跳
    this.heartbeatInterval = setInterval(async () => {
      // 如果连接断开，尝试重新连接
      if (!this.connected) {
        try {
          // 检查机器端状态
          const machineServer = await import('./index.js').then(m => m.default);
          const machineState = machineServer.getState();

          // 如果机器端正在停止或已停止，不进行重连
          if (machineState === 'shutting_down' || machineState === 'stopped') {
            logger.warn(`心跳检测到连接已断开，但机器端当前状态为 ${machineState}，取消重连`);
            return;
          }

          logger.warn('心跳检测到连接已断开');
          // 不直接重连，而是抛出错误，由上层的错误处理机制统一处理
          const error = new Error('UNAVAILABLE: Connection detected as closed by heartbeat');
          this.emit('error', error);
        } catch (stateError) {
          logger.error('心跳定时器中获取机器端状态失败:', stateError);
          // 即使无法获取状态，也抛出错误由上层处理
          const connectionError = new Error('UNAVAILABLE: Connection detected as closed by heartbeat');
          this.emit('error', connectionError);
        }
        return;
      }

      this.sendHeartbeat();
    }, 30000); // 30 秒

    logger.info('已启动心跳定时器，每 30 秒发送一次心跳');
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      logger.info('已停止心跳定时器');
    }
  }

  /**
   * 发送心跳
   */
  private async sendHeartbeat() {
    // 检查连接状态
    if (!this.connected || !this.call) {
      logger.warn('无法发送心跳，连接已断开或 call 对象为空');
      return;
    }

    try {
      // 构造心跳消息
      const heartbeat = {
        machine_id: this.config.machineId,
        heartbeat: {
          timestamp: Date.now(),
          cpu_usage: this.getCpuUsage(),
          memory_usage: this.getMemoryUsage(),
          active_sessions: browserService.getActiveSessions(),
        },
      };

      logger.debug(`心跳消息内容: ${JSON.stringify(heartbeat)}`);

      // 发送心跳消息
      const writeResult = this.call.write(heartbeat);
      if (writeResult === false) {
        logger.warn('发送心跳消息缓冲区已满，等待排空');
      } else {
        logger.debug('心跳消息发送成功');
      }
    } catch (error) {
      logger.error('发送心跳消息失败:', error);

      // 如果发送失败，标记连接已断开
      this.connected = false;
      this.emit('error', error);

      try {
        // 检查机器端状态
        const machineServer = await import('./index.js').then(m => m.default);
        const machineState = machineServer.getState();

        // 如果机器端正在停止或已停止，不进行重连
        if (machineState === 'shutting_down' || machineState === 'stopped') {
          logger.warn(`心跳发送失败，但机器端当前状态为 ${machineState}，取消重连`);
          return;
        }

        // 不直接重连，而是抛出错误，由上层的错误处理机制统一处理
        const reconnectError = new Error('UNAVAILABLE: Connection lost during heartbeat');
        this.emit('error', reconnectError);
      } catch (stateError) {
        logger.error('心跳发送失败后获取机器端状态失败:', stateError);
        // 即使无法获取状态，也抛出错误由上层处理
        const reconnectError = new Error('UNAVAILABLE: Connection lost during heartbeat');
        this.emit('error', reconnectError);
      }
    }
  }

  /**
   * 发送会话状态更新
   */
  sendSessionStatus(sessionId: string, status: string, duration: number): void {
    if (!this.connected || !this.call) {
      logger.warn(`无法发送会话状态更新，未连接到管理服务器`);
      return;
    }

    try {
      // 如果持续时间为0，尝试从浏览器服务获取会话信息并计算持续时间
      let finalDuration = duration;

      if (finalDuration === 0 && status === 'closed') {
        // 尝试从浏览器服务获取会话信息
        const sessions = browserService['sessions'];
        const session = sessions.get(sessionId);

        if (session && session.startTime) {
          const now = Date.now();
          finalDuration = Math.floor((now - session.startTime) / 1000);
          logger.info(`发送会话状态更新时计算持续时间 (sessionId: ${sessionId}): 开始时间=${new Date(session.startTime).toISOString()}, 当前时间=${new Date(now).toISOString()}, 持续时间=${finalDuration}秒`);
        }
      }

      // 构造会话状态消息
      const message = {
        machine_id: this.config.machineId,
        session_status: {
          session_id: sessionId,
          status: status,
          duration: finalDuration,
        },
      };

      // 发送消息
      const writeResult = this.call.write(message);
      if (writeResult === false) {
        logger.warn(`发送状态更新缓冲区已满，等待排空`);
      } else {
        logger.info(`已发送会话状态更新 (sessionId: ${sessionId}, status: ${status}, duration: ${finalDuration}s)`);
      }
    } catch (error) {
      logger.error(`发送会话状态更新失败:`, error);
    }
  }

  /**
   * 发送会话截图更新
   */
  sendSessionScreenshot(sessionId: string, screenshotUrl: string): void {
    if (!this.connected || !this.call) {
      logger.warn(`无法发送会话截图更新，未连接到管理服务器`);
      return;
    }

    try {
      // 构造会话截图消息
      const message = {
        machine_id: this.config.machineId,
        session_screenshot: {
          session_id: sessionId,
          screenshot_url: screenshotUrl,
        },
      };

      // 发送消息
      const writeResult = this.call.write(message);
      if (writeResult === false) {
        logger.warn(`发送截图更新缓冲区已满，等待排空`);
      } else {
        logger.info(`已发送会话截图更新 (sessionId: ${sessionId}, screenshotUrl: ${screenshotUrl})`);
      }
    } catch (error) {
      logger.error(`发送会话截图更新失败:`, error);
    }
  }

  /**
   * 处理来自管理服务器的消息
   */
  private async handleManagerMessage(message: any) {
    try {
      // 处理心跳请求
      if (message.heartbeat_request) {
        logger.debug(`收到心跳请求: ${JSON.stringify(message.heartbeat_request)}`);
        this.handleHeartbeatRequest(message.heartbeat_request);
        return;
      }

      // 处理关闭浏览器命令
      if (message.close_browser) {
        const { session_id } = message.close_browser;
        logger.info(`收到关闭浏览器命令 (sessionId: ${session_id})`);

        // 关闭浏览器
        browserService.closeBrowser(session_id)
          .then(success => {
            logger.info(`应管理端要求关闭浏览器${success ? '成功' : '失败'} (sessionId: ${session_id})`);
          })
          .catch(error => {
            logger.error(`应管理端要求关闭浏览器出错 (sessionId: ${session_id}):`, error);
          });
        return;
      }

      // 处理重启命令
      if (message.restart) {
        logger.info(`收到重启命令，准备重启机器服务`);

        // 先关闭所有浏览器实例
        try {
          // 关闭所有浏览器实例
          await browserService.closeAllBrowsers();
          logger.info(`已关闭所有浏览器实例`);

          // 引入机器服务并获取实例
          const { getMachineServer } = await import('./index.js');
          const machineServer = getMachineServer();

          if (!machineServer) {
            logger.error(`无法获取机器服务实例`);
            return;
          }

          // 重启机器服务
          logger.info(`开始重启机器服务...`);
          await machineServer.restart();
          logger.info(`机器服务重启指令已发送`);
        } catch (error) {
          logger.error(`重启机器服务失败:`, error);
        }
        return;
      }

      // 处理永久关闭命令
      if (message.shutdown && message.shutdown.permanent) {
        logger.info(`收到永久关闭命令，准备停止机器服务并退出`);

        try {
          // 先关闭所有浏览器实例
          await browserService.closeAllBrowsers();
          logger.info(`已关闭所有浏览器实例`);

          // 引入机器服务并获取实例
          const { getMachineServer } = await import('./index.js');
          const machineServer = getMachineServer();

          if (!machineServer) {
            logger.error(`无法获取机器服务实例`);
            return;
          }

          // 停止机器服务
          logger.info(`开始停止机器服务...`);
          await machineServer.stop();
          logger.info(`机器服务已停止，准备退出进程`);

          // 创建一个标记文件，表示这个机器已被删除
          try {
            const fs = await import('fs/promises');
            await fs.writeFile('.machine_deleted', 'true');
            logger.info(`已创建机器删除标记文件`);
          } catch (fsError) {
            logger.error(`创建机器删除标记文件失败:`, fsError);
          }

          // 延迟一秒后退出进程，给日志足够的时间写入
          setTimeout(() => {
            logger.info(`收到永久关闭命令，进程即将退出`);
            process.exit(0);
          }, 1000);
        } catch (error) {
          logger.error(`处理永久关闭命令失败:`, error);
        }
        return;
      }

      // 未知消息类型
      logger.warn(`收到未知类型的消息来自管理服务器: ${JSON.stringify(message)}`);

      // 尝试解析消息结构
      for (const key in message) {
        logger.debug(`消息字段 ${key}: ${typeof message[key]}, 值: ${JSON.stringify(message[key])}`);
      }
    } catch (error) {
      logger.error(`处理来自管理服务器的消息时出错:`, error);
    }
  }

  /**
   * 处理心跳请求
   */
  private handleHeartbeatRequest(_request: any) {
    try {
      // 构造心跳响应消息
      const response = {
        machine_id: this.config.machineId,
        heartbeat: {
          timestamp: Date.now(),
          cpu_usage: this.getCpuUsage(),
          memory_usage: this.getMemoryUsage(),
          active_sessions: browserService.getActiveSessions(),
        },
      };

      // 检查连接状态
      if (!this.connected) {
        logger.error(`无法发送心跳响应，未连接到管理服务器`);
        return;
      }

      // 检查 call 对象
      if (!this.call) {
        logger.error(`无法发送心跳响应，call 对象为空`);
        return;
      }

      // 发送响应
      const writeResult = this.call.write(response);
      if (writeResult === false) {
        logger.warn(`发送心跳响应缓冲区已满，等待排空`);
      } else {
        logger.debug(`心跳响应发送成功`);
      }
    } catch (error) {
      logger.error(`处理心跳请求失败:`, error);
    }
  }

  /**
   * 获取本地 IP 地址
   */
  private getLocalIpAddress(): string {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return '127.0.0.1';
  }

    /**
   * 获取 CPU 使用率
   */
  private getCpuUsage(): number {
    return getCpuUsage();
  }

  /**
   * 获取内存使用率
   */
  private getMemoryUsage(): number {
    return (os.totalmem() - os.freemem()) / os.totalmem() * 100;
  }

  /**
   * 获取磁盘空间
   * 返回磁盘总空间（字节）
   */
  private async getDiskSpace(): Promise<number> {
    try {
      // 使用不同的命令获取磁盘信息，取决于操作系统
      const execAsync = promisify(exec);
      let command = '';

      if (os.platform() === 'win32') {
        // Windows
        command = 'wmic logicaldisk get size';
      } else if (os.platform() === 'darwin') {
        // macOS
        command = 'df -k / | tail -1 | awk \'{ print $2 }\'';
      } else {
        // Linux 和其他类 Unix 系统
        command = 'df -k / | tail -1 | awk \'{ print $2 }\'';
      }

      const { stdout } = await execAsync(command);

      // 解析输出
      if (os.platform() === 'win32') {
        // Windows 输出格式不同，需要特殊处理
        const lines = stdout.trim().split('\n').filter(line => line.trim() !== 'Size');
        if (lines.length > 0) {
          const size = parseInt(lines[0].trim(), 10);
          return isNaN(size) ? 1000000000 : size;
        }
      } else {
        // macOS 和 Linux
        const size = parseInt(stdout.trim(), 10) * 1024; // 转换为字节
        return isNaN(size) ? 1000000000 : size;
      }

      // 如果无法解析，返回默认值
      return 1000000000; // 1GB
    } catch (error) {
      logger.error('获取磁盘空间失败:', error);
      return 1000000000; // 1GB
    }
  }
}

/**
 * gRPC 服务器实现
 */
const serviceImplementation = {
  // 启动浏览器实例
  LaunchBrowser: async (call: any, callback: any) => {
    try {
      const request = call.request;
      logger.info(`收到启动浏览器请求:`, request);

      const { session_id, options, user_id } = request;

      // 转换 proto 格式的 options 到 TypeScript 接口格式
      const convertedOptions: any = {};

      if (options.user_agent) {
        convertedOptions.userAgent = options.user_agent;
      }

      if (options.proxy) {
        convertedOptions.proxy = options.proxy;
      }

      if (options.viewport) {
        convertedOptions.viewport = {
          width: options.viewport.width,
          height: options.viewport.height,
        };
      }

      if (options.args && Array.isArray(options.args)) {
        convertedOptions.args = options.args;
      }

      if (options.storage_state_path) {
        convertedOptions.storageStatePath = options.storage_state_path;
      }

      if (options.storage_state) {
        // 转换 storage_state
        const storageState: any = {};

        if (options.storage_state.cookies && Array.isArray(options.storage_state.cookies)) {
          storageState.cookies = options.storage_state.cookies.map((cookie: any) => ({
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path,
            expires: cookie.expires,
            httpOnly: cookie.http_only,
            secure: cookie.secure,
            sameSite: cookie.same_site,
          }));
        }

        if (options.storage_state.origins && Array.isArray(options.storage_state.origins)) {
          storageState.origins = options.storage_state.origins.map((origin: any) => ({
            origin: origin.origin,
            localStorage: origin.localStorage,
          }));
        }

        convertedOptions.storageState = storageState;
      }

      // 新增：shared_user_data 参数
      if (options.shared_user_data !== undefined) {
        convertedOptions.sharedUserData = options.shared_user_data;
      }

      // 新增：timezone 参数
      if (options.timezone) {
        convertedOptions.timezone = options.timezone;
      }

      // 保留向后兼容：如果客户端传递了 user_data_dir（已废弃）
      if (options.user_data_dir) {
        convertedOptions.userDataDir = options.user_data_dir;
        logger.warn(`user_data_dir 参数已废弃，客户端传递了自定义路径: ${options.user_data_dir}`);
      }

      // 传递 userId 用于计算 userDataDir
      if (user_id) {
        convertedOptions.userId = user_id;
      }

      logger.info(`转换后的浏览器选项:`, convertedOptions);

      // 调用浏览器服务启动浏览器
      try {
        const result = await browserService.launchBrowser(session_id, convertedOptions);
        logger.info(`浏览器启动成功 (sessionId: ${session_id}, port: ${result.port})`);

        // 构造响应
        callback(null, {
          session_id,
          success: true,
          browser_ws_endpoint: result.browserWSEndpoint,
          port: result.port,
          error: '',
        });
      } catch (error: any) {
        logger.error(`启动浏览器失败 (sessionId: ${session_id}):`, error);

        // 业务逻辑错误（如 SHARED_SESSION_EXISTS）应该返回给客户端
        // 使用 gRPC 错误回调，让管理端正确处理
        callback({
          code: grpc.status.FAILED_PRECONDITION,
          message: error.message || '启动浏览器失败',
        });
      }
    } catch (error: any) {
      logger.error('处理启动浏览器请求失败:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: error.message || '处理启动浏览器请求失败',
      });
    }
  },

  // 关闭浏览器实例
  CloseBrowser: async (call: any, callback: any) => {
    try {
      const request = call.request;
      logger.info(`收到关闭浏览器请求:`, request);

      const { session_id } = request;

      // 调用浏览器服务关闭浏览器
      try {
        const success = await browserService.closeBrowser(session_id);
        logger.info(`浏览器关闭${success ? '成功' : '失败'} (sessionId: ${session_id})`);

        // 构造响应
        callback(null, {
          session_id,
          status: success ? 'closed' : 'error',
          error: success ? '' : '关闭浏览器失败',
        });
      } catch (error: any) {
        logger.error(`关闭浏览器失败 (sessionId: ${session_id}):`, error);
        callback(null, {
          session_id,
          status: 'error',
          error: error.message || '关闭浏览器失败',
        });
      }
    } catch (error: any) {
      logger.error('处理关闭浏览器请求失败:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: error.message || '处理关闭浏览器请求失败',
      });
    }
  },

  // 获取机器状态
  GetMachineStatus: async (call: any, callback: any) => {
    try {
      const request = call.request;
      logger.info(`收到获取机器状态请求:`, request);

      // 获取CPU使用率
      const cpuUsage = getCpuUsage();

      // 构造响应
      callback(null, {
        machine_id: serverConfig.machineId,
        online: true,
        cpu_usage: cpuUsage,
        memory_usage: (os.totalmem() - os.freemem()) / os.totalmem() * 100,
        active_sessions: browserService.getActiveSessions(),
        max_sessions: serverConfig.maxSessions,
        timestamp: Date.now(),
      });
    } catch (error: any) {
      logger.error('处理获取机器状态请求失败:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: error.message || '处理获取机器状态请求失败',
      });
    }
  },

  // 注册机器
  Register: async (call: any, callback: any) => {
    try {
      const request = call.request;
      logger.info('收到机器注册请求:', request);

      // 这个方法通常不会被调用，因为机器是客户端，不是服务器
      // 但为了完整性，我们还是实现它

      callback(null, {
        success: true,
        message: '注册成功'
      });
    } catch (error: any) {
      logger.error('处理机器注册请求失败:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: error.message || '处理机器注册请求失败',
      });
    }
  },

  // 双向流通信
  Connect: (call: any) => {
    try {
      logger.info('收到新的 Connect 请求');

      // 这个方法通常不会被调用，因为机器是客户端，不是服务器
      // 但为了完整性，我们还是实现它

      call.on('data', (message: any) => {
        logger.info('收到消息:', message);

        // 发送响应
        call.write({
          heartbeat_request: {
            timestamp: Date.now()
          }
        });
      });

      call.on('end', () => {
        logger.info('连接结束');
        call.end();
      });

      call.on('error', (error: any) => {
        logger.error('连接错误:', error);
        call.end();
      });
    } catch (error) {
      logger.error('处理 Connect 请求失败:', error);
      call.end();
    }
  },
};



// 创建 gRPC 客户端实例
export const grpcClient = new GrpcClient();

/**
 * 启动 gRPC 客户端
 */
export async function startGrpcClient(): Promise<void> {
  try {
    // 注册机器
    await grpcClient.register();

    // 建立长连接
    await grpcClient.connect();

    return;
  } catch (error: any) {
    logger.error('启动 gRPC 客户端失败:', error);

    // 检查是否是 gRPC 连接错误
    const isGrpcConnectionError = error.message && (
      error.message.includes('UNAVAILABLE: Connection dropped') ||
      error.message.includes('UNAVAILABLE: No connection established') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('UNAVAILABLE')
    );

    if (isGrpcConnectionError) {
      logger.warn('检测到 gRPC 连接错误，将在内部处理而不抛出异常');

      // 尝试重新连接
      setTimeout(async () => {
        try {
          // 检查机器端状态
          const machineServer = await import('./index.js').then(m => m.default);
          const machineState = machineServer.getState();

          // 如果机器端正在停止或已停止，不进行重连
          if (machineState === 'shutting_down' || machineState === 'stopped') {
            logger.warn(`机器端当前状态为 ${machineState}，取消 gRPC 客户端重连`);
            return;
          }

          logger.info('尝试重新启动 gRPC 客户端...');
          await startGrpcClient();
          logger.info('gRPC 客户端重新启动成功');
        } catch (reconnectError) {
          logger.error('gRPC 客户端重新启动失败:', reconnectError);

          // 如果重连失败，再次尝试，除非机器端正在停止
          try {
            const machineServer = await import('./index.js').then(m => m.default);
            const machineState = machineServer.getState();

            if (machineState !== 'shutting_down' && machineState !== 'stopped') {
              setTimeout(() => startGrpcClient(), 10000); // 10 秒后重试
            }
          } catch (stateError) {
            logger.error('获取机器端状态失败:', stateError);
            // 即使无法获取状态，也尝试重连
            setTimeout(() => startGrpcClient(), 10000); // 10 秒后重试
          }
        }
      }, 10000); // 10 秒后重试

      return; // 不抛出异常
    }

    // 其他错误正常抛出
    throw error;
  }
}

/**
 * 启动 gRPC 服务器
 */
export function startGrpcServer(port: number = 50052): void {
  logger.info(`开始启动 gRPC 服务器，端口: ${port}`);
  const server = new grpc.Server();
  server.addService(proto.MachineService.service, serviceImplementation);

  // 使用新的 API 启动服务器
  server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (bindErr) => {
    if (bindErr) {
      logger.error('绑定 gRPC 服务器失败:', bindErr);
      return;
    }

    // 启动服务器
    // server.start() 已经被废弃，不需要显式调用
    logger.info(`gRPC 服务器已启动并绑定到端口 ${port}`);
  });
}

export { CONFIG };

export default {
  grpcClient,
  startGrpcClient,
  startGrpcServer,
  CONFIG,
};
