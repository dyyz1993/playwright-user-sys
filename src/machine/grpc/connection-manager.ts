import * as grpc from '@grpc/grpc-js';
import { logger } from '@shared/utils/logger.js';
import { browserService } from '../browser.service.js';
import { setGrpcConnected } from '../health.service.js';
import { getCpuUsage, getMemoryUsage, getDiskUsage } from './system-info.js';
import type { ManagerMessage, HeartbeatRequest } from '../../shared/types/grpc.js';

export class ConnectionManager {
  private call: grpc.ClientDuplexStream<any, ManagerMessage> | null = null;
  private connected: boolean = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private machineId: string;
  private onDisconnected: () => void;
  private onReconnectNeeded: () => void;

  constructor(machineId: string, onDisconnected: () => void, onReconnectNeeded: () => void) {
    this.machineId = machineId;
    this.onDisconnected = onDisconnected;
    this.onReconnectNeeded = onReconnectNeeded;
  }

  setCall(call: grpc.ClientDuplexStream<any, ManagerMessage>): void {
    this.call = call;
  }

  setConnected(value: boolean): void {
    this.connected = value;
    setGrpcConnected(value);
  }

  isConnected(): boolean {
    return this.connected;
  }

  getCall(): grpc.ClientDuplexStream<any, ManagerMessage> | null {
    return this.call;
  }

  setupStreamHandlers(call: grpc.ClientDuplexStream<any, ManagerMessage>): void {
    this.call = call;

    call.on('data', (message: ManagerMessage) => {
      try {
        logger.debug(`收到管理端消息: ${JSON.stringify(message)}`);
        this.handleManagerMessage(message);
      } catch (dataError) {
        logger.error('处理管理端消息时出错:', dataError);
      }
    });

    call.on('end', () => {
      logger.info('管理端关闭了连接');
      this.connected = false;
      setGrpcConnected(false);
      this.stopHeartbeat();
      this.onDisconnected();
      const error = new Error('UNAVAILABLE: Connection closed by server');
      this.onReconnectNeeded();
    });

    call.on('error', (error: unknown) => {
      logger.error('连接错误:', error);
      this.connected = false;
      setGrpcConnected(false);
      this.stopHeartbeat();

      if (
        error &&
        typeof error === 'object' &&
        'message' in error &&
        typeof error.message === 'string' &&
        error.message.includes('UNAVAILABLE: Connection dropped')
      ) {
        logger.warn('检测到 gRPC 连接断开错误，将在内部处理而不传播异常');
      }

      this.onReconnectNeeded();
    });
  }

  async sendInitialHeartbeat(): Promise<void> {
    const diskUsage = await getDiskUsage();

    const heartbeat = {
      machine_id: this.machineId,
      heartbeat: {
        timestamp: Date.now(),
        cpu_usage: getCpuUsage(),
        memory_usage: getMemoryUsage(),
        disk_usage: diskUsage,
        active_sessions: browserService.getActiveSessions(),
      },
    };

    logger.info(`准备发送首次心跳消息: ${JSON.stringify(heartbeat)}`);

    if (this.call) {
      const writeResult = this.call.write(heartbeat);
      logger.info(`使用 write 方法发送消息结果: ${writeResult}`);
    }
  }

  startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(async () => {
      if (!this.connected) {
        try {
          const { getMachineServer } = await import('../index.js');
          const machineServer = getMachineServer();
          const machineState = machineServer?.getState();

          if (!machineServer || machineState === 'shutting_down' || machineState === 'stopped') {
            logger.warn(`心跳检测到连接已断开，但机器端当前状态为 ${machineState || 'undefined'}，取消重连`);
            return;
          }

          logger.warn('心跳检测到连接已断开');
          this.onReconnectNeeded();
        } catch (stateError) {
          logger.error('心跳定时器中获取机器端状态失败:', stateError);
          this.onReconnectNeeded();
        }
        return;
      }

      this.sendHeartbeat();
    }, 30000);

