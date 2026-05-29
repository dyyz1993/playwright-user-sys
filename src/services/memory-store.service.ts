import { logger } from '@shared/utils/logger.js';
import { EventEmitter } from 'events';
import { SessionStatus } from '@shared/types/index.js';
import type { MachineStatus } from '@shared/types/index.js';
import { MachineStore } from './memory-store/machine-store.js';
import { SessionStore } from './memory-store/session-store.js';
import type { MachineRealTimeStatus, SessionRealTimeStatus } from './memory-store/types.js';

class MemoryStoreService extends EventEmitter {
  private machineStore: MachineStore = new MachineStore();
  private sessionStore: SessionStore = new SessionStore();

  private static instance: MemoryStoreService;

  public static getInstance(): MemoryStoreService {
    if (!MemoryStoreService.instance) {
      MemoryStoreService.instance = new MemoryStoreService();
    }
    return MemoryStoreService.instance;
  }

  private constructor() {
    super();
    this.startCleanupTimer();
    this.startConsistencyCheckTimer();
  }

  private startCleanupTimer(): void {
    setInterval(
      () => {
        try {
          logger.info('开始清理过期数据...');
          this.sessionStore.cleanupOldSessions(24 * 60 * 60 * 1000);
          this.machineStore.cleanupOfflineMachines(7 * 24 * 60 * 60 * 1000);
          logger.info('数据清理完成');
        } catch (error: unknown) {
          logger.error('清理过期数据时出错:', error);
        }
      },
      60 * 60 * 1000
    );
  }

  private startConsistencyCheckTimer(): void {
    setInterval(
      async () => {
        try {
          logger.info('开始数据一致性检查...');
          await this.checkDataConsistency();
          logger.info('数据一致性检查完成');
        } catch (error: unknown) {
          logger.error('数据一致性检查时出错:', error);
        }
      },
      5 * 60 * 1000
    );
  }

  updateMachineStatus(status: MachineStatus): void {
    const existingStatus = this.machineStore.get(status.machine_id);

    const logFields: string[] = [`machine_id=${status.machine_id}`];
    if (status.grpc_port !== undefined) logFields.push(`grpc_port=${status.grpc_port}`);
    if (status.cpu_usage !== undefined) logFields.push(`cpu_usage=${status.cpu_usage}`);
    if (status.memory_usage !== undefined) logFields.push(`memory_usage=${status.memory_usage}`);
    logger.info(`[MemoryStore] updateMachineStatus: ${logFields.join(', ')}`);

    const newStatus = this.machineStore.createFromStatus(status);

    logger.info(
      `[MemoryStore] 机器状态已更新: ${newStatus.machine_id}, grpc_port=${newStatus.grpc_port ?? '未设置'}, online=${newStatus.online}`
    );

    this.machineStore.set(status.machine_id, newStatus);

    if (!existingStatus || existingStatus.online !== newStatus.online) {
      this.emit('machine:status:changed', newStatus);
    }
  }

  markMachineOffline(machineId: string): void {
    const status = this.machineStore.get(machineId);
    if (status && status.online) {
      status.online = false;
      this.machineStore.set(machineId, status);
      this.emit('machine:offline', status);
    }
  }

  removeMachine(machineId: string): void {
    const status = this.machineStore.get(machineId);
    if (status) {
      this.machineStore.delete(machineId);
      this.emit('machine:removed', { machineId });
      logger.info(`从内存中移除机器: ${machineId}`);
    }
  }

  getAllMachines(): MachineRealTimeStatus[] {
    return this.machineStore.getAll();
  }

  getOnlineMachines(): MachineRealTimeStatus[] {
    return this.machineStore.getOnline();
  }

  getMachine(machineId: string): MachineRealTimeStatus | undefined {
    return this.machineStore.get(machineId);
  }

  getMachineStats(): { total: number; online: number; offline: number } {
    return this.machineStore.getStats();
  }

