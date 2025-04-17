import { z } from 'zod';
import { successResponseSchema, timestampSchema } from './common.schema.js';

// 会话选项模式
export const sessionOptionsSchema = z.object({
  userAgent: z.string().optional(),
  proxy: z.string().optional(),
  cookies: z.record(z.string()).optional(),
  localStorage: z.record(z.string()).optional(),
  viewport: z.object({
    width: z.number(),
    height: z.number(),
  }).optional(),
}).nullable();

// 创建会话请求模式
export const createSessionRequestSchema = z.object({
  userAgent: z.string().optional(),
  proxy: z.string().optional(),
  cookies: z.record(z.string()).optional(),
  localStorage: z.record(z.string()).optional(),
  viewport: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }).optional(),
});  // 允许空对象

// 会话基本信息模式
export const sessionBaseSchema = z.object({
  id: z.string(),
  status: z.string(),
  options: sessionOptionsSchema.optional(),
});

// 会话详细信息模式
export const sessionDetailSchema = sessionBaseSchema.extend({
  machine_id: z.string().nullable(),
  port: z.number().nullable(),
  start_time: timestampSchema,
  end_time: timestampSchema.nullable(),
  duration: z.number(),
  screenshot_url: z.string().nullable(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

// 创建会话响应模式
export const createSessionResponseSchema = successResponseSchema(
  sessionBaseSchema.extend({
    created_at: timestampSchema,
    browserWSEndpoint: z.string(),
    directUrl: z.string(),
  })
);

// 会话详情响应模式
export const sessionDetailResponseSchema = successResponseSchema(
  sessionDetailSchema
);

// 释放会话响应模式
export const releaseSessionResponseSchema = successResponseSchema(
  z.object({
    id: z.string(),
    status: z.string(),
    duration: z.number(),
  })
);

// 会话列表项模式
export const sessionListItemSchema = sessionDetailSchema.extend({
  user_id: z.number(),
});

// 获取用户会话响应模式
export const getUserSessionsResponseSchema = successResponseSchema(
  z.array(sessionListItemSchema)
);

// 获取所有会话响应模式
export const getAllSessionsResponseSchema = successResponseSchema(
  z.array(sessionListItemSchema)
);

// 获取会话响应模式
export const getSessionResponseSchema = successResponseSchema(
  sessionDetailSchema
);

// 获取会话截图响应模式
export const getSessionScreenshotResponseSchema = successResponseSchema(
  z.object({
    screenshot_url: z.string()
  })
);
