import { FastifyReply } from 'fastify';
import { z } from 'zod';
import { UserModel, CreateUserInput, UpdateUserInput } from '../models/user.model.js';
import { OperationLogModel } from '../models/operation-log.model.js';
import { sendSuccess, sendError, sendCreated, sendNoContent, sendPaginated } from '../utils/response.js';
import { UserRole, PaginationQuery, IdParams, AuthenticatedRequest, AuthenticatedRequestWithParams } from '../types/index.js';
import {
  createUserRequestSchema,
  updateUserRequestSchema,
  paginationQuerySchema,

} from '../schemas/index.js';



// 创建用户
export async function createUser(request: AuthenticatedRequest, reply: FastifyReply) {
  try {
    const adminId = request.user.id;
    const userData = createUserRequestSchema.parse(request.body) as CreateUserInput;

    // 检查用户名是否已存在
    const existingUser = await UserModel.findByUsername(userData.username);
    if (existingUser) {
      return sendError(reply, '用户名已存在', 409);
    }

    // 创建用户
    const user = await UserModel.create(userData);
    if (!user) {
      return sendError(reply, '创建用户失败', 500);
    }

    // 记录操作日志
    await OperationLogModel.create({
      admin_id: adminId,
      action: '创建用户',
      details: {
        username: userData.username,
        role: userData.role || UserRole.USER,
        credits: userData.credits || 0,
      },
      target_user_id: user.id,
    });

    return sendCreated(reply, {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
      credits: user.credits,
      api_key: user.api_key,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(reply, '无效的请求数据: ' + error.errors.map(e => e.message).join(', '), 400);
    }

    request.log.error(error);
    return sendError(reply, '创建用户失败', 500);
  }
}

// 获取所有用户
export async function getAllUsers(request: AuthenticatedRequest, reply: FastifyReply) {
  try {
    const query = paginationQuerySchema.parse(request.query) as PaginationQuery;
    const users = await UserModel.findAll(query);

    // 移除敏感信息
    const sanitizedUsers = users.items.map(user => ({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
      credits: user.credits,
      created_at: user.created_at,
    }));

    return sendPaginated(reply, {
      ...users,
      items: sanitizedUsers,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(reply, '无效的查询参数: ' + error.errors.map(e => e.message).join(', '), 400);
    }

    request.log.error(error);
    return sendError(reply, '获取用户列表失败', 500);
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

    return sendSuccess(reply, {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
      credits: user.credits,
      webhook_url: user.webhook_url,
      created_at: user.created_at,
    });
  } catch (error) {
    request.log.error(error);
    return sendError(reply, '获取用户信息失败', 500);
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

    // 记录操作日志
    await OperationLogModel.create({
      admin_id: adminId,
      action: '更新用户',
      details: userData,
      target_user_id: userId,
    });

    return sendSuccess(reply, {
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      role: updatedUser.role,
      status: updatedUser.status,
      credits: updatedUser.credits,
      webhook_url: updatedUser.webhook_url,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(reply, '无效的请求数据: ' + error.errors.map(e => e.message).join(', '), 400);
    }

    request.log.error(error);
    return sendError(reply, '更新用户失败', 500);
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

    // 记录操作日志
    await OperationLogModel.create({
      admin_id: adminId,
      action: '重置用户 API Key',
      target_user_id: userId,
    });

    return sendSuccess(reply, { api_key: apiKey });
  } catch (error) {
    request.log.error(error);
    return sendError(reply, '重置 API Key 失败', 500);
  }
}

// 添加点数 - 已移至管理员API路由
// 保留方法供兼容使用
export async function addCredits(request: AuthenticatedRequestWithParams<IdParams>, reply: FastifyReply) {
  try {
    // 重定向到管理员API路由
    return sendError(reply, '此功能已移至管理员API路由', 404);
  } catch (error) {
    request.log.error(error);
    return sendError(reply, '添加点数失败', 500);
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

    // 删除用户
    await UserModel.delete(userId);

    // 记录操作日志
    await OperationLogModel.create({
      admin_id: adminId,
      action: '删除用户',
      details: { username: existingUser.username },
      target_user_id: userId,
    });

    return sendNoContent(reply);
  } catch (error) {
    request.log.error(error);
    return sendError(reply, '删除用户失败', 500);
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
};
