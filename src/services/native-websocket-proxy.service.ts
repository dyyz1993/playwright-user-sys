import * as stream from 'stream';
import * as http from 'http';
import * as url from 'url';
import jwt from 'jsonwebtoken';
import httpProxy from 'http-proxy';
import { UserModel } from '../models/user.model.js';
import { SessionModel } from '../models/session/index.js';
import { logger } from '@shared/utils/logger.js';
import { createBrowserSession, handleSessionDisconnect } from './session.service.js';
import { memoryStore } from './memory-store.service.js';
import { SessionStatus } from '@shared/types/index.js';
import { startHeartbeat } from './ws-heartbeat.js';
import { wsConnectQuerySchema, existingSessionQuerySchema } from './websocket-proxy/validation.js';
import { shortId, getJwtSecret, extractTokenFromHeaderOrCookie } from './websocket-proxy/utils.js';
import { ConnectionManager } from './websocket-proxy/connection-manager.js';
import { validateOrigin } from './websocket-proxy/origin-validator.js';
import { handleViewerWebSocketProxy } from './websocket-proxy/viewer-bridge.js';
import { rejectUpgrade } from './websocket-proxy/error-handler.js';

export class NativeWebSocketProxyService {
  private proxy: httpProxy;
  private server: http.Server;
  private connectionManager: ConnectionManager;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private upgradeHandler: ((request: http.IncomingMessage, socket: stream.Duplex, head: Buffer) => void) | null = null;

  get activeConnections(): Set<string> {
    return this.connectionManager.getActiveSet();
  }

  constructor(server: http.Server) {
    if (!server) {
      logger.error('无法初始化WebSocket服务：HTTP服务器未提供');
      throw new Error('HTTP服务器未提供');
    }

    this.server = server;
    this.connectionManager = new ConnectionManager();
    logger.info('正在初始化原生WebSocket代理服务...');

    this.proxy = httpProxy.createProxyServer({
      ws: true,
      timeout: 60000,
      proxyTimeout: 60000,
      ignorePath: true,
    });

    this.proxy.on('error', (err: Error, req: http.IncomingMessage, socket: unknown) => {
      const sessionId = (req as { sessionId?: string }).sessionId || '未知';
      logger.error(`WebSocket代理错误 (sessionId: ${sessionId}):`, err);

      this.cleanupConnection(sessionId);

      const sock = socket as stream.Duplex | undefined;
      if (sock && !sock.destroyed) {
        try {
          if (sock.writable) {
            sock.end();
          }
        } catch (socketError: unknown) {
          logger.error(`关闭socket失败 (sessionId: ${sessionId}):`, socketError);
        }
      }
    });

    logger.info('HTTP代理实例已创建');

    this.upgradeHandler = (request, socket, head) => {
      if (process.env.NODE_ENV !== 'production') {
        logger.info(`收到HTTP升级请求: ${request.url}`);
      }

      if (!validateOrigin(request.headers.origin, socket)) {
        return;
      }

      try {
        const pathname = url.parse(request.url || '').pathname;

        if (pathname === '/ws/connect') {
          logger.info(`处理WebSocket升级请求: ${request.url}`);
          this.handleWebSocketUpgrade(request, socket, head).catch((error) => {
            logger.error('处理WebSocket升级请求失败:', error);
            try {
              if (!socket.destroyed && socket.writable) {
                socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
                socket.destroy();
              }
            } catch (socketError: unknown) {
              logger.error('关闭socket失败:', socketError);
            }
          });
        } else if (
          pathname &&
          pathname.startsWith('/ws/') &&
          (pathname.endsWith('/stream') || pathname.endsWith('/events'))
        ) {
          const pathParts = pathname.split('/');
          const sessionIdFromPath = pathParts[2];
          if (sessionIdFromPath) {
            logger.info(`处理Viewer WebSocket升级请求: ${pathname} (sessionId: ${sessionIdFromPath})`);
            handleViewerWebSocketProxy(request, socket, head, sessionIdFromPath, pathname).catch((error) => {
              logger.error(`Viewer WebSocket代理失败 (sessionId: ${sessionIdFromPath}):`, error);
              try {
                if (!socket.destroyed && socket.writable) {
                  socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
                  socket.destroy();
                }
              } catch (socketError: unknown) {
                logger.error('关闭socket失败:', socketError);
              }
            });
          }
        }
      } catch (error: unknown) {
        logger.error('处理HTTP升级请求失败:', error);
        try {
          if (!socket.destroyed && socket.writable) {
            socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
            socket.destroy();
          }
        } catch (socketError: unknown) {
          logger.error('关闭socket失败:', socketError);
        }
      }
    };

    server.on('upgrade', this.upgradeHandler);

    this.heartbeatInterval = setInterval(() => {
      const STALE_MS = 5 * 60 * 1000;
      for (const sid of this.connectionManager.getStaleSessionIds(STALE_MS)) {
        logger.warn(`清理超时的WebSocket连接 (sessionId: ${sid})`);
        this.cleanupConnection(sid);
      }
    }, 60 * 1000);

    logger.info('原生WebSocket代理服务已成功初始化，正在监听upgrade事件');
  }

