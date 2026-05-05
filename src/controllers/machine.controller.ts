import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { MachineModel, UpdateMachineInput } from '../models/machine.model.js';
import { SessionModel } from '../models/session.model.js';
import { sendSuccess, sendError, sendCreated, sendPaginated } from '../utils/response.js';
import { PaginationQuery } from '@shared/types/index.js';
import {
  registerMachineRequestSchema,
  updateMachineStatusRequestSchema,
  paginationQuerySchema,
} from '../schemas/index.js';
import { toMachineMemoryDTO, toMachineInfoDTO } from '@shared/mappers/index.js';
import {
  IdParamRoute,
  CleanupOldMachinesBodyRoute,
} from '@shared/types/routes.js';

// 注册机器
export async function registerMachine(request: FastifyRequest, reply: FastifyReply) {
  try {
    const machineData = registerMachineRequestSchema.parse(request.body) as {
      id: string;
      hostname: string;
      ip: string;
      max_instances?: number;
    };

    // 注册机器
    const machine = await MachineModel.register(machineData);

    return sendCreated(reply, machine);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(reply, '无效的请求数据: ' + error.errors.map((e) => e.message).join(', '), 400);
    }

    request.log.error(error);
    return sendError(reply, '注册机器失败', 500);
  }
}

// 更新机器状态
export async function updateMachineStatus(request: FastifyRequest<IdParamRoute>, reply: FastifyReply) {
  try {
    const machineId = request.params.id;
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
      return sendError(reply, '无效的请求数据: ' + error.errors.map((e) => e.message).join(', '), 400);
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

    console.log(`[DEBUG] getAllMachines: 内存中机器数量 = ${memoryMachines.length}`);

    // 如果内存中有数据，则使用内存中的数据
    if (memoryMachines.length > 0) {
      console.log(`[DEBUG] 使用内存数据，机器数量: ${memoryMachines.length}`);
      // 处理分页
      const page = parseInt(query.page || '1', 10);
      const limit = parseInt(query.limit || '10', 10);
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
          return order === 'desc' ? b.active_sessions - a.active_sessions : a.active_sessions - b.active_sessions;
        } else if (sort === 'cpu_usage') {
          return order === 'desc' ? b.cpu_usage - a.cpu_usage : a.cpu_usage - b.cpu_usage;
        } else if (sort === 'memory_usage') {
          return order === 'desc' ? b.memory_usage - a.memory_usage : a.memory_usage - b.memory_usage;
        }
        // 默认按最后心跳时间排序
        return order === 'desc'
          ? b.last_heartbeat.getTime() - a.last_heartbeat.getTime()
          : a.last_heartbeat.getTime() - b.last_heartbeat.getTime();
      });

      // 分页
      const paginatedMachines = sortedMachines.slice(offset, offset + limit);

      // 转换为 API 响应格式
      const formattedMachines = paginatedMachines.map(toMachineMemoryDTO);

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
      return sendError(reply, '无效的查询参数: ' + error.errors.map((e) => e.message).join(', '), 400);
    }

    request.log.error(error);
    return sendError(reply, '获取机器列表失败', 500);
  }
}

