import * as stream from 'stream';
import * as http from 'http';
import * as net from 'net';
import type * as crypto from 'crypto';
import * as url from 'url';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import httpProxy from 'http-proxy';
import type { WebSocket as WSClient } from 'ws';
import { UserModel } from '../models/user.model.js';
import { SessionModel } from '../models/session.model.js';
import { logger } from '@shared/utils/logger.js';
import { createBrowserSession, handleSessionDisconnect } from './session.service.js';
import { memoryStore } from './memory-store.service.js';
import { env } from '../config/env.js';
import { SessionStatus } from '@shared/types/index.js';

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
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(server: http.Server) {
    if (!server) {
      logger.error('无法初始化WebSocket服务：HTTP服务器未提供');
      throw new Error('HTTP服务器未提供');
    }

    this.server = server;
    logger.info('正在初始化原生WebSocket代理服务...');

    // 初始化HTTP代理，添加超时设置
    this.proxy = httpProxy.createProxyServer({
      ws: true,
      timeout: 60000, // 60秒超时
      proxyTimeout: 60000,
      ignorePath: true,
    });

    // 代理错误处理
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
        } catch (socketError) {
          logger.error(`关闭socket失败 (sessionId: ${sessionId}):`, socketError);
        }
      }
    });

    logger.info('HTTP代理实例已创建');

    // 拦截所有upgrade事件
    server.on('upgrade', (request, socket, head) => {
      if (process.env.NODE_ENV !== 'production') {
        logger.info(`收到HTTP升级请求: ${request.url}`);
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
            } catch (socketError) {
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
              } catch (socketError) {
                logger.error('关闭socket失败:', socketError);
              }
            });
          }
        }
      } catch (error) {
        logger.error('处理HTTP升级请求失败:', error);
        try {
          if (!socket.destroyed && socket.writable) {
            socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
            socket.destroy();
          }
        } catch (socketError) {
          logger.error('关闭socket失败:', socketError);
        }
      }
    });

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
    const parsedUrl = url.parse(request.url || '', true);
    const queryParams = parsedUrl.query;
    const sessionIdParam = queryParams.sessionId as string | undefined;
    const apiKeyParam = queryParams.apiKey as string | undefined;

    if (sessionIdParam) {
      await this.handleExistingSessionProxy(request, socket, head, sessionIdParam, queryParams);
    } else if (apiKeyParam) {
      await this.handleNewSessionProxy(request, socket, head, queryParams);
    } else {
      logger.error('WebSocket连接缺少 sessionId 或 apiKey 参数');
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\nMissing sessionId or apiKey');
      socket.destroy();
    }
  }

  private async handleExistingSessionProxy(
    request: http.IncomingMessage,
    socket: stream.Duplex,
    head: Buffer,
    sessionId: string,
    queryParams: Record<string, unknown>
  ): Promise<void> {
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
        logger.error(`已有会话代理缺少认证信息 (sessionId: ${sessionId})`);
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\nMissing authentication');
        socket.destroy();
        return;
      }

      const jwtSecret =
        process.env.NODE_ENV === 'test' ? 'test-secret-key-for-testing-only-32chars' : String(env.JWT_SECRET);

      let decoded: { id: number; role: string };
      try {
        decoded = jwt.verify(token, jwtSecret) as { id: number; role: string };
      } catch {
        logger.error(`已有会话代理JWT验证失败 (sessionId: ${sessionId})`);
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
        logger.error(`已有会话代理：会话不存在 (sessionId: ${sessionId})`);
        socket.write('HTTP/1.1 404 Not Found\r\n\r\nSession not found');
        socket.destroy();
        return;
      }

      if (session.status !== SessionStatus.CREATED && session.status !== SessionStatus.CONNECTED) {
        logger.error(`已有会话代理：会话状态无效 (sessionId: ${sessionId}, status: ${session.status})`);
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

      logger.info(`已有会话代理: sessionId=${sessionId}, machineId=${machineId}, target=${targetUrl}`);

      (request as { sessionId?: string }).sessionId = sessionId;

      if (this.activeConnections.size >= this.maxConnections) {
        logger.error(`WebSocket连接数已达上限 (${this.activeConnections.size}/${this.maxConnections})`);
        socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\nMax connections reached');
        socket.destroy();
        return;
      }

      this.activeConnections.add(sessionId);
      this.connectionTimestamps.set(sessionId, Date.now());

      const cleanupHandler = () => {
        this.cleanupConnection(sessionId);
      };

      socket.on('close', () => {
        logger.info(`客户端WebSocket连接关闭 (sessionId: ${sessionId})`);
        cleanupHandler();
      });

      socket.on('error', (err: Error) => {
        logger.error(`客户端WebSocket连接错误 (sessionId: ${sessionId}):`, err);
      });

      this.proxy.ws(request, socket, head, { target: targetUrl }, (err: Error) => {
        if (err) {
          logger.error(`代理WebSocket连接失败 (sessionId: ${sessionId}):`, err);
          cleanupHandler();
        } else {
          logger.info(`WebSocket代理连接成功 (sessionId: ${sessionId})`);
        }
      });
    } catch (error) {
      logger.error(`已有会话代理失败 (sessionId: ${sessionId}):`, error);
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
    queryParams: Record<string, unknown>
  ): Promise<void> {
    let sessionId: string | null = null;

    try {
      const validatedParams = wsConnectQuerySchema.parse(queryParams);
      logger.info(`WebSocket连接参数: ${JSON.stringify(validatedParams)}`);

      const user = await UserModel.findByApiKey(validatedParams.apiKey as string);
      if (!user) {
        logger.error('无效的API密钥');
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

      logger.info(`为用户 ${userId} 创建浏览器会话`);
      const sessionResult = await createBrowserSession(userId, sessionOptions, true);
      sessionId = sessionResult.sessionId;
      const machineId = sessionResult.machineId;
      logger.info(`会话创建成功: ${sessionId}`);

      (request as { sessionId?: string }).sessionId = sessionId;

      if (this.activeConnections.size >= this.maxConnections) {
        logger.error(`WebSocket连接数已达上限 (${this.activeConnections.size}/${this.maxConnections})`);
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

      logger.info(`获取到机器真实IP: ${machineInfo.ip} (machineId: ${machineId})`);

      const targetUrl = (sessionResult as { internalTargetUrl?: string }).internalTargetUrl || sessionResult.directUrl;

      logger.info(`原始WebSocket端点: ${originalWsEndpoint}`);
      logger.info(`修正后的WebSocket端点: ${targetUrl}`);
      logger.info(`使用代理转发到目标WebSocket: ${targetUrl} (sessionId: ${sessionId})`);

      const cleanupHandler = () => {
        if (!sessionId) return;
        this.cleanupConnection(sessionId);
      };

      socket.on('close', () => {
        logger.info(`客户端WebSocket连接关闭 (sessionId: ${sessionId})`);
        cleanupHandler();
      });

      socket.on('error', (err: Error) => {
        logger.error(`客户端WebSocket连接错误 (sessionId: ${sessionId}):`, err);
      });

      this.proxy.ws(request, socket, head, { target: targetUrl }, (err: Error) => {
        if (err) {
          logger.error(`代理WebSocket连接失败 (sessionId: ${sessionId}):`, err);
          cleanupHandler();
        } else {
          logger.info(`WebSocket代理连接成功 (sessionId: ${sessionId})`);
        }
      });

      logger.info(`WebSocket代理转发已设置 (sessionId: ${sessionId})`);
    } catch (error) {
      logger.error('处理WebSocket连接失败:', error);

      if (sessionId) {
        this.cleanupConnection(sessionId);
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
        logger.error(`Viewer WebSocket代理缺少认证信息 (sessionId: ${sessionId})`);
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\nMissing authentication');
        socket.destroy();
        return;
      }

      const jwtSecret =
        process.env.NODE_ENV === 'test' ? 'test-secret-key-for-testing-only-32chars' : String(env.JWT_SECRET);

      let decoded: { id: number; role: string };
      try {
        decoded = jwt.verify(token, jwtSecret) as { id: number; role: string };
      } catch {
        const userByKey = await UserModel.findByApiKey(token);
        if (!userByKey) {
          logger.error(`Viewer WebSocket代理认证失败 (sessionId: ${sessionId})`);
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
        logger.error(`Viewer WebSocket代理：会话不存在 (sessionId: ${sessionId})`);
        socket.write('HTTP/1.1 404 Not Found\r\n\r\nSession not found');
        socket.destroy();
        return;
      }

      if (session.status !== SessionStatus.CREATED && session.status !== SessionStatus.CONNECTED) {
        logger.error(`Viewer WebSocket代理：会话状态无效 (sessionId: ${sessionId}, status: ${session.status})`);
        socket.write('HTTP/1.1 410 Gone\r\n\r\nSession is not active');
        socket.destroy();
        return;
      }

      if (session.user_id !== decoded.id && decoded.role !== 'admin') {
        logger.error(`Viewer WebSocket代理：无权访问会话 (sessionId: ${sessionId}, userId: ${decoded.id})`);
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

      logger.info(`Viewer WS Bridge: sessionId=${sessionId}, target=${targetUrl}`);

      (request as { sessionId?: string }).sessionId = sessionId;

      // Raw TCP bridge: forward WS upgrade to machine, then pipe raw bytes
      // This avoids http-proxy's binary WS frame dropping issue
      const netSocket = net.connect(proxyPort, machineIp, () => {
        logger.info(`Viewer WS bridge TCP connected to ${machineIp}:${proxyPort} (sessionId: ${sessionId})`);

        // Forward client's HTTP upgrade request to machine
        // Include all relevant headers for proper WS negotiation
        const reqHeaders = [
          `${request.method} ${request.url} HTTP/1.1`,
          `Host: ${machineIp}:${proxyPort}`,
          'Connection: Upgrade',
          'Upgrade: websocket',
          `Sec-WebSocket-Key: ${request.headers['sec-websocket-key']}`,
          `Sec-WebSocket-Version: ${request.headers['sec-websocket-version'] || '13'}`,
        ];

        // Intentionally skip Sec-WebSocket-Extensions to avoid permessage-deflate
        // compression negotiation that breaks the raw TCP bridge

        reqHeaders.push('\r\n');
        netSocket.write(reqHeaders.join('\r\n'));

        // Forward any data the client already sent (head buffer)
        if (head && head.length > 0) {
          netSocket.write(head);
        }
      });

      let clientHeaderSent = false;
      let machineHeaderReceived = false;
      let bridged = false;

      function startBridging() {
        if (bridged) return;
        bridged = true;
        logger.info(`Viewer WS bridge active - piping raw bytes (sessionId: ${sessionId})`);

        // Pipe: client → machine only (raw WS frames)
        // machine → client is already handled by the existing on('data') handler below
        socket.on('data', (chunk: Buffer) => {
          if (!netSocket.destroyed && netSocket.writable) {
            netSocket.write(chunk);
          }
        });
      }

      // Handle machine response (should be 101 Switching Protocols)
      // Also pipes machine → client WS frames after handshake
      let machineRespBuffer = Buffer.alloc(0);
      netSocket.on('data', (chunk: Buffer) => {
        if (!machineHeaderReceived) {
          machineRespBuffer = Buffer.concat([machineRespBuffer, chunk]);
          const headerEnd = machineRespBuffer.indexOf('\r\n\r\n');
          if (headerEnd !== -1) {
            // Found complete HTTP response headers from machine
            const headers = machineRespBuffer.slice(0, headerEnd).toString();
            const remaining = machineRespBuffer.slice(headerEnd + 4);

            logger.info(`Machine 101 response received (sessionId: ${sessionId}): ${headers.split('\r\n')[0]}`);

            // Strip Sec-WebSocket-Extensions from machine's 101 response
            // to prevent compression/RSV framing issues in the bridge
            const cleanHeaders = headers
              .split('\r\n')
              .filter((line) => !line.toLowerCase().startsWith('sec-websocket-extensions'))
              .join('\r\n');

            // Forward cleaned 101 response to client
            socket.write(Buffer.from(cleanHeaders + '\r\n\r\n'));
            clientHeaderSent = true;
            machineHeaderReceived = true;

            // If there's body data after headers, write it
            if (remaining.length > 0) {
              socket.write(remaining);
            }

            startBridging();
          }
          // else: wait for more data to complete headers
        }
        // If headers already processed, data goes through bridge
        else if (machineHeaderReceived && !socket.destroyed && socket.writable) {
          socket.write(chunk);
        }
      });

      netSocket.on('error', (err: Error) => {
        logger.error(`Viewer WS TCP error (sessionId: ${sessionId}):`, err.message);
        if (!socket.destroyed && socket.writable) {
          socket.end();
        }
      });

      netSocket.on('close', () => {
        logger.info(`Viewer WS machine TCP closed (sessionId: ${sessionId})`);
        if (!socket.destroyed && socket.writable) {
          socket.end();
        }
      });

      socket.on('close', () => {
        logger.info(`Viewer WebSocket连接关闭 (sessionId: ${sessionId}, path: ${pathname})`);
        netSocket.destroy();
      });

      socket.on('error', (err: Error) => {
        logger.error(`Viewer WebSocket连接错误 (sessionId: ${sessionId}):`, err.message);
        netSocket.destroy();
      });
    } catch (error) {
      logger.error(`Viewer WebSocket代理失败 (sessionId: ${sessionId}):`, error);
      if (!socket.destroyed && socket.writable) {
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
      }
    }
  }

  // 清理连接的辅助方法

  private cleanupConnection(sessionId: string): void {
    if (!sessionId || !this.activeConnections.has(sessionId)) {
      return;
    }

    logger.info(`清理WebSocket连接 (sessionId: ${sessionId})`);
    this.activeConnections.delete(sessionId);
    this.connectionTimestamps.delete(sessionId);

    // 查找与这个会话关联的用户和机器信息
    Promise.resolve().then(async () => {
      try {
        // 从数据库获取会话信息
        const session = await import('../models/session.model.js').then((module) =>
          module.SessionModel.findById(sessionId)
        );

        if (session && session.user_id && session.machine_id) {
          await handleSessionDisconnect(sessionId, session.user_id, session.machine_id);
          logger.info(`会话资源已清理 (sessionId: ${sessionId})`);
        }
      } catch (error) {
        logger.error(`清理会话资源失败 (sessionId: ${sessionId}):`, error);
      }
    });
  }

  // 关闭服务，释放所有资源
  shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  public close(): void {
    logger.info('关闭WebSocket代理服务...');

    // 复制一份活动连接列表，避免在迭代过程中修改原集合
    const activeSessionIds = [...this.activeConnections];

    // 清理所有活动连接
    for (const sessionId of activeSessionIds) {
      this.cleanupConnection(sessionId);
    }

    // 关闭代理
    this.proxy.close();

    // 移除upgrade事件监听器
    this.server.removeAllListeners('upgrade');

    logger.info('WebSocket代理服务已关闭');
  }
}
