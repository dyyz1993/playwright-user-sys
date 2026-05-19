import * as grpc from '@grpc/grpc-js';
import { logger } from '@shared/utils/logger.js';
import { MachineModel } from '../../models/machine.model.js';
import type {
  MachineMessage,
  ManagerMessage,
  MachineProtoPackage,
  MachineServiceClient,
} from '../../shared/types/grpc.js';

export class ConnectionPool {
  private connections: Map<string, grpc.ServerDuplexStream<MachineMessage, ManagerMessage>> = new Map();
  private clients: Map<string, MachineServiceClient> = new Map();
  private proto: MachineProtoPackage | null = null;

  setProto(proto: MachineProtoPackage): void {
    this.proto = proto;
  }

  add(machineId: string, call: grpc.ServerDuplexStream<MachineMessage, ManagerMessage>): void {
    if (this.connections.has(machineId)) {
      this.remove(machineId);
    }
    this.connections.set(machineId, call);
    logger.info(`机器连接已添加: ${machineId}`);
  }

  async remove(machineId: string): Promise<void> {
    const call = this.connections.get(machineId);
    if (call) {
      try {
        call.end();
      } catch (error: unknown) {
        logger.error(`结束机器连接时出错 (${machineId}):`, error);
      }
    }

    this.connections.delete(machineId);

    const client = this.clients.get(machineId);
    if (client) {
      try {
        (client as unknown as { close: () => void }).close();
      } catch (error: unknown) {
        logger.error(`关闭机器 gRPC 客户端时出错 (${machineId}):`, error);
      }
      this.clients.delete(machineId);
    }

    logger.info(`机器连接已移除: ${machineId}`);

    try {
      await MachineModel.update(machineId, { status: 'offline' });
      logger.info(`机器状态已更新为离线: ${machineId}`);

      try {
        const { memoryStore } = await import('../memory-store.service.js');
        memoryStore.markMachineOffline(machineId);
        logger.info(`内存存储中的机器状态已更新为离线: ${machineId}`);
      } catch (memoryError: unknown) {
        logger.error(`更新内存存储中的机器状态失败 (${machineId}):`, memoryError);
      }
    } catch (error: unknown) {
      logger.error(`更新机器状态失败 (${machineId}):`, error);
    }
  }

  has(machineId: string): boolean {
    return this.connections.has(machineId);
  }

  get(machineId: string): grpc.ServerDuplexStream<MachineMessage, ManagerMessage> | undefined {
    return this.connections.get(machineId);
  }

  getAllIds(): string[] {
    return Array.from(this.connections.keys());
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
    } catch (error: unknown) {
      logger.error(`创建 gRPC 客户端失败 (${machineId}):`, error);
      return null;
    }
  }

  clear(): void {
    for (const [, call] of this.connections) {
      call.end();
    }
    this.connections.clear();
    this.clients.clear();
  }
}
