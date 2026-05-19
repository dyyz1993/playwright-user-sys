import { logger } from '@shared/utils/logger.js';
import { CONFIG } from './config.js';
import type { SessionInfo, ConnectionInfo } from './types.js';

export interface ConnectionState {
  sessions: Map<string, SessionInfo>;
  connections: Map<string, ConnectionInfo>;
  disconnectionTimers: Map<string, NodeJS.Timeout>;
  emit(event: string, ...args: unknown[]): boolean;
}

export function updateSessionActivity(state: ConnectionState, sessionId: string): void {
  const session = state.sessions.get(sessionId);
  if (session) {
    session.lastActivity = Date.now();
  }
}

export function handleConnection(state: ConnectionState, sessionId: string): void {
  const now = Date.now();
  const session = state.sessions.get(sessionId);
  if (!session) {
    logger.warn(`处理连接：会话不存在 (sessionId: ${sessionId})`);
    return;
  }

  if (state.disconnectionTimers.has(sessionId)) {
    clearTimeout(state.disconnectionTimers.get(sessionId)!);
    state.disconnectionTimers.delete(sessionId);
    logger.info(`已清除断开连接计时器 (sessionId: ${sessionId})`);
  }

  const previousTotalTime = state.connections.has(sessionId) ? state.connections.get(sessionId)!.totalConnectedTime : 0;

  state.connections.set(sessionId, {
    connectedAt: now,
    lastActivity: now,
    totalConnectedTime: previousTotalTime,
  });
  state.emit('sessionConnected', sessionId);
  logger.info(`用户已连接到会话 (sessionId: ${sessionId})`);
}

export function updateActivity(state: ConnectionState, sessionId: string): void {
  const connection = state.connections.get(sessionId);
  if (connection) {
    connection.lastActivity = Date.now();
    logger.debug(`已更新用户活动时间 (sessionId: ${sessionId})`);
  }
}

export function handleDisconnection(
  state: ConnectionState,
  sessionId: string,
  closeBrowserFn: (sessionId: string) => Promise<boolean>
): void {
  logger.info(`开始处理用户断开连接 (sessionId: ${sessionId})`);
  if (state.disconnectionTimers.has(sessionId)) {
    logger.warn(`断开连接处理已在进行中 (sessionId: ${sessionId})`);
    return;
  }
  const connection = state.connections.get(sessionId);
  if (connection) {
    const now = Date.now();
    const connectionDuration = Math.floor((now - connection.connectedAt) / 1000);
    connection.totalConnectedTime += connectionDuration;
    state.emit('sessionDisconnected', sessionId, connection.totalConnectedTime);
    logger.info(
      `用户已断开会话连接 (sessionId: ${sessionId}, 本次连接时长: ${connectionDuration}秒, 总连接时长: ${connection.totalConnectedTime}秒)`
    );
  } else {
    logger.warn(`处理断开连接：找不到连接信息 (sessionId: ${sessionId})`);
  }
  logger.info(`设置断开连接计时器 (sessionId: ${sessionId}, 超时时间: ${CONFIG.disconnectionTimeout}ms)`);
  const timer = setTimeout(() => {
    logger.info(`会话连接超时，准备关闭浏览器 (sessionId: ${sessionId})`);
    closeBrowserFn(sessionId)
      .then((success) => logger.info(`超时会话浏览器关闭 ${success ? '成功' : '失败'} (sessionId: ${sessionId})`))
      .catch((error: unknown) => logger.error(`关闭超时会话浏览器出错 (sessionId: ${sessionId}):`, error));
    state.disconnectionTimers.delete(sessionId);
  }, CONFIG.disconnectionTimeout);
  state.disconnectionTimers.set(sessionId, timer);
}

export function startActivityReporting(
  state: ConnectionState,
  handleDisconnectionFn: (sessionId: string) => void
): NodeJS.Timeout {
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [sessionId, connection] of state.connections.entries()) {
      if (!state.disconnectionTimers.has(sessionId)) {
        if (now - connection.lastActivity > CONFIG.sessionActivityTimeout) {
          logger.warn(`会话活动超时 (sessionId: ${sessionId})`);
          handleDisconnectionFn(sessionId);
        }
      }
    }
  }, CONFIG.activityReportInterval);
  return interval;
}

export function stopActivityReporting(interval: NodeJS.Timeout | null): null {
  if (interval) {
    clearInterval(interval);
  }
  return null;
}
