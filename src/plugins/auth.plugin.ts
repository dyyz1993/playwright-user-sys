import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import jwt from 'jsonwebtoken';
import { UserModel } from '../models/user.model.js';
import { UserRole, UserStatus } from '../types/index.js';
import { sendError } from '../utils/response.js';

export default fp(async function (fastify: FastifyInstance) {
  // JWT 验证中间件
  fastify.decorate('verifyJWT', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // 先从 Authorization 头中获取令牌
      let token = null;
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }

      // 如果没有从头中获取到令牌，尝试从 cookie 中获取
      if (!token && request.cookies.token) {
        token = request.cookies.token;
      }

      // 如果仍然没有令牌，返回错误
      if (!token) {
        return sendError(reply, '未提供授权令牌', 401);
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as { id: number };

      const user = await UserModel.findById(decoded.id);
      if (!user) {
        return sendError(reply, '无效的用户', 401);
      }

      if (user.status !== UserStatus.ACTIVE) {
        return sendError(reply, '用户已被禁用或暂停', 403);
      }

      // 将用户信息添加到请求对象
      request.user = {
        id: user.id,
        username: user.username,
        role: user.role as 'admin' | 'user',
      };
    } catch (error) {
      return sendError(reply, '无效的令牌', 401);
    }
  });

  // 管理员验证中间件
  fastify.decorate('verifyAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return sendError(reply, '未授权', 401);
    }

    if (request.user.role !== UserRole.ADMIN) {
      return sendError(reply, '需要管理员权限', 403);
    }
  });

  // API Key 验证中间件
  fastify.decorate('verifyApiKey', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const apiKey = request.headers['x-api-key'] as string;
      if (!apiKey) {
        return sendError(reply, '未提供 API Key', 401);
      }

      const user = await UserModel.findByApiKey(apiKey);
      if (!user) {
        return sendError(reply, '无效的 API Key', 401);
      }

      if (user.status !== UserStatus.ACTIVE) {
        return sendError(reply, '用户已被禁用或暂停', 403);
      }

      // 将用户信息添加到请求对象
      request.user = {
        id: user.id,
        username: user.username,
        role: user.role as 'admin' | 'user',
      };
    } catch (error) {
      return sendError(reply, '验证 API Key 失败', 500);
    }
  });
});