  updateSessionStatus(session: SessionRealTimeStatus): void {
    this.sessionStore.set(session.id, session);
    this.emit('session:status:changed', session);

    const machine = this.machineStore.get(session.machine_id);
    if (machine) {
      const activeSessions = this.sessionStore.getActive().filter((s) => s.machine_id === session.machine_id).length;

      machine.active_sessions = activeSessions;
      this.machineStore.set(session.machine_id, machine);
    }
  }

  getAllSessions(): SessionRealTimeStatus[] {
    return this.sessionStore.getAll();
  }

  getActiveSessions(): SessionRealTimeStatus[] {
    return this.sessionStore.getActive();
  }

  getSession(sessionId: string): SessionRealTimeStatus | undefined {
    return this.sessionStore.get(sessionId);
  }

  getSessionStats(): { total: number; active: number; completed: number; error: number; expired: number } {
    return this.sessionStore.getStats();
  }

  cleanupOldSessions(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
    this.sessionStore.cleanupOldSessions(maxAgeMs);
  }

  cleanupOfflineMachines(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): void {
    this.machineStore.cleanupOfflineMachines(maxAgeMs);
  }

  async checkDataConsistency(): Promise<void> {
    try {
      const { MachineModel } = await import('../models/machine.model.js');
      const { SessionModel } = await import('../models/session/index.js');
      const { connectionManager } = await import('../services/machine-grpc/index.js');

      if (connectionManager) {
        const activeConnections = connectionManager.getActiveConnections();

        for (const [machineId, machine] of this.machineStore.entries()) {
          if (machine.online && !activeConnections.includes(machineId)) {
            logger.info(`发现不一致: 机器 ${machineId} 在内存中标记为在线，但实际没有连接`);
            machine.online = false;
            this.machineStore.set(machineId, machine);
            await MachineModel.update(machineId, { status: 'offline' });
          }
        }

        for (const connectedMachineId of activeConnections) {
          const machine = this.machineStore.get(connectedMachineId);
          if (machine && !machine.online) {
            logger.info(`发现不一致: 机器 ${connectedMachineId} 有活跃连接，但在内存中标记为离线`);
            machine.online = true;
            this.machineStore.set(connectedMachineId, machine);
            await MachineModel.update(connectedMachineId, { status: 'online' });
          }
        }
      }

      const activeSessions = await SessionModel.findActiveSessions();
      const activeSessionIds = new Set(activeSessions.map((s) => s.id));

      for (const [sessionId, session] of this.sessionStore.entries()) {
        if (
          (session.status === SessionStatus.CREATED || session.status === SessionStatus.CONNECTED) &&
          !activeSessionIds.has(sessionId)
        ) {
          logger.info(`发现不一致: 会话 ${sessionId} 在内存中标记为活跃，但在数据库中不是活跃的`);
          session.status = SessionStatus.DISCONNECTED;
          this.sessionStore.set(sessionId, session);
        }
      }

      for (const dbSession of activeSessions) {
        if (!dbSession.id) continue;

        const memorySession = this.sessionStore.get(dbSession.id);
        if (!memorySession) {
          logger.info(`发现不一致: 会话 ${dbSession.id} 在数据库中是活跃的，但在内存中不存在`);

          if (dbSession.machine_id) {
            this.sessionStore.set(dbSession.id, {
              id: dbSession.id,
              user_id: dbSession.user_id,
              machine_id: dbSession.machine_id,
              status: dbSession.status as SessionStatus,
              start_time: new Date(dbSession.start_time || Date.now()),
              last_activity: new Date(dbSession.last_activity || Date.now()),
              port: dbSession.port || undefined,
            });
          }
        }
      }

      this.updateMachineSessionCounts();
    } catch (error: unknown) {
      logger.error('数据一致性检查失败:', error);
    }
  }

  private updateMachineSessionCounts(): void {
    for (const [machineId, machine] of this.machineStore.entries()) {
      const machineSessions = this.sessionStore.getActive().filter((s) => s.machine_id === machineId).length;

      machine.active_sessions = machineSessions;
      this.machineStore.set(machineId, machine);
    }
  }