// 获取单个机器
export async function getMachineById(request: FastifyRequest<IdParamRoute>, reply: FastifyReply) {
  try {
    const machineId = request.params.id;

    // 导入内存存储服务
    const { memoryStore } = await import('../services/memory-store.service.js');

    // 从内存中获取机器数据
    const memoryMachine = memoryStore.getMachine(machineId);

    if (memoryMachine) {
      // 如果内存中有数据，则使用内存中的数据
      return sendSuccess(reply, toMachineMemoryDTO(memoryMachine));
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
export async function getMachineSessions(request: FastifyRequest<IdParamRoute>, reply: FastifyReply) {
  try {
    const machineId = request.params.id;

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
    const machineSessions = allSessions.filter((session) => session.machine_id === machineId);

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
export async function markMachineOffline(request: FastifyRequest<IdParamRoute>, reply: FastifyReply) {
  try {
    const machineId = request.params.id;

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
export async function cleanupOldMachines(request: FastifyRequest<CleanupOldMachinesBodyRoute>, reply: FastifyReply) {
  try {
    const { daysThreshold = 30 } = request.body;

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
export async function restartMachine(request: FastifyRequest<IdParamRoute>, reply: FastifyReply) {
  try {
    const machineId = request.params.id;

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
        id: machineId,
      });
    } catch (commandError) {
      request.log.error({ err: commandError }, '发送重启命令失败');
      return sendError(reply, '发送重启命令失败: ' + (commandError as Error).message, 500);
    }
  } catch (error) {
    request.log.error({ err: error }, '重启机器失败');
    return sendError(reply, '重启机器失败', 500);
  }
}

// 删除机器
export async function deleteMachine(request: FastifyRequest<IdParamRoute>, reply: FastifyReply) {
  try {
    const machineId = request.params.id;
    request.log.info(`开始删除机器: ${machineId}`);

    // 检查机器是否存在
    const machine = await MachineModel.findById(machineId);
    if (!machine) {
      request.log.warn(`机器不存在: ${machineId}`);
      return reply.status(404).send({
        success: false,
        error: '机器不存在',
      });
    }

    // 如果机器在线，先发送关闭命令并断开连接
    if (machine.status === 'online') {
      try {
        const { connectionManager } = await import('../services/machine-grpc.service.js');
        if (connectionManager.isConnected(machineId)) {
          // 先发送永久关闭命令，告诉机器端不要重连
          request.log.info(`发送永久关闭命令: ${machineId}`);
          connectionManager.sendShutdownCommand(machineId);

          // 等待一小段时间，确保命令被发送
          await new Promise((resolve) => setTimeout(resolve, 500));

          // 然后断开连接
          request.log.info(`断开机器连接: ${machineId}`);
          await connectionManager.removeConnection(machineId);
        }
      } catch (error) {
        request.log.error({ err: error, machineId }, '断开机器连接失败');
        // 继续删除操作，即使断开连接失败
      }
    }

    // 删除机器
    request.log.info(`从数据库删除机器: ${machineId}`);
    const success = await MachineModel.delete(machineId);
    if (!success) {
      request.log.error(`从数据库删除机器失败: ${machineId}`);
      return reply.status(500).send({
        success: false,
        error: '删除机器失败',
      });
    }

    // 从内存存储中移除机器
    try {
      const { memoryStore } = await import('../services/memory-store.service.js');
      request.log.info(`从内存存储中移除机器: ${machineId}`);
      memoryStore.removeMachine(machineId);
    } catch (error) {
      request.log.error({ err: error, machineId }, '从内存存储中移除机器失败');
      // 继续返回成功响应，因为数据库中的机器已经删除
    }

    request.log.info(`机器删除成功: ${machineId}`);
    return reply.status(200).send({
      success: true,
      message: '机器删除成功',
      id: machineId,
    });
  } catch (error) {
    request.log.error({ err: error }, '删除机器失败');
    return reply.status(500).send({
      success: false,
      error: '删除机器失败',
    });
  }
}

// 健康检查
export async function healthCheck(request: FastifyRequest<IdParamRoute>, reply: FastifyReply) {
  try {
    const machineId = request.params.id;

    const result = await MachineModel.healthCheck(machineId);
    return sendSuccess(reply, result);
  } catch (error) {
    request.log.error(error);
    return sendError(reply, '健康检查失败', 500);
  }
}

// 批量健康检查
export async function batchHealthCheck(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { machineIds } = request.body as { machineIds: string[] };

    if (!Array.isArray(machineIds) || machineIds.length === 0) {
      return sendError(reply, '无效的机器 ID 列表', 400);
    }

    const results = await MachineModel.batchHealthCheck(machineIds);

    const healthy = results.filter((r) => r.status === 'healthy').length;
    const unhealthy = results.filter((r) => r.status === 'unhealthy').length;

    return sendSuccess(reply, {
      total: results.length,
      healthy,
      unhealthy,
      results,
    });
  } catch (error) {
    request.log.error(error);
    return sendError(reply, '批量健康检查失败', 500);
  }
}

// 更新机器配置（管理员）
export async function updateMachineConfig(request: FastifyRequest<IdParamRoute>, reply: FastifyReply) {
  try {
    const machineId = request.params.id;
    const updateData = request.body as UpdateMachineInput;

    // 检查机器是否存在
    const existingMachine = await MachineModel.findById(machineId);
    if (!existingMachine) {
      return sendError(reply, '机器不存在', 404);
    }

    // 验证 IP 地址格式（如果提供）
    if (updateData.ip) {
      const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      if (!ipRegex.test(updateData.ip)) {
        return sendError(reply, '无效的 IP 地址格式', 400);
      }
    }

    // 验证端口范围（如果提供）
    if (updateData.grpcPort !== undefined && (updateData.grpcPort < 1 || updateData.grpcPort > 65535)) {
      return sendError(reply, 'gRPC 端口必须在 1-65535 之间', 400);
    }
    if (updateData.proxyPort !== undefined && (updateData.proxyPort < 1 || updateData.proxyPort > 65535)) {
      return sendError(reply, '代理端口必须在 1-65535 之间', 400);
    }

    // 更新机器
    const updatedMachine = await MachineModel.update(machineId, updateData);
    if (!updatedMachine) {
      return sendError(reply, '更新机器失败', 500);
    }

    return sendSuccess(reply, updatedMachine);
  } catch (error) {
    request.log.error(error);
    return sendError(reply, '更新机器失败', 500);
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
  deleteMachine,
  healthCheck,
  batchHealthCheck,
  updateMachineConfig,
};
