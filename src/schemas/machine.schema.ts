import { z } from 'zod';
import { successResponseSchema, timestampSchema } from './common.schema.js';
import { sessionListItemSchema } from './session.schema.js';

// 机器基本信息模式
export const machineBaseSchema = z.object({
  id: z.string(),
  hostname: z.string(),
  ip: z.string(),
});

// 机器详细信息模式
export const machineDetailSchema = machineBaseSchema.extend({
  cpuUsage: z.number(),
  memoryUsage: z.number(),
  diskUsage: z.number(),
  instanceCount: z.number(),
  maxInstances: z.number(),
  status: z.string(),
  lastSeen: timestampSchema,
});

// 注册机器请求模式
export const registerMachineRequestSchema = z.object({
  id: z.string().min(1),
  hostname: z.string().min(1),
  ip: z.string().ip(),
  max_instances: z.number().int().positive().optional(),
});

// 注册机器响应模式
export const registerMachineResponseSchema = successResponseSchema(machineDetailSchema);

// 更新机器状态请求模式
// 注意: API 层统一使用 camelCase，Model 层负责转换为 snake_case
export const updateMachineStatusRequestSchema = z.object({
  cpuUsage: z.number().min(0).max(100),
  memoryUsage: z.number().min(0).max(100),
  diskUsage: z.number().min(0).max(100),
  instanceCount: z.number().int().min(0).optional(),
  maxInstances: z.number().int().positive().optional(),
  status: z.enum(['online', 'offline', 'busy']).optional(),
});

// 更新机器状态响应模式
export const updateMachineStatusResponseSchema = successResponseSchema(machineDetailSchema);

// 机器详情响应模式
export const machineDetailResponseSchema = successResponseSchema(machineDetailSchema);

// 机器会话列表响应模式
export const machineSessiosnResponseSchema = successResponseSchema(z.array(sessionListItemSchema));

// 标记机器离线响应模式
export const markMachineOfflineResponseSchema = successResponseSchema(
  z.object({
    id: z.string(),
    status: z.string(),
  })
);

// 获取所有机器响应模式 (分页格式)
export const getAllMachinesResponseSchema = successResponseSchema(
  z.object({
    items: z.array(machineDetailSchema),
    total: z.number(),
    page: z.number(),
    limit: z.number(),
    totalPages: z.number(),
  })
);

// 获取机器详情响应模式
export const getMachineByIdResponseSchema = successResponseSchema(machineDetailSchema);

// 获取机器会话响应模式
export const getMachineSessionsResponseSchema = successResponseSchema(z.array(sessionListItemSchema));
