/**
 * 内存数据存储服务
 * 用于存储实时状态数据，如机器状态、会话状态等
 */

import { EventEmitter } from 'events';
import { MachineStatus, SessionStatus } from '../types/index.js';

/**
 * 机器实时状态
 */
interface MachineRealTimeStatus {
  machine_id: string;
  name: string;
  ip: string;
  grpc_port: number;
  online: boolean;
  cpu_usage: number;
  memory_usage: number;
  disk_space: number;
  active_sessions: number;
  max_sessions: number;
  last_heartbeat: Date;
}

/**
 * 会话实时状态
 */
interface SessionRealTimeStatus {
  id: string;
  user_id: number;
  machine_id: string;
  status: SessionStatus;
  start_time: Date;
  last_activity: Date;
  browser_ws_endpoint?: string | undefined;
  port?: number | undefined;
}

/**
 * 内存数据存储服务
 */
class MemoryStoreService extends EventEmitter {
  // 机器状态映射 (machine_id -> status)
  private machines: Map<string, MachineRealTimeStatus> = new Map();

  // 会话状态映射 (session_id -> status)
  private sessions: Map<string, SessionRealTimeStatus> = new Map();

  // 单例实例
  private static instance: MemoryStoreService;

  /**
   * 获取单例实例
   */
  public static getInstance(): MemoryStoreService {
    if (!MemoryStoreService.instance) {
      MemoryStoreService.instance = new MemoryStoreService();
    }
    return MemoryStoreService.instance;
  }

  // 清理定时器
  private cleanupTimer: NodeJS.Timeout | null = null;

  // 数据一致性检查定时器
  private consistencyCheckTimer: NodeJS.Timeout | null = null;

  /**
   * 私有构造函数，确保单例模式
   */
  private constructor() {
    super();

    // 启动定期清理
    this.startCleanupTimer();

    // 启动数据一致性检查
    this.startConsistencyCheckTimer();
  }

  /**
   * 启动定期清理定时器
   */
  private startCleanupTimer(): void {
    // 每小时清理一次过期数据
    this.cleanupTimer = setInterval(() => {
      try {
        console.log('开始清理过期数据...');

        // 清理过期会话，保留 24 小时内的数据
        this.cleanupOldSessions(24 * 60 * 60 * 1000);

        // 清理长时间离线的机器数据，保留 7 天内的数据
        this.cleanupOfflineMachines(7 * 24 * 60 * 60 * 1000);

        console.log('数据清理完成');
      } catch (error) {
        console.error('清理过期数据时出错:', error);
      }
    }, 60 * 60 * 1000); // 1 小时
  }

  /**
   * 启动数据一致性检查定时器
   */
  private startConsistencyCheckTimer(): void {
    // 每 5 分钟检查一次数据一致性
    this.consistencyCheckTimer = setInterval(async () => {
      try {
        console.log('开始数据一致性检查...');

        // 检查机器和会话数据的一致性
        await this.checkDataConsistency();

        console.log('数据一致性检查完成');
      } catch (error) {
        console.error('数据一致性检查时出错:', error);
      }
    }, 5 * 60 * 1000); // 5 分钟
  }

  /**
   * 更新机器状态
   */
  updateMachineStatus(status: MachineStatus): void {
    const existingStatus = this.machines.get(status.machine_id);

    // 创建新的状态对象
    const newStatus: MachineRealTimeStatus = {
      machine_id: status.machine_id,
      name: status.name,
      ip: status.ip,
      grpc_port: status.grpc_port,
      online: true, // 收到心跳即为在线
      cpu_usage: status.cpu_usage,
      memory_usage: status.memory_usage,
      disk_space: status.disk_space || 0,
      active_sessions: status.active_sessions,
      max_sessions: status.max_sessions,
      last_heartbeat: new Date(),
    };

    // 更新状态
    this.machines.set(status.machine_id, newStatus);

    // 如果是新机器或状态变化，触发事件
    if (!existingStatus || existingStatus.online !== newStatus.online) {
      this.emit('machine:status:changed', newStatus);
    }
  }

  /**
   * 标记机器离线
   */
  markMachineOffline(machineId: string): void {
    const status = this.machines.get(machineId);
    if (status && status.online) {
      status.online = false;
      this.machines.set(machineId, status);
      this.emit('machine:offline', status);
    }
  }

