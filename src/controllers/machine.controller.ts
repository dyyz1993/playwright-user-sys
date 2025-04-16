import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { MachineModel } from '../models/machine.model.js';
import { SessionModel } from '../models/session.model.js';
import { sendSuccess, sendError, sendCreated, sendPaginated } from '../utils/response.js';
import { PaginationQuery } from '../types/index.js';
import { registerMachineRequestSchema, updateMachineStatusRequestSchema, paginationQuerySchema } from '../schemas/index.js';





// 注册机器
export async function registerMachine(request: FastifyRequest, reply: FastifyReply) {
  try {
    const machineData = registerMachineRequestSchema.parse(request.body);

    // 注册机器
    const machine = await MachineModel.register(machineData);

    return sendCreated(reply, machine);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(reply, '无效的请求数据: ' + error.errors.map(e => e.message).join(', '), 400);
    }

    request.log.error(error);
    return sendError(reply, '注册机器失败', 500);
  }
}

// 更新机器状态
export async function updateMachineStatus(request: FastifyRequest, reply: FastifyReply) {
  try {
    const machineId = (request.params as any).id;
    const statusData = updateMachineStatusRequestSchema.parse(request.body);

    // 检查机器是否存在
    const existingMachine = await MachineModel.findById(machineId);
    if (!existingMachine) {
      return sendError(reply, '机器不存在', 404);
    }

    // 更新机器状态
    const updatedMachine = await MachineModel.update(machineId, statusData);

    return sendSuccess(reply, updatedMachine);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(reply, '无效的请求数据: ' + error.errors.map(e => e.message).join(', '), 400);
    }

    request.log.error(error);
    return sendError(reply, '更新机器状态失败', 500);
  }
}

// 获取所有机器
export async function getAllMachines(request: FastifyRequest, reply: FastifyReply) {
  try {
    const query = paginationQuerySchema.parse(request.query) as PaginationQuery;

    // 导入内存存储服务
    const { memoryStore } = await import('../services/memory-store.service.js');

    // 从内存中获取机器数据
    const memoryMachines = memoryStore.getAllMachines();

    // 如果内存中有数据，则使用内存中的数据
    if (memoryMachines.length > 0) {
      // 处理分页
      const page = query.page || 1;
      const limit = query.limit || 10;
      const offset = (page - 1) * limit;

      // 排序
      const sort = query.sort || 'last_heartbeat';
      const order = query.order || 'desc';

      // 根据排序字段排序
      const sortedMachines = [...memoryMachines].sort((a, b) => {
        if (sort === 'last_heartbeat') {
          return order === 'desc'
            ? b.last_heartbeat.getTime() - a.last_heartbeat.getTime()
            : a.last_heartbeat.getTime() - b.last_heartbeat.getTime();
        } else if (sort === 'active_sessions') {
          return order === 'desc'
            ? b.active_sessions - a.active_sessions
            : a.active_sessions - b.active_sessions;
        } else if (sort === 'cpu_usage') {
          return order === 'desc'
            ? b.cpu_usage - a.cpu_usage
            : a.cpu_usage - b.cpu_usage;
        } else if (sort === 'memory_usage') {
          return order === 'desc'
            ? b.memory_usage - a.memory_usage
            : a.memory_usage - b.memory_usage;
        }
        // 默认按最后心跳时间排序
        return order === 'desc'
          ? b.last_heartbeat.getTime() - a.last_heartbeat.getTime()
          : a.last_heartbeat.getTime() - b.last_heartbeat.getTime();
      });

      // 分页
      const paginatedMachines = sortedMachines.slice(offset, offset + limit);

      // 转换为 API 响应格式
      const formattedMachines = paginatedMachines.map(machine => ({
        id: machine.machine_id,
        hostname: machine.name,
        ip: machine.ip,
        grpcPort: machine.grpc_port,
        cpuUsage: machine.cpu_usage,
        memoryUsage: machine.memory_usage,
        diskUsage: machine.disk_space,
        instanceCount: machine.active_sessions,
        maxInstances: machine.max_sessions,
        status: machine.online ? 'online' : 'offline',
        lastSeen: machine.last_heartbeat,
      }));

      return sendPaginated(reply, {
        items: formattedMachines,
        total: memoryMachines.length,
        page,
        limit,
        totalPages: Math.ceil(memoryMachines.length / limit),
      });
    } else {
      // 如果内存中没有数据，则从数据库获取
      const machines = await MachineModel.findAll(query);
      return sendPaginated(reply, machines);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(reply, '无效的查询参数: ' + error.errors.map(e => e.message).join(', '), 400);
    }

    request.log.error(error);
    return sendError(reply, '获取机器列表失败', 500);
  }
}

// 获取单个机器
export async function getMachineById(request: FastifyRequest, reply: FastifyReply) {
  try {
    const machineId = (request.params as any).id;

    // 导入内存存储服务
    const { memoryStore } = await import('../services/memory-store.service.js');

    // 从内存中获取机器数据
    const memoryMachine = memoryStore.getMachine(machineId);

    if (memoryMachine) {
      // 如果内存中有数据，则使用内存中的数据
      return sendSuccess(reply, {
        id: memoryMachine.machine_id,
        hostname: memoryMachine.name,
        ip: memoryMachine.ip,
        grpcPort: memoryMachine.grpc_port,
        cpuUsage: memoryMachine.cpu_usage,
        memoryUsage: memoryMachine.memory_usage,
        diskUsage: memoryMachine.disk_space,
        instanceCount: memoryMachine.active_sessions,
        maxInstances: memoryMachine.max_sessions,
        status: memoryMachine.online ? 'online' : 'offline',
        lastSeen: memoryMachine.last_heartbeat,
      });
    } else {
      // 如果内存中没有数据，则从数据库获取
      const machine = await MachineModel.findById(machineId);
      if (!machine) {
        return sendError(reply, '机器不存在', 404);
      }

      return sendSuccess(reply, machine);
    }
  } catch (error) {
    request.log.error(error);
    return sendError(reply, '获取机器信息失败', 500);
  }
}

