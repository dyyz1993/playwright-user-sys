import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { SessionModel } from '../models/session.model.js';
import { MachineModel } from '../models/machine.model.js';
import { UserModel } from '../models/user.model.js';
import { sendSuccess, sendError, sendCreated, sendPaginated } from '../utils/response.js';
import { SessionStatus, SessionCreateOptions, PaginationQuery, WebhookEventType } from '../types/index.js';
import { createWebhookEvent } from '../utils/webhook.js';
import { createSessionRequestSchema, paginationQuerySchema } from '../schemas/index.js';
import { URL } from 'node:url';

// 会话控制器中使用的类型定义
interface User {
  id: number;
  username: string;
  role: 'admin' | 'user';
}



// 创建会话
export async function createSession(request: FastifyRequest, reply: FastifyReply) {
  try {
    // 检查用户是否已经认证
    if (!request.user) {
      return sendError(reply, '用户未认证', 401);
    }

    const userId = request.user.id;

    // 解析请求体，如果为空则使用默认值
    let options: SessionCreateOptions = {};

    try {
      // 尝试解析请求体
      if (request.body) {
        options = createSessionRequestSchema.parse(request.body) as SessionCreateOptions;
      }
    } catch (parseError) {
      request.log.error(`解析请求体失败:`, parseError);
      // 使用默认空对象
    }

    // 确保至少有一个默认的 viewport
    if (!options.viewport) {
      options.viewport = {
        width: 1280,
        height: 800,
      };
    }

    request.log.info(`创建会话的选项: ${JSON.stringify(options)}`);

    // 检查用户是否存在
    const user = await UserModel.findById(userId);
    if (!user) {
      return sendError(reply, '用户不存在', 404);
    }

    // 检查用户点数是否足够
    if (user.credits <= 0) {
      return sendError(reply, '点数不足，请联系管理员充值', 402);
    }

    // 查找可用的实例机器
    request.log.info('开始查找可用的实例机器');
    const machine = await MachineModel.findAvailable();
    if (!machine) {
      request.log.error('没有找到可用的实例机器');
      return sendError(reply, '当前没有可用的实例机器，请稍后再试', 503);
    }

    request.log.info(`找到可用的实例机器: ${machine.id}`);

    // 获取 connectionManager
    const { connectionManager } = await import('../services/machine-grpc.service.js');

    // 创建会话记录
    const session = await SessionModel.create({
      user_id: userId,
      options,
    });

    if (!session) {
      return sendError(reply, '创建会话失败', 500);
    }

    try {
      // 向机器发送启动浏览器实例的请求
      request.log.info(`向机器 ${machine.id} 发送启动浏览器请求 (sessionId: ${session.id})`);

      const result = await connectionManager.launchBrowser(machine.id, session.id, options);

      request.log.info('启动浏览器结果: '+JSON.stringify(result));

      // 更新会话记录
      await SessionModel.update(session.id, {
        machine_id: machine.id,
        port: result.port,
        status: SessionStatus.CREATED, // 创建状态，而不是连接状态，等待用户连接
      });

      // 触发 Webhook 事件
      await createWebhookEvent(userId, WebhookEventType.SESSION_CREATED, {
        session_id: session.id,
        created_at: session.created_at,
      });

      const url = new URL(result.browser_ws_endpoint);
      request.log.info(`原始 WebSocket 端点: ${result.browser_ws_endpoint}`);

      // 构建返回给用户的 WebSocket 端点
      // 注意：这里我们使用代理 URL，而不是直接返回浏览器的 WebSocket 端点
      const proxyUrl = `ws://localhost:8082?sessionId=${session.id}`;

      return sendCreated(reply, {
        id: session.id,
        status: SessionStatus.CONNECTED,
        browserWSEndpoint:result.browser_ws_endpoint,
        proxyUrl:proxyUrl,
        created_at: session.created_at,
      });
    } catch (machineError: any) {
      // 如果与机器通信失败，更新会话状态为失败
      await SessionModel.update(session.id, {
        status: SessionStatus.ERROR,
      });

      // 记录错误信息
      request.log.error(`会话错误信息: ${machineError.message}`);

      request.log.error(`启动浏览器实例失败 (sessionId: ${session.id}):`, machineError);
      return sendError(reply, '启动浏览器实例失败: ' + machineError.message, 500);
    }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(reply, '无效的请求数据: ' + error.errors.map((e: any) => e.message).join(', '), 400);
    }

    request.log.error(error);
    return sendError(reply, '创建会话失败', 500);
  }
}

