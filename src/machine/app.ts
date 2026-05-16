import { CONFIG, MachineConfig, loadConfig } from './config.js';
import { logger } from '@shared/utils/logger.js';
import { browserService } from './browser.service.js';
import { ProxyService } from './proxy.service.js';
import { startGrpcServer, GrpcClient, setGrpcServerConfig } from './grpc.service.js';
import { startHealthServer, stopHealthServer } from './health.service.js';
import retry from 'async-retry';
import { fileService } from './services/file.service.js';

// 机器端状态枚举
export enum MachineState {
  /* eslint-disable no-unused-vars */
  STARTING = 'starting',
  RUNNING = 'running',
  RECONNECTING = 'reconnecting',
  SHUTTING_DOWN = 'shutting_down',
  STOPPED = 'stopped',
  /* eslint-enable no-unused-vars */
}

/**
 * 机器端应用类
 * 负责管理机器服务的生命周期
 */
export class MachineServer {
  // 当前机器端状态
  private state: MachineState = MachineState.STOPPED;

  // 重连定时器
  private reconnectTimer: NodeJS.Timeout | null = null;

  // 冷却定时器
  private cooldownTimer: NodeJS.Timeout | null = null;

  // 是否处于冷却期
  private inCooldown: boolean = false;

  // 冷却期时间（毫秒）
  private readonly COOLDOWN_PERIOD: number = 60000; // 1分钟

  // 配置
  private config: MachineConfig;

  // 代理服务实例（每个 MachineServer 拥有独立的实例）
  private proxyService: ProxyService;

  // gRPC 客户端实例（每个 MachineServer 拥有独立的实例）
  private grpcClient: GrpcClient;

  /**
   * 构造函数
   * @param customConfig 可选的自定义配置，用于测试环境
   */
  constructor(customConfig?: Partial<MachineConfig>) {
    if (customConfig) {
      // 如果提供了自定义配置，合并默认配置
      const defaultConfig = loadConfig();
      this.config = { ...defaultConfig, ...customConfig };
      logger.info('使用自定义配置初始化 MachineServer');
    } else {
      // 否则使用默认配置（从环境变量加载）
      this.config = CONFIG;
      logger.info('使用环境变量配置初始化 MachineServer');
    }

    // 创建独立的代理服务实例
    this.proxyService = new ProxyService(this.config);

    // 创建独立的 gRPC 客户端实例（使用此实例的配置）
    // 注意：GrpcClient 现在需要传入配置参数
    this.grpcClient = new GrpcClient(this.config);
  }

  /**
   * 获取当前状态
   */
  getState(): MachineState {
    return this.state;
  }

  /**
   * 设置状态
   */
  private setState(newState: MachineState): void {
    const oldState = this.state;
    this.state = newState;
    logger.info(`机器端状态变更: ${oldState} -> ${newState}`);
  }

  /**
   * 启动机器端
   */
  async start() {
    try {
      // 设置状态为启动中
      this.setState(MachineState.STARTING);

      logger.info('机器端配置:', {
        machineId: this.config.machineId,
        machineName: this.config.machineName,
        managerHost: this.config.managerHost,
        proxyPort: this.config.proxyPort,
        grpcPort: this.config.grpcPort,
      });

      // 设置 gRPC 服务器配置
      setGrpcServerConfig(this.config);

      // 启动 gRPC 服务器
      startGrpcServer(this.config.grpcPort);

      // 启动代理服务器（使用此实例的代理服务）
      this.proxyService.start();

      // 清理上次运行残留的过期临时文件（1小时前创建的）
      try {
        const { fileService } = await import('./services/file.service.js');
        const cleaned = await fileService.cleanupExpiredFiles(60 * 60 * 1000);
        if (cleaned > 0) {
          logger.info(`启动时清理了 ${cleaned} 个残留临时文件目录`);
        }
      } catch (cleanupError) {
        logger.warn('启动时清理临时文件失败:', cleanupError);
      }

      // 注册机器（使用此实例的 gRPC 客户端）
      await this.grpcClient.register();

      // 连接到管理端（使用此实例的 gRPC 客户端）
      await this.grpcClient.connect();

      // 处理进程退出
      this.setupProcessHandlers();

      // 启动健康检查 HTTP 服务
      startHealthServer();

      // 启动定时清理过期临时文件（每小时清理一次）
      this.startFileCleanup();

      // 设置状态为运行中
      this.setState(MachineState.RUNNING);

      logger.info('机器端启动完成');
    } catch (error) {
      logger.error('启动机器端失败:', error);
      this.setState(MachineState.STOPPED);
      process.exit(1);
    }
  }

