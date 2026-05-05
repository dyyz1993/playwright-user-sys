import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { UserModel, UpdateUserInput } from '../models/user.model.js';
import { generateToken, verifyPasswordWithMigration, hashPassword } from '../utils/auth.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { UserStatus } from '@shared/types/index.js';
import { adminLoginRequestSchema } from '../schemas/admin.schema.js';
import { toLoginUser, toCurrentUserResponse } from '@shared/mappers/index.js';

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
    const { valid, needsMigration } = await verifyPasswordWithMigration(password, user.password);
    if (!valid) {
      return sendError(reply, '用户名或密码错误', 401);
    }

    if (needsMigration) {
      const newHash = await hashPassword(password);
      await UserModel.update(user.id, { password: newHash } as UpdateUserInput);
      request.log.info({ userId: user.id }, 'Password migrated from SHA-256 to bcrypt');
    }

    // 生成 JWT Token
    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role,
    });

    // 返回用户信息和 Token
    return sendSuccess(reply, {
      user: toLoginUser(user),
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
      user: toCurrentUserResponse(user),
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
