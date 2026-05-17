import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import httpProxy from 'http-proxy';
import { Socket } from 'net';
import { MachineConfig } from './config.js';
import { sessionManager } from './browser.service.js';
import { logger } from '@shared/utils/logger.js';

// !! 导入新的处理器函数 !!
import { handleEventsConnection } from './session_handlers/events.handler.js';
import { handleStreamConnection } from './session_handlers/stream.handler.js';

// !! 导入 WebSocketServer 和 WebSocket !!
import { WebSocketServer, WebSocket } from 'ws';

/**
 * 代理服务
 * 负责处理 HTTP 和 WebSocket 请求，并将它们转发到相应的浏览器实例
 */
export class ProxyService {
  private server: Server;
  private proxy: httpProxy;
  // !! 添加 wss 实例变量 !!
  private wss: WebSocketServer;
  private config: MachineConfig;

  constructor(config: MachineConfig) {
    this.config = config;

    // 创建 HTTP 代理
    this.proxy = httpProxy.createProxyServer({
      ws: true,
      xfwd: true,
      changeOrigin: true,
    });

    // 创建 HTTP 服务器
    this.server = createServer(this.handleHttpRequest.bind(this));

    // !! 创建 WebSocket 服务器实例，但不监听端口 !!
    // 我们将使用 HTTP 服务器的 'upgrade' 事件来处理连接
    this.wss = new WebSocketServer({ noServer: true });

    // 处理 WebSocket 连接
    this.server.on('upgrade', this.handleWebSocketUpgrade.bind(this));

    // 处理代理错误
    this.proxy.on('error', ((err: Error, req: IncomingMessage, res: ServerResponse | Socket) => {
      logger.error('代理错误:', err);

      try {
        if (req && req.url) {
          const urlObj = new URL(req.url, `http://${req.headers?.host || 'localhost'}`);
          const sessionId = urlObj.searchParams.get('sessionId');

          if (sessionId) {
            logger.info(`代理错误，尝试处理断开连接 (sessionId: ${sessionId})`);
            sessionManager.handleDisconnection(sessionId);
          }
        }
      } catch (error) {
        logger.error('从请求中提取 sessionId 失败:', error);
      }

      if (res && 'writeHead' in res && typeof res.writeHead === 'function') {
        (res as ServerResponse).writeHead(500);
        (res as ServerResponse).end('Proxy Error');
      } else if (res && typeof res.destroy === 'function') {
        res.destroy();
      }
    }) as httpProxy.ErrorCallback);
  }

  /**
   * 启动代理服务器
   */
  start(): void {
    this.server.listen(this.config.proxyPort, '0.0.0.0', () => {
      logger.info(`代理服务器运行在端口 ${this.config.proxyPort}`);
    });
  }

  /**
   * 停止代理服务器
   */
  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      // 关闭 WebSocketServer 以释放资源
      try {
        this.wss.close();
      } catch (wssErr) {
        logger.warn('关闭 WebSocketServer 时出错:', wssErr);
      }