// 获取会话信息
export async function getSession(request: FastifyRequest, reply: FastifyReply) {
  try {
    // 检查用户是否已经认证
    if (!request.user) {
      return sendError(reply, '用户未认证', 401);
    }

    const userId = request.user.id;
    const sessionId = (request.params as any).id;

    // 查找会话
    const session = await SessionModel.findById(sessionId);
    if (!session) {
      return sendError(reply, '会话不存在', 404);
    }

    // 检查会话是否属于当前用户
    if (session.user_id !== userId && request.user.role !== 'admin') {
      return sendError(reply, '无权访问此会话', 403);
    }

    return sendSuccess(reply, {
      id: session.id,
      status: session.status,
      machine_id: session.machine_id,
      port: session.port,
      options: session.options,
      start_time: session.start_time,
      end_time: session.end_time,
      duration: session.duration,
      screenshot_url: session.screenshot_url,
      created_at: session.created_at,
    });
  } catch (error) {
    request.log.error(error);
    return sendError(reply, '获取会话信息失败', 500);
  }
}

// 获取用户的所有会话
export async function getUserSessions(request: FastifyRequest, reply: FastifyReply) {
  try {
    // 检查用户是否已经认证
    if (!request.user) {
      return sendError(reply, '用户未认证', 401);
    }

    const userId = request.user.id;
    const query = paginationQuerySchema.parse(request.query) as PaginationQuery;

    // 获取用户的所有会话
    const sessions = await SessionModel.findByUserId(userId, query);

    return sendPaginated(reply, sessions);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(reply, '无效的查询参数: ' + error.errors.map((e: any) => e.message).join(', '), 400);
    }

    request.log.error(error);
    return sendError(reply, '获取会话列表失败', 500);
  }
}

// 释放会话
export async function releaseSession(request: FastifyRequest, reply: FastifyReply) {
  try {
    // 检查用户是否已经认证
    if (!request.user) {
      return sendError(reply, '用户未认证', 401);
    }

    const userId = request.user.id;
    const sessionId = (request.params as any).id;

    // 查找会话
    const session = await SessionModel.findById(sessionId);
    if (!session) {
      return sendError(reply, '会话不存在', 404);
    }

    // 检查会话是否属于当前用户
    if (session.user_id !== userId && request.user.role !== 'admin') {
      return sendError(reply, '无权操作此会话', 403);
    }

    // 检查会话状态
    if (session.status === SessionStatus.DISCONNECTED || session.status === SessionStatus.ERROR) {
      return sendSuccess(reply, { id: sessionId, status: session.status, duration: session.duration || 0 }, '会话已释放');
    }

    // 检查会话是否有关联的机器
    if (!session.machine_id) {
      await SessionModel.update(sessionId, {
        status: SessionStatus.DISCONNECTED,
        end_time: new Date(),
      });
      return sendSuccess(reply, { id: sessionId, status: SessionStatus.DISCONNECTED, duration: 0 }, '会话已释放');
    }

    try {
      // 向机器发送关闭浏览器实例的请求
      const { connectionManager } = await import('../services/machine-grpc.service.js');
      request.log.info(`向机器 ${session.machine_id} 发送关闭浏览器请求 (sessionId: ${sessionId})`);

      await connectionManager.closeBrowser(session.machine_id, sessionId);

      // 更新会话状态
      // 注意：我们不再在这里计算持续时间和扣除点数
      // 这些将由机器端通过会话状态更新来处理
      await SessionModel.update(sessionId, {
        status: SessionStatus.DISCONNECTED,
        end_time: new Date(),
      });

      // 如果会话已分配机器，减少机器的实例计数
      await MachineModel.decrementInstanceCount(session.machine_id);

      // 触发 Webhook 事件
      const disconnectedAt = new Date();
      await createWebhookEvent(userId, WebhookEventType.SESSION_DISCONNECTED, {
        session_id: sessionId,
        disconnected_at: disconnectedAt,
      });

      // 计算会话持续时间
      const now = new Date();
      const startTime = new Date(session.start_time);
      const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);

      // 扣除用户点数（每分钟1点）
      const minutes = Math.ceil(duration / 60);
      try {
        await UserModel.deductCredits(userId, minutes);
        request.log.info(`已扣除用户 ${userId} 的点数: ${minutes} 点 (${sessionId})`);
      } catch (error) {
        request.log.error('扣除点数失败:', error);
      }

      return sendSuccess(reply, { id: sessionId, status: SessionStatus.DISCONNECTED, duration }, '会话已释放');
    } catch (machineError: any) {
      request.log.error(`关闭浏览器实例失败 (sessionId: ${sessionId}):`, machineError);

      // 即使关闭失败，也将会话标记为结束
      await SessionModel.update(sessionId, {
        status: SessionStatus.DISCONNECTED,
        end_time: new Date(),
      });

      // 记录错误信息
      request.log.error(`关闭浏览器错误信息: ${machineError.message}`);

      // 计算会话持续时间
      const now = new Date();
      const startTime = new Date(session.start_time);
      const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);

      // 扣除用户点数（每分钟1点）
      const minutes = Math.ceil(duration / 60);
      try {
        await UserModel.deductCredits(userId, minutes);
        request.log.info(`已扣除用户 ${userId} 的点数: ${minutes} 点 (${sessionId})`);
      } catch (error) {
        request.log.error('扣除点数失败:', error);
      }

      return sendSuccess(reply, { id: sessionId, status: SessionStatus.DISCONNECTED, duration }, '会话已释放（但关闭浏览器实例失败）');
    }
  } catch (error) {
    request.log.error(error);
    return sendError(reply, '释放会话失败', 500);
  }
}

