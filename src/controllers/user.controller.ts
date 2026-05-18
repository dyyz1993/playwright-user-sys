import { FastifyReply } from 'fastify';
import { z } from 'zod';
import { UserModel, CreateUserInput, UpdateUserInput } from '../models/user.model.js';
import { OperationLogModel } from '../models/operation-log.model.js';
import { SessionModel } from '../models/session/index.js';
import {
  sendSuccess,
  sendError,
  sendCreated,
  sendNoContent,
  sendPaginated,
  logAndSendError,
} from '../utils/response.js';
import {
  UserRole,
  PaginationQuery,
  IdParams,
  AuthenticatedRequest,
  AuthenticatedRequestWithParams,
} from '@shared/types/index.js';
import { createUserRequestSchema, updateUserRequestSchema, paginationQuerySchema } from '../schemas/index.js';
import { toCreateUserResponse, toUserListItem, toUpdateUserResponse, toUserResponse } from '@shared/mappers/index.js';

// 创建用户
export async function createUser(request: AuthenticatedRequest, reply: FastifyReply) {
  try {
    const adminId = request.user.id;
    const userData = createUserRequestSchema.parse(request.body) as CreateUserInput;

    // 检查用户名是否已存在（快速失败）
    const existingUser = await UserModel.findByUsername(userData.username);
    if (existingUser) {
      return sendError(reply, '用户名已存在', 409);
    }

    // 创建用户（捕获并发创建的竞态条件）
    let user: Awaited<ReturnType<typeof UserModel.create>>;
    try {
      user = await UserModel.create(userData);
    } catch (createError: unknown) {
      // MySQL ER_DUP_ENTRY / SQLite UNIQUE constraint violation
      const msg = createError instanceof Error ? createError.message : String(createError);
      if (msg.includes('Duplicate') || msg.includes('UNIQUE') || msg.includes('已存在')) {
        return sendError(reply, '用户名已存在', 409);
      }
      throw createError;
    }
    if (!user) {
      return sendError(reply, '创建用户失败', 500);
    }

    // 记录操作日志 - 异步处理
    OperationLogModel.create({
      admin_id: adminId,
      action: '创建用户',
      details: {
        username: userData.username,
        role: userData.role || UserRole.USER,
        credits: userData.credits || 0,
      },
      target_user_id: user.id,
    }).catch((logError) => {
      request.log.error({ err: logError }, '记录操作日志失败');
    });

    return sendCreated(reply, toCreateUserResponse(user));
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return sendError(reply, '无效的请求数据: ' + error.errors.map((e) => e.message).join(', '), 400);
    }

    return logAndSendError(request, reply, error, '创建用户失败');
  }
}

// 获取所有用户
export async function getAllUsers(request: AuthenticatedRequest, reply: FastifyReply) {
  try {
    const query = paginationQuerySchema.parse(request.query) as PaginationQuery;
    const users = await UserModel.findAll(query);

    // 移除敏感信息
    const sanitizedUsers = users.items.map(toUserListItem);

    return sendPaginated(reply, {
      ...users,
      items: sanitizedUsers,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return sendError(reply, '无效的查询参数: ' + error.errors.map((e) => e.message).join(', '), 400);
    }

    return logAndSendError(request, reply, error, '获取用户列表失败');
  }
}

// 获取单个用户
export async function getUserById(request: AuthenticatedRequestWithParams<IdParams>, reply: FastifyReply) {
  try {
    const userId = parseInt(request.params.id, 10);
    if (isNaN(userId)) {
      return sendError(reply, '无效的用户 ID', 400);
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return sendError(reply, '用户不存在', 404);
    }

    return sendSuccess(reply, toUserResponse(user));
  } catch (error: unknown) {
    return logAndSendError(request, reply, error, '获取用户信息失败');
  }
}

// 更新用户
export async function updateUser(request: AuthenticatedRequestWithParams<IdParams>, reply: FastifyReply) {
  try {
    const adminId = request.user.id;
    const userId = parseInt(request.params.id, 10);
    if (isNaN(userId)) {
      return sendError(reply, '无效的用户 ID', 400);
    }

    const userData = updateUserRequestSchema.parse(request.body) as UpdateUserInput;

    // 检查用户是否存在
    const existingUser = await UserModel.findById(userId);
    if (!existingUser) {
      return sendError(reply, '用户不存在', 404);
    }

    // 更新用户
    const updatedUser = await UserModel.update(userId, userData);
    if (!updatedUser) {
      return sendError(reply, '更新用户失败', 500);
    }

    // 记录操作日志 - 异步处理（脱敏密码字段）
    const logData = { ...userData } as Record<string, unknown>;
    delete logData.password;
    OperationLogModel.create({
      admin_id: adminId,
      action: '更新用户',
      details: logData,
      target_user_id: userId,
    }).catch((logError) => {
      request.log.error({ err: logError }, '记录操作日志失败');
    });

    return sendSuccess(reply, toUpdateUserResponse(updatedUser));
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return sendError(reply, '无效的请求数据: ' + error.errors.map((e) => e.message).join(', '), 400);
    }

    return logAndSendError(request, reply, error, '更新用户失败');
  }
}

