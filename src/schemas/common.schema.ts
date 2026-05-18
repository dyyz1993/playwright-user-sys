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
  // 接受任意字符串，但在应用层验证和过滤无效值
  order: z.string().optional(),
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

// 数字 ID 参数模式 — 将 string ID 解析为正整数，替换 parseInt + isNaN 手动验证
export const numericIdParamSchema = z.object({
  id: z.string().transform((val, ctx) => {
    const num = parseInt(val, 10);
    if (isNaN(num) || num <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '无效的用户 ID',
      });
      return z.NEVER;
    }
    return num;
  }),
});

// 分页解析模式 — 将 string page/limit 解析为带边界的正整数
// 替换 Math.max(1, parseInt(...)) 和 Math.min(100, Math.max(1, parseInt(...))) 手动验证
export const paginationParseSchema = z.object({
  page: z
    .string()
    .optional()
    .default('1')
    .transform((val) => {
      const num = parseInt(val, 10);
      if (isNaN(num) || num < 1) return 1;
      return num;
    }),
  limit: z
    .string()
    .optional()
    .default('20')
    .transform((val) => {
      const num = parseInt(val, 10);
      if (isNaN(num) || num < 1) return 20;
      return Math.min(100, num);
    }),
});

// 通用时间戳字段
export const timestampSchema = z.string().or(z.date());

/** 单次充值最大金额 */
export const MAX_RECHARGE_AMOUNT = 1_000_000;

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type PaginationQueryType = z.infer<typeof paginationQuerySchema>;
export type IdParam = z.infer<typeof idParamSchema>;
export type NumericIdParam = z.infer<typeof numericIdParamSchema>;
export type PaginationParse = z.infer<typeof paginationParseSchema>;
