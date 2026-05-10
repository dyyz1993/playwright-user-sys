import { z } from 'zod';
import { UserRole, UserStatus } from '@shared/types/index.js';
import { successResponseSchema } from './common.schema.js';

// 管理员登录请求模式
export const adminLoginRequestSchema = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(1),
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
  username: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_\-\u4e00-\u9fa5]+$/, '用户名只能包含字母、数字、下划线、横线和中文'),
  password: z
    .string()
    .min(8)
    .max(100)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, '密码必须至少8个字符，包含大小写字母和数字'),
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
  password: z
    .string()
    .min(8)
    .max(100)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, '密码必须至少8个字符，包含大小写字母和数字')
    .optional(),
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
  amount: z.number().int().positive().max(1000000, '单次充值金额不能超过 1,000,000'),
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

// 用户列表查询参数模式
export const userListQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  sort: z.enum(['username', 'email', 'created_at', 'credits', 'id']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  search: z.string().optional(),
  role: z.enum(['admin', 'user']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

// 用户列表响应模式
export const adminGetUsersResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    items: z.array(z.record(z.unknown())),
    total: z.number(),
    page: z.number(),
    limit: z.number(),
    totalPages: z.number(),
  }),
});

export type AdminLoginRequest = z.infer<typeof adminLoginRequestSchema>;
export type AdminLoginResponse = z.infer<typeof adminLoginResponseSchema>;
export type DashboardStats = z.infer<typeof dashboardStatsSchema>;
export type AdminCreateUserRequest = z.infer<typeof adminCreateUserRequestSchema>;
export type AdminUpdateUserRequest = z.infer<typeof adminUpdateUserRequestSchema>;
export type AdminAddCreditsRequest = z.infer<typeof adminAddCreditsRequestSchema>;
export type UserListQuery = z.infer<typeof userListQuerySchema>;
