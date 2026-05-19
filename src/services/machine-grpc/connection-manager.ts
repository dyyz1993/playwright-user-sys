import { EventEmitter } from 'events';
import { logger } from '@shared/utils/logger.js';
import { MachineModel } from '../../models/machine.model.js';
import type { MachineMessage, ManagerMessage, MachineProtoPackage } from '../../shared/types/grpc.js';
import { ConnectionPool } from './connection-pool.js';
import { ConnectionCommands } from './connection-commands.js';
import { ConnectionMessageHandler } from './connection-message-handler.js';

export class MachineConnectionManager extends EventEmitter {
  private pool: ConnectionPool = new ConnectionPool();
  private commands: ConnectionCommands;
  private messageHandler: ConnectionMessageHandler;

  constructor() {
    super();
    this.commands = new ConnectionCommands(this.pool);
    this.messageHandler = new ConnectionMessageHandler(this.commands);
  }

  setProto(proto: MachineProtoPackage): void {
    this.pool.setProto(proto);
  }

  addConnection(
    machineId: string,
    call: import('@grpc/grpc-js').ServerDuplexStream<MachineMessage, ManagerMessage>
  ): void {
    this.pool.add(machineId, call);

    call.on('data', (message: MachineMessage) => {
      try {
        this.messageHandler.handle(machineId, message);
      } catch (error: unknown) {
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
      .catch((error: unknown) => {
        logger.error(`更新机器状态失败 (${machineId}):`, error);
      });

    this.sendHeartbeatRequest(machineId);
  }

  async removeConnection(machineId: string): Promise<void> {
    await this.pool.remove(machineId);
  }

  isConnected(machineId: string): boolean {
    return this.pool.has(machineId);
  }

  getAllConnectedMachines(): string[] {
    return this.pool.getAllIds();
  }

  getActiveConnections(): string[] {
    return this.getAllConnectedMachines();
  }

  getConnection(machineId: string) {
    return this.pool.get(machineId);
  }

  async getClient(machineId: string) {
    return this.pool.getClient(machineId);
  }

  sendCloseBrowserCommand(machineId: string, sessionId: string): void {
    this.commands.sendCloseBrowserCommand(machineId, sessionId);
  }

  sendRestartCommand(machineId: string): void {
    this.commands.sendRestartCommand(machineId);
  }

  sendShutdownCommand(machineId: string): void {
    this.commands.sendShutdownCommand(machineId);
  }

  sendHeartbeatRequest(machineId: string): void {
    this.commands.sendHeartbeatRequest(machineId);
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
  ) {
    return this.commands.launchBrowser(machineId, sessionId, options);
  }

  async closeBrowser(machineId: string, sessionId: string) {
    return this.commands.closeBrowser(machineId, sessionId);
  }

  async requestScreenshot(machineId: string, sessionId: string) {
    return this.commands.requestScreenshot(machineId, sessionId);
  }

  async getMachineStatus(machineId: string) {
    return this.commands.getMachineStatus(machineId);
  }

  async transferFile(machineId: string, sessionId: string, filename: string, data: Buffer) {
    return this.commands.transferFile(machineId, sessionId, filename, data);
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
  ) {
    return this.commands.downloadAndInjectFile(machineId, params);
  }

  async injectFile(
    machineId: string,
    params: {
      sessionId: string;
      machineFilePath: string;
      selector: string;
      frameSelector?: string;
    }
  ) {
    return this.commands.injectFile(machineId, params);
  }

  shutdown(): void {
    this.pool.clear();
  }
}