  async loadInitialData(): Promise<void> {
    try {
      this.machineStore.clear();
      this.sessionStore.clear();

      const { MachineModel } = await import('../models/machine.model.js');
      const { SessionModel } = await import('../models/session/index.js');

      try {
        const { connectionManager } = await import('../services/machine-grpc/index.js');

        const machinesData = await MachineModel.findAll();
        logger.info(`从数据库加载了 ${machinesData.items.length} 台机器`);

        let activeConnections: string[] = [];
        if (connectionManager) {
          try {
            activeConnections = connectionManager.getActiveConnections();
            logger.info(`当前活跃连接的机器: ${activeConnections.length} 台`);
            logger.info(`活跃连接的机器 ID: ${JSON.stringify(activeConnections)}`);
          } catch (connError: unknown) {
            logger.error('获取活跃连接失败:', connError);
            activeConnections = [];
          }
        } else {
          logger.warn('连接管理器不存在，所有机器将标记为离线');
        }

        for (const machine of machinesData.items) {
          const isReallyOnline = activeConnections.includes(machine.id);
          logger.info(`机器 ${machine.id} 状态: ${isReallyOnline ? '在线' : '离线'}`);

          this.machineStore.set(machine.id, {
            machine_id: machine.id,
            name: machine.hostname,
            ip: machine.ip,
            grpc_port: machine.grpcPort || 50052,
            proxy_port: machine.proxyPort || 8080,
            online: isReallyOnline,
            cpu_usage: machine.cpuUsage || 0,
            memory_usage: machine.memoryUsage || 0,
            disk_space: machine.diskUsage || 0,
            active_sessions: isReallyOnline ? machine.instanceCount || 0 : 0,
            max_sessions: machine.maxInstances,
            last_heartbeat: new Date(machine.lastSeen || Date.now()),
          });
        }
      } catch (error: unknown) {
        logger.error('加载机器数据或获取活跃连接失败:', error);

        const machines = await MachineModel.findAll();
        for (const machine of machines.items) {
          this.machineStore.set(machine.id, {
            machine_id: machine.id,
            name: machine.hostname,
            ip: machine.ip,
            grpc_port: machine.grpcPort || 50052,
            proxy_port: machine.proxyPort || 8080,
            online: false,
            cpu_usage: machine.cpuUsage || 0,
            memory_usage: machine.memoryUsage || 0,
            disk_space: machine.diskUsage || 0,
            active_sessions: 0,
            max_sessions: machine.maxInstances,
            last_heartbeat: new Date(machine.lastSeen || Date.now()),
          });
        }
      }

      const activeSessions = await SessionModel.findActiveSessions();
      logger.info(`从数据库加载了 ${activeSessions.length} 个活跃会话`);

      const validSessions = activeSessions.filter((session) => {
        if (!session.machine_id) return false;
        const machine = this.machineStore.get(session.machine_id);
        return machine && machine.online;
      });

      logger.info(`其中 ${validSessions.length} 个会话在真正在线的机器上`);

      for (const session of validSessions) {
        if (!session.id || !session.machine_id) continue;

        this.sessionStore.set(session.id, {
          id: session.id,
          user_id: session.user_id,
          machine_id: session.machine_id,
          status: session.status as SessionStatus,
          start_time: new Date(session.start_time || Date.now()),
          last_activity: new Date(session.last_activity || Date.now()),
          port: session.port || undefined,
        });
      }

      this.updateMachineSessionCounts();

      logger.info(
        `内存中现有 ${this.machineStore.size} 台机器（${this.getOnlineMachines().length} 台在线）和 ${this.sessionStore.size} 个活跃会话`
      );
    } catch (error: unknown) {
      logger.error('从数据库加载初始数据失败:', error);
    }
  }
}

export const memoryStore = MemoryStoreService.getInstance();
export { MemoryStoreService };
export default memoryStore;