// 获取机器上的所有会话
export async function getMachineSessions(request: FastifyRequest, reply: FastifyReply) {
  try {
    const machineId = (request.params as any).id;

    // 导入内存存储服务
    const { memoryStore } = await import('../services/memory-store.service.js');

    // 从内存中获取机器数据
    const memoryMachine = memoryStore.getMachine(machineId);

    // 检查机器是否存在
    if (!memoryMachine) {
      // 如果内存中没有数据，则从数据库检查
      const machine = await MachineModel.findById(machineId);
      if (!machine) {
        return sendError(reply, '机器不存在', 404);
      }
    }

    // 从内存中获取会话数据
    const allSessions = memoryStore.getAllSessions();
    const machineSessions = allSessions.filter(session => session.machine_id === machineId);

    if (machineSessions.length > 0) {
      // 如果内存中有数据，则使用内存中的数据
      return sendSuccess(reply, machineSessions);
    } else {
      // 如果内存中没有数据，则从数据库获取
      const sessions = await SessionModel.findByMachineId(machineId);
      return sendSuccess(reply, sessions);
    }
  } catch (error) {
    request.log.error(error);
    return sendError(reply, '获取机器会话列表失败', 500);
  }
}

// 标记机器离线
export async function markMachineOffline(request: FastifyRequest, reply: FastifyReply) {
  try {
    const machineId = (request.params as any).id;

    // 检查机器是否存在
    const machine = await MachineModel.findById(machineId);
    if (!machine) {
      return sendError(reply, '机器不存在', 404);
    }

    // 标记机器离线
    await MachineModel.markOffline(machineId);

    return sendSuccess(reply, { id: machineId, status: 'offline' });
  } catch (error) {
    request.log.error(error);
    return sendError(reply, '标记机器离线失败', 500);
  }
}

// 强制刷新所有机器状态
export async function refreshMachineStatus(request: FastifyRequest, reply: FastifyReply) {
  try {
    // 导入必要的服务
    const { forceCheckAllMachines } = await import('../services/machine-monitor.service.js');

    // 强制检查所有机器状态
    await forceCheckAllMachines();

    // 导入内存存储服务
    const { memoryStore } = await import('../services/memory-store.service.js');

    // 获取在线机器数量
    const onlineMachines = memoryStore.getOnlineMachines().length;

    return sendSuccess(reply, {
      success: true,
      message: '所有机器状态已强制刷新',
      updated: onlineMachines,
    });
  } catch (error) {
    request.log.error(error);
    return sendError(reply, '强制刷新机器状态失败', 500);
  }
}

// 清理长时间未活动的机器
export async function cleanupOldMachines(request: FastifyRequest, reply: FastifyReply) {
  try {
    // 获取请求参数
    const { daysThreshold = 30 } = request.body as any;

    // 导入必要的服务
    const { cleanupOldMachines: cleanup } = await import('../services/machine-monitor.service.js');

    // 清理长时间未活动的机器
    await cleanup(daysThreshold);

    // 获取删除的记录数量
    // 注意：这里我们无法知道实际删除了多少条记录，因为 cleanup 函数不返回这个信息
    // 实际应用中可以修改 cleanup 函数返回删除的记录数量

    return sendSuccess(reply, {
      success: true,
      message: `已清理超过 ${daysThreshold} 天未活动的离线机器`,
      deleted: 0, // 这里暂时无法知道实际删除数量
    });
  } catch (error) {
    request.log.error(error);
    return sendError(reply, '清理旧机器记录失败', 500);
  }
}

// 重启机器
export async function restartMachine(request: FastifyRequest, reply: FastifyReply) {
  try {
    const machineId = (request.params as any).id;

    // 检查机器是否存在
    const machine = await MachineModel.findById(machineId);
    if (!machine) {
      return sendError(reply, '机器不存在', 404);
    }

    // 导入必要的服务
    const { connectionManager } = await import('../services/machine-grpc.service.js');

    // 发送重启命令
    try {
      // 检查机器是否连接
      if (!connectionManager.isConnected(machineId)) {
        return sendError(reply, '机器未连接，无法发送重启命令', 400);
      }

      // 发送重启命令
      connectionManager.sendRestartCommand(machineId);

      // 更新数据库中的机器状态
      await MachineModel.update(machineId, { status: 'offline' });

      return sendSuccess(reply, {
        success: true,
        message: '重启命令已发送',
        id: machineId
      });
    } catch (commandError) {
      request.log.error('发送重启命令失败:', commandError);
      return sendError(reply, '发送重启命令失败: ' + (commandError as Error).message, 500);
    }
  } catch (error) {
    request.log.error('重启机器失败:', error);
    return sendError(reply, '重启机器失败', 500);
  }
}

export default {
  registerMachine,
  updateMachineStatus,
  getAllMachines,
  getMachineById,
  getMachineSessions,
  markMachineOffline,
  refreshMachineStatus,
  cleanupOldMachines,
  restartMachine,
};
