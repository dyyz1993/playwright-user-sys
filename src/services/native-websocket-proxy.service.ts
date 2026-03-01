import * as http from 'http';
import * as url from 'url';
import { WebSocket } from 'ws';
import { z } from 'zod';
import httpProxy from 'http-proxy';
import { UserModel } from '../models/user.model.js';
import { logger } from '@shared/utils/logger.js';
import { createBrowserSession, handleSessionDisconnect } from './session.service.js';
import { memoryStore } from './memory-store.service.js';

// WebSocket连接参数验证
const wsConnectQuerySchema = z.object({
  apiKey: z.string().min(1),
  width: z.coerce.number().optional(),
  height: z.coerce.number().optional(),
  proxy: z.string().optional(),
  userAgent: z.string().optional(),
  cookies: z.record(z.string(), z.string()).optional(),
  localStorage: z.record(z.string(), z.string()).optional(),
  sharedUserData: z.coerce.boolean().optional(),
  timezone: z.string().optional(),
});

export class NativeWebSocketProxyService {
  private proxy: any; // 使用any类型来避免TypeScript类型错误
  private server: http.Server;
  private activeConnections: Set<string> = new Set(); // 跟踪活动连接的会话ID

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
    this.proxy.on('error', (err: Error, req: http.IncomingMessage, socket: any, proxyRes: any) => {
      const sessionId = (req as any).sessionId || '未知';
      logger.error(`WebSocket代理错误 (sessionId: ${sessionId}):`, err);

      this.cleanupConnection(sessionId);

      if (socket && !socket.destroyed) {
        try {
          if (socket.writable) {
            socket.end();
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

        // 只处理/ws/connect路径
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

    logger.info('原生WebSocket代理服务已成功初始化，正在监听upgrade事件');
  }

  private async handleWebSocketUpgrade(request: http.IncomingMessage, socket: any, head: Buffer): Promise<void> {
    let sessionId: string | null = null;
    let userId: number | null = null;
    let machineId: string | null = null;

    try {
      // 解析查询参数
      const parsedUrl = url.parse(request.url || '', true);
      const queryParams = parsedUrl.query;

      // 验证API密钥和其他参数
      const validatedParams = wsConnectQuerySchema.parse(queryParams);
      logger.info(`WebSocket连接参数: ${JSON.stringify(validatedParams)}`);

      // 验证API密钥
      const user = await UserModel.findByApiKey(validatedParams.apiKey as string);
      if (!user) {
        logger.error('无效的API密钥');
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      userId = user.id;

      // 创建会话
      const sessionOptions = {
        userAgent: validatedParams.userAgent,
        proxy: validatedParams.proxy,
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
      machineId = sessionResult.machineId;
      logger.info(`会话创建成功: ${sessionId}`);

      // 保存sessionId到请求对象，用于错误处理
      (request as any).sessionId = sessionId;

      // 记录活动连接
      this.activeConnections.add(sessionId);

      // 原始CDP端点URL (可能包含localhost或127.0.0.1)
      const originalWsEndpoint = sessionResult.browserWSEndpoint;

      // 从memoryStore获取机器的实际IP
      const machineInfo = memoryStore.getMachine(machineId);
      if (!machineInfo) {
        throw new Error(`无法获取机器信息: ${machineId}`);
      }

      const machineIp = machineInfo.ip;
      logger.info(`获取到机器真实IP: ${machineIp} (machineId: ${machineId})`);

      // 解析原始WebSocket URL
      //   const originalUrl = new URL(originalWsEndpoint);

      //   const targetUrl = originalWsEndpoint;
      const targetUrl = sessionResult.directUrl;
      //   // 替换主机部分为实际机器IP
      //   const targetUrl = originalWsEndpoint.replace(
      //     /^ws:\/\/(localhost|127\.0\.0\.1)/,
      //     `ws://${machineIp}`
      //   );

      logger.info(`原始WebSocket端点: ${originalWsEndpoint}`);
      logger.info(`修正后的WebSocket端点: ${targetUrl}`);
      logger.info(`使用代理转发到目标WebSocket: ${targetUrl} (sessionId: ${sessionId})`);

      // 设置清理函数
      const cleanupHandler = () => {
        this.cleanupConnection(sessionId!);
      };

      // 监听socket关闭事件
      socket.on('close', () => {
        logger.info(`客户端WebSocket连接关闭 (sessionId: ${sessionId})`);
        cleanupHandler();
      });

      socket.on('error', (err: Error) => {
        logger.error(`客户端WebSocket连接错误 (sessionId: ${sessionId}):`, err);
      });

      // 使用HTTP代理直接转发WebSocket请求
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

      // 如果会话已创建但出错，确保清理资源
      if (sessionId) {
        this.cleanupConnection(sessionId);
      }

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
