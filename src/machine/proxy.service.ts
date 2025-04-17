import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import httpProxy from 'http-proxy';
import { Socket } from 'net';
import { CONFIG } from './config.js';
import { sessionManager } from './browser.service.js';
import { logger } from '../utils/logger.js';

/**
 * 代理服务
 * 负责处理 HTTP 和 WebSocket 请求，并将它们转发到相应的浏览器实例
 */
class ProxyService {
  private server: Server;
  private proxy: httpProxy;

  constructor() {
    // 创建 HTTP 代理
    this.proxy = httpProxy.createProxyServer({
      ws: true,
      xfwd: true,
      changeOrigin: true,
    });

    // 创建 HTTP 服务器
    this.server = createServer(this.handleHttpRequest.bind(this));

    // 处理 WebSocket 连接
    this.server.on('upgrade', this.handleWebSocketUpgrade.bind(this));

    // 处理代理错误
    this.proxy.on('error', (err, req, res: any) => {
      logger.error('代理错误:', err);

      // 尝试从请求中提取 sessionId
      try {
        if (req && req.url) {
          const url = new URL(req.url, `http://${req.headers?.host || 'localhost'}`);
          const sessionId = url.searchParams.get('sessionId');

          if (sessionId) {
            logger.info(`代理错误，尝试处理断开连接 (sessionId: ${sessionId})`);
            sessionManager.handleDisconnection(sessionId);
          }
        }
      } catch (error) {
        logger.error('从请求中提取 sessionId 失败:', error);
      }

      if (res && typeof res.writeHead === 'function') {
        res.writeHead(500);
        res.end('Proxy Error');
      } else if (res && typeof res.destroy === 'function') {
        res.destroy();
      }
    });
  }

  /**
   * 启动代理服务器
   */
  start(): void {
    this.server.listen(CONFIG.proxyPort, () => {
      logger.info(`代理服务器运行在端口 ${CONFIG.proxyPort}`);
    });
  }

  /**
   * 停止代理服务器
   */
  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
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
   * 处理 WebSocket 连接
   */
  private handleWebSocketUpgrade(req: IncomingMessage, socket: Socket, head: Buffer): void {
    // 声明变量，以便在 catch 块中使用
    let sessionId: string | null = null;
    let activityInterval: NodeJS.Timeout | undefined;

    try {
      logger.info(`收到 WebSocket 连接请求: ${req.url}`);

      // 解析 URL 中的 sessionId
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      sessionId = url.searchParams.get('sessionId');

      logger.info(`解析到 sessionId: ${sessionId}`);

      if (!sessionId) {
        logger.error('缺少 sessionId 参数');
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }

      // 获取会话端口和路径
      const port = sessionManager.getPort(sessionId);
      const path = sessionManager.getPath(sessionId);
      logger.info(`获取到端口: ${port}, 路径: ${path}`);

      if (!port) {
        logger.error(`会话不存在: ${sessionId}`);
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }

      // 通知会话管理器用户已连接
      logger.info(`通知会话管理器用户已连接 (sessionId: ${sessionId})`);
      sessionManager.handleConnection(sessionId);

      // 设置活动更新定时器
      activityInterval = setInterval(() => {
        if (sessionId) {
          sessionManager.updateActivity(sessionId);
        }
      }, 5000); // 每5秒更新一次

      // 监听原始 socket 的各种事件
      socket.on('close', () => {
        logger.info(`用户 WebSocket 连接已关闭 (sessionId: ${sessionId})`);
        clearInterval(activityInterval); // 清除活动更新定时器
        // 通知会话管理器用户已断开连接
        if (sessionId) {
          sessionManager.handleDisconnection(sessionId);
        }
      });

      socket.on('end', () => {
        logger.info(`用户 WebSocket 连接结束 (sessionId: ${sessionId})`);
        clearInterval(activityInterval); // 清除活动更新定时器
        // 通知会话管理器用户已断开连接
        if (sessionId) {
          sessionManager.handleDisconnection(sessionId);
        }
      });

      socket.on('error', (error) => {
        logger.error(`用户 WebSocket 连接出错 (sessionId: ${sessionId}):`, error);
        clearInterval(activityInterval); // 清除活动更新定时器
        // 出错时也应该通知会话管理器用户已断开连接
        if (sessionId) {
          sessionManager.handleDisconnection(sessionId);
        }
      });

      // 监听消息事件，更新活动时间
      socket.on('data', () => {
        if (sessionId) {
          sessionManager.updateActivity(sessionId);
        }
      });

      // 转发 WebSocket 连接
      const target = `ws://localhost:${port}${path || ''}`;
      logger.info(`转发 WebSocket 连接到: ${target}`);

      this.proxy.ws(req, socket, head, { target, ws: true }, (err: Error) => {
        logger.error('代理 WebSocket 连接失败:', err);
        clearInterval(activityInterval); // 清除活动更新定时器
        if (sessionId) {
          sessionManager.handleDisconnection(sessionId);
        }
        socket.destroy();
      });
    } catch (error) {
      logger.error('处理 WebSocket 连接请求失败:', error);

      // 如果定时器已经创建，清除定时器
      if (typeof activityInterval !== 'undefined') {
        clearInterval(activityInterval);
      }

      // 如果 sessionId 已经解析，通知会话管理器用户已断开连接
      if (sessionId) {
        sessionManager.handleDisconnection(sessionId);
      }

      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
  }
}

// 创建代理服务实例
export const proxyService = new ProxyService();

export default proxyService;
