import { db } from '../config/database.js';
import { MachineInfo, PaginationQuery, PaginatedResponse, SessionStatus } from '@shared/types/index.js';
import { logger } from '@shared/utils/logger.js';
export interface CreateMachineInput {
  id: string;
  hostname: string;
  ip: string;
  grpcPort?: number;
  proxyPort?: number;
  maxInstances?: number;
  instanceCount?: number;
}

export interface UpdateMachineInput {
  hostname?: string;
  ip?: string;
  grpcPort?: number;
  proxyPort?: number;
  // 统一使用 camelCase，Model 层负责转换为 snake_case
  cpuUsage?: number;
  memoryUsage?: number;
  diskUsage?: number;
  instanceCount?: number;
  maxInstances?: number;
  status?: 'online' | 'offline' | 'busy';
  lastSeen?: Date;
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
        instance_count: data.instanceCount || 0,
        max_instances: data.maxInstances || 10,
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
    // 将 camelCase (API 层) 转换为 snake_case (数据库层)
    const updateData: Record<string, unknown> = {
      hostname: data.hostname,
      ip: data.ip,
      // camelCase → snake_case 转换
      cpu_usage: data.cpuUsage,
      memory_usage: data.memoryUsage,
      disk_usage: data.diskUsage,
      instance_count: data.instanceCount,
      max_instances: data.maxInstances,
      status: data.status,
      last_seen: data.lastSeen || new Date(),
      updated_at: new Date(),
    };

    // 处理可选的 port 字段
    if (data.grpcPort !== undefined) {
      updateData.grpc_port = data.grpcPort;
    }
    if (data.proxyPort !== undefined) {
      updateData.proxy_port = data.proxyPort;
    }

    // 输出调试信息
    logger.info(`更新机器数据 (${id}):`, updateData);

