import { z } from 'zod';

// 通用成功响应模式
export const successResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema,
    message: z.string().optional(),
  });

// 通用错误响应模式
export const errorResponseSchema = z.object({
  success: z.boolean(),
  error: z.string(),
});

// 空响应模式
export const nullSchema = z.null();

// 通用分页查询参数
export const paginationQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
  search: z.string().optional(),
  role: z.enum(['admin', 'user']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

// 通用分页响应模式
export const paginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  successResponseSchema(
    z.object({
      items: z.array(itemSchema),
      total: z.number(),
      page: z.number(),
      limit: z.number(),
      totalPages: z.number(),
    })
  );

// ID 参数模式
export const idParamSchema = z.object({
  id: z.string(),
});

// 通用时间戳字段
export const timestampSchema = z.string().or(z.date());
