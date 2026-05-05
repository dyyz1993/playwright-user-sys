import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { SessionModel } from '../models/session.model.js';
import { MachineModel } from '../models/machine.model.js';
import { UserModel } from '../models/user.model.js';
import { sendSuccess, sendError, sendCreated } from '../utils/response.js';
import { SessionStatus, SessionCreateOptions, WebhookEventType } from '@shared/types/index.js';
import { createWebhookEvent } from '../utils/webhook.js';
import { createSessionRequestSchema } from '../schemas/index.js';
import { env } from '../config/env.js';

function toISOString(v: Date | string | null | undefined): string | null {
  if (!v) return v === undefined ? undefined : null;
  return v instanceof Date ? v.toISOString() : String(v);
}

function serializeSessionTimestamps(session: any) {
  return {
    ...session,
    start_time: toISOString(session.start_time),
    end_time: toISOString(session.end_time),
    disconnected_at: toISOString(session.disconnected_at),
    last_activity: toISOString(session.last_activity),
    created_at: toISOString(session.created_at),
    updated_at: toISOString(session.updated_at),
  };
}

import { createBrowserSession } from '../services/session.service.js';
import { connectionManager } from '../services/machine-grpc.service.js';
// URL 导入已移除，因为不再需要解析 URL

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

    // 验证并解析请求体
    // 完全依赖 Zod strict() 模式进行验证，拒绝未知字段
    let options: SessionCreateOptions = {};
    if (request.body) {
      try {
        options = createSessionRequestSchema.parse(request.body) as SessionCreateOptions;
      } catch (parseError: any) {
        if (parseError instanceof z.ZodError) {
          // 提供详细的错误信息
          const errors = parseError.errors.map((e: any) => {
            if (e.code === 'unrecognized_keys') {
              return `包含未知字段: ${e.keys.join(', ')}`;
            }
            return `${e.path.join('.') || 'field'}: ${e.message}`;
          });
          return sendError(reply, '无效的请求数据: ' + errors.join(', '), 400);
        }
        return sendError(reply, '无效的请求数据', 400);
      }
    }

    try {
      // 使用共享服务创建会话
      const sessionResult = await createBrowserSession(userId, options);

      // 构建前端 Viewer URL
      const frontendBaseUrl = (env as any).VITE_FRONTEND_URL || 'http://localhost:5173';
      const viewerUrl = `${frontendBaseUrl}/viewer?sessionId=${sessionResult.sessionId}`;
      request.log.info(`构建的前端 Viewer URL: ${viewerUrl}`);

      return sendCreated(reply, {
        id: sessionResult.sessionId,
        status: sessionResult.status,
        browserWSEndpoint: sessionResult.directUrl, // 使用代理端点而不是原始 CDP 端点
        directUrl: sessionResult.directUrl,
        viewerUrl: viewerUrl,
        created_at: toISOString(sessionResult.created_at),
      });
    } catch (serviceError: any) {
      request.log.error({ err: serviceError }, '创建会话服务错误');

      // 检查是否是点数不足错误 - 返回 402 (Payment Required)
      if (serviceError.message && serviceError.message.includes('点数不足')) {
        return sendError(reply, serviceError.message, 402);
      }

      // 检查是否是会话数量限制错误 - 返回 429 (Too Many Requests)
      if (serviceError.message && serviceError.message.includes('Session limit reached')) {
        return sendError(reply, serviceError.message, 429);
      }

      // 其他错误返回 500
      return sendError(reply, '启动浏览器实例失败: ' + serviceError.message, 500);
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
      return sendError(reply, '未找到指定的会话记录', 404);
    }

    // 检查会话是否属于当前用户
    if (session.user_id !== userId && request.user.role !== 'admin') {
      return sendError(reply, '无权访问此会话', 403);
    }

    return sendSuccess(
      reply,
      serializeSessionTimestamps({
        id: session.id,
        status: session.status,
        machine_id: session.machine_id,
        port: session.port,
        options: session.options,
        start_time: session.start_time,
        end_time: session.end_time,
        disconnected_at: session.disconnected_at,
        duration: session.duration,
        credits_used: session.credits_used,
        screenshot_url: session.screenshot_url,
        last_activity: session.last_activity,
        error_message: session.error_message,
        created_at: session.created_at,
        updated_at: session.updated_at,
      })
    );
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
    // 直接传递查询参数，让 Model 层处理验证和默认值
    const query = request.query as any;

    // 获取用户的所有会话
    const paginatedSessions = await SessionModel.findByUserId(userId, query);

    // 返回完整的分页对象
    return sendSuccess(reply, {
      ...paginatedSessions,
      items: paginatedSessions.items.map(serializeSessionTimestamps),
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(reply, '无效的查询参数: ' + error.errors.map((e: any) => e.message).join(', '), 400);
    }

    request.log.error({ err: error }, '获取用户会话失败');
    return sendError(reply, '获取会话列表失败: ' + (error.message || error), 500);
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

    // 检查会话是否有关联的机器
    // 即使会话已经是 DISCONNECTED 状态，也要尝试关闭浏览器以确保清理
    // （例如：清理共享浏览器记录 userSharedBrowsers）
    if (!session.machine_id) {
      // 计算会话持续时间
      const now = new Date();
      const startTime = new Date(session.start_time);
      const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);

      // 使用 markDisconnected 方法更新会话状态并计算点数
      // 注意：markDisconnected 已经自动扣除了用户积分
      const updatedSession = await SessionModel.markDisconnected(sessionId, duration);

      return sendSuccess(
        reply,
        { id: sessionId, status: SessionStatus.DISCONNECTED, duration: updatedSession?.duration || duration },
        '会话已释放'
      );
    }

    try {
      // 向机器发送关闭浏览器实例的请求
      request.log.info(`向机器 ${session.machine_id} 发送关闭浏览器请求 (sessionId: ${sessionId})`);

      await connectionManager.closeBrowser(session.machine_id, sessionId);

      // 计算会话持续时间
      const now = new Date();
      const startTime = new Date(session.start_time);
      const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);
      request.log.info(
        `计算会话持续时间 (${sessionId}): 开始时间=${startTime.toISOString()}, 结束时间=${now.toISOString()}, 持续时间=${duration}秒, 数据源: 管理端`
      );

      // 计算消耗的点数（每分钟1点）
      // 即使会话只运行了几秒钟，也至少消耗 1 点
      const minutes = duration > 0 ? Math.max(1, Math.ceil(duration / 60)) : 0;

      // 使用 markDisconnected 方法更新会话状态
      // 该方法会同时更新持续时间和消耗点数
      await SessionModel.markDisconnected(sessionId, duration);
      request.log.info(
        `使用 markDisconnected 方法更新会话状态 (${sessionId}): 持续时间=${duration}秒, 消耗点数=${minutes}点`
      );

      // 如果会话已分配机器，减少机器的实例计数
      await MachineModel.decrementInstanceCount(session.machine_id);

      // 触发 Webhook 事件
      const disconnectedAt = new Date();
      await createWebhookEvent(userId, WebhookEventType.SESSION_DISCONNECTED, {
        session_id: sessionId,
        disconnected_at: disconnectedAt,
      });

      // 注意：markDisconnected 已经自动扣除了用户积分，这里不需要重复扣费

      return sendSuccess(reply, { id: sessionId, status: SessionStatus.DISCONNECTED, duration }, '会话已释放');
    } catch (machineError: any) {
      request.log.error({ err: machineError, sessionId }, '关闭浏览器实例失败');

      // 计算会话持续时间
      const now = new Date();
      const startTime = new Date(session.start_time);
      const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);

      // 计算消耗的点数（每分钟1点）
      // 即使会话只运行了几秒钟，也至少消耗 1 点
      const minutes = duration > 0 ? Math.max(1, Math.ceil(duration / 60)) : 0;

      // 即使关闭失败，也将会话标记为结束
      // 使用 markDisconnected 方法更新会话状态
      // 该方法会同时更新持续时间和消耗点数
      await SessionModel.markDisconnected(sessionId, duration);
      request.log.info(
        `关闭失败，使用 markDisconnected 方法更新会话状态 (${sessionId}): 持续时间=${duration}秒, 消耗点数=${minutes}点`
      );

      // 记录错误信息
      request.log.error(`关闭浏览器错误信息: ${machineError.message}`);

      // 注意：markDisconnected 已经自动扣除了用户积分，这里不需要重复扣费

      return sendSuccess(
        reply,
        { id: sessionId, status: SessionStatus.DISCONNECTED, duration },
        '会话已释放（但关闭浏览器实例失败）'
      );
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

    // 直接传递查询参数，让 Model 层处理验证和默认值
    const query = request.query as any;

    // 获取所有会话
    const paginatedSessions = await SessionModel.findAll(query);

    // 返回完整的分页对象
    return sendSuccess(reply, {
      ...paginatedSessions,
      items: paginatedSessions.items.map(serializeSessionTimestamps),
    });
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
      return sendSuccess(
        reply,
        { id: sessionId, status: session.status, duration: session.duration || 0 },
        '会话已关闭'
      );
    }

    // 检查会话是否有关联的机器
    if (!session.machine_id) {
      // 计算会话持续时间
      const now = new Date();
      const startTime = session.start_time ? new Date(session.start_time) : new Date(session.created_at);
      const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);

      // 使用 markDisconnected 方法更新会话状态并计算点数
      // 注意：markDisconnected 已经自动扣除了用户积分
      const updatedSession = await SessionModel.markDisconnected(sessionId, duration);

      return sendSuccess(
        reply,
        { id: sessionId, status: SessionStatus.DISCONNECTED, duration: updatedSession?.duration || duration },
        '会话已关闭'
      );
    }

    try {
      // 向机器发送关闭浏览器实例的请求
      request.log.info(`向机器 ${session.machine_id} 发送关闭浏览器请求 (sessionId: ${sessionId})`);

      await connectionManager.closeBrowser(session.machine_id, sessionId);

      // 计算会话持续时间
      const now = new Date();
      const startTime = session.start_time ? new Date(session.start_time) : new Date(session.created_at);
      const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);

      // 计算消耗的点数（每分钟1点）
      // 即使会话只运行了几秒钟，也至少消耗 1 点
      const minutes = duration > 0 ? Math.max(1, Math.ceil(duration / 60)) : 0;

      // 使用 markDisconnected 方法更新会话状态
      // 该方法会同时更新持续时间和消耗点数
      await SessionModel.markDisconnected(sessionId, duration);
      request.log.info(
        `使用 markDisconnected 方法更新会话状态 (${sessionId}): 持续时间=${duration}秒, 消耗点数=${minutes}点`
      );

      // 如果会话已分配机器，减少机器的实例计数
      await MachineModel.decrementInstanceCount(session.machine_id);

      // 触发 Webhook 事件
      const disconnectedAt = new Date();
      await createWebhookEvent(session.user_id, WebhookEventType.SESSION_DISCONNECTED, {
        session_id: sessionId,
        disconnected_at: disconnectedAt,
      });

      // 注意：markDisconnected 已经自动扣除了用户积分，这里不需要重复扣费

      return sendSuccess(reply, { id: sessionId, status: SessionStatus.DISCONNECTED, duration }, '会话已关闭');
    } catch (machineError: any) {
      request.log.error({ err: machineError, sessionId }, '关闭浏览器实例失败');

      // 计算会话持续时间
      const now = new Date();
      const startTime = session.start_time ? new Date(session.start_time) : new Date(session.created_at);
      const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);

      // 计算消耗的点数（每分钟1点）
      // 即使会话只运行了几秒钟，也至少消耗 1 点
      const minutes = duration > 0 ? Math.max(1, Math.ceil(duration / 60)) : 0;

      // 即使关闭失败，也将会话标记为结束
      // 使用 markDisconnected 方法更新会话状态
      // 该方法会同时更新持续时间和消耗点数
      await SessionModel.markDisconnected(sessionId, duration);
      request.log.info(
        `关闭失败，使用 markDisconnected 方法更新会话状态 (${sessionId}): 持续时间=${duration}秒, 消耗点数=${minutes}点`
      );

      return sendSuccess(
        reply,
        { id: sessionId, status: SessionStatus.DISCONNECTED, duration },
        '会话已关闭（但关闭浏览器实例失败）'
      );
    }
  } catch (error) {
    request.log.error(error);
    return sendError(reply, '关闭会话失败', 500);
  }
}

// 获取会话截图
export async function getSessionScreenshot(request: FastifyRequest, reply: FastifyReply) {
  try {
    const sessionId = (request.params as any).id;

    // 查找会话
    const session = await SessionModel.findById(sessionId);
    if (!session) {
      return sendError(reply, '会话不存在', 404);
    }

    // 检查是否有权限访问该会话
    const apiKey = request.headers['x-api-key'] as string;
    if (!apiKey) {
      return sendError(reply, 'API Key 不能为空', 401);
    }

    // 获取用户 ID
    const user = await UserModel.findByApiKey(apiKey);
    if (!user) {
      return sendError(reply, '无效的 API Key', 401);
    }

    if (session.user_id !== user.id) {
      return sendError(reply, '无权访问该会话', 403);
    }

    // 检查是否有截图 URL
    if (!session.screenshot_url) {
      return sendError(reply, '会话没有截图', 404);
    }

    return sendSuccess(reply, {
      screenshot_url: session.screenshot_url,
    });
  } catch (error) {
    request.log.error(error);
    return sendError(reply, '获取会话截图失败', 500);
  }
}

export default {
  createSession,
  getSession,
  getUserSessions,
  releaseSession,
  getAllSessions,
  closeSession,
  getSessionScreenshot,
};
