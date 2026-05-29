import { logger } from '@shared/utils/logger.js';
import type { MachineStatus } from '@shared/types/index.js';
import type { MachineRealTimeStatus } from './types.js';

export class MachineStore {
  private machines: Map<string, MachineRealTimeStatus> = new Map();

  get(machineId: string): MachineRealTimeStatus | undefined {
    return this.machines.get(machineId);
  }

  set(machineId: string, status: MachineRealTimeStatus): void {
    this.machines.set(machineId, status);
  }

  delete(machineId: string): boolean {
    return this.machines.delete(machineId);
  }

  getAll(): MachineRealTimeStatus[] {
    return Array.from(this.machines.values());
  }

  getOnline(): MachineRealTimeStatus[] {
    return this.getAll().filter((m) => m.online);
  }

  getStats(): { total: number; online: number; offline: number } {
    const machines = this.getAll();
    const online = machines.filter((m) => m.online).length;
    return {
      total: machines.length,
      online,
      offline: machines.length - online,
    };
  }

  entries(): IterableIterator<[string, MachineRealTimeStatus]> {
    return this.machines.entries();
  }

  values(): IterableIterator<MachineRealTimeStatus> {
    return this.machines.values();
  }

  get size(): number {
    return this.machines.size;
  }

  has(machineId: string): boolean {
    return this.machines.has(machineId);
  }

  clear(): void {
    this.machines.clear();
  }

  cleanupOfflineMachines(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): number {
    const now = new Date();
    const cutoffTime = new Date(now.getTime() - maxAgeMs);
    let removedCount = 0;

    for (const [machineId, machine] of this.machines.entries()) {
      if (!machine.online && machine.last_heartbeat < cutoffTime) {
        this.machines.delete(machineId);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.info(`清理了 ${removedCount} 台长时间离线的机器`);
    }

    return removedCount;
  }

  createFromStatus(status: MachineStatus): MachineRealTimeStatus {
    return {
      machine_id: status.machine_id,
      name: status.name,
      ip: status.ip,
      grpc_port: status.grpc_port,
      proxy_port: status.proxy_port || 8080,
      online: true,
      cpu_usage: status.cpu_usage,
      memory_usage: status.memory_usage,
      disk_space: status.disk_space || 0,
      active_sessions: status.active_sessions,
      max_sessions: status.max_sessions,
      last_heartbeat: status.last_heartbeat || new Date(),
    };
  }
}
