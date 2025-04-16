import fp from 'fastify-plugin';
import http from 'http';
import { WebSocketServer } from 'ws';
import { FastifyInstance } from 'fastify';
import { UserModel } from '../models/user.model.js';
import { SessionModel } from '../models/session.model.js';
import { SessionStatus, WebhookEventType } from '../types/index.js';
import { createWebhookEvent } from '../utils/webhook.js';
import { env } from '../config/env.js';

export default fp(async function (fastify: FastifyInstance) {
  // 创建 WebSocket 服务器
  const wss = new WebSocketServer({ noServer: true });
  
  // 处理 WebSocket 连接
  wss.on('connection', (ws, request, client) => {
    const { sessionId, userId } = client;
    
    fastify.log.info(`WebSocket 连接已建立: sessionId=${sessionId}, userId=${userId}`);
    
    // 标记会话已连接
    SessionModel.markConnected(sessionId)
      .then(() => {
        // 触发 Webhook 事件
        createWebhookEvent(userId, WebhookEventType.SESSION_CONNECTED, {
          session_id: sessionId,
          connected_at: new Date(),
        });
      })
      .catch(error => {
        fastify.log.error(`标记会话已连接失败: ${error.message}`);
      });
    
    // 处理连接关闭
    ws.on('close', async () => {
      fastify.log.info(`WebSocket 连接已关闭: sessionId=${sessionId}`);
      
      try {
        // 获取会话信息
        const session = await SessionModel.findById(sessionId);
        if (!session) return;
        
        // 如果会话仍处于活跃状态，则标记为已断开
        if (session.status === SessionStatus.CONNECTED) {
          const now = new Date();
          const startTime = new Date(session.start_time);
          const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);
          
          await SessionModel.markDisconnected(sessionId, duration);
          
          // 扣除用户点数（1分钟1点）
          const minutes = Math.ceil(duration / 60);
          try {
            await UserModel.deductCredits(userId, minutes);
          } catch (error) {
            fastify.log.error(`扣除点数失败: ${error.message}`);
          }
          
          // 触发 Webhook 事件
          await createWebhookEvent(userId, WebhookEventType.SESSION_DISCONNECTED, {
            session_id: sessionId,
            duration,
            disconnected_at: now,
          });
        }
      } catch (error) {
        fastify.log.error(`处理 WebSocket 关闭事件失败: ${error.message}`);
      }
    });
    
    // 处理错误
    ws.on('error', async (error) => {
      fastify.log.error(`WebSocket 错误: ${error.message}`);
      
      try {
        await SessionModel.markError(sessionId);
        
        // 触发 Webhook 事件
        await createWebhookEvent(userId, WebhookEventType.SESSION_ERROR, {
          session_id: sessionId,
          error: error.message,
          error_at: new Date(),
        });
      } catch (err) {
        fastify.log.error(`标记会话错误失败: ${err.message}`);
      }
    });
  });
  
  // 处理 WebSocket 升级请求
  fastify.server.on('upgrade', async (request, socket, head) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const apiKey = url.searchParams.get('apiKey');
      const sessionId = url.searchParams.get('sessionId');
      
      if (!apiKey || !sessionId) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
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
      
      // 验证会话
      const session = await SessionModel.findById(sessionId);
      if (!session) {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }
      
      // 检查会话是否属于该用户
      if (session.user_id !== user.id) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
      
      // 检查会话状态
      if (session.status !== SessionStatus.CREATED && session.status !== SessionStatus.CONNECTED) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }
      
      // 检查用户点数
      if (user.credits <= 0) {
        socket.write('HTTP/1.1 402 Payment Required\r\n\r\n');
        socket.destroy();
        
        // 触发点数不足 Webhook 事件
        await createWebhookEvent(user.id, WebhookEventType.CREDITS_DEPLETED, {
          user_id: user.id,
          username: user.username,
          credits: user.credits,
          timestamp: new Date(),
        });
        
        return;
      }
      
      // 如果会话没有分配机器，则分配一个
      if (!session.machine_id || !session.port) {
        // 这里应该有实际的分配逻辑，但在这个示例中我们只是模拟
        // 在实际实现中，这里应该与实例机器通信，启动一个 Playwright 实例
        socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
        socket.destroy();
        return;
      }
      
      // 升级连接为 WebSocket
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, {
          sessionId,
          userId: user.id,
        });
      });
    } catch (error) {
      fastify.log.error(`处理 WebSocket 升级请求失败: ${error.message}`);
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
  });
  
  // 定期检查过期会话
  const checkExpiredSessions = async () => {
    try {
      const expiredCount = await SessionModel.checkExpiredSessions(env.INSTANCE_TIMEOUT);
      if (expiredCount > 0) {
        fastify.log.info(`已标记 ${expiredCount} 个过期会话`);
      }
    } catch (error) {
      fastify.log.error(`检查过期会话失败: ${error.message}`);
    }
  };
  
  // 每分钟检查一次过期会话
  const intervalId = setInterval(checkExpiredSessions, 60000);
  
  // 服务器关闭时清理
  fastify.addHook('onClose', (instance, done) => {
    clearInterval(intervalId);
    wss.close(done);
  });
});