  /**
   * 从内存中移除机器
   */
  removeMachine(machineId: string): void {
    const status = this.machines.get(machineId);
    if (status) {
      this.machines.delete(machineId);
      this.emit('machine:removed', { machineId });
      console.log(`从内存中移除机器: ${machineId}`);
    }
  }

  /**
   * 获取所有机器状态
   */
  getAllMachines(): MachineRealTimeStatus[] {
    return Array.from(this.machines.values());
  }

  /**
   * 获取在线机器状态
   */
  getOnlineMachines(): MachineRealTimeStatus[] {
    return Array.from(this.machines.values()).filter(m => m.online);
  }

  /**
   * 获取单个机器状态
   */
  getMachine(machineId: string): MachineRealTimeStatus | undefined {
    return this.machines.get(machineId);
  }

  /**
   * 获取机器数量统计
   */
  getMachineStats(): { total: number; online: number; offline: number } {
    const machines = Array.from(this.machines.values());
    const online = machines.filter(m => m.online).length;

    return {
      total: machines.length,
      online,
      offline: machines.length - online,
    };
  }

  /**
   * 更新会话状态
   */
  updateSessionStatus(session: SessionRealTimeStatus): void {
    this.sessions.set(session.id, session);
    this.emit('session:status:changed', session);

    // 更新机器的活跃会话数
    const machine = this.machines.get(session.machine_id);
    if (machine) {
      // 重新计算该机器上的活跃会话数
      const activeSessions = Array.from(this.sessions.values())
        .filter(s => s.machine_id === session.machine_id &&
                (s.status === SessionStatus.CREATED || s.status === SessionStatus.CONNECTED))
        .length;

      machine.active_sessions = activeSessions;
      this.machines.set(session.machine_id, machine);
    }
  }

  /**
   * 获取所有会话
   */
  getAllSessions(): SessionRealTimeStatus[] {
    return Array.from(this.sessions.values());
  }

  /**
   * 获取活跃会话
   */
  getActiveSessions(): SessionRealTimeStatus[] {
    return Array.from(this.sessions.values())
      .filter(s => s.status === SessionStatus.CREATED || s.status === SessionStatus.CONNECTED);
  }

  /**
   * 获取单个会话
   */
  getSession(sessionId: string): SessionRealTimeStatus | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * 获取会话数量统计
   */
  getSessionStats(): { total: number; active: number; completed: number; error: number; expired: number } {
    const sessions = Array.from(this.sessions.values());
    const active = sessions.filter(s =>
      s.status === SessionStatus.CREATED || s.status === SessionStatus.CONNECTED
    ).length;
    const completed = sessions.filter(s => s.status === SessionStatus.COMPLETED).length;
    const error = sessions.filter(s => s.status === SessionStatus.ERROR).length;
    const expired = sessions.filter(s => s.status === SessionStatus.EXPIRED).length;

    return {
      total: sessions.length,
      active,
      completed,
      error,
      expired
    };
  }

  /**
   * 清理过期会话
   * 从内存中移除超过指定时间的已完成/错误/过期会话
   */
  cleanupOldSessions(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
    const now = new Date();
    const cutoffTime = new Date(now.getTime() - maxAgeMs);

    for (const [sessionId, session] of this.sessions.entries()) {
      // 只清理非活跃会话
      if (session.status !== SessionStatus.CREATED && session.status !== SessionStatus.CONNECTED) {
        if (session.last_activity < cutoffTime) {
          this.sessions.delete(sessionId);
        }
      }
    }
  }

  /**
   * 清理长时间离线的机器
   * 从内存中移除超过指定时间的离线机器
   */
  cleanupOfflineMachines(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): void {
    const now = new Date();
    const cutoffTime = new Date(now.getTime() - maxAgeMs);
    let removedCount = 0;

    for (const [machineId, machine] of this.machines.entries()) {
      // 只清理离线机器
      if (!machine.online && machine.last_heartbeat < cutoffTime) {
        this.machines.delete(machineId);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`清理了 ${removedCount} 台长时间离线的机器`);
    }
  }

