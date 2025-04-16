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
    this.proxy.on('error', (err, _req, res: any) => {
      logger.error('代理错误:', err);
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
    try {
      logger.info(`收到 WebSocket 连接请求: ${req.url}`);

      // 解析 URL 中的 sessionId
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const sessionId = url.searchParams.get('sessionId');

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

      // 转发 WebSocket 连接
      const target = `ws://localhost:${port}${path || ''}`;
      logger.info(`转发 WebSocket 连接到: ${target}`);

      this.proxy.ws(req, socket, head, { target, ws: true }, (err: Error) => {
        logger.error('代理 WebSocket 连接失败:', err);
        socket.destroy();
      });
    } catch (error) {
      logger.error('处理 WebSocket 连接请求失败:', error);
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
  }
}

// 创建代理服务实例
export const proxyService = new ProxyService();

export default proxyService;