  private async handleWebSocketUpgrade(
    request: http.IncomingMessage,
    socket: stream.Duplex,
    head: Buffer
  ): Promise<void> {
    const connId = shortId();
    const parsedUrl = url.parse(request.url || '', true);
    const queryParams = parsedUrl.query;
    const sessionIdParam = queryParams.sessionId as string | undefined;
    const headerApiKey = request.headers['x-api-key'] as string | undefined;
    const apiKeyParam = headerApiKey || (queryParams.apiKey as string | undefined);

    if (sessionIdParam) {
      if (apiKeyParam) {
        await this.handleExistingSessionProxy(request, socket, head, sessionIdParam, queryParams, connId, apiKeyParam);
      } else {
        await this.handleExistingSessionProxy(request, socket, head, sessionIdParam, queryParams, connId);
      }
    } else if (apiKeyParam) {
      await this.handleNewSessionProxy(request, socket, head, queryParams, connId);
    } else {
      logger.error('WebSocket连接缺少 sessionId 或 apiKey 参数', { connectionId: connId });
      rejectUpgrade(socket, 400, 'Missing sessionId or apiKey');
    }
  }

  private async handleExistingSessionProxy(
    request: http.IncomingMessage,
    socket: stream.Duplex,
    head: Buffer,
    sessionId: string,
    queryParams: Record<string, unknown>,
    connId: string,
    apiKey?: string
  ): Promise<void> {
    const cid = { connectionId: connId, sessionId };
    try {
      existingSessionQuerySchema.parse(queryParams);

      let userId: number;

      if (apiKey) {
        const apiUser = await UserModel.findByApiKey(apiKey);
        if (!apiUser || apiUser.status !== 'active') {
          logger.error(`已有会话代理API Key验证失败`, cid);
          rejectUpgrade(socket, 401, 'Invalid API Key');
          return;
        }
        userId = apiUser.id;
      } else {
        const queryToken = queryParams.token as string | undefined;
        const token: string | null = queryToken || extractTokenFromHeaderOrCookie(request);

        if (!token) {
          logger.error(`已有会话代理缺少认证信息`, cid);
          rejectUpgrade(socket, 401, 'Missing authentication');
          return;
        }

        const jwtSecret = getJwtSecret();

        let decoded: { id: number; role: string };
        try {
          decoded = jwt.verify(token, jwtSecret) as { id: number; role: string };
        } catch {
          logger.error(`已有会话代理JWT验证失败`, cid);
          rejectUpgrade(socket, 401, 'Invalid token');
          return;
        }

        const user = await UserModel.findById(decoded.id);
        if (!user) {
          rejectUpgrade(socket, 401, 'User not found');
          return;
        }
        userId = user.id;
      }

      const session = await SessionModel.findById(sessionId);
      if (!session) {
        logger.error(`已有会话代理：会话不存在`, cid);
        rejectUpgrade(socket, 404, 'Session not found');
        return;
      }

      if (session.user_id !== userId) {
        logger.error(`已有会话代理：会话不属于当前用户`, cid);
        rejectUpgrade(socket, 403, 'Forbidden');
        return;
      }

      if (session.status !== SessionStatus.CREATED && session.status !== SessionStatus.CONNECTED) {
        logger.error(`已有会话代理：会话状态无效 (status: ${session.status})`, cid);
        rejectUpgrade(socket, 410, 'Session is not active');
        return;
      }

      const machineId = session.machine_id;
      if (!machineId) {
        rejectUpgrade(socket, 500, 'No machine assigned');
        return;
      }

      const machineInfo = memoryStore.getMachine(machineId);
      if (!machineInfo) {
        rejectUpgrade(socket, 503, 'Machine not found');
        return;
      }

      const machineIp = machineInfo.ip;
      const proxyPort = machineInfo.proxy_port;
      const targetUrl = `ws://${machineIp}:${proxyPort}?sessionId=${sessionId}`;

      logger.info(`已有会话代理: machineId=${machineId}, target=${targetUrl}`, cid);

      (request as { sessionId?: string }).sessionId = sessionId;

      if (this.connectionManager.isAtCapacity()) {
        logger.error(
          `WebSocket连接数已达上限 (${this.connectionManager.getActiveConnectionCount()}/${this.connectionManager.maxConnections})`,
          cid
        );
        rejectUpgrade(socket, 503, 'Max connections reached');
        return;
      }

      this.connectionManager.add(sessionId);

      const hbHandle = startHeartbeat(socket, sessionId, () => {
        this.cleanupConnection(sessionId, connId);
      });
      this.connectionManager.setHeartbeat(sessionId, hbHandle);

      const cleanupHandler = () => {
        hbHandle.stop();
        this.connectionManager.removeHeartbeat(sessionId);
        this.cleanupConnection(sessionId, connId);
      };

      socket.on('close', () => {
        logger.info(`客户端WebSocket连接关闭`, cid);
        cleanupHandler();
      });

      socket.on('error', (err: Error) => {
        logger.error(`客户端WebSocket连接错误:`, { ...cid, error: err.message });
      });

      this.proxy.ws(request, socket, head, { target: targetUrl }, (err: Error) => {
        if (err) {
          logger.error(`代理WebSocket连接失败:`, { ...cid, error: err.message });
          cleanupHandler();
        } else {
          logger.info(`WebSocket代理连接成功`, cid);
        }
      });
    } catch (error: unknown) {
      logger.error(`已有会话代理失败:`, { ...cid, error: (error as Error).message });
      rejectUpgrade(socket, 500);
    }
  }