      this.server.close((err) => {
        if (err) {
          logger.error('关闭代理服务器失败:', err);
          reject(err);
        } else {
          logger.info('代理服务器已关闭');
          resolve();
        }
      });
    });
  }

  /**
   * 处理 HTTP 请求
   */
  private handleHttpRequest(req: IncomingMessage, res: ServerResponse): void {
    try {
      logger.info(`收到 HTTP 请求: ${req.url}`);

      // 解析 URL 中的 sessionId
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const sessionId = url.searchParams.get('sessionId');

      logger.info(`解析到 sessionId: ${sessionId}`);

      if (!sessionId) {
        logger.error('缺少 sessionId 参数');
        res.writeHead(400);
        res.end('Missing sessionId parameter');
        return;
      }

      // 获取会话端口
      const port = sessionManager.getPort(sessionId);
      logger.info(`获取到端口: ${port}`);

      if (!port) {
        logger.error(`会话不存在: ${sessionId}`);
        res.writeHead(404);
        res.end('Session not found');
        return;
      }

      // 转发请求
      const target = `http://localhost:${port}`;
      logger.info(`转发 HTTP 请求到: ${target}`);

      this.proxy.web(req, res, { target }, (err: Error) => {
        logger.error('代理请求失败:', err);
        res.writeHead(500);
        res.end('Proxy error');
      });
    } catch (error) {
      logger.error('处理 HTTP 请求失败:', error);
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  }

  /**
   * 处理 WebSocket 连接升级请求
   */
  private handleWebSocketUpgrade(req: IncomingMessage, socket: Socket, head: Buffer): void {
    let sessionId: string | null = null;
    // !! activityInterval 仅用于 fallback 路径 !!
    let activityInterval: NodeJS.Timeout | undefined;

    try {
      logger.info(`收到 WebSocket 升级请求: ${req.url}`);
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const pathname = url.pathname;

      // 优先从查询参数获取 sessionId
      sessionId = url.searchParams.get('sessionId');

      // 如果查询参数中没有，尝试从路径中提取
      if (!sessionId && pathname.startsWith('/ws/')) {
        const pathSegments = pathname.split('/');
        // 预期路径格式: ['', 'ws', '<sessionId>', 'events|stream|...']
        if (pathSegments.length >= 3 && pathSegments[2]) {
          sessionId = pathSegments[2];
          logger.info(`从路径中提取到 sessionId: ${sessionId}`);
        }
      }

      logger.info(`最终 sessionId: ${sessionId}, pathname: ${pathname}`);

      if (!sessionId) {
        logger.error('无法确定 sessionId (查询参数或路径中均未找到)');
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }

      // !! 路径路由 !!
      if (pathname.startsWith('/ws/') && pathname.endsWith('/events')) {
        logger.info(`路由到 Events Handler (sessionId: ${sessionId})`);
        this.wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
          handleEventsConnection(ws, sessionId!); // 交给处理器
        });
        return; // !! 处理 /events 后返回 !!
      } else if (pathname.startsWith('/ws/') && pathname.endsWith('/stream')) {
        logger.info(`路由到 Stream Handler (sessionId: ${sessionId})`);
        this.wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
          handleStreamConnection(ws, sessionId!); // 交给处理器
        });
        return; // !! 处理 /stream 后返回 !!
      }

      // !! Fallback: 路径不匹配，执行原始代理逻辑 !!
      logger.info(`路径 ${pathname} 不匹配特定处理器，执行默认 WebSocket 代理 (sessionId: ${sessionId})`);

      // !! 恢复原始逻辑：获取 port 和 path !!
      const port = sessionManager.getPort(sessionId);
      const path = sessionManager.getPath(sessionId);
      logger.info(`获取到端口: ${port}, 路径: ${path} 用于 CDP 代理`);

      if (!port || path === null) {
        // 检查 port 和 path
        logger.error(`CDP 代理失败: 会话 ${sessionId} 不存在或缺少路径信息。`);
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }

      // !! 恢复原始逻辑：为 CDP 代理连接设置活动监控 !!
      logger.info(`为 CDP 代理连接设置活动监控 (sessionId: ${sessionId})`);
      sessionManager.handleConnection(sessionId); // 通知连接
      activityInterval = setInterval(() => {
        if (sessionId) {
          sessionManager.updateActivity(sessionId);
        }
      }, 1000);

      const cleanupProxyListeners = () => {
        if (activityInterval) clearInterval(activityInterval);
        socket.removeAllListeners('close');
        socket.removeAllListeners('end');
        socket.removeAllListeners('error');
        socket.removeAllListeners('data');
        logger.debug(`Cleaned up CDP proxy listeners for session ${sessionId}`);
      };

      socket.on('close', () => {
        logger.info(`用户 WebSocket (CDP 代理) 连接已关闭 (sessionId: ${sessionId})`);
        cleanupProxyListeners();
        if (sessionId) {
          sessionManager.handleDisconnection(sessionId);
        }
      });
      socket.on('end', () => {
        logger.info(`用户 WebSocket (CDP 代理) 连接结束 (sessionId: ${sessionId})`);
        cleanupProxyListeners();
        if (sessionId) {
          sessionManager.handleDisconnection(sessionId);
        }
      });
      socket.on('error', (error) => {
        logger.error(`用户 WebSocket (CDP 代理) 连接出错 (sessionId: ${sessionId}):`, error);
        cleanupProxyListeners();
        if (sessionId) {
          sessionManager.handleDisconnection(sessionId);
        }
      });
      socket.on('data', () => {
        if (sessionId) {
          sessionManager.updateActivity(sessionId);
        }
      });

      // !! 恢复原始逻辑：转发 WebSocket 连接到 CDP 端点 !!
      const target = `ws://localhost:${port}${path}`;
      logger.info(`转发 WebSocket (CDP) 连接到: ${target}`);
      this.proxy.ws(req, socket, head, { target, ws: true }, (err: Error) => {
        logger.error(`代理 WebSocket (CDP) 连接失败 (sessionId: ${sessionId}):`, err);
        cleanupProxyListeners(); // 清理监听器
        if (sessionId) {
          sessionManager.handleDisconnection(sessionId); // 尝试通知断开
        }
        // 不需要手动 destroy socket, proxy.ws 在出错时会处理
      });
    } catch (error) {
      logger.error('处理 WebSocket 升级请求失败:', error);
      if (activityInterval) {
        clearInterval(activityInterval);
      }
      // 避免在已知错误（如找不到会话）时重复通知断开
      if (sessionId && !(error instanceof Error && error.message.includes('Session not found'))) {
        try {
          sessionManager.handleDisconnection(sessionId);
        } catch (disconnectError) {
          logger.error(`Error calling handleDisconnection for ${sessionId} during upgrade error:`, disconnectError);
        }
      }
      if (!socket.destroyed) {
        try {
          socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        } catch (writeError) {
          logger.warn('Failed to write error to socket during upgrade error handling:', writeError);
        }
        socket.destroy();
      }
    }
  }
}

// 向后兼容：创建默认的代理服务实例（使用 CONFIG）
import { CONFIG } from './config.js';
const defaultProxyService = new ProxyService(CONFIG);

export const proxyService = defaultProxyService;

export default ProxyService;