// 重置用户 API Key
export async function resetApiKey(request: AuthenticatedRequestWithParams<IdParams>, reply: FastifyReply) {
  try {
    const adminId = request.user.id;
    const userId = parseInt(request.params.id, 10);
    if (isNaN(userId)) {
      return sendError(reply, '无效的用户 ID', 400);
    }

    // 检查用户是否存在
    const existingUser = await UserModel.findById(userId);
    if (!existingUser) {
      return sendError(reply, '用户不存在', 404);
    }

    // 重置 API Key
    const apiKey = await UserModel.resetApiKey(userId);

    // 记录操作日志 - 异步处理
    OperationLogModel.create({
      admin_id: adminId,
      action: '重置用户 API Key',
      target_user_id: userId,
    }).catch((logError) => {
      request.log.error({ err: logError }, '记录操作日志失败');
    });

    return sendSuccess(reply, { api_key: apiKey });
  } catch (error: unknown) {
    return logAndSendError(request, reply, error, '重置 API Key 失败');
  }
}

// 添加点数 - 已移至管理员API路由
// 保留方法供兼容使用
export async function addCredits(request: AuthenticatedRequestWithParams<IdParams>, reply: FastifyReply) {
  try {
    // 重定向到管理员API路由
    return sendError(reply, '此功能已移至管理员API路由', 404);
  } catch (error: unknown) {
    return logAndSendError(request, reply, error, '添加点数失败');
  }
}

// 删除用户
export async function deleteUser(request: AuthenticatedRequestWithParams<IdParams>, reply: FastifyReply) {
  try {
    const adminId = request.user.id;
    const userId = parseInt(request.params.id, 10);
    if (isNaN(userId)) {
      return sendError(reply, '无效的用户 ID', 400);
    }

    // 检查用户是否存在
    const existingUser = await UserModel.findById(userId);
    if (!existingUser) {
      return sendError(reply, '用户不存在', 404);
    }

    // 不允许删除管理员
    if (existingUser.role === UserRole.ADMIN) {
      return sendError(reply, '不允许删除管理员账号', 403);
    }

    const activeSessions = await SessionModel.findActiveSessions();
    const hasActive = activeSessions.some((s: { user_id: number }) => s.user_id === userId);
    if (hasActive) {
      return sendError(reply, '该用户有活跃会话，请先释放所有会话后再删除', 409);
    }

    await UserModel.delete(userId);

    // 记录操作日志 - 异步处理
    OperationLogModel.create({
      admin_id: adminId,
      action: '删除用户',
      details: { username: existingUser.username },
      target_user_id: userId,
    }).catch((logError) => {
      request.log.error({ err: logError }, '记录操作日志失败');
    });

    return sendNoContent(reply);
  } catch (error: unknown) {
    return logAndSendError(request, reply, error, '删除用户失败');
  }
}

// 获取用户的会话消耗统计
export async function getUserSessionStats(request: AuthenticatedRequestWithParams<IdParams>, reply: FastifyReply) {
  try {
    const userId = parseInt(request.params.id, 10);
    if (isNaN(userId)) {
      return sendError(reply, '无效的用户 ID', 400);
    }

    // 检查用户是否存在
    const existingUser = await UserModel.findById(userId);
    if (!existingUser) {
      return sendError(reply, '用户不存在', 404);
    }

    // 获取用户的会话消耗统计
    const { SessionModel } = await import('../models/session/index.js');
    const stats = await SessionModel.getUserSessionStats(userId);

    return sendSuccess(reply, stats);
  } catch (error: unknown) {
    return logAndSendError(request, reply, error, '获取用户会话消耗统计失败');
  }
}

export default {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  resetApiKey,
  addCredits,
  deleteUser,
  getUserSessionStats,
};
