import { z } from 'zod';

export const wsConnectQuerySchema = z.object({
  apiKey: z.string().min(1),
  width: z.coerce.number().optional(),
  height: z.coerce.number().optional(),
  proxy: z.string().optional(),
  proxyBypass: z.string().optional(),
  userAgent: z.string().optional(),
  cookies: z.record(z.string(), z.string()).optional(),
  localStorage: z.record(z.string(), z.string()).optional(),
  sharedUserData: z.coerce.boolean().optional(),
  timezone: z.string().optional(),
});

export const existingSessionQuerySchema = z.object({
  sessionId: z.string().min(1),
  token: z.string().optional(),
});
