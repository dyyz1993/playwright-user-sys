import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { SessionModel } from '../models/session.model.js';
import { UserModel } from '../models/user.model.js';
import { sendSuccess, sendError, sendCreated } from '../utils/response.js';
import { SessionStatus, SessionCreateOptions, WebhookEventType } from '@shared/types/index.js';
import { createWebhookEvent } from '../utils/webhook.js';
import { createSessionRequestSchema } from '../schemas/index.js';
import { env } from '../config/env.js';
import {
  serializeSessionTimestamps,
  toSessionDetail,
  toCreateSessionResponse,
  toSessionReleaseDTO,
} from '@shared/mappers/index.js';
import { IdParamRoute, PaginationQueryRoute } from '@shared/types/routes.js';

import * as sessionService from '../services/session.service.js';
import { connectionManager } from '../services/machine-grpc.service.js';

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
      } catch (parseError: unknown) {
        if (parseError instanceof z.ZodError) {
          const errors = parseError.errors.map((e) => {
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
      const sessionResult = await sessionService.createBrowserSession(userId, options);

      // 构建前端 Viewer URL
      const frontendBaseUrl = ((env as Record<string, unknown>).VITE_FRONTEND_URL as string) || 'http://localhost:5173';
      const viewerUrl = `${frontendBaseUrl}/viewer?sessionId=${sessionResult.sessionId}`;
      request.log.info(`构建的前端 Viewer URL: ${viewerUrl}`);

      return sendCreated(
        reply,
        toCreateSessionResponse(
          sessionResult.sessionId,
          sessionResult.status,
          sessionResult.directUrl,
          viewerUrl,
          sessionResult.created_at
        )
      );
    } catch (serviceError: unknown) {
      request.log.error({ err: serviceError }, '创建会话服务错误');
      const errMsg = serviceError instanceof Error ? serviceError.message : String(serviceError);

      if (errMsg.includes('点数不足')) {
        return sendError(reply, errMsg, 402);
      }

      if (errMsg.includes('Session limit reached')) {
        return sendError(reply, errMsg, 429);
      }

      return sendError(reply, '启动浏览器实例失败: ' + errMsg, 500);
    }
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return sendError(reply, '无效的请求数据: ' + error.errors.map((e) => e.message).join(', '), 400);
    }

    request.log.error(error);
    return sendError(reply, '创建会话失败', 500);
  }
}

// 获取会话信息
export async function getSession(request: FastifyRequest<IdParamRoute>, reply: FastifyReply) {
  try {
    if (!request.user) {
      return sendError(reply, '用户未认证', 401);
    }

    const userId = request.user.id;
    const sessionId = request.params.id;

    // 查找会话
    const session = await SessionModel.findById(sessionId);
    if (!session) {
      return sendError(reply, '未找到指定的会话记录', 404);
    }

    // 检查会话是否属于当前用户
    if (session.user_id !== userId && request.user.role !== 'admin') {
      return sendError(reply, '无权访问此会话', 403);
    }

    return sendSuccess(reply, toSessionDetail(session));
  } catch (error) {
    request.log.error(error);
    return sendError(reply, '获取会话信息失败', 500);
  }
}

