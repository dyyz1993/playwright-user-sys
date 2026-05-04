import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { UserModel } from '../models/user.model.js';
import { generateToken, comparePassword } from '../utils/auth.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { UserStatus } from '@shared/types/index.js';
import { adminLoginRequestSchema } from '../schemas/admin.schema.js';

// 登录控制器
export async function login(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { username, password } = adminLoginRequestSchema.parse(request.body);

    // 查找用户
    const user = await UserModel.findByUsername(username);
    if (!user) {
      return sendError(reply, '用户名或密码错误', 401);
    }

    // 检查用户状态
    if (user.status !== UserStatus.ACTIVE) {
      return sendError(reply, '用户账号已被禁用', 403);
    }

    // 验证密码
    const isValid = await comparePassword(password, user.password);
    if (!isValid) {
      return sendError(reply, '用户名或密码错误', 401);
    }

    // 生成 JWT Token
    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role,
    });

    // 返回用户信息和 Token
    return sendSuccess(reply, {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status,
        credits: user.credits,
      },
      token,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(reply, '无效的请求数据: ' + error.errors.map((e) => e.message).join(', '), 400);
    }

    request.log.error(error);
    return sendError(reply, '登录失败', 500);
  }
}

// 获取当前用户信息
export async function getCurrentUser(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = request?.user?.id as number;
    if (!userId) {
      return sendError(reply, '用户未登录', 401);
    }

    // 查找用户
    const user = await UserModel.findById(userId);
    if (!user) {
      return sendError(reply, '用户不存在', 404);
    }

    return sendSuccess(reply, {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        credits: user.credits,
        webhook_url: user.webhook_url,
        api_key: user.api_key,
        created_at: user.created_at,
      },
    });
  } catch (error) {
    request.log.error(error);
    return sendError(reply, '获取用户信息失败', 500);
  }
}

export default {
  login,
  getCurrentUser,
};
