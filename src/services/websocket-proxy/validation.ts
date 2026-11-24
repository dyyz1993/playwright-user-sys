import { z } from 'zod';
import { SessionStatus } from '@shared/types/index.js';

// disconnected = 客户端已断开但机器仍在 DISCONNECTION_TIMEOUT 保活期内保留浏览器，允许重新接入；
// closed/expired/error/completed 为终态，浏览器已不存在。
export function isSessionReconnectable(status: SessionStatus): boolean {
  return (
    status === SessionStatus.CREATED ||
    status === SessionStatus.CONNECTED ||
    status === SessionStatus.DISCONNECTED
  );
}

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
