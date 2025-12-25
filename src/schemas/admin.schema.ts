import { z } from 'zod';
import { UserRole, UserStatus } from '@shared/types/index.js';
import { successResponseSchema } from './common.schema.js';

// 管理员登录请求模式
export const adminLoginRequestSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(100),
});

// 管理员登录响应模式
export const adminLoginResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    id: z.number(),
    username: z.string(),
    role: z.string(),
    token: z.string(),
  }),
});

// 仪表盘统计数据模式
export const dashboardStatsSchema = z.object({
  totalUsers: z.number(),
  activeUsers: z.number(),
  totalMachines: z.number(),
  onlineMachines: z.number(),
  totalSessions: z.number(),
  activeSessions: z.number(),
  totalCredits: z.number(),
  usedCredits: z.number(),
});

// 仪表盘统计响应模式
export const dashboardStatsResponseSchema = successResponseSchema(dashboardStatsSchema);

// 管理员创建用户请求模式
export const adminCreateUserRequestSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(100),
  email: z.string().email().optional(),
  role: z.enum([UserRole.ADMIN, UserRole.USER]).optional(),
  credits: z.number().int().min(0).optional(),
});

// 管理员创建用户响应模式
export const adminCreateUserResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    id: z.number(),
    username: z.string(),
    email: z.string().optional(),
    role: z.string(),
    status: z.string(),
    credits: z.number(),
    api_key: z.string(),
  }),
});

// 管理员获取用户响应模式
export const adminGetUserResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    id: z.number(),
    username: z.string(),
    email: z.string().optional(),
    role: z.string(),
    status: z.string(),
    credits: z.number(),
    webhook_url: z.string().optional(),
    created_at: z.string().or(z.date()),
  }),
});

// 管理员更新用户请求模式
export const adminUpdateUserRequestSchema = z.object({
  email: z.string().email().optional(),
  role: z.enum([UserRole.ADMIN, UserRole.USER]).optional(),
  status: z.enum([UserStatus.ACTIVE, UserStatus.INACTIVE]).optional(),
  webhook_url: z.string().url().optional(),
  password: z.string().min(6).max(100).optional(),
});

// 管理员更新用户响应模式
export const adminUpdateUserResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    id: z.number(),
    username: z.string(),
    email: z.string().optional(),
    role: z.string(),
    status: z.string(),
    credits: z.number(),
    webhook_url: z.string().optional(),
  }),
});

// 管理员删除用户响应模式
export const adminDeleteUserResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

// 管理员添加点数请求模式
export const adminAddCreditsRequestSchema = z.object({
  amount: z.number().int().positive(),
  reason: z.string().optional(),
});

// 管理员添加点数响应模式
export const adminAddCreditsResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    id: z.number(),
    username: z.string(),
    credits: z.number(),
  }),
});