  /**
   * 重启机器端
   */
  async restart() {
    try {
      logger.info('正在重启机器端...');

      // 先停止所有服务
      await this.stop();

      // 等待一小段时间
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // 重新启动服务
      await this.start();

      logger.info('机器端重启完成');
    } catch (error) {
      logger.error('重启机器端失败:', error);
      // 即使出错，也尝试重新启动
      this.setState(MachineState.STOPPED);
      this.start().catch((startError) => {
        logger.error('重启后启动机器端失败:', startError);
      });
    }
  }

  /**
   * 停止机器端
   */
  async stop() {
    try {
      // 如果已经在停止中或已停止，直接返回
      if (this.state === MachineState.SHUTTING_DOWN || this.state === MachineState.STOPPED) {
        logger.info(`机器端已经在${this.state === MachineState.SHUTTING_DOWN ? '停止中' : '停止状态'}，不需要重复停止`);
        return;
      }

      // 设置状态为停止中
      this.setState(MachineState.SHUTTING_DOWN);

      logger.info('正在停止机器端...');

      // 清除重连定时器
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      // 清除冷却定时器
      if (this.cooldownTimer) {
        clearTimeout(this.cooldownTimer);
        this.cooldownTimer = null;
      }

      // 清除文件清理定时器
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = null;
      }

      // 关闭所有浏览器实例
      await browserService.closeAllBrowsers();

      // 停止健康检查 HTTP 服务
      await stopHealthServer();

      // 停止代理服务器（使用此实例的代理服务）
      await this.proxyService.stop();

      // 停止 gRPC 服务器
      // 注意：我们没有实现 gRPC 服务器的停止方法
      // 在进程退出时，gRPC 服务器会自动关闭

      // 设置状态为已停止
      this.setState(MachineState.STOPPED);

      logger.info('机器端已停止');
    } catch (error) {
      logger.error('停止机器端失败:', error);
      // 即使出错，也设置状态为已停止
      this.setState(MachineState.STOPPED);
      process.exit(1);
    }
  }

  /**
   * 设置进程处理程序
   */
  private setupProcessHandlers() {
    // 处理进程退出
    process.on('SIGINT', this.handleExit.bind(this));
    process.on('SIGTERM', this.handleExit.bind(this));
    process.on('uncaughtException', this.handleUncaughtException.bind(this));
    process.on('unhandledRejection', this.handleUnhandledRejection.bind(this));
  }

  private cleanupInterval: NodeJS.Timeout | null = null;

  private startFileCleanup(): void {
    this.cleanupInterval = setInterval(
      async () => {
        try {
          const count = await fileService.cleanupExpiredFiles();
          if (count > 0) {
            logger.info(`已清理 ${count} 个过期临时文件目录`);
          }
        } catch (error) {
          logger.warn('定时清理临时文件失败:', error);
        }
      },
      60 * 60 * 1000
    );
  }

  /**
   * 处理进程退出
   */
  private async handleExit() {
    logger.info('收到退出信号，正在优雅地关闭...');
    await this.stop();
    process.exit(0);
  }

  /**
   * 处理未捕获的异常
   */
  private handleUncaughtException(error: Error) {
    logger.error('未捕获的异常:', error);

    // 如果机器端正在停止或已停止，不处理连接错误
    if (this.state === MachineState.SHUTTING_DOWN || this.state === MachineState.STOPPED) {
      logger.warn(`机器端当前状态为 ${this.state}，忽略连接错误`);
      return;
    }

    // 检查是否是 gRPC 连接错误
    const isGrpcConnectionError =
      error.message &&
      (error.message.includes('UNAVAILABLE: Connection dropped') ||
        error.message.includes('UNAVAILABLE: No connection established') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('UNAVAILABLE'));

    if (isGrpcConnectionError) {
      logger.warn('检测到 gRPC 连接错误，将尝试重新连接而不是停止服务');

      // 设置状态为重连中
      this.setState(MachineState.RECONNECTING);

      // 清除现有的重连定时器
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      // 如果在冷却期，不立即重连
      if (this.inCooldown) {
        logger.warn('当前处于重连冷却期，等待冷却期结束后自动重试');
        return;
      }

      // 使用 async-retry 库进行重试
      this.reconnectTimer = setTimeout(async () => {
        try {
          // 再次检查状态，确保没有在停止中
          if (this.state === MachineState.SHUTTING_DOWN || this.state === MachineState.STOPPED) {
            logger.warn('机器端正在停止或已停止，取消重连');
            return;
          }

          await retry(
            async (bail: (_error: Error) => void, attemptNumber: number) => {
              try {
                // 再次检查状态
                if (this.state === MachineState.SHUTTING_DOWN || this.state === MachineState.STOPPED) {
                  logger.warn('机器端正在停止或已停止，取消重连');
                  bail(new Error('取消重连'));
                  return;
                }

                logger.info(`执行第 ${attemptNumber} 次重连尝试...`);
                await this.grpcClient.connect();
                logger.info('重新连接成功');

                // 重连成功，设置状态为运行中
                this.setState(MachineState.RUNNING);
              } catch (err) {
                logger.error(`第 ${attemptNumber} 次重连失败:`, err);
                throw err; // 抛出错误，触发重试
              }
            },
            {
              retries: 10, // 最大重试次数
              factor: 2, // 指数退避因子
              minTimeout: 1000, // 最小重试间隔（毫秒）
              maxTimeout: 60000, // 最大重试间隔（毫秒）
              randomize: true, // 添加随机性，避免集体重试
              onRetry: (err: Error, attempt: number) => {
                logger.warn(`重连失败，将进行第 ${attempt} 次重试:`, err);
              },
            }
          ).catch((retryError: Error) => {
            logger.error('重连失败，已达到最大重试次数:', retryError);

            // 进入冷却期
            this.inCooldown = true;
            logger.warn(`进入重连冷却期，${this.COOLDOWN_PERIOD / 1000} 秒后将再次尝试`);

            // 设置冷却定时器
            this.cooldownTimer = setTimeout(() => {
              logger.info('冷却期结束，将再次尝试重连');
              this.inCooldown = false;

              // 冷却期结束后再次尝试重连
              setImmediate(() => this.handleUncaughtException(error));
            }, this.COOLDOWN_PERIOD);
          });
        } catch (outerError) {
          logger.error('重连过程中发生外部错误:', outerError);
        } finally {
          this.reconnectTimer = null;
        }
      }, 1000); // 等待 1 秒后开始重连

      return; // 不停止服务，不退出进程
    }

    // 对于其他严重错误，停止服务并退出
    this.stop().then(() => process.exit(1));
  }

  /**
   * 处理未处理的拒绝
   */
  private handleUnhandledRejection(reason: unknown) {
    logger.error('未处理的拒绝:', reason);

    // 如果是 Error 对象，交给 handleUncaughtException 处理
    if (reason instanceof Error) {
      this.handleUncaughtException(reason);
      return;
    }

    // 如果机器端正在停止或已停止，不处理连接错误
    if (this.state === MachineState.SHUTTING_DOWN || this.state === MachineState.STOPPED) {
      logger.warn(`机器端当前状态为 ${this.state}，忽略连接错误`);
      return;
    }

    // 检查是否是 gRPC 连接错误
    const isGrpcConnectionError =
      reason &&
      typeof reason === 'object' &&
      'message' in reason &&
      typeof (reason as { message: string }).message === 'string' &&
      ((reason as { message: string }).message.includes('UNAVAILABLE: Connection dropped') ||
        (reason as { message: string }).message.includes('UNAVAILABLE: No connection established') ||
        (reason as { message: string }).message.includes('ECONNREFUSED') ||
        (reason as { message: string }).message.includes('UNAVAILABLE'));

    if (isGrpcConnectionError) {
      // 创建一个 Error 对象并交给 handleUncaughtException 处理
      const error = new Error((reason as { message: string }).message || 'gRPC connection error');
      this.handleUncaughtException(error);
    }
  }
}

// 保存服务实例以便于优雅关闭
let machineServer: MachineServer;

/**
 * 启动机器端服务
 */
export async function startMachine() {
  machineServer = new MachineServer();
  await machineServer.start();
}

/**
 * 停止机器端服务
 */
export async function stopMachine() {
  if (machineServer) {
    await machineServer.stop();
  }
}

/**
 * 获取机器服务实例
 */
export function getMachineServer(): MachineServer | undefined {
  return machineServer;
}

export default MachineServer;
