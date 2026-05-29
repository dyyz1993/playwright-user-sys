import * as stream from 'stream';
import { logger } from '@shared/utils/logger.js';
import { rejectUpgrade } from './error-handler.js';

const ALLOWED_HOSTS = ['localhost', '127.0.0.1'];

export function validateOrigin(origin: string | undefined, socket: stream.Duplex): boolean {
  if (!origin) return true;

  try {
    const originHost = new URL(origin).hostname;
    const isAllowed =
      ALLOWED_HOSTS.includes(originHost) ||
      (process.env.NODE_ENV === 'production' && !ALLOWED_HOSTS.includes(originHost));
    if (!isAllowed) {
      logger.warn(`WebSocket Origin 不被允许: ${origin}`);
      rejectUpgrade(socket, 403);
      return false;
    }
    return true;
  } catch {
    rejectUpgrade(socket, 403);
    return false;
  }
}
