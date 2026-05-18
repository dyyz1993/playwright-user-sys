import * as crypto from 'crypto';
import * as stream from 'stream';
import * as http from 'http';
import * as net from 'net';
import * as url from 'url';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import httpProxy from 'http-proxy';
import { UserModel } from '../models/user.model.js';
import { SessionModel } from '../models/session/index.js';
import { logger } from '@shared/utils/logger.js';
import { createBrowserSession, handleSessionDisconnect } from './session.service.js';
import { memoryStore } from './memory-store.service.js';
import { SessionStatus } from '@shared/types/index.js';
import { startHeartbeat, type HeartbeatHandle } from './ws-heartbeat.js';

function shortId(): string {
  return crypto.randomUUID().slice(0, 8);
}

const wsConnectQuerySchema = z.object({
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

const existingSessionQuerySchema = z.object({
  sessionId: z.string().min(1),
  token: z.string().optional(),
});

export class NativeWebSocketProxyService {
  private proxy: httpProxy;
  private server: http.Server;
  private activeConnections: Set<string> = new Set();
  private maxConnections: number = 1000;
  private connectionTimestamps: Map<string, number> = new Map();
  private heartbeatHandles: Map<string, HeartbeatHandle> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private upgradeHandler: ((request: http.IncomingMessage, socket: stream.Duplex, head: Buffer) => void) | null = null;

  constructor(server: http.Server) {
    if (!server) {
      logger.error('无法初始化WebSocket服务：HTTP服务器未提供');
      throw new Error('HTTP服务器未提供');
    }

    this.server = server;
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

      const origin = request.headers.origin;

      if (process.env.NODE_ENV === 'production' && !origin) {
        logger.warn('WebSocket 连接被拒绝: 生产环境缺少 Origin header');
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      if (origin) {
        const allowedHosts = ['localhost', '127.0.0.1'];
        try {
          const originHost = new URL(origin).hostname;
          const isAllowed =
            allowedHosts.includes(originHost) ||
            (process.env.NODE_ENV === 'production' && !allowedHosts.includes(originHost));
          if (!isAllowed) {
            logger.warn(`WebSocket Origin 不被允许: ${origin}`);
            socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
            socket.destroy();
            return;
          }
        } catch {
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
          socket.destroy();
          return;
        }
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
            this.handleViewerWebSocketProxy(request, socket, head, sessionIdFromPath, pathname).catch((error) => {
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
      const now = Date.now();
      const STALE_MS = 5 * 60 * 1000;
      for (const [sid, ts] of this.connectionTimestamps.entries()) {
        if (now - ts > STALE_MS) {
          logger.warn(`清理超时的WebSocket连接 (sessionId: ${sid})`);
          this.cleanupConnection(sid);
          this.connectionTimestamps.delete(sid);
        }
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
      await this.handleExistingSessionProxy(request, socket, head, sessionIdParam, queryParams, connId);
    } else if (apiKeyParam) {
      await this.handleNewSessionProxy(request, socket, head, queryParams, connId);
    } else {
      logger.error('WebSocket连接缺少 sessionId 或 apiKey 参数', { connectionId: connId });
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\nMissing sessionId or apiKey');
      socket.destroy();
    }
  }

  private async handleExistingSessionProxy(
    request: http.IncomingMessage,
    socket: stream.Duplex,
    head: Buffer,
    sessionId: string,
    queryParams: Record<string, unknown>,
    connId: string
  ): Promise<void> {
    const cid = { connectionId: connId, sessionId };
    try {
      existingSessionQuerySchema.parse(queryParams);

      const token =
        (queryParams.token as string) ||
        (request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.split(' ')[1] : null) ||
        (request.headers.cookie
          ? (request.headers.cookie
              .split(';')
              .map((c) => c.trim())
              .find((c) => c.startsWith('token='))
              ?.split('=')[1] ?? null)
          : null);

      if (!token) {
        logger.error(`已有会话代理缺少认证信息`, cid);
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\nMissing authentication');
        socket.destroy();
        return;
      }

      const jwtSecret =
        process.env.JWT_SECRET ||
        (process.env.NODE_ENV === 'test' ? 'test-secret-key-for-testing-only-32chars' : 'dev-only-secret-key');

      let decoded: { id: number; role: string };
      try {
        decoded = jwt.verify(token, jwtSecret) as { id: number; role: string };
      } catch {
        logger.error(`已有会话代理JWT验证失败`, cid);
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\nInvalid token');
        socket.destroy();
        return;
      }

      const user = await UserModel.findById(decoded.id);
      if (!user) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\nUser not found');
        socket.destroy();
        return;
      }

      const session = await SessionModel.findById(sessionId);
      if (!session) {
        logger.error(`已有会话代理：会话不存在`, cid);
        socket.write('HTTP/1.1 404 Not Found\r\n\r\nSession not found');
        socket.destroy();
        return;
      }

      if (session.status !== SessionStatus.CREATED && session.status !== SessionStatus.CONNECTED) {
        logger.error(`已有会话代理：会话状态无效 (status: ${session.status})`, cid);
        socket.write('HTTP/1.1 410 Gone\r\n\r\nSession is not active');
        socket.destroy();
        return;
      }

      const machineId = session.machine_id;
      if (!machineId) {
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\nNo machine assigned');
        socket.destroy();
        return;
      }

      const machineInfo = memoryStore.getMachine(machineId);
      if (!machineInfo) {
        socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\nMachine not found');
        socket.destroy();
        return;
      }

      const machineIp = machineInfo.ip;
      const proxyPort = machineInfo.proxy_port;
      const targetUrl = `ws://${machineIp}:${proxyPort}?sessionId=${sessionId}`;

      logger.info(`已有会话代理: machineId=${machineId}, target=${targetUrl}`, cid);

      (request as { sessionId?: string }).sessionId = sessionId;

      if (this.activeConnections.size >= this.maxConnections) {
        logger.error(`WebSocket连接数已达上限 (${this.activeConnections.size}/${this.maxConnections})`, cid);
        socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\nMax connections reached');
        socket.destroy();
        return;
      }

      this.activeConnections.add(sessionId);
      this.connectionTimestamps.set(sessionId, Date.now());

      const hbHandle = startHeartbeat(socket, sessionId, () => {
        this.cleanupConnection(sessionId, connId);
      });
      this.heartbeatHandles.set(sessionId, hbHandle);

      const cleanupHandler = () => {
        hbHandle.stop();
        this.heartbeatHandles.delete(sessionId);
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
      if (!socket.destroyed && socket.writable) {
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
      }
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
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
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

      if (this.activeConnections.size >= this.maxConnections) {
        logger.error(`WebSocket连接数已达上限 (${this.activeConnections.size}/${this.maxConnections})`, cid());
        socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\nMax connections reached');
        socket.destroy();
        return;
      }

      this.activeConnections.add(sessionId);
      this.connectionTimestamps.set(sessionId, Date.now());

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
      this.heartbeatHandles.set(sessionId, hbHandle);

      const cleanupHandler = () => {
        if (!sessionId) return;
        hbHandle.stop();
        this.heartbeatHandles.delete(sessionId);
        this.cleanupConnection(sessionId, connId);
      };

      socket.on('close', () => {
        logger.info(`客户端WebSocket连接关闭`, cid());
        cleanupHandler();
      });

      socket.on('error', (err: Error) => {
        logger.error(`客户端WebSocket连接错误:`, { ...cid(), error: err.message });
      });

      this.proxy.ws(request, socket, head, { target: targetUrl }, (err: Error) => {
        if (err) {
          logger.error(`代理WebSocket连接失败:`, { ...cid(), error: err.message });
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

      if (!socket.destroyed && socket.writable) {
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
      }
    }
  }

  private async handleViewerWebSocketProxy(
    request: http.IncomingMessage,
    socket: stream.Duplex,
    head: Buffer,
    sessionId: string,
    pathname: string
  ): Promise<void> {
    const connId = shortId();
    const cid = { connectionId: connId, sessionId };
    try {
      const parsedUrl = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
      const queryToken = parsedUrl.searchParams.get('token');

      const token =
        queryToken ||
        (request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.split(' ')[1] : null) ||
        (request.headers.cookie
          ? (request.headers.cookie
              .split(';')
              .map((c) => c.trim())
              .find((c) => c.startsWith('token='))
              ?.split('=')[1] ?? null)
          : null);

      if (!token) {
        logger.error(`Viewer WebSocket代理缺少认证信息`, cid);
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\nMissing authentication');
        socket.destroy();
        return;
      }

      const jwtSecret =
        process.env.JWT_SECRET ||
        (process.env.NODE_ENV === 'test' ? 'test-secret-key-for-testing-only-32chars' : 'dev-only-secret-key');

      let decoded: { id: number; role: string };
      try {
        decoded = jwt.verify(token, jwtSecret) as { id: number; role: string };
      } catch {
        const userByKey = await UserModel.findByApiKey(token);
        if (!userByKey) {
          logger.error(`Viewer WebSocket代理认证失败`, cid);
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\nInvalid token');
          socket.destroy();
          return;
        }
        decoded = { id: userByKey.id, role: userByKey.role };
      }

      const user = await UserModel.findById(decoded.id);
      if (!user) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\nUser not found');
        socket.destroy();
        return;
      }

      const session = await SessionModel.findById(sessionId);
      if (!session) {
        logger.error(`Viewer WebSocket代理：会话不存在`, cid);
        socket.write('HTTP/1.1 404 Not Found\r\n\r\nSession not found');
        socket.destroy();
        return;
      }

      if (session.status !== SessionStatus.CREATED && session.status !== SessionStatus.CONNECTED) {
        logger.error(`Viewer WebSocket代理：会话状态无效 (status: ${session.status})`, cid);
        socket.write('HTTP/1.1 410 Gone\r\n\r\nSession is not active');
        socket.destroy();
        return;
      }

      if (session.user_id !== decoded.id && decoded.role !== 'admin') {
        logger.error(`Viewer WebSocket代理：无权访问会话 (userId: ${decoded.id})`, cid);
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\nAccess denied');
        socket.destroy();
        return;
      }

      const machineId = session.machine_id;
      if (!machineId) {
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\nNo machine assigned');
        socket.destroy();
        return;
      }

      const machineInfo = memoryStore.getMachine(machineId);
      if (!machineInfo) {
        socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\nMachine not found');
        socket.destroy();
        return;
      }

      const machineIp = machineInfo.ip;
      const proxyPort = machineInfo.proxy_port;
      const targetUrl = `ws://${machineIp}:${proxyPort}${pathname}?sessionId=${sessionId}`;

      logger.info(`Viewer WS Bridge: target=${targetUrl}`, cid);

      (request as { sessionId?: string }).sessionId = sessionId;

      const netSocket = net.connect(proxyPort, machineIp, () => {
        logger.info(`Viewer WS bridge TCP connected to ${machineIp}:${proxyPort}`, cid);

        const reqHeaders = [
          `${request.method} ${request.url} HTTP/1.1`,
          `Host: ${machineIp}:${proxyPort}`,
          'Connection: Upgrade',
          'Upgrade: websocket',
          `Sec-WebSocket-Key: ${request.headers['sec-websocket-key']}`,
          `Sec-WebSocket-Version: ${request.headers['sec-websocket-version'] || '13'}`,
        ];

        reqHeaders.push('\r\n');
        netSocket.write(reqHeaders.join('\r\n'));

        if (head && head.length > 0) {
          netSocket.write(head);
        }
      });

      let machineHeaderReceived = false;
      let bridged = false;

      function startBridging() {
        if (bridged) return;
        bridged = true;
        logger.info(`Viewer WS bridge active - piping raw bytes`, cid);

        socket.on('data', (chunk: Buffer) => {
          if (!netSocket.destroyed && netSocket.writable) {
            netSocket.write(chunk);
          }
        });
      }

      let machineRespBuffer = Buffer.alloc(0);
      netSocket.on('data', (chunk: Buffer) => {
        if (!machineHeaderReceived) {
          machineRespBuffer = Buffer.concat([machineRespBuffer, chunk]);
          const headerEnd = machineRespBuffer.indexOf('\r\n\r\n');
          if (headerEnd !== -1) {
            const headers = machineRespBuffer.slice(0, headerEnd).toString();
            const remaining = machineRespBuffer.slice(headerEnd + 4);

            logger.info(`Machine 101 response received: ${headers.split('\r\n')[0]}`, cid);

            const cleanHeaders = headers
              .split('\r\n')
              .filter((line) => !line.toLowerCase().startsWith('sec-websocket-extensions'))
              .join('\r\n');

            socket.write(Buffer.from(cleanHeaders + '\r\n\r\n'));
            machineHeaderReceived = true;

            if (remaining.length > 0) {
              socket.write(remaining);
            }

            startBridging();
          }
        } else if (machineHeaderReceived && !socket.destroyed && socket.writable) {
          socket.write(chunk);
        }
      });

      netSocket.on('error', (err: Error) => {
        logger.error(`Viewer WS TCP error:`, { ...cid, error: err.message });
        if (!socket.destroyed && socket.writable) {
          socket.end();
        }
      });

      netSocket.on('close', () => {
        logger.info(`Viewer WS machine TCP closed`, cid);
        if (!socket.destroyed && socket.writable) {
          socket.end();
        }
      });

      socket.on('close', () => {
        logger.info(`Viewer WebSocket连接关闭 (path: ${pathname})`, cid);
        netSocket.destroy();
      });

      socket.on('error', (err: Error) => {
        logger.error(`Viewer WebSocket连接错误:`, { ...cid, error: err.message });
        netSocket.destroy();
      });
    } catch (error: unknown) {
      logger.error(`Viewer WebSocket代理失败:`, { ...cid, error: (error as Error).message });
      if (!socket.destroyed && socket.writable) {
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
      }
    }
  }

  private cleanupConnection(sessionId: string, connId?: string): void {
    if (!sessionId || !this.activeConnections.has(sessionId)) {
      return;
    }

    logger.info(`清理WebSocket连接`, { connectionId: connId || 'unknown', sessionId });
    this.activeConnections.delete(sessionId);
    this.connectionTimestamps.delete(sessionId);

    const hbHandle = this.heartbeatHandles.get(sessionId);
    if (hbHandle) {
      hbHandle.stop();
      this.heartbeatHandles.delete(sessionId);
    }

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
    return this.activeConnections.size;
  }

  public close(): void {
    logger.info('关闭WebSocket代理服务...');

    const activeSessionIds = [...this.activeConnections];

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