  private async handleNewSessionProxy(
    request: http.IncomingMessage,
    socket: stream.Duplex,
    head: Buffer,
    queryParams: Record<string, unknown>,
    connId: string
  ): Promise<void> {
    let sessionId: string | null = null;
    const cid = () => ({ connectionId: connId, sessionId: sessionId || 'pending' });

    try {
      const headerApiKey = request.headers['x-api-key'] as string | undefined;
      if (headerApiKey) {
        (queryParams as Record<string, unknown>).apiKey = headerApiKey;
      }
      const validatedParams = wsConnectQuerySchema.parse(queryParams);
      const safeParams = { ...validatedParams, apiKey: '***REDACTED***' };
      logger.info(`WebSocket连接参数: ${JSON.stringify(safeParams)}`, cid());

      const user = await UserModel.findByApiKey(validatedParams.apiKey as string);
      if (!user) {
        logger.error('无效的API密钥', cid());
        rejectUpgrade(socket, 401);
        return;
      }

      const userId = user.id;

      const sessionOptions = {
        userAgent: validatedParams.userAgent,
        proxy: validatedParams.proxy,
        proxyBypass: validatedParams.proxyBypass,
        cookies: validatedParams.cookies,
        localStorage: validatedParams.localStorage,
        viewport:
          validatedParams.width && validatedParams.height
            ? { width: validatedParams.width, height: validatedParams.height }
            : undefined,
        sharedUserData: validatedParams.sharedUserData,
        timezone: validatedParams.timezone,
      };

      logger.info(`为用户 ${userId} 创建浏览器会话`, cid());
      const sessionResult = await createBrowserSession(userId, sessionOptions, true);
      sessionId = sessionResult.sessionId;
      const machineId = sessionResult.machineId;
      logger.info(`会话创建成功`, cid());

      (request as { sessionId?: string }).sessionId = sessionId;

      if (this.connectionManager.isAtCapacity()) {
        logger.error(
          `WebSocket连接数已达上限 (${this.connectionManager.getActiveConnectionCount()}/${this.connectionManager.maxConnections})`,
          cid()
        );
        rejectUpgrade(socket, 503, 'Max connections reached');
        return;
      }

      this.connectionManager.add(sessionId);

      const originalWsEndpoint = sessionResult.browserWSEndpoint;

      const machineInfo = memoryStore.getMachine(machineId);
      if (!machineInfo) {
        throw new Error(`无法获取机器信息: ${machineId}`);
      }

      logger.info(`获取到机器真实IP: ${machineInfo.ip} (machineId: ${machineId})`, cid());

      const targetUrl = (sessionResult as { internalTargetUrl?: string }).internalTargetUrl || sessionResult.directUrl;

      logger.info(`原始WebSocket端点: ${originalWsEndpoint}`, cid());
      logger.info(`修正后的WebSocket端点: ${targetUrl}`, cid());
      logger.info(`使用代理转发到目标WebSocket: ${targetUrl}`, cid());

      const hbHandle = startHeartbeat(socket, sessionId, () => {
        if (!sessionId) return;
        this.cleanupConnection(sessionId, connId);
      });
      this.connectionManager.setHeartbeat(sessionId, hbHandle);

      const cleanupHandler = () => {
        if (!sessionId) return;
        hbHandle.stop();
        this.connectionManager.removeHeartbeat(sessionId);
        this.cleanupConnection(sessionId, connId);
      };

      socket.on('close', () => {
        logger.info(`客户端WebSocket连接关闭`, cid());
        cleanupHandler();
      });

      socket.on('error', (err: Error) => {
        logger.error(`客户端WebSocket连接错误:`, { ...cid, error: err.message });
      });

      this.proxy.ws(request, socket, head, { target: targetUrl }, (err: Error) => {
        if (err) {
          logger.error(`代理WebSocket连接失败:`, { ...cid, error: err.message });
          cleanupHandler();
        } else {
          logger.info(`WebSocket代理连接成功`, cid());
        }
      });

      logger.info(`WebSocket代理转发已设置`, cid());
    } catch (error: unknown) {
      logger.error('处理WebSocket连接失败:', { ...cid(), error: (error as Error).message });

      if (sessionId) {
        this.cleanupConnection(sessionId, connId);
      }

      rejectUpgrade(socket, 500);
    }
  }

