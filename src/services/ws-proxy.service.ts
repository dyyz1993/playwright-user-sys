import WebSocket from 'ws';
import http from 'http';
import { URL } from 'url';
import { SessionModel } from '../models/session.model.js';
import { UserModel } from '../models/user.model.js';
import { SessionStatus, WebhookEventType } from '../types/index.js';
import { createWebhookEvent } from '../utils/webhook.js';
import { env } from '../config/env.js';

/**
 * 创建 WebSocket 代理
 */
export function createWebSocketProxy(server: http.Server) {
  // 处理 WebSocket 升级请求
  server.on('upgrade', async (request, socket, head) => {
    try {
      // 解析 URL
      const url = new URL(request.url || '', `http://${request.headers.host}`);
      
      // 检查路径是否为 WebSocket 连接路径
      if (url.pathname !== '/ws') {
        return;
      }
      
      // 获取查询参数
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
      
      // 检查会话是否已分配机器和端口
      if (!session.machine_id || !session.port) {
        socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
        socket.destroy();
        return;
      }
      
      // 创建到 Playwright 实例的 WebSocket 连接
      const targetUrl = `ws://${session.machine_id}:${session.port}`;
      const targetWs = new WebSocket(targetUrl);
      
      // 处理目标 WebSocket 连接打开
      targetWs.on('open', () => {
        // 标记会话已连接
        SessionModel.markConnected(sessionId)
          .then(() => {
            // 触发 Webhook 事件
            createWebhookEvent(user.id, WebhookEventType.SESSION_CONNECTED, {
              session_id: sessionId,
              connected_at: new Date(),
            });
          })
          .catch(error => {
            console.error(`标记会话已连接失败: ${error.message}`);
          });
        
        // 升级客户端连接为 WebSocket
        const wss = new WebSocket.Server({ noServer: true });
        wss.on('connection', (ws) => {
          // 转发客户端消息到目标
          ws.on('message', (message) => {
            if (targetWs.readyState === WebSocket.OPEN) {
              targetWs.send(message);
            }
          });
          
          // 转发目标消息到客户端
          targetWs.on('message', (message) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(message);
            }
          });
          
          // 处理客户端连接关闭
          ws.on('close', async () => {
            targetWs.close();
            
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
                  await UserModel.deductCredits(user.id, minutes);
                } catch (error) {
                  console.error(`扣除点数失败: ${error.message}`);
                }
                
                // 触发 Webhook 事件
                await createWebhookEvent(user.id, WebhookEventType.SESSION_DISCONNECTED, {
                  session_id: sessionId,
                  duration,
                  disconnected_at: now,
                });
              }
            } catch (error) {
              console.error(`处理 WebSocket 关闭事件失败: ${error.message}`);
            }
          });
          
          // 处理客户端错误
          ws.on('error', (error) => {
            console.error(`客户端 WebSocket 错误: ${error.message}`);
          });
        });
        
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws);
        });
      });
      
      // 处理目标 WebSocket 错误
      targetWs.on('error', async (error) => {
        console.error(`目标 WebSocket 错误: ${error.message}`);
        
        socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        socket.destroy();
        
        try {
          await SessionModel.markError(sessionId);
          
          // 触发 Webhook 事件
          await createWebhookEvent(user.id, WebhookEventType.SESSION_ERROR, {
            session_id: sessionId,
            error: error.message,
            error_at: new Date(),
          });
        } catch (err) {
          console.error(`标记会话错误失败: ${err.message}`);
        }
      });
    } catch (error) {
      console.error(`处理 WebSocket 升级请求失败: ${error.message}`);
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
  });
}

export default {
  createWebSocketProxy,
};