// 获取用户的所有会话
export async function getUserSessions(request: FastifyRequest<PaginationQueryRoute>, reply: FastifyReply) {
  try {
    if (!request.user) {
      return sendError(reply, '用户未认证', 401);
    }

    const userId = request.user.id;
    const query = request.query;

    // 获取用户的所有会话
    const paginatedSessions = await SessionModel.findByUserId(userId, query);

    // 返回完整的分页对象
    return sendSuccess(reply, {
      ...paginatedSessions,
      items: paginatedSessions.items.map(serializeSessionTimestamps),
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return sendError(reply, '无效的查询参数: ' + error.errors.map((e) => e.message).join(', '), 400);
    }

    request.log.error({ err: error }, '获取用户会话失败');
    return sendError(reply, '获取会话列表失败: ' + (error instanceof Error ? error.message : String(error)), 500);
  }
}

// 释放会话
export async function releaseSession(request: FastifyRequest<IdParamRoute>, reply: FastifyReply) {
  try {
    if (!request.user) {
      return sendError(reply, '用户未认证', 401);
    }

    const userId = request.user.id;
    const sessionId = request.params.id;

    const session = await SessionModel.findById(sessionId);
    if (!session) {
      return sendError(reply, '会话不存在', 404);
    }

    if (session.user_id !== userId && request.user.role !== 'admin') {
      return sendError(reply, '无权操作此会话', 403);
    }

    const result = await sessionService.releaseSession({
      sessionId,
      userId: session.user_id,
      machineId: session.machine_id || undefined,
    });

    if (session.machine_id && !result.alreadyDisconnected) {
      try {
        await connectionManager.closeBrowser(session.machine_id, sessionId);
      } catch (machineError: unknown) {
        request.log.error({ err: machineError, sessionId }, '关闭浏览器实例失败（会话已释放）');
      }

      await createWebhookEvent(session.user_id, WebhookEventType.SESSION_DISCONNECTED, {
        session_id: sessionId,
        disconnected_at: new Date(),
      });
    }

    return sendSuccess(
      reply,
      toSessionReleaseDTO(sessionId, SessionStatus.DISCONNECTED, result.duration),
      '会话已释放'
    );
  } catch (error) {
    request.log.error(error);
    return sendError(reply, '释放会话失败', 500);
  }
}

// 获取所有会话（管理员）
export async function getAllSessions(request: FastifyRequest<PaginationQueryRoute>, reply: FastifyReply) {
  try {
    if (!request.user) {
      return sendError(reply, '用户未认证', 401);
    }

    const user = request.user as User;
    if (user.role !== 'admin') {
      return sendError(reply, '无权访问', 403);
    }

    const query = request.query;

    // 获取所有会话
    const paginatedSessions = await SessionModel.findAll(query);

    // 返回完整的分页对象
    return sendSuccess(reply, {
      ...paginatedSessions,
      items: paginatedSessions.items.map(serializeSessionTimestamps),
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return sendError(reply, '无效的查询参数: ' + error.errors.map((e) => e.message).join(', '), 400);
    }

    request.log.error(error);
    return sendError(reply, '获取会话列表失败', 500);
  }
}

// 关闭会话（管理员）
export async function closeSession(request: FastifyRequest<IdParamRoute>, reply: FastifyReply) {
  try {
    if (!request.user) {
      return sendError(reply, '用户未认证', 401);
    }

    const user = request.user as User;
    if (user.role !== 'admin') {
      return sendError(reply, '无权访问', 403);
    }

    const sessionId = request.params.id;

    const session = await SessionModel.findById(sessionId);
    if (!session) {
      return sendError(reply, '会话不存在', 404);
    }

    const result = await sessionService.releaseSession({
      sessionId,
      userId: session.user_id,
      machineId: session.machine_id || undefined,
      force: true,
    });

    if (session.machine_id && !result.alreadyDisconnected) {
      try {
        await connectionManager.closeBrowser(session.machine_id, sessionId);
      } catch (machineError: unknown) {
        request.log.error({ err: machineError, sessionId }, '关闭浏览器实例失败（会话已关闭）');
      }

      await createWebhookEvent(session.user_id, WebhookEventType.SESSION_DISCONNECTED, {
        session_id: sessionId,
        disconnected_at: new Date(),
      });
    }

    return sendSuccess(
      reply,
      toSessionReleaseDTO(sessionId, SessionStatus.DISCONNECTED, result.duration),
      '会话已关闭'
    );
  } catch (error) {
    request.log.error(error);
    return sendError(reply, '关闭会话失败', 500);
  }
}

// 获取会话截图
export async function getSessionScreenshot(request: FastifyRequest<IdParamRoute>, reply: FastifyReply) {
  try {
    const sessionId = request.params.id;

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