  /**
   * 检查数据一致性
   * 确保内存中的数据与数据库一致
   */
  async checkDataConsistency(): Promise<void> {
    try {
      // 导入模型
      const { MachineModel } = await import('../models/machine.model.js');
      const { SessionModel } = await import('../models/session.model.js');
      const { connectionManager } = await import('../services/machine-grpc.service.js');

      // 检查机器连接状态
      if (connectionManager) {
        const activeConnections = connectionManager.getActiveConnections();

        // 检查内存中标记为在线的机器是否真的有连接
        for (const [machineId, machine] of this.machines.entries()) {
          if (machine.online && !activeConnections.includes(machineId)) {
            console.log(`发现不一致: 机器 ${machineId} 在内存中标记为在线，但实际没有连接`);
            machine.online = false;
            this.machines.set(machineId, machine);

            // 更新数据库
            await MachineModel.update(machineId, { status: 'offline' });
          }
        }

        // 检查有连接的机器是否在内存中标记为在线
        for (const connectedMachineId of activeConnections) {
          const machine = this.machines.get(connectedMachineId);
          if (machine && !machine.online) {
            console.log(`发现不一致: 机器 ${connectedMachineId} 有活跃连接，但在内存中标记为离线`);
            machine.online = true;
            this.machines.set(connectedMachineId, machine);

            // 更新数据库
            await MachineModel.update(connectedMachineId, { status: 'online' });
          }
        }
      }

      // 检查会话状态
      const activeSessions = await SessionModel.findActiveSessions();
      const activeSessionIds = new Set(activeSessions.map(s => s.id));

      // 检查内存中的活跃会话是否在数据库中也是活跃的
      for (const [sessionId, session] of this.sessions.entries()) {
        if ((session.status === SessionStatus.CREATED || session.status === SessionStatus.CONNECTED) &&
            !activeSessionIds.has(sessionId)) {
          console.log(`发现不一致: 会话 ${sessionId} 在内存中标记为活跃，但在数据库中不是活跃的`);

          // 更新内存中的状态
          session.status = SessionStatus.DISCONNECTED;
          this.sessions.set(sessionId, session);
        }
      }

      // 检查数据库中的活跃会话是否在内存中
      for (const dbSession of activeSessions) {
        if (!dbSession.id) continue;

        const memorySession = this.sessions.get(dbSession.id);
        if (!memorySession) {
          console.log(`发现不一致: 会话 ${dbSession.id} 在数据库中是活跃的，但在内存中不存在`);

          // 将数据库中的会话添加到内存中
          if (dbSession.machine_id) {
            this.sessions.set(dbSession.id, {
              id: dbSession.id,
              user_id: dbSession.user_id,
              machine_id: dbSession.machine_id,
              status: dbSession.status as SessionStatus,
              start_time: new Date(dbSession.start_time || Date.now()),
              last_activity: new Date(dbSession.last_activity || Date.now()),
              browser_ws_endpoint: dbSession.browser_ws_endpoint || undefined,
              port: dbSession.port || undefined,
            });
          }
        }
      }

      // 更新每台机器的活跃会话数
      this.updateMachineSessionCounts();

    } catch (error) {
      console.error('数据一致性检查失败:', error);
    }
  }

  /**
   * 更新所有机器的会话计数
   */
  private updateMachineSessionCounts(): void {
    for (const [machineId, machine] of this.machines.entries()) {
      const machineSessions = Array.from(this.sessions.values())
        .filter(s => s.machine_id === machineId &&
                (s.status === SessionStatus.CREATED || s.status === SessionStatus.CONNECTED))
        .length;

      machine.active_sessions = machineSessions;
      this.machines.set(machineId, machine);
    }
  }

