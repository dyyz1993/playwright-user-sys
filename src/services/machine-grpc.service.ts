import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import { logger } from '@shared/utils/logger.js';
import { MachineModel } from '../models/machine.model.js';
import { SessionModel } from '../models/session.model.js';
import { UserModel } from '../models/user.model.js';
import { SessionStatus } from '@shared/types/index.js';
import { createWebhookEvent } from '../utils/webhook.js';
import { WebhookEventType } from '@shared/types/index.js';

// 获取当前文件的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

/**
 * 机器连接管理器
 * 负责管理与机器的连接
 */
class MachineConnectionManager extends EventEmitter {
  private connections: Map<string, any> = new Map();
  private pendingRequests: Map<string, { resolve: Function; reject: Function; timer: NodeJS.Timeout }> = new Map();
  private clients: Map<string, any> = new Map();

  constructor() {
    super();
  }

  /**
   * 添加机器连接
   */
  addConnection(machineId: string, call: any): void {
    // 如果已经有连接，先移除
    if (this.connections.has(machineId)) {
      this.removeConnection(machineId);
    }

    // 添加新连接
    this.connections.set(machineId, call);
    logger.info(`机器连接已添加: ${machineId}`);

    // 设置数据处理器
    call.on('data', (message: any) => {
      try {
        this.handleMachineMessage(machineId, message);
      } catch (error) {
        logger.error(`处理机器消息时出错 (${machineId}):`, error);
      }
    });

    // 设置结束处理器
    call.on('end', () => {
      logger.info(`机器连接已结束: ${machineId}`);
      this.removeConnection(machineId);
    });

    // 设置错误处理器
    call.on('error', (error: any) => {
      logger.error(`机器连接错误 (${machineId}):`, error);
      this.removeConnection(machineId);
    });

    // 更新机器状态为在线
    MachineModel.update(machineId, { status: 'online' })
      .then(() => {
        logger.info(`机器状态已更新为在线: ${machineId}`);
      })
      .catch((error) => {
        logger.error(`更新机器状态失败 (${machineId}):`, error);
      });

    // 发送心跳请求
    this.sendHeartbeatRequest(machineId);
  }

  /**
   * 移除机器连接
   */
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
      // 更新数据库中的机器状态为离线
      await MachineModel.update(machineId, { status: 'offline' });
      logger.info(`机器状态已更新为离线: ${machineId}`);

