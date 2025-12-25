import { db } from '../config/database.js';
import { MachineInfo, PaginationQuery, PaginatedResponse, SessionStatus } from '@shared/types/index.js';
import { logger } from '@shared/utils/logger.js';
export interface CreateMachineInput {
  id: string;
  hostname: string;
  ip: string;
  grpcPort?: number;
  proxyPort?: number;
  max_instances?: number;
}

export interface UpdateMachineInput {
  hostname?: string;
  ip?: string;
  grpcPort?: number;
  proxyPort?: number;
  cpu_usage?: number;
  memory_usage?: number;
  disk_usage?: number;
  instance_count?: number;
  max_instances?: number;
  status?: 'online' | 'offline' | 'busy';
}

export class MachineModel {
  // 注册新机器
  static async register(data: CreateMachineInput): Promise<MachineInfo | null> {
    const exists = await db('machines').where({ id: data.id }).first();

    if (exists) {
      // 如果机器已存在，则更新状态
      await db('machines').where({ id: data.id }).update({
        hostname: data.hostname,
        ip: data.ip,
        grpc_port: data.grpcPort,
        proxy_port: data.proxyPort,
        status: 'online',
        last_seen: db.fn.now(),
        updated_at: new Date(),
      });
    } else {
      // 创建新机器记录
      await db('machines').insert({
        id: data.id,
        hostname: data.hostname,
        ip: data.ip,
        grpc_port: data.grpcPort,
        proxy_port: data.proxyPort,
        max_instances: data.max_instances || 10,
        status: 'online',
        last_seen: db.fn.now(),
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    return this.findById(data.id);
  }

  // 通过 ID 查找机器
  static async findById(id: string): Promise<MachineInfo | null> {
    const machine = await db('machines').where({ id }).first();
    if (!machine) return null;

    return {
      id: machine.id,
      hostname: machine.hostname,
      ip: machine.ip,
      grpcPort: machine.grpc_port,
      proxyPort: machine.proxy_port,
      cpuUsage: machine.cpu_usage,
      memoryUsage: machine.memory_usage,
      diskUsage: machine.disk_usage,
      instanceCount: machine.instance_count,
      maxInstances: machine.max_instances,
      status: machine.status,
      lastSeen: machine.last_seen,
    };
  }

  // 更新机器状态
  static async update(id: string, data: UpdateMachineInput): Promise<MachineInfo | null> {
    // 创建更新数据对象
    const updateData: any = {
      hostname: data.hostname,
      ip: data.ip,
      cpu_usage: data.cpu_usage,
      memory_usage: data.memory_usage,
      disk_usage: data.disk_usage,
      instance_count: data.instance_count,
      max_instances: data.max_instances,
      status: data.status,
      last_seen: new Date(),
      updated_at: new Date(),
    };

    // 处理 grpcPort 字段
    if (data.grpcPort !== undefined) {
      updateData.grpc_port = data.grpcPort;
    }

    // 处理 proxyPort 字段
    if (data.proxyPort !== undefined) {
      updateData.proxy_port = data.proxyPort;
    }

    // 输出调试信息
    console.log(`更新机器数据 (${id}):`, updateData);

    // 移除未定义的字段
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });
    if (updateData.status === 'offline') {
      await db('sessions').where({ machine_id: id }).update({
        status: SessionStatus.DISCONNECTED,
        disconnected_at: new Date(),
        updated_at: new Date(),
      });
      logger.info(`❌ 机器 ${id} 已离线，已关闭所有会话`);
    }

    await db('machines').where({ id }).update(updateData);
    return this.findById(id);
  }

  // 获取所有机器（分页）
  static async findAll(query: PaginationQuery = {}): Promise<PaginatedResponse<MachineInfo>> {
    try {
      console.log('开始查询机器数据');
      const page = query.page || 1;
      const limit = query.limit || 10;
      const offset = (page - 1) * limit;
      const sort = query.sort || 'last_seen';
      const order = query.order || 'desc';

      const [machines, total] = await Promise.all([
        db('machines')
          .orderBy(sort, order)
          .limit(limit)
          .offset(offset),
        db('machines').count('id as count').first(),
      ]);

      console.log(`找到 ${machines.length} 台机器，总数 ${total ? total.count : 0}`);

      return {
        items: machines.map((machine: any) => ({
          id: machine.id,
          hostname: machine.hostname,
          ip: machine.ip,
          grpcPort: machine.grpc_port,
          proxyPort: machine.proxy_port,
          cpuUsage: machine.cpu_usage,
          memoryUsage: machine.memory_usage,
          diskUsage: machine.disk_usage,
          instanceCount: machine.instance_count,
          maxInstances: machine.max_instances,
          status: machine.status,
          lastSeen: machine.last_seen,
        })),
        total: total ? Number(total.count) : 0,
        page,
        limit,
        totalPages: Math.ceil((total ? Number(total.count) : 0) / limit),
      };
    } catch (error) {
      console.error('查询机器数据失败:', error);
      // 返回空数据
      return {
        items: [],
        total: 0,
        page: query.page || 1,
        limit: query.limit || 10,
        totalPages: 0,
      };
    }
  }

  // 获取可用机器（实例数量最少的）
  static async findAvailable(): Promise<MachineInfo | null> {
    try {
      console.log('开始查找可用机器');

      // 直接从 connectionManager 获取已连接的机器
      const { connectionManager } = await import('../services/machine-grpc.service.js');
      const connectedMachineIds = connectionManager.getAllConnectedMachines();

      console.log(`当前有 ${connectedMachineIds.length} 台已连接的机器`);

      if (connectedMachineIds.length === 0) {
        console.log('没有已连接的机器');
        return null;
      }

      // 从数据库中获取这些已连接机器的详细信息
      const machines = await db('machines')
        .whereIn('id', connectedMachineIds)
        .whereRaw('instance_count < max_instances')
        .orderBy('instance_count', 'asc');

      console.log(`找到 ${machines.length} 台可用的已连接机器`);

      if (machines.length === 0) {
        console.log('没有可用的已连接机器（所有机器实例数已满）');
        return null;
      }

      // 选择实例数量最少的机器
      const machine = machines[0];
      console.log(`选择机器: ${machine.id}, 当前实例数: ${machine.instance_count}/${machine.max_instances}`);

      return {
        id: machine.id,
        hostname: machine.hostname,
        ip: machine.ip,
        grpcPort: machine.grpc_port,
        proxyPort: machine.proxy_port,
        cpuUsage: machine.cpu_usage,
        memoryUsage: machine.memory_usage,
        diskUsage: machine.disk_usage,
        instanceCount: machine.instance_count,
        maxInstances: machine.max_instances,
        status: machine.status,
        lastSeen: machine.last_seen,
      };
    } catch (error) {
      console.error('查找可用机器失败:', error);
      return null;
    }
  }

  // 增加实例计数
  static async incrementInstanceCount(id: string): Promise<void> {
    await db('machines').where({ id }).increment('instance_count', 1);
  }

  // 减少实例计数
  static async decrementInstanceCount(id: string): Promise<void> {
    await db('machines').where({ id }).decrement('instance_count', 1);
  }

  // 标记机器离线
  static async markOffline(id: string): Promise<void> {
    await db('machines').where({ id }).update({
      status: 'offline',
      updated_at: new Date(),
    });
  }

  // 检查并标记超时的机器为离线
  static async checkOfflineMachines(timeoutMinutes: number = 5): Promise<number> {
    const result = await db('machines')
      .where('status', 'online')
      .whereRaw(`last_seen < datetime('now', '-${timeoutMinutes} minutes')`)
      .update({
        status: 'offline',
        updated_at: new Date(),
      });

    return result;
  }

  // 根据状态查找机器
  static async findByStatus(status: string): Promise<PaginatedResponse<MachineInfo>> {
    try {
      const machines = await db('machines').where({ status });

      return {
        items: machines.map((machine: any) => ({
          id: machine.id,
          hostname: machine.hostname,
          ip: machine.ip,
          grpcPort: machine.grpc_port,
          proxyPort: machine.proxy_port,
          cpuUsage: machine.cpu_usage,
          memoryUsage: machine.memory_usage,
          diskUsage: machine.disk_usage,
          instanceCount: machine.instance_count,
          maxInstances: machine.max_instances,
          status: machine.status,
          lastSeen: machine.last_seen,
        })),
        total: machines.length,
        page: 1,
        limit: machines.length,
        totalPages: 1,
      };
    } catch (error) {
      console.error(`查询${status}状态的机器失败:`, error);
      return {
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      };
    }
  }

  // 删除长时间未活动的离线机器
  static async deleteOldMachines(cutoffDate: Date): Promise<number> {
    try {
      // 只删除离线状态的机器
      const result = await db('machines')
        .where('status', 'offline')
        .where('last_seen', '<', cutoffDate)
        .delete();

      return result;
    } catch (error) {
      console.error('删除旧机器记录失败:', error);
      return 0;
    }
  }

  // 删除指定ID的机器
  static async delete(id: string): Promise<boolean> {
    try {
      // 删除机器记录
      const result = await db('machines')
        .where({ id })
        .delete();

      return result > 0;
    } catch (error) {
      console.error(`删除机器失败 (${id}):`, error);
      return false;
    }
  }
}

export default MachineModel;
