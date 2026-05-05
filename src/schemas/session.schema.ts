import { z } from 'zod';
import { successResponseSchema, timestampSchema, paginatedResponseSchema } from './common.schema.js';

// Cookie 模式
const cookieSchema = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string(),
  path: z.string(),
  expires: z.number().optional(),
  httpOnly: z.boolean().optional(),
  secure: z.boolean().optional(),
  sameSite: z.enum(['Strict', 'Lax', 'None']).optional(),
});

// localStorage 项模式
const localStorageItemSchema = z.object({
  name: z.string(),
  value: z.string(),
});

// Origin 模式
const originSchema = z.object({
  origin: z.string(),
  localStorage: z.array(localStorageItemSchema),
});

// StorageState 模式
const storageStateSchema = z.object({
  cookies: z.array(cookieSchema).optional(),
  origins: z.array(originSchema).optional(),
});

// 会话选项模式
export const sessionOptionsSchema = z
  .object({
    userAgent: z.string().optional(),
    proxy: z.string().optional(),
    cookies: z.record(z.string()).optional(),
    localStorage: z.record(z.string()).optional(),
    viewport: z
      .object({
        width: z.number(),
        height: z.number(),
      })
      .optional(),
  })
  .nullable();

// 创建会话请求模式
export const createSessionRequestSchema = z
  .object({
    userAgent: z.string().optional(),
    proxy: z.string().optional(),
    cookies: z.record(z.string()).optional(),
    localStorage: z.record(z.string()).optional(),
    viewport: z
      .object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      })
      .optional(),
    // 新增参数
    storageStatePath: z.string().optional(),
    storageState: storageStateSchema.optional(),
    // 共享用户数据目录
    // 当 sharedUserData 为 true 时，所有会话共享同一个用户数据目录
    // 当 sharedUserData 为 false 或未设置时，每个会话有独立的用户数据目录
    sharedUserData: z.boolean().optional(),
    // @deprecated userDataDir 已废弃，出于安全考虑不再允许客户端指定任意路径
    // 请使用 sharedUserData 参数控制是否共享用户数据目录
    userDataDir: z.string().optional(),
  })
  .strict(); // 严格模式：拒绝未知字段如 "options"

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
  disconnected_at: timestampSchema.nullable(),
  duration: z.number(),
  credits_used: z.number(),
  screenshot_url: z.string().nullable(),
  last_activity: timestampSchema.nullable(),
  error_message: z.string().nullable(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

// 创建会话响应模式
export const createSessionResponseSchema = successResponseSchema(
  sessionBaseSchema.extend({
    created_at: timestampSchema,
    browserWSEndpoint: z.string(),
    directUrl: z.string(),
    viewerUrl: z.string().optional(),
  })
);

// 会话详情响应模式
export const sessionDetailResponseSchema = successResponseSchema(sessionDetailSchema);

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
export const getUserSessionsResponseSchema = paginatedResponseSchema(sessionListItemSchema);

// 获取所有会话响应模式
export const getAllSessionsResponseSchema = paginatedResponseSchema(sessionListItemSchema);

// 获取会话响应模式
export const getSessionResponseSchema = successResponseSchema(sessionDetailSchema);

// 获取会话截图响应模式
export const getSessionScreenshotResponseSchema = successResponseSchema(
  z.object({
    screenshot_url: z.string(),
  })
);

export type SessionOptions = z.infer<typeof sessionOptionsSchema>;
export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>;
export type SessionBase = z.infer<typeof sessionBaseSchema>;
export type SessionDetail = z.infer<typeof sessionDetailSchema>;
export type CreateSessionResponse = z.infer<typeof createSessionResponseSchema>;
export type SessionListItem = z.infer<typeof sessionListItemSchema>;