    logger.info('已启动心跳定时器，每 30 秒发送一次心跳');
  }

  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      logger.info('已停止心跳定时器');
    }
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.connected || !this.call) {
      logger.warn('无法发送心跳，连接已断开或 call 对象为空');
      return;
    }

    try {
      const diskUsage = await getDiskUsage();

      const heartbeat = {
        machine_id: this.machineId,
        heartbeat: {
          timestamp: Date.now(),
          cpu_usage: getCpuUsage(),
          memory_usage: getMemoryUsage(),
          disk_usage: diskUsage,
          active_sessions: browserService.getActiveSessions(),
        },
      };

      logger.debug(`心跳消息内容: ${JSON.stringify(heartbeat)}`);

      const writeResult = this.call.write(heartbeat);
      if (writeResult === false) {
        logger.warn('发送心跳消息缓冲区已满，等待排空');
      } else {
        logger.debug('心跳消息发送成功');
      }
    } catch (error) {
      logger.error('发送心跳消息失败:', error);

      this.connected = false;
      setGrpcConnected(false);

      try {
        const { getMachineServer } = await import('../index.js');
        const machineServer = getMachineServer();
        const machineState = machineServer?.getState();

        if (!machineServer || machineState === 'shutting_down' || machineState === 'stopped') {
          logger.warn(`心跳发送失败，但机器端当前状态为 ${machineState || 'undefined'}，取消重连`);
          return;
        }

        this.onReconnectNeeded();
      } catch (stateError) {
        logger.error('心跳发送失败后获取机器端状态失败:', stateError);
        this.onReconnectNeeded();
      }
    }
  }

  private async handleManagerMessage(message: ManagerMessage): Promise<void> {
    try {
      if (message.heartbeat_request) {
        logger.debug(`收到心跳请求: ${JSON.stringify(message.heartbeat_request)}`);
        this.handleHeartbeatRequest(message.heartbeat_request as HeartbeatRequest);
        return;
      }

      if (message.close_browser) {
        const { session_id } = message.close_browser;
        logger.info(`收到关闭浏览器命令 (sessionId: ${session_id})`);

        browserService
          .closeBrowser(session_id)
          .then((success) => {
            logger.info(`应管理端要求关闭浏览器${success ? '成功' : '失败'} (sessionId: ${session_id})`);
          })
          .catch((error) => {
            logger.error(`应管理端要求关闭浏览器出错 (sessionId: ${session_id}):`, error);
          });
        return;
      }

      if (message.restart) {
        logger.info(`收到重启命令，准备重启机器服务`);

        try {
          await browserService.closeAllBrowsers();
          logger.info(`已关闭所有浏览器实例`);

          const { getMachineServer } = await import('../index.js');
          const machineServer = getMachineServer();

          if (!machineServer) {
            logger.error(`无法获取机器服务实例`);
            return;
          }

          logger.info(`开始重启机器服务...`);
          await machineServer.restart();
          logger.info(`机器服务重启指令已发送`);
        } catch (error) {
          logger.error(`重启机器服务失败:`, error);
        }
        return;
      }

      if (message.shutdown && typeof message.shutdown === 'object' && 'permanent' in message.shutdown) {
        logger.info(`收到永久关闭命令，准备停止机器服务并退出`);

        try {
          await browserService.closeAllBrowsers();
          logger.info(`已关闭所有浏览器实例`);

          const { getMachineServer } = await import('../index.js');
          const machineServer = getMachineServer();

          if (!machineServer) {
            logger.error(`无法获取机器服务实例`);
            return;
          }

          logger.info(`开始停止机器服务...`);
          await machineServer.stop();
          logger.info(`机器服务已停止，准备退出进程`);

          try {
            const fs = await import('fs/promises');
            await fs.writeFile('.machine_deleted', 'true');
            logger.info(`已创建机器删除标记文件`);
          } catch (fsError) {
            logger.error(`创建机器删除标记文件失败:`, fsError);
          }

          setTimeout(() => {
            logger.info(`收到永久关闭命令，进程即将退出`);
            process.exit(0);
          }, 1000);
        } catch (error) {
          logger.error(`处理永久关闭命令失败:`, error);
        }
        return;
      }

      if (message.request_screenshot) {
        const { session_id } = message.request_screenshot;
        logger.info(`收到截图请求 (sessionId: ${session_id})`);
        browserService
          .takeScreenshot(session_id)
          .then((url) => {
            logger.info(`截图完成 (sessionId: ${session_id}): ${url}`);
          })
          .catch((error) => {
            logger.error(`截图失败 (sessionId: ${session_id}):`, error);
          });
        return;
      }

      logger.warn(`收到未知类型的消息来自管理服务器: ${JSON.stringify(message)}`);

      for (const key in message) {
        logger.debug(
          `消息字段 ${key}: ${typeof (message as Record<string, unknown>)[key]}, 值: ${JSON.stringify((message as Record<string, unknown>)[key])}`
        );
      }
    } catch (error) {
      logger.error(`处理来自管理服务器的消息时出错:`, error);
    }
  }

  private handleHeartbeatRequest(_request: HeartbeatRequest): void {
    try {
      const response = {
        machine_id: this.machineId,
        heartbeat: {
          timestamp: Date.now(),
          cpu_usage: getCpuUsage(),
          memory_usage: getMemoryUsage(),
          active_sessions: browserService.getActiveSessions(),
        },
      };

      if (!this.connected) {
        logger.error(`无法发送心跳响应，未连接到管理服务器`);
        return;
      }

      if (!this.call) {
        logger.error(`无法发送心跳响应，call 对象为空`);
        return;
      }

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
}