      // 更新内存存储中的机器状态
      try {
        const { memoryStore } = await import('./memory-store.service.js');
        memoryStore.markMachineOffline(machineId);
        logger.info(`内存存储中的机器状态已更新为离线: ${machineId}`);
      } catch (memoryError) {
        logger.error(`更新内存存储中的机器状态失败 (${machineId}):`, memoryError);
      }
    } catch (error) {
      logger.error(`更新机器状态失败 (${machineId}):`, error);
    }
  }

  /**
   * 检查机器是否已连接
   */
  isConnected(machineId: string): boolean {
    return this.connections.has(machineId);
  }

  /**
   * 获取所有已连接的机器 ID
   */
  getAllConnectedMachines(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * 获取所有活跃连接的机器 ID
   * 与 getAllConnectedMachines 相同，但命名更符合内存存储服务的使用方式
   */
  getActiveConnections(): string[] {
    return this.getAllConnectedMachines();
  }

  /**
   * 获取连接
   */
  getConnection(machineId: string) {
    return this.connections.get(machineId);
  }

  /**
   * 获取客户端
   */
  async getClient(machineId: string): Promise<any> {
    // 如果已经有客户端，直接返回
    if (this.clients.has(machineId)) {
      return this.clients.get(machineId);
    }

    try {
      // 获取机器信息
      const machine = await MachineModel.findById(machineId);
      if (!machine) {
        logger.error(`找不到机器: ${machineId}`);
        return null;
      }

      // 创建 gRPC 客户端
      const address = `${machine.ip}:${machine.grpcPort || 50052}`;
      logger.info(`创建到机器 ${machineId} 的 gRPC 客户端 (${address})`);

      // 创建带超时和重试的客户端选项
      const options = {
        'grpc.keepalive_time_ms': 30000, // 30 秒发送一次心跳
        'grpc.keepalive_timeout_ms': 10000, // 10 秒超时
        'grpc.keepalive_permit_without_calls': 1, // 允许在没有调用的情况下发送心跳
        'grpc.http2.min_time_between_pings_ms': 15000, // 两次心跳之间的最小时间
        'grpc.http2.max_pings_without_data': 0, // 允许无限次没有数据的 ping
        'grpc.max_reconnect_backoff_ms': 10000, // 最大重连间隔为 10 秒
      };

      const client = new proto.MachineService(address, grpc.credentials.createInsecure(), options);

      // 存储客户端
      this.clients.set(machineId, client);

      return client;
    } catch (error) {
      logger.error(`创建 gRPC 客户端失败 (${machineId}):`, error);
      return null;
    }
  }

  /**
   * 处理来自机器的消息
   */
  private async handleMachineMessage(machineId: string, message: any): Promise<void> {
    try {
      logger.debug(`收到机器消息 (${machineId}): ${JSON.stringify(message)}`);

      // 处理心跳消息
      if (message.heartbeat) {
        await this.handleHeartbeat(machineId, message.heartbeat);
      }
      // 处理会话状态更新
      else if (message.session_status) {
        await this.handleSessionStatus(machineId, message.session_status);
      }
      // 处理会话截图更新
      else if (message.session_screenshot) {
        await this.handleSessionScreenshot(machineId, message.session_screenshot);
      }
      // 未知消息类型
      else {
        logger.warn(`收到未知类型的消息 (${machineId}): ${JSON.stringify(message)}`);
      }
    } catch (error) {
      logger.error(`处理机器消息时出错 (${machineId}):`, error);
    }
  }

  /**
   * 处理心跳消息
   */
  private async handleHeartbeat(machineId: string, heartbeat: any): Promise<void> {
    try {
      logger.debug(`收到心跳 (${machineId}): ${JSON.stringify(heartbeat)}`);

      // 导入内存存储服务
      const { memoryStore } = await import('./memory-store.service.js');

      // 获取机器信息
      const machine = await MachineModel.findById(machineId);

      logger.debug(`findById 返回: machine=${machine ? '存在' : 'null'}`);

      if (machine) {
        logger.debug(`machine.grpcPort=${machine.grpcPort}`);

        // 更新内存中的机器状态
        memoryStore.updateMachineStatus({
          machine_id: machineId,
          name: machine.hostname,
          ip: machine.ip,
          grpc_port: machine.grpcPort || 50052, // 默认值
          cpu_usage: heartbeat.cpu_usage,
          memory_usage: heartbeat.memory_usage,
          disk_space: heartbeat.disk_space || 0,
          active_sessions: heartbeat.active_sessions,
          max_sessions: machine.maxInstances,
          last_heartbeat: new Date(),
        });
      } else {
        logger.warn(`机器 ${machineId} 在数据库中不存在，跳过内存更新`);
      }

      // 同时更新数据库中的机器状态（作为备份）
      await MachineModel.update(machineId, {
        cpu_usage: heartbeat.cpu_usage,
        memory_usage: heartbeat.memory_usage,
        instance_count: heartbeat.active_sessions,
        status: 'online',
      });

      logger.debug(`机器状态已更新 (${machineId})`);
    } catch (error) {
      logger.error(`处理心跳时出错 (${machineId}):`, error);
    }
  }

  /**
   * 处理会话截图更新
   */
  private async handleSessionScreenshot(machineId: string, screenshot: any): Promise<void> {
    try {
      const { session_id, screenshot_url } = screenshot;
      logger.info(`收到会话截图更新 (${machineId}, ${session_id}): ${screenshot_url}`);

      // 获取会话信息
      const session = await SessionModel.findById(session_id);
      if (!session) {
        logger.warn(`会话不存在 (${session_id})`);
        return;
      }

      // 更新会话截图 URL
      await SessionModel.update(session_id, {
        screenshot_url,
      });

      logger.info(`会话截图已更新 (${session_id}): ${screenshot_url}`);
    } catch (error) {
      logger.error(`处理会话截图更新时出错 (${machineId}, ${screenshot.session_id}):`, error);
    }
  }

  /**
   * 处理会话状态更新
   */
  private async handleSessionStatus(machineId: string, status: any): Promise<void> {
    try {
      const { session_id, status: sessionStatus, duration: reportedDuration } = status;
      // 使用可变变量存储持续时间，以便后续可以修改
      let duration = reportedDuration;
      logger.info(
        `收到会话状态更新 (${machineId}, ${session_id}): ${sessionStatus}, 持续时间: ${duration}秒, 数据源: 机器端`
      );

      // 获取会话信息
      const session = await SessionModel.findById(session_id);
      if (!session) {
        logger.warn(`会话不存在 (${session_id})`);
        return;
      }

      // 根据状态更新会话记录
      // 如果持续时间为0，尝试根据开始时间计算
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
          // 用户连接到浏览器实例，开始计费
          const now = new Date();

          // 如果会话已有开始时间，不覆盖
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

          // 触发 Webhook 事件
          await createWebhookEvent(session.user_id, WebhookEventType.SESSION_CONNECTED, {
            session_id,
            connected_at: new Date(),
          });

          logger.info(`用户已连接到会话，开始计费 (${session_id})`);
          break;

        case 'disconnected':
          // 使用 markDisconnected 方法更新会话状态并扣费
          // 这个方法会处理：
          // 1. 更新数据库（状态、持续时间、消耗点数）
          // 2. 扣除用户积分
          // 3. 生成积分历史记录
          await SessionModel.markDisconnected(session_id, duration);
          logger.info(`机器端报告用户已断开会话连接，已调用 markDisconnected 完成扣费 (${session_id})`);
          break;

        case 'active':
          // 计算已使用的点数（每分钟1点）
          // 即使会话只运行了几秒钟，也至少消耗 1 点
          const minutes = duration > 0 ? Math.max(1, Math.ceil(duration / 60)) : 0;

          // 更新会话持续时间和消耗点数
          // 如果已有值，只更新当前值大于已有值的情况
          if (session.duration > 0 || session.credits_used > 0) {
            // 取最大值，确保不会减少
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
            // 如果没有值，直接更新
            await SessionModel.update(session_id, {
              duration,
              credits_used: minutes,
            });

            logger.info(`会话活动更新 (${session_id}): 持续时间=${duration}秒, 消耗点数=${minutes}点`);
          }

          const user = await UserModel.findById(session.user_id);

          // 检查用户点数是否足够
          if (user && user.credits < minutes) {
            logger.warn(`用户点数不足 (${session.user_id}), 剩余: ${user.credits}, 已使用: ${minutes}点`);

            // 通知机器端关闭浏览器实例
            this.sendCloseBrowserCommand(machineId, session_id);

            // 触发点数不足事件
            await createWebhookEvent(session.user_id, WebhookEventType.CREDITS_DEPLETED, {
              session_id,
              credits_remaining: user.credits,
              credits_used: minutes,
            });
          } else if (user && user.credits < minutes + 5) {
            // 点数即将不足，发送警告
            await createWebhookEvent(session.user_id, WebhookEventType.CREDITS_LOW, {
              session_id,
              credits_remaining: user.credits,
              credits_used: minutes,
            });
          }

          logger.info(`会话活动更新 (${session_id}): 连接时长 ${duration}秒, 已使用 ${minutes}点`);
          break;

        case 'closed':
          // 使用 markDisconnected 方法更新会话状态并扣费
          // 这个方法会处理：
          // 1. 更新数据库（状态、持续时间、消耗点数）
          // 2. 扣除用户积分
          // 3. 生成积分历史记录
          await SessionModel.markDisconnected(session_id, duration);

          // 如果会话已分配机器，减少机器的实例计数
          await MachineModel.decrementInstanceCount(machineId);

          // 触发 Webhook 事件
          await createWebhookEvent(session.user_id, WebhookEventType.SESSION_DISCONNECTED, {
            session_id,
            duration,
            disconnected_at: new Date(),
          });

          logger.info(`浏览器实例已关闭，已调用 markDisconnected 完成扣费 (${session_id})`);
          break;

        case 'error':
          // 计算消耗的点数（每分钟1点）
          // 即使会话只运行了几秒钟，也至少消耗 1 点
          const errorMinutes = duration > 0 ? Math.max(1, Math.ceil(duration / 60)) : 0;

          // 检查会话是否已经有持续时间和消耗点数
          if (session.duration > 0 || session.credits_used > 0) {
            // 如果已经有持续时间和消耗点数，只更新状态和结束时间
            await SessionModel.update(session_id, {
              status: SessionStatus.ERROR,
              end_time: new Date(),
            });
            logger.info(
              `会话已有持续时间和消耗点数，只更新状态和结束时间 (${session_id}): 持续时间=${session.duration}秒, 消耗点数=${session.credits_used}点`
            );
          } else {
            // 如果没有持续时间和消耗点数，更新所有字段
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

          // 如果会话已分配机器，减少机器的实例计数
          await MachineModel.decrementInstanceCount(machineId);

          // // 只有在会话没有持续时间和消耗点数时才扣除点数
          // if (!(session.duration > 0 || session.credits_used > 0)) {
          //   try {
          //     await UserModel.deductCredits(session.user_id, errorMinutes);
          //     logger.info(`已扣除用户 ${session.user_id} 的点数: ${errorMinutes} 点 (${session_id})`);
          //   } catch (error) {
          //     logger.error('扣除点数失败:', error);
          //   }
          // } else {
          //   logger.info(`会话已有持续时间和消耗点数，不重复扣除点数 (${session_id}): 持续时间=${session.duration}秒, 消耗点数=${session.credits_used}点`);
          // }

          // 触发 Webhook 事件
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

  /**
   * 发送关闭浏览器命令
   */
  sendCloseBrowserCommand(machineId: string, sessionId: string): void {
    try {
      const call = this.connections.get(machineId);
      if (!call) {
        logger.warn(`无法发送关闭浏览器命令，机器未连接: ${machineId}`);
        return;
      }

      // 构造关闭浏览器命令
      const message = {
        close_browser: {
          session_id: sessionId,
        },
      };

      // 发送命令
      call.write(message);
      logger.info(`已发送关闭浏览器命令 (${machineId}, ${sessionId})`);
    } catch (error) {
      logger.error(`发送关闭浏览器命令失败 (${machineId}, ${sessionId}):`, error);
    }
  }

  /**
   * 发送重启命令
   */
  sendRestartCommand(machineId: string): void {
    const call = this.connections.get(machineId);
    if (!call) {
      logger.warn(`无法发送重启命令，机器未连接: ${machineId}`);
      return;
    }

    try {
      // 构造重启命令消息
      const message = {
        restart: {
          timestamp: Date.now(),
        },
      };

      // 发送消息
      call.write(message);
      logger.info(`重启命令已发送 (${machineId})`);
    } catch (error) {
      logger.error(`发送重启命令失败 (${machineId}):`, error);
    }
  }

  /**
   * 发送关闭命令
   * 用于通知机器端永久关闭，不要尝试重新连接
   */
  sendShutdownCommand(machineId: string): void {
    const call = this.connections.get(machineId);
    if (!call) {
      logger.warn(`无法发送关闭命令，机器未连接: ${machineId}`);
      return;
    }

    try {
      // 构造关闭命令消息
      const message = {
        shutdown: {
          timestamp: Date.now(),
          permanent: true,
        },
      };

      // 发送消息
      call.write(message);
      logger.info(`永久关闭命令已发送 (${machineId})`);
    } catch (error) {
      logger.error(`发送永久关闭命令失败 (${machineId}):`, error);
    }
  }

  /**
   * 发送心跳请求
   */
  sendHeartbeatRequest(machineId: string): void {
    const call = this.connections.get(machineId);
    if (!call) {
      logger.warn(`无法发送心跳请求，机器未连接: ${machineId}`);
      return;
    }

    try {
      // 构造心跳请求消息
      const message = {
        heartbeat_request: {
          timestamp: Date.now(),
        },
      };

      // 发送消息
      call.write(message);
      logger.debug(`心跳请求已发送 (${machineId})`);
    } catch (error) {
      logger.error(`发送心跳请求失败 (${machineId}):`, error);
    }
  }

  /**
   * 启动浏览器实例
   */
  async launchBrowser(machineId: string, sessionId: string, options: any): Promise<any> {
    return new Promise(async (resolve, reject) => {
      try {
        // 检查机器是否连接
        if (!this.isConnected(machineId)) {
          reject(new Error(`机器未连接: ${machineId}`));
          return;
        }

        // 获取机器对应的 gRPC 客户端
        const client = await this.getClient(machineId);
        if (!client) {
          reject(new Error(`无法获取机器的 gRPC 客户端: ${machineId}`));
          return;
        }

        logger.info(`向机器 ${machineId} 发送启动浏览器请求 (sessionId: ${sessionId})`);

        // 转换 TypeScript 格式的 options 到 proto 格式
        const protoOptions: any = {};

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
          // 转换 storage_state
          const storageState: any = {};

          if (options.storageState.cookies && Array.isArray(options.storageState.cookies)) {
            storageState.cookies = options.storageState.cookies.map((cookie: any) => ({
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
            storageState.origins = options.storageState.origins.map((origin: any) => ({
              origin: origin.origin,
              localStorage: origin.localStorage,
            }));
          }

          protoOptions.storage_state = storageState;
        }

        // 新增：sharedUserData 参数
        if (options.sharedUserData !== undefined) {
          protoOptions.shared_user_data = options.sharedUserData;
        }

        // 新增：timezone 参数
        if (options.timezone) {
          protoOptions.timezone = options.timezone;
        }

        // 保留向后兼容：如果客户端直接传递了 userDataDir（已废弃）
        if (options.userDataDir) {
          protoOptions.user_data_dir = options.userDataDir;
          logger.warn(`userDataDir 参数已废弃，客户端传递了自定义路径: ${options.userDataDir}`);
        }

        logger.info(`转换后的 proto 浏览器选项:`, protoOptions);

        // 构造请求参数
        const request = {
          session_id: sessionId,
          options: protoOptions,
          user_id: options.userId || 0, // 传递 userId 用于计算 userDataDir
        };

        // 创建 metadata 并设置机器 ID
        const metadata = new grpc.Metadata();
        metadata.set('machine_id', machineId);

        // 使用 LaunchBrowser RPC 方法
        client.LaunchBrowser(request, metadata, (error: any, response: any) => {
          if (error) {
            logger.error(`启动浏览器失败 (${machineId}, ${sessionId}):`, error);
            reject(error);
            return;
          }

          logger.info(`浏览器启动成功 (${machineId}, ${sessionId}, port: ${response.port})`);
          resolve(response);
        });
      } catch (error) {
        logger.error(`启动浏览器过程中出错 (${machineId}, ${sessionId}):`, error);
        reject(error);
      }
    });
  }

  /**
   * 关闭浏览器实例
   */
  async closeBrowser(machineId: string, sessionId: string): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      try {
        // 检查机器是否连接
        if (!this.isConnected(machineId)) {
          reject(new Error(`机器未连接: ${machineId}`));
          return;
        }

        // 获取机器对应的 gRPC 客户端
        const client = await this.getClient(machineId);
        if (!client) {
          reject(new Error(`无法获取机器的 gRPC 客户端: ${machineId}`));
          return;
        }

        logger.info(`向机器 ${machineId} 发送关闭浏览器请求 (sessionId: ${sessionId})`);

        // 构造请求参数
        const request = {
          session_id: sessionId,
        };

        // 创建 metadata 并设置机器 ID
        const metadata = new grpc.Metadata();
        metadata.set('machine_id', machineId);

        // 使用 CloseBrowser RPC 方法
        client.CloseBrowser(request, metadata, (error: any, response: any) => {
          if (error) {
            logger.error(`关闭浏览器失败 (${machineId}, ${sessionId}):`, error);
            reject(error);
            return;
          }

          const success = response.status === 'closed';
          logger.info(`浏览器关闭${success ? '成功' : '失败'} (${machineId}, ${sessionId})`);
          resolve(success);
        });
      } catch (error) {
        logger.error(`关闭浏览器过程中出错 (${machineId}, ${sessionId}):`, error);
        reject(error);
      }
    });
  }

  /**
   * 获取机器状态
   */
  async getMachineStatus(machineId: string): Promise<any> {
    return new Promise(async (resolve, reject) => {
      try {
        // 检查机器是否连接
        if (!this.isConnected(machineId)) {
          resolve({
            machine_id: machineId,
            online: false,
            cpu_usage: 0,
            memory_usage: 0,
            active_sessions: 0,
            max_sessions: 0,
            timestamp: Date.now(),
          });
          return;
        }

        // 获取机器对应的 gRPC 客户端
        const client = await this.getClient(machineId);
        if (!client) {
          reject(new Error(`无法获取机器的 gRPC 客户端: ${machineId}`));
          return;
        }

        logger.info(`向机器 ${machineId} 发送获取状态请求`);

        // 构造请求参数
        const request = {
          machine_id: machineId,
        };

        // 创建 metadata 并设置机器 ID
        const metadata = new grpc.Metadata();
        metadata.set('machine_id', machineId);

        // 使用 GetMachineStatus RPC 方法
        client.GetMachineStatus(request, metadata, (error: any, response: any) => {
          if (error) {
            logger.error(`获取机器状态失败 (${machineId}):`, error);
            reject(error);
            return;
          }

          logger.info(`成功获取机器状态 (${machineId})`);
          resolve(response);
        });
      } catch (error) {
        logger.error(`获取机器状态过程中出错 (${machineId}):`, error);
        reject(error);
      }
    });
  }
}

// gRPC 服务实现
const serviceImplementation = {
  // 机器注册
  Register: async (call: any, callback: any) => {
    try {
      const request = call.request;
      logger.info('收到机器注册请求:', request);

      // 检查机器是否已存在
      const existingMachine = await MachineModel.findById(request.machine_id);

      if (existingMachine) {
        // 更新机器信息
        await MachineModel.update(request.machine_id, {
          hostname: request.name,
          ip: request.ip_address,
          grpcPort: request.grpc_port, // 注意：这里的 grpcPort 将在 MachineModel.update 中被转换为 grpc_port
          proxyPort: request.proxy_port, // 注意：这里的 proxyPort 将在 MachineModel.update 中被转换为 proxy_port
          max_instances: request.max_sessions,
          status: 'online',
        });

        logger.info(
          `机器更新数据: ${JSON.stringify({
            hostname: request.name,
            ip: request.ip_address,
            grpcPort: request.grpc_port,
            proxyPort: request.proxy_port,
            max_instances: request.max_sessions,
          })}`
        );

        logger.info(`机器已更新: ${request.machine_id}`);
      } else {
        // 创建新机器记录
        await MachineModel.register({
          id: request.machine_id,
          hostname: request.name,
          ip: request.ip_address,
          grpcPort: request.grpc_port, // 注意：这里的 grpcPort 将在 MachineModel.register 中被转换为 grpc_port
          proxyPort: request.proxy_port, // 注意：这里的 proxyPort 将在 MachineModel.register 中被转换为 proxy_port
          max_instances: request.max_sessions,
        });

        logger.info(
          `新机器数据: ${JSON.stringify({
            id: request.machine_id,
            hostname: request.name,
            ip: request.ip_address,
            grpcPort: request.grpc_port,
            proxyPort: request.proxy_port,
            max_instances: request.max_sessions,
          })}`
        );

        logger.info(`机器已创建: ${request.machine_id}`);
      }

      // 修复：注册后立即更新内存状态
      const { memoryStore } = await import('./memory-store.service.js');
      memoryStore.updateMachineStatus({
        machine_id: request.machine_id,
        name: request.name,
        ip: request.ip_address,
        grpc_port: request.grpc_port,
        cpu_usage: 0,
        memory_usage: 0,
        disk_space: 0,
        active_sessions: 0,
        max_sessions: request.max_sessions || 10,
        last_heartbeat: new Date(),
      });
      logger.info(`内存状态已更新: ${request.machine_id}, grpc_port=${request.grpc_port}`);

      callback(null, { success: true, message: '注册成功' });
    } catch (error: any) {
      logger.error('机器注册失败:', error);
      callback({ code: grpc.status.INTERNAL, message: error.message });
    }
  },

  // 双向流通信
  Connect: (call: any) => {
    try {
      logger.info('收到新的 Connect 请求');

      // 测试 call 对象的类型和方法
      logger.debug(`call 对象类型: ${typeof call}`);
      try {
        logger.debug(`call 对象方法: ${Object.getOwnPropertyNames(Object.getPrototypeOf(call)).join(', ')}`);
      } catch (error) {
        logger.error(`获取 call 对象方法失败:`, error);
      }

      // 等待第一条消息以获取机器 ID
      const dataHandler = (message: any) => {
        logger.info('收到第一条消息:', message);

        try {
          logger.debug(`消息类型: ${typeof message}, 字段: ${Object.keys(message).join(', ')}`);
        } catch (error) {
          logger.error('解析消息字段失败:', error);
        }

        const machineId = message.machine_id;
        logger.info(`提取的机器 ID: ${machineId}`);

        if (!machineId) {
          logger.warn('收到的消息中缺少机器 ID');
          try {
            call.write({ error: { message: '缺少机器 ID' } });
            logger.info('已发送错误响应');
          } catch (writeError) {
            logger.error('发送错误响应失败:', writeError);
          }
          call.end();
          return;
        }

        // 移除此监听器，后续消息由连接管理器处理
        logger.info(`移除数据监听器，转由连接管理器处理 (machineId: ${machineId})`);
        call.removeListener('data', dataHandler);

        // 添加连接
        logger.info(`添加机器连接: ${machineId}`);
        connectionManager.addConnection(machineId, call);
      };

      // 添加数据监听器
      call.on('data', dataHandler);

      // 处理错误
      call.on('error', (error: any) => {
        logger.error('gRPC 连接错误:', error);
      });

      // 处理结束
      call.on('end', () => {
        logger.info('gRPC 连接结束');
      });
    } catch (error: any) {
      logger.error('处理 Connect 请求失败:', error);
      call.end();
    }
  },

  // 启动浏览器实例
  LaunchBrowser: async (call: any, callback: any) => {
    try {
      const request = call.request;
      logger.info(`收到启动浏览器请求:`, request);

      const { session_id, options } = request;

      // 从 metadata 中获取机器 ID
      const machineId = call.metadata?.get('machine_id')?.[0] || '';

      if (!machineId) {
        logger.error(`启动浏览器请求缺少机器 ID`);
        callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: '缺少机器 ID',
        });
        return;
      }

      // 检查机器是否连接
      if (!connectionManager.isConnected(machineId)) {
        logger.error(`机器未连接: ${machineId}`);
        callback({
          code: grpc.status.FAILED_PRECONDITION,
          message: `机器未连接: ${machineId}`,
        });
        return;
      }

      // 将请求转发到机器端
      try {
        const result = await connectionManager.launchBrowser(machineId, session_id, options);
        logger.info(`浏览器启动成功 (${machineId}, ${session_id})`);
        callback(null, result);
      } catch (error: any) {
        logger.error(`启动浏览器失败 (${machineId}, ${session_id}):`, error);
        callback({
          code: grpc.status.INTERNAL,
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

      // 从 metadata 中获取机器 ID
      const machineId = call.metadata?.get('machine_id')?.[0] || '';

      if (!machineId) {
        logger.error(`关闭浏览器请求缺少机器 ID`);
        callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: '缺少机器 ID',
        });
        return;
      }

      // 检查机器是否连接
      if (!connectionManager.isConnected(machineId)) {
        logger.error(`机器未连接: ${machineId}`);
        callback({
          code: grpc.status.FAILED_PRECONDITION,
          message: `机器未连接: ${machineId}`,
        });
        return;
      }

      // 将请求转发到机器端
      try {
        const success = await connectionManager.closeBrowser(machineId, session_id);
        logger.info(`浏览器关闭${success ? '成功' : '失败'} (${machineId}, ${session_id})`);
        callback(null, {
          session_id,
          status: success ? 'closed' : 'error',
          error: success ? '' : '关闭浏览器失败',
        });
      } catch (error: any) {
        logger.error(`关闭浏览器失败 (${machineId}, ${session_id}):`, error);
        callback({
          code: grpc.status.INTERNAL,
          message: error.message || '关闭浏览器失败',
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

      const { machine_id } = request;

      if (!machine_id) {
        logger.error(`获取机器状态请求缺少机器 ID`);
        callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: '缺少机器 ID',
        });
        return;
      }

      // 检查机器是否连接
      if (!connectionManager.isConnected(machine_id)) {
        logger.error(`机器未连接: ${machine_id}`);
        callback(null, {
          machine_id,
          online: false,
          cpu_usage: 0,
          memory_usage: 0,
          active_sessions: 0,
          max_sessions: 0,
          timestamp: Date.now(),
        });
        return;
      }

      // 获取机器状态
      try {
        // 尝试使用心跳请求获取状态
        const heartbeat = await connectionManager.getMachineStatus(machine_id);

        // 获取机器信息
        const machine = await MachineModel.findById(machine_id);

        logger.info(`成功获取机器状态 (${machine_id})`);
        callback(null, {
          machine_id,
          online: true,
          cpu_usage: heartbeat.cpu_usage,
          memory_usage: heartbeat.memory_usage,
          active_sessions: heartbeat.active_sessions,
          max_sessions: machine?.maxInstances || 0,
          timestamp: heartbeat.timestamp || Date.now(),
        });
      } catch (error: any) {
        logger.error(`获取机器状态失败 (${machine_id}):`, error);

        // 即使心跳请求失败，也返回机器在线状态
        callback(null, {
          machine_id,
          online: true, // 机器连接存在，所以还是在线的
          cpu_usage: 0,
          memory_usage: 0,
          active_sessions: 0,
          max_sessions: 0,
          timestamp: Date.now(),
          error: error.message || '获取机器状态失败',
        });
      }
    } catch (error: any) {
      logger.error('处理获取机器状态请求失败:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: error.message || '处理获取机器状态请求失败',
      });
    }
  },
};

// 创建连接管理器实例
export const connectionManager = new MachineConnectionManager();

/**
 * 启动 gRPC 服务器
 */
export function startGrpcServer(port: number = 50051): void {
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

export default {
  connectionManager,
  startGrpcServer,
};