// 获取所有会话（管理员）
export async function getAllSessions(request: FastifyRequest, reply: FastifyReply) {
  try {
    // 检查用户是否已经认证
    if (!request.user) {
      return sendError(reply, '用户未认证', 401);
    }

    // 检查用户是否是管理员
    const user = request.user as User;
    if (user.role !== 'admin') {
      return sendError(reply, '无权访问', 403);
    }

    const query = paginationQuerySchema.parse(request.query) as PaginationQuery;

    // 获取所有会话
    const sessions = await SessionModel.findAll(query);

    return sendPaginated(reply, sessions);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(reply, '无效的查询参数: ' + error.errors.map((e: any) => e.message).join(', '), 400);
    }

    request.log.error(error);
    return sendError(reply, '获取会话列表失败', 500);
  }
}

// 关闭会话（管理员）
export async function closeSession(request: FastifyRequest, reply: FastifyReply) {
  try {
    // 检查用户是否已经认证
    if (!request.user) {
      return sendError(reply, '用户未认证', 401);
    }

    // 检查用户是否是管理员
    const user = request.user as User;
    if (user.role !== 'admin') {
      return sendError(reply, '无权访问', 403);
    }

    const sessionId = (request.params as any).id;

    // 查找会话
    const session = await SessionModel.findById(sessionId);
    if (!session) {
      return sendError(reply, '会话不存在', 404);
    }

    // 检查会话状态
    if (session.status === SessionStatus.DISCONNECTED || session.status === SessionStatus.ERROR) {
      return sendSuccess(reply, { id: sessionId, status: session.status, duration: session.duration || 0 }, '会话已关闭');
    }

    // 检查会话是否有关联的机器
    if (!session.machine_id) {
      await SessionModel.update(sessionId, {
        status: SessionStatus.DISCONNECTED,
        end_time: new Date(),
      });
      return sendSuccess(reply, { id: sessionId, status: SessionStatus.DISCONNECTED, duration: 0 }, '会话已关闭');
    }

    try {
      // 向机器发送关闭浏览器实例的请求
      const { connectionManager } = await import('../services/machine-grpc.service.js');
      request.log.info(`向机器 ${session.machine_id} 发送关闭浏览器请求 (sessionId: ${sessionId})`);

      await connectionManager.closeBrowser(session.machine_id, sessionId);

      // 更新会话状态
      await SessionModel.update(sessionId, {
        status: SessionStatus.DISCONNECTED,
        end_time: new Date(),
      });

      // 如果会话已分配机器，减少机器的实例计数
      await MachineModel.decrementInstanceCount(session.machine_id);

      // 触发 Webhook 事件
      const disconnectedAt = new Date();
      await createWebhookEvent(session.user_id, WebhookEventType.SESSION_DISCONNECTED, {
        session_id: sessionId,
        disconnected_at: disconnectedAt,
      });

      // 计算会话持续时间
      const now = new Date();
      const startTime = session.start_time ? new Date(session.start_time) : new Date(session.created_at);
      const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);

      // 扣除用户点数（每分钟1点）
      const minutes = Math.ceil(duration / 60);
      try {
        await UserModel.deductCredits(session.user_id, minutes);
        request.log.info(`已扣除用户 ${session.user_id} 的点数: ${minutes} 点 (${sessionId})`);
      } catch (error) {
        request.log.error('扣除点数失败:', error);
      }

      return sendSuccess(reply, { id: sessionId, status: SessionStatus.DISCONNECTED, duration }, '会话已关闭');
    } catch (machineError: any) {
      request.log.error(`关闭浏览器实例失败 (sessionId: ${sessionId}):`, machineError);

      // 即使关闭失败，也将会话标记为结束
      await SessionModel.update(sessionId, {
        status: SessionStatus.DISCONNECTED,
        end_time: new Date(),
      });

      // 计算会话持续时间
      const now = new Date();
      const startTime = session.start_time ? new Date(session.start_time) : new Date(session.created_at);
      const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);

      return sendSuccess(reply, { id: sessionId, status: SessionStatus.DISCONNECTED, duration }, '会话已关闭（但关闭浏览器实例失败）');
    }
  } catch (error) {
    request.log.error(error);
    return sendError(reply, '关闭会话失败', 500);
  }
}

export default {
  createSession,
  getSession,
  getUserSessions,
  releaseSession,
  getAllSessions,
  closeSession,
};
