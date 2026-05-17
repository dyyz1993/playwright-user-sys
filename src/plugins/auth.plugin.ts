import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import jwt from 'jsonwebtoken';
import { UserModel } from '../models/user.model.js';
import { UserRole, UserStatus } from '@shared/types/index.js';
import { sendError } from '../utils/response.js';
import { getJwtSecret } from '../utils/auth.js';

export default fp(async function (fastify: FastifyInstance) {
  // JWT 验证中间件
  fastify.decorate('verifyJWT', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // 先从 Authorization 头中获取令牌
      let token: string | null = null;
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1] ?? null;
        request.log.info('从 Authorization 头中获取到令牌');
      }

      // 如果没有从头中获取到令牌，尝试从 cookie 中获取
      if (!token && request.cookies && request.cookies.token) {
        token = request.cookies.token ?? null;
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

      // 使用统一的 JWT 密钥
      const jwtSecret = getJwtSecret();

      const decoded = jwt.verify(token, jwtSecret) as { id: number; role: string };

      const user = await UserModel.findById(decoded.id);
      if (!user) {
        request.log.warn({ userId: decoded.id }, '找不到用户');
        const acceptHeader = request.headers.accept || '';
        if (acceptHeader.includes('text/html')) {
          return reply.redirect('/admin/login');
        }
        return sendError(reply, '无效的用户', 401);
      }

      if (user.status !== UserStatus.ACTIVE) {
        request.log.warn({ username: user.username }, '用户已被禁用或暂停');
        const acceptHeader = request.headers.accept || '';
        if (acceptHeader.includes('text/html')) {
          return reply.redirect('/admin/login');
        }
        return sendError(reply, '用户已被禁用或暂停', 403);
      }

      // 将用户信息添加到请求对象
      request.user = {
        id: user.id,
        username: user.username,
        role: user.role as 'admin' | 'user',
      };

      request.log.info({ username: user.username, role: user.role }, '用户认证成功');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.error({ err: message }, '令牌验证失败');
      const acceptHeader = request.headers.accept || '';
      if (acceptHeader.includes('text/html')) {
        return reply.redirect('/admin/login');
      }
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
    } catch (error: unknown) {
      request.log.error({ err: error }, '验证 API Key 失败');
      return sendError(reply, '验证 API Key 失败', 500);
    }
  });

  // 支持 JWT Token 或 API Key 的灵活认证中间件
  // 优先尝试 JWT Token，如果失败则尝试 API Key
  // 注意：同时提供 JWT 和 API Key 时，拒绝请求以防止身份混淆
  fastify.decorate('verifyJWTOrApiKey', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    const apiKey = request.headers['x-api-key'] as string;
    const hasToken = authHeader && authHeader.startsWith('Bearer ');
    const hasApiKey = !!apiKey;

    // 两种方式都没有提供
    if (!hasToken && !hasApiKey) {
      return sendError(reply, '未提供授权令牌或 API Key', 401);
    }

    // 同时提供 JWT 和 API Key 时，拒绝请求防止身份混淆
    if (hasToken && hasApiKey) {
      return sendError(reply, '不允许同时提供 JWT 和 API Key', 401);
    }

    // 尝试 JWT Token
    if (hasToken) {
      try {
        const parts = authHeader.split(' ');
        const token = parts.length === 2 ? parts[1] : '';

        const jwtSecret = getJwtSecret();
        const decoded = jwt.verify(token, jwtSecret) as { id: number; role: string };

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
        return; // JWT 认证成功，直接返回
      } catch (error: unknown) {
        request.log.error({ err: error }, 'JWT 令牌验证失败');
        return sendError(reply, '无效的令牌', 401);
      }
    }

    // 尝试 API Key 认证
    if (hasApiKey) {
      try {
        const user = await UserModel.findByApiKey(apiKey!);
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
        return; // API Key 认证成功
      } catch (error: unknown) {
        request.log.error({ err: error }, 'API Key 验证失败');
        return sendError(reply, '验证 API Key 失败', 500);
      }
    }

    // 都失败了
    return sendError(reply, '认证失败', 401);
  });
});
