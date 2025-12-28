import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import jwt from 'jsonwebtoken';
import { UserModel } from '../models/user.model.js';
import { UserRole, UserStatus } from '@shared/types/index.js';
import { sendError } from '../utils/response.js';
import { env } from '../config/env.js';

export default fp(async function (fastify: FastifyInstance) {
  // JWT 验证中间件
  fastify.decorate('verifyJWT', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // 先从 Authorization 头中获取令牌
      let token = null;
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
        request.log.info('从 Authorization 头中获取到令牌');
      }

      // 如果没有从头中获取到令牌，尝试从 cookie 中获取
      if (!token && request.cookies && request.cookies.token) {
        token = request.cookies.token;
        request.log.info('从 cookie 中获取到令牌');
      }

      // 如果仍然没有令牌，根据请求类型返回不同的响应
      if (!token) {
        request.log.warn('未提供授权令牌');

        // 检查是否是浏览器页面请求（通过Accept头）
        const acceptHeader = request.headers.accept || '';
        const isHtmlRequest = acceptHeader.includes('text/html');

        if (isHtmlRequest) {
          // 浏览器请求：重定向到登录页面
          return reply.redirect('/admin/login');
        } else {
          // API请求：返回JSON错误
          return sendError(reply, '未提供授权令牌', 401);
        }
      }

      // 输出所有 cookie 信息以便调试
      request.log.info('请求中的 cookie:', request.cookies);
      request.log.info('NODE_ENV:', process.env.NODE_ENV);

      // 使用配置中的 JWT 密钥
      // 测试环境使用固定密钥
      const jwtSecret = process.env.NODE_ENV === 'test' ? 'test-secret-key' : String(env.JWT_SECRET);
      request.log.info('JWT_SECRET:', jwtSecret);
      request.log.info('使用 JWT 密钥验证令牌');
      request.log.info('Token 前缀:', token?.substring(0, 20) + '...');

      const decoded = jwt.verify(token, jwtSecret) as any;
      request.log.info('完整解码后的 token:', JSON.stringify(decoded));
      request.log.info('令牌验证成功，用户 ID:', decoded?.id);
      request.log.info('令牌类型:', typeof decoded);

      const user = await UserModel.findById(decoded.id);
      if (!user) {
        request.log.warn('找不到用户:', decoded.id);
        return sendError(reply, '无效的用户', 401);
      }

      if (user.status !== UserStatus.ACTIVE) {
        request.log.warn('用户已被禁用或暂停:', user.username);
        return sendError(reply, '用户已被禁用或暂停', 403);
      }

      // 将用户信息添加到请求对象
      request.user = {
        id: user.id,
        username: user.username,
        role: user.role as 'admin' | 'user',
      };

      request.log.info('用户认证成功:', user.username, '角色:', user.role);
    } catch (error: any) {
      request.log.error('令牌验证失败:', error.message);
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