  private cleanupConnection(sessionId: string, connId?: string): void {
    if (!sessionId || !this.connectionManager.has(sessionId)) {
      return;
    }

    logger.info(`清理WebSocket连接`, { connectionId: connId || 'unknown', sessionId });
    this.connectionManager.remove(sessionId);

    this.handleCleanupDisconnect(sessionId, connId).catch((error) => {
      logger.error(`清理会话资源失败:`, {
        connectionId: connId || 'unknown',
        sessionId,
        error: (error as Error).message,
      });
    });
  }

  private async handleCleanupDisconnect(sessionId: string, connId?: string): Promise<void> {
    const cid = { connectionId: connId || 'unknown', sessionId };
    try {
      const session = await SessionModel.findById(sessionId);

      if (session && session.user_id && session.machine_id) {
        await handleSessionDisconnect(sessionId, session.user_id, session.machine_id);
        logger.info(`会话资源已清理`, cid);
      }
    } catch (error: unknown) {
      logger.error(`清理会话资源失败:`, { ...cid, error: (error as Error).message });
    }
  }

  shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  public getActiveConnectionCount(): number {
    return this.connectionManager.getActiveConnectionCount();
  }

  public close(): void {
    logger.info('关闭WebSocket代理服务...');

    const activeSessionIds = this.connectionManager.getAllSessionIds();

    for (const sessionId of activeSessionIds) {
      this.cleanupConnection(sessionId);
    }

    this.proxy.close();

    if (this.upgradeHandler) {
      this.server.removeListener('upgrade', this.upgradeHandler);
      this.upgradeHandler = null;
    }

    logger.info('WebSocket代理服务已关闭');
  }
}
