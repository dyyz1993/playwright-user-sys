import { createServer, Server } from 'http';
import httpProxy from 'http-proxy';
import { SessionModel } from '../models/session.model.js';
import { UserModel } from '../models/user.model.js';
import { logger } from '../utils/logger.js';
import { connectionManager } from './machine-grpc.service.js';
import { SessionStatus } from '../types/index.js';


// 代理服务器
class ProxyService {
  private server: Server;
  private proxy: any;

  constructor() {
    // 创建 HTTP 代理
    this.proxy = httpProxy.createProxyServer({
      ws: true,
      xfwd: true,
    });

    // 创建 HTTP 服务器
    this.server = createServer(this.handleRequest.bind(this));

    // 处理 WebSocket 连接
    this.server.on('upgrade', this.handleUpgrade.bind(this));

    // 处理代理错误
    this.proxy.on('error', (err: Error, req: any, res: any) => {
      logger.error('代理错误:', err);

      if (res.writeHead) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('代理错误');
      }
    });
  }

  // 启动服务器
  start(port: number): void {
    this.server.listen(port, () => {
      logger.info(`代理服务器运行在端口 ${port}`);
    });
  }

  // 处理 HTTP 请求
  private async handleRequest(req: any, res: any): Promise<void> {
    try {
      // 解析 URL 中的 sessionId
      const url = new URL(req.url, `http://${req.headers.host}`);
      const sessionId = url.searchParams.get('sessionId');
      const apiKey = url.searchParams.get('apiKey');

      if (!sessionId) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('缺少 sessionId 参数');
        return;
      }

      if (!apiKey) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('缺少 apiKey 参数');
        return;
      }

      // 验证 API Key
      const user = await UserModel.findByApiKey(apiKey);
      if (!user) {
        res.writeHead(401, { 'Content-Type': 'text/plain' });
        res.end('无效的 API Key');
        return;
      }

      // 检查用户点数
      if (user.credits <= 0) {
        res.writeHead(402, { 'Content-Type': 'text/plain' });
        res.end('点数不足，请联系管理员充值');
        return;
      }

      // 获取会话信息
      const session = await SessionModel.findById(sessionId);
      if (!session) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('会话不存在');
        return;
      }

      // 检查会话状态
      if (session.status !== SessionStatus.CONNECTED) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end(`会话状态不是已连接，当前状态: ${session.status}`);
        return;
      }

      // 检查会话是否属于该用户
      if (session.user_id !== user.id) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('您无权访问此会话');
        return;
      }

      // 获取机器信息
      if (!session.machine_id) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('会话没有关联的机器');
        return;
      }

      // 检查机器是否在线
      if (!connectionManager.isConnected(session.machine_id)) {
        res.writeHead(503, { 'Content-Type': 'text/plain' });
        res.end('机器当前不可用');
        return;
      }

      // 检查会话端口
      if (!session.port) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('会话没有关联的端口');
        return;
      }

      // 构建目标 URL
      const target = `http://${session.machine_id}:${session.port}?sessionId=${sessionId}`;

      // 转发请求
      this.proxy.web(req, res, { target }, (err: Error) => {
        logger.error('代理请求失败:', err);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('代理错误');
      });
    } catch (error) {
      logger.error('处理代理请求失败:', error);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('内部服务器错误');
    }
  }

  // 处理 WebSocket 连接
  private async handleUpgrade(req: any, socket: any, head: any): Promise<void> {
    try {
      // 解析 URL 中的 sessionId
      const url = new URL(req.url, `http://${req.headers.host}`);
      const sessionId = url.searchParams.get('sessionId');
      const apiKey = url.searchParams.get('apiKey');

      if (!sessionId) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }

      if (!apiKey) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }

      // 验证 API Key
      const user = await UserModel.findByApiKey(apiKey);
      if (!user) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      // 检查用户点数
      if (user.credits <= 0) {
        socket.write('HTTP/1.1 402 Payment Required\r\n\r\n');
        socket.destroy();
        return;
      }

      // 获取会话信息
      const session = await SessionModel.findById(sessionId);
      if (!session) {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }

      // 检查会话状态
      if (session.status !== SessionStatus.CONNECTED) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }

      // 检查会话是否属于该用户
      if (session.user_id !== user.id) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      // 获取机器信息
      if (!session.machine_id) {
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
        return;
      }

      // 检查机器是否在线
      if (!connectionManager.isConnected(session.machine_id)) {
        socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
        socket.destroy();
        return;
      }

      // 检查会话端口
      if (!session.port) {
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
        return;
      }

      // 构建目标 URL
      const target = `ws://${session.machine_id}:${session.port}?sessionId=${sessionId}`;

      // 转发 WebSocket 连接
      this.proxy.ws(req, socket, head, { target }, (err: Error) => {
        logger.error('代理 WebSocket 连接失败:', err);
        socket.destroy();
      });

      // 更新会话的最后活动时间
      await SessionModel.updateLastActivity(sessionId);

      // 标记会话为已连接
      await SessionModel.markConnected(sessionId);

      // 监听 socket 关闭
      socket.on('close', async () => {
        logger.info(`WebSocket 连接关闭 (sessionId: ${sessionId})`);

        try {
          // 获取会话的最新状态
          const updatedSession = await SessionModel.findById(sessionId);

          // 如果会话仍然是已连接状态，则更新为已断开
          if (updatedSession && updatedSession.status === SessionStatus.CONNECTED) {
            // 计算会话持续时间
            const now = new Date();
            const startTime = new Date(updatedSession.start_time);
            const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);

            // 标记会话为已断开
            await SessionModel.markDisconnected(sessionId, duration);

            // 扣除用户点数
            const minutes = Math.ceil(duration / 60);
            await UserModel.deductCredits(user.id, minutes);

            logger.info(`会话已断开 (sessionId: ${sessionId}, duration: ${duration}s, credits: ${minutes})`);
          }
        } catch (error) {
          logger.error(`处理 WebSocket 关闭失败 (sessionId: ${sessionId}):`, error);
        }
      });
    } catch (error) {
      logger.error('处理 WebSocket 连接失败:', error);
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
  }
}

// 创建代理服务实例
const proxyService = new ProxyService();

export { proxyService };