    // 移除未定义的字段
    Object.keys(updateData).forEach((key) => {
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
      logger.info('开始查询机器数据');
      const page = parseInt(query.page || '1', 10);
      const limit = parseInt(query.limit || '10', 10);
      const offset = (page - 1) * limit;
      const MACHINE_SORT_COLUMNS = [
        'id',
        'hostname',
        'ip',
        'status',
        'last_seen',
        'instance_count',
        'max_instances',
        'created_at',
        'updated_at',
      ];
      const ALLOWED_ORDER = ['asc', 'desc'];
      const sort = query.sort && MACHINE_SORT_COLUMNS.includes(query.sort) ? query.sort : 'last_seen';
      const order =
        query.order && ALLOWED_ORDER.includes(query.order.toLowerCase())
          ? (query.order.toLowerCase() as 'asc' | 'desc')
          : 'desc';

      const [machines, total] = await Promise.all([
        db('machines').orderBy(sort, order).limit(limit).offset(offset),
        db('machines').count('id as count').first(),
      ]);

      logger.info(`找到 ${machines.length} 台机器，总数 ${total ? total.count : 0}`);

      return {
        items: machines.map((machine) => ({
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
      logger.error('查询机器数据失败:', error);
      throw error;
    }
  }

  // 获取可用机器（实例数量最少的）
  static async findAvailable(): Promise<MachineInfo | null> {
    try {
      logger.info('开始查找可用机器');

      // 直接从 connectionManager 获取已连接的机器
      const { connectionManager } = await import('../services/machine-grpc.service.js');
      const connectedMachineIds = connectionManager.getAllConnectedMachines();

      logger.info(`当前有 ${connectedMachineIds.length} 台已连接的机器`);

      if (connectedMachineIds.length === 0) {
        logger.info('没有已连接的机器');
        return null;
      }

      // 从数据库中获取这些已连接机器的详细信息
      const machines = await db('machines')
        .whereIn('id', connectedMachineIds)
        .whereRaw('instance_count < max_instances')
        .orderBy('instance_count', 'asc');

      logger.info(`找到 ${machines.length} 台可用的已连接机器`);

      if (machines.length === 0) {
        logger.info('没有可用的已连接机器（所有机器实例数已满）');
        return null;
      }

      // 选择实例数量最少的机器
      const machine = machines[0];
      logger.info(`选择机器: ${machine.id}, 当前实例数: ${machine.instance_count}/${machine.max_instances}`);

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
      logger.error('查找可用机器失败:', error);
      return null;
    }
  }

  // 增加实例计数
  static async incrementInstanceCount(id: string): Promise<void> {
    await db('machines').where({ id }).increment('instance_count', 1);
  }

  static async decrementInstanceCount(id: string): Promise<void> {
    await db('machines')
      .where({ id })
      .update({
        instance_count: db.raw('CASE WHEN instance_count > 0 THEN instance_count - 1 ELSE 0 END'),
        updated_at: new Date(),
      });
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
    const cutoffDate = new Date(Date.now() - timeoutMinutes * 60 * 1000);
    const result = await db('machines').where('status', 'online').where('last_seen', '<', cutoffDate).update({
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
        items: machines.map((machine) => ({
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
      logger.error(`查询${status}状态的机器失败:`, error);
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
      const result = await db('machines').where('status', 'offline').where('last_seen', '<', cutoffDate).delete();

      return result;
    } catch (error) {
      logger.error('删除旧机器记录失败:', error);
      return 0;
    }
  }

  // 删除指定ID的机器
  static async delete(id: string): Promise<boolean> {
    try {
      // 删除机器记录
      const result = await db('machines').where({ id }).delete();

      return result > 0;
    } catch (error) {
      logger.error(`删除机器失败 (${id}):`, error);
      return false;
    }
  }

  // 统计所有机器数
  static async countAll(): Promise<number> {
    try {
      const result = await db('machines').count('id as count').first();
      return result ? Number(result.count) : 0;
    } catch (error) {
      logger.error('统计机器数失败:', error);
      return 0;
    }
  }

  // 统计在线机器数
  static async countOnline(): Promise<number> {
    try {
      const result = await db('machines').where('status', 'online').count('id as count').first();
      return result ? Number(result.count) : 0;
    } catch (error) {
      logger.error('统计在线机器数失败:', error);
      return 0;
    }
  }

  // 获取所有机器（不分页）
  static async getAll(): Promise<MachineInfo[]> {
    try {
      const machines = await db('machines').orderBy('last_seen', 'desc');

      return machines.map((machine) => ({
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
      }));
    } catch (error) {
      logger.error('获取所有机器失败:', error);
      return [];
    }
  }

  // 获取机器详情（包含活跃会话数）
  static async getDetailById(id: string): Promise<
    | (MachineInfo & {
        activeSessions: number;
        healthStatus?: string;
      })
    | null
  > {
    try {
      const machine = await this.findById(id);
      if (!machine) return null;

      // 获取活跃会话数
      const activeSessionsResult = await db('sessions')
        .where({ machine_id: id, status: SessionStatus.CREATED })
        .count('id as count')
        .first();
      const machineActiveSessions = activeSessionsResult ? Number(activeSessionsResult.count) : 0;

      // 计算健康状态
      let healthStatus = 'unknown';
      if (machine.status === 'online') {
        const usageRatio = machine.instanceCount / machine.maxInstances;
        if (usageRatio >= 0.9) {
          healthStatus = 'warning';
        } else if (machine.cpuUsage && machine.cpuUsage > 80) {
          healthStatus = 'warning';
        } else if (machine.memoryUsage && machine.memoryUsage > 80) {
          healthStatus = 'warning';
        } else {
          healthStatus = 'healthy';
        }
      } else {
        healthStatus = 'offline';
      }

      return {
        ...machine,
        activeSessions: machineActiveSessions,
        healthStatus,
      };
    } catch (error) {
      logger.error('获取机器详情失败:', error);
      return null;
    }
  }

  // 执行健康检查
  static async healthCheck(id: string): Promise<{
    machineId: string;
    status: 'healthy' | 'unhealthy';
    grpcConnected: boolean;
    responseTime?: number;
    activeInstances?: number;
    systemInfo?: {
      cpuUsage: number;
      memoryUsage: number;
      diskUsage: number;
      uptime?: number;
    };
    error?: string;
    checkedAt: Date;
  }> {
    try {
      const machine = await this.findById(id);
      if (!machine) {
        return {
          machineId: id,
          status: 'unhealthy',
          grpcConnected: false,
          error: '机器不存在',
          checkedAt: new Date(),
        };
      }

      // 导入 gRPC 连接管理器
      const { connectionManager } = await import('../services/machine-grpc.service.js');

      const startTime = Date.now();
      try {
        // 检查机器是否连接
        const isConnected = connectionManager.isConnected(id);

        if (!isConnected) {
          return {
            machineId: id,
            status: 'unhealthy',
            grpcConnected: false,
            error: '机器未连接',
            responseTime: Date.now() - startTime,
            checkedAt: new Date(),
          };
        }

        // 尝试获取机器状态
        const machineStatus = await connectionManager.getMachineStatus(id);
        const responseTime = Date.now() - startTime;

        return {
          machineId: id,
          status: 'healthy',
          grpcConnected: true,
          responseTime,
          activeInstances: machineStatus.active_sessions || machine.instanceCount,
          systemInfo: {
            cpuUsage: machineStatus.cpu_usage || machine.cpuUsage || 0,
            memoryUsage: machineStatus.memory_usage || machine.memoryUsage || 0,
            diskUsage: machineStatus.disk_space || machine.diskUsage || 0,
          },
          checkedAt: new Date(),
        };
      } catch (grpcError) {
        return {
          machineId: id,
          status: 'unhealthy',
          grpcConnected: false,
          error: (grpcError as Error).message || 'gRPC 连接失败',
          checkedAt: new Date(),
        };
      }
    } catch (error) {
      logger.error('健康检查失败:', error);
      return {
        machineId: id,
        status: 'unhealthy',
        grpcConnected: false,
        error: (error as Error).message || '健康检查失败',
        checkedAt: new Date(),
      };
    }
  }

  // 批量健康检查
  static async batchHealthCheck(ids: string[]): Promise<
    Array<{
      machineId: string;
      status: 'healthy' | 'unhealthy';
      error?: string;
    }>
  > {
    const results = await Promise.all(
      ids.map(async (id) => {
        const result = await this.healthCheck(id);
        return {
          machineId: id,
          status: result.status,
          error: result.error,
        };
      })
    );

    return results;
  }
}

export default MachineModel;
