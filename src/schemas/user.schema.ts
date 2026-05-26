import { z } from 'zod';
import { UserRole, UserStatus } from '@shared/types/index.js';
import { successResponseSchema, timestampSchema, MAX_RECHARGE_AMOUNT } from './common.schema.js';

// 用户基本信息模式
export const userBaseSchema = z.object({
  id: z.number(),
  username: z.string(),
  email: z.string().nullable(),
  role: z.string(),
  status: z.string(),
});

// 用户详细信息模式
export const userDetailSchema = userBaseSchema.extend({
  credits: z.number(),
  webhook_url: z.string().nullable(),
  api_key: z.string().nullable(),
  created_at: timestampSchema,
});

// 登录请求模式
export const loginRequestSchema = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(1),
});

// 登录响应模式
export const loginResponseSchema = successResponseSchema(
  z.object({
    user: userBaseSchema.extend({
      credits: z.number(),
    }),
    token: z.string(),
  })
);

// 当前用户信息响应模式
export const currentUserResponseSchema = successResponseSchema(
  z.object({
    user: userDetailSchema.omit({ status: true }),
  })
);

// 创建用户请求模式
export const createUserRequestSchema = z.object({
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
  status: z.enum([UserStatus.ACTIVE, UserStatus.INACTIVE, UserStatus.SUSPENDED]).optional(),
  credits: z.number().int().min(0).optional(),
  webhook_url: z.string().url().optional().nullable(),
});

// 创建用户响应模式
export const createUserResponseSchema = successResponseSchema(userDetailSchema.omit({ created_at: true }));

// 更新用户请求模式
export const updateUserRequestSchema = z.object({
  password: z
    .string()
    .min(8)
    .max(100)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, '密码必须至少8个字符，包含大小写字母和数字')
    .optional(),
  email: z.string().email().optional(),
  status: z.enum([UserStatus.ACTIVE, UserStatus.INACTIVE, UserStatus.SUSPENDED]).optional(),
  webhook_url: z.string().url().optional().nullable(),
});

// 更新用户响应模式
export const updateUserResponseSchema = successResponseSchema(
  userDetailSchema.omit({ api_key: true, created_at: true })
);

// 重置 API Key 响应模式
export const resetApiKeyResponseSchema = successResponseSchema(
  z.object({
    api_key: z.string(),
  })
);

// 添加点数请求模式
export const addCreditsRequestSchema = z.object({
  amount: z.number().int().positive().max(MAX_RECHARGE_AMOUNT, '单次充值金额不能超过 1,000,000'),
});

// 添加点数响应模式
export const addCreditsResponseSchema = successResponseSchema(
  z.object({
    id: z.number(),
    username: z.string(),
    credits: z.number(),
  })
);

// 用户列表项模式
export const userListItemSchema = userBaseSchema.extend({
  credits: z.number(),
  api_key: z.string().nullable(),
  created_at: timestampSchema,
});

export type UserBase = z.infer<typeof userBaseSchema>;
export type UserDetail = z.infer<typeof userDetailSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;
export type CreateUserResponse = z.infer<typeof createUserResponseSchema>;
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;
export type UpdateUserResponse = z.infer<typeof updateUserResponseSchema>;
export type ResetApiKeyResponse = z.infer<typeof resetApiKeyResponseSchema>;
export type AddCreditsRequest = z.infer<typeof addCreditsRequestSchema>;
export type AddCreditsResponse = z.infer<typeof addCreditsResponseSchema>;
export type UserListItem = z.infer<typeof userListItemSchema>;