  async loadInitialData(): Promise<void> {
    try {
      // 清空当前内存中的数据
      this.machines.clear();
      this.sessions.clear();

      const { MachineModel } = await import('../models/machine.model.js');
      const { SessionModel } = await import('../models/session.model.js');

      try {
        // 尝试导入连接管理器
        const { connectionManager } = await import('../services/machine-grpc.service.js');

        // 加载机器数据
        const machinesData = await MachineModel.findAll();
        console.log(`从数据库加载了 ${machinesData.items.length} 台机器`);

        // 获取当前活跃连接的机器 ID
        let activeConnections: string[] = [];
        if (connectionManager) {
          try {
            activeConnections = connectionManager.getActiveConnections();
            console.log(`当前活跃连接的机器: ${activeConnections.length} 台`);
            console.log(`活跃连接的机器 ID: ${JSON.stringify(activeConnections)}`);
          } catch (connError) {
            console.error('获取活跃连接失败:', connError);
            activeConnections = [];
          }
        } else {
          console.warn('连接管理器不存在，所有机器将标记为离线');
        }

        // 强制将所有机器标记为离线，除非有活跃连接
        for (const machine of machinesData.items) {
          // 检查机器是否真正在线（有活跃连接）
          const isReallyOnline = activeConnections.includes(machine.id);
          console.log(`机器 ${machine.id} 状态: ${isReallyOnline ? '在线' : '离线'}`);

          this.machines.set(machine.id, {
            machine_id: machine.id,
            name: machine.hostname,
            ip: machine.ip,
            grpc_port: machine.grpcPort || 50052, // 默认值
            online: isReallyOnline, // 只有真正有连接的机器才标记为在线
            cpu_usage: machine.cpuUsage || 0,
            memory_usage: machine.memoryUsage || 0,
            disk_space: machine.diskUsage || 0,
            active_sessions: isReallyOnline ? (machine.instanceCount || 0) : 0, // 如果机器离线，活跃会话数为 0
            max_sessions: machine.maxInstances,
            last_heartbeat: new Date(machine.lastSeen || Date.now()),
          });
        }
      } catch (error) {
        console.error('加载机器数据或获取活跃连接失败:', error);

        // 如果无法获取活跃连接，则使用数据库中的状态，但将所有机器标记为离线
        const machines = await MachineModel.findAll();
        for (const machine of machines.items) {
          this.machines.set(machine.id, {
            machine_id: machine.id,
            name: machine.hostname,
            ip: machine.ip,
            grpc_port: machine.grpcPort || 50052, // 默认值
            online: false, // 强制标记为离线
            cpu_usage: machine.cpuUsage || 0,
            memory_usage: machine.memoryUsage || 0,
            disk_space: machine.diskUsage || 0,
            active_sessions: 0, // 重置活跃会话数
            max_sessions: machine.maxInstances,
            last_heartbeat: new Date(machine.lastSeen || Date.now()),
          });
        }
      }

      // 加载活跃会话数据
      const activeSessions = await SessionModel.findActiveSessions();
      console.log(`从数据库加载了 ${activeSessions.length} 个活跃会话`);

      // 过滤出在真正在线机器上的会话
      const validSessions = activeSessions.filter(session => {
        // 确保 machine_id 不为 null
        if (!session.machine_id) return false;

        const machine = this.machines.get(session.machine_id);
        return machine && machine.online;
      });

      console.log(`其中 ${validSessions.length} 个会话在真正在线的机器上`);

      for (const session of validSessions) {
        // 确保必要的字段存在且不为 null
        if (!session.id || !session.machine_id) continue;

        this.sessions.set(session.id, {
          id: session.id,
          user_id: session.user_id,
          machine_id: session.machine_id,
          status: session.status as SessionStatus,
          start_time: new Date(session.start_time || Date.now()),
          last_activity: new Date(session.last_activity || Date.now()),
          browser_ws_endpoint: session.browser_ws_endpoint || undefined,
          port: session.port || undefined,
        });
      }

      // 更新每台机器的活跃会话数
      for (const [machineId, machine] of this.machines.entries()) {
        const machineSessions = Array.from(this.sessions.values())
          .filter(s => s.machine_id === machineId &&
                  (s.status === SessionStatus.CREATED || s.status === SessionStatus.CONNECTED))
          .length;

        machine.active_sessions = machineSessions;
        this.machines.set(machineId, machine);
      }

      console.log(`内存中现有 ${this.machines.size} 台机器（${this.getOnlineMachines().length} 台在线）和 ${this.sessions.size} 个活跃会话`);
    } catch (error) {
      console.error('从数据库加载初始数据失败:', error);
    }
  }
}

// 导出单例实例
export const memoryStore = MemoryStoreService.getInstance();

export default memoryStore;
