import { logger } from '@shared/utils/logger.js';

export const WS_HEARTBEAT_INTERVAL_MS = 30_000;
export const WS_HEARTBEAT_TIMEOUT_MS = 60_000;

export interface HeartbeatHandle {
  stop: () => void;
  reset: () => void;
}

export interface HeartbeatSocket {
  on(event: string, listener: (...args: any[]) => void): this;
  removeListener(event: string, listener: (...args: any[]) => void): this;
  setKeepAlive?(enable: boolean, initialDelay: number): this;
  destroyed?: boolean;
}

export function startHeartbeat(
  socket: HeartbeatSocket,
  connectionId: string,
  onTimeout: (connectionId: string) => void,
  intervalMs: number = WS_HEARTBEAT_INTERVAL_MS,
  timeoutMs: number = WS_HEARTBEAT_TIMEOUT_MS
): HeartbeatHandle {
  let lastActivity = Date.now();
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const onData = () => {
    lastActivity = Date.now();
  };

  const reset = () => {
    lastActivity = Date.now();
  };

  const cleanup = () => {
    stopped = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    try {
      socket.removeListener('data', onData);
    } catch {
      /* ignore if already removed */
    }
  };

  const check = () => {
    if (stopped) return;

    if (socket.destroyed) {
      logger.warn(`WebSocket heartbeat: socket destroyed (${connectionId})`);
      cleanup();
      onTimeout(connectionId);
      return;
    }

    const elapsed = Date.now() - lastActivity;
    if (elapsed >= timeoutMs) {
      logger.warn(`WebSocket heartbeat timeout (${connectionId}): no activity for ${elapsed}ms`);
      cleanup();
      onTimeout(connectionId);
    }
  };

  socket.on('data', onData);

  try {
    socket.setKeepAlive?.(true, intervalMs);
  } catch {
    /* setKeepAlive may not be available on all Duplex streams */
  }

  timer = setInterval(check, intervalMs);

  return {
    stop: cleanup,
    reset,
  };
}
