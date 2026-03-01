import { FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { verifyToken, extractTokenFromHeader } from '../utils/auth.js';
import { UserModel } from '../models/user.model.js';
import { UserRole, UserStatus } from '@shared/types/index.js';

// 验证 JWT Token 中间件
export const verifyJWT = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    let token = extractTokenFromHeader(request.headers.authorization);

    // 如果 Authorization header 中没有 token,尝试从 cookie 中获取
    if (!token && request.cookies) {
      token = request.cookies.token || '';
    }

    if (!token) {
      return reply.status(401).send({ success: false, error: '未提供认证令牌' });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return reply.status(401).send({ success: false, error: '无效的认证令牌' });
    }

    const user = await UserModel.findById(decoded.id);
    if (!user) {
      return reply.status(401).send({ success: false, error: '用户不存在' });
    }

    if (user.status !== UserStatus.ACTIVE) {
      return reply.status(403).send({ success: false, error: '用户账号已被禁用' });
    }

    // 将用户信息添加到请求对象
    request.user = {
      id: user.id,
      username: user.username,
      role: user.role as 'admin' | 'user',
    };
  } catch (_error) {
    return reply.status(401).send({ success: false, error: '认证失败' });
  }
};

// 验证 API Key 中间件
export const verifyApiKey = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const apiKey = request.headers['x-api-key'] as string;
    if (!apiKey) {
      return reply.status(401).send({ success: false, error: '未提供 API Key' });
    }

    const user = await UserModel.findByApiKey(apiKey);
    if (!user) {
      return reply.status(401).send({ success: false, error: '无效的 API Key' });
    }

    if (user.status !== UserStatus.ACTIVE) {
      return reply.status(403).send({ success: false, error: '用户账号已被禁用' });
    }

    // 安全修复: 防止水平越权攻击
    // 如果请求同时包含 JWT token，必须验证 token 所有者与 API Key 所有者一致
    const authorizationHeader = request.headers.authorization;
    if (authorizationHeader) {
      const token = extractTokenFromHeader(authorizationHeader);
      if (token) {
        const decoded = verifyToken(token);
        // 如果 JWT token 无效，返回 401
        if (!decoded) {
          return reply.status(401).send({
            success: false,
            error: '无效的 JWT token',
          });
        }
        // 如果 JWT token 所有者与 API Key 所有者不匹配，返回 403
        if (decoded.id !== user.id) {
          return reply.status(403).send({
            success: false,
            error: 'JWT token 所有者与 API Key 所有者不匹配',
          });
        }
      }
    }

    // 将用户信息添加到请求对象
    request.user = {
      id: user.id,
      username: user.username,
      role: user.role as 'admin' | 'user',
    };
  } catch (_error) {
    return reply.status(401).send({ success: false, error: '认证失败' });
  }
};

// 验证管理员权限中间件
export const verifyAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!request.user || request.user.role !== UserRole.ADMIN) {
    return reply.status(403).send({ success: false, error: '需要管理员权限' });
  }
};

// 注册中间件插件
export default fp(async (fastify) => {
  fastify.decorate('verifyJWT', verifyJWT);
  fastify.decorate('verifyApiKey', verifyApiKey);
  fastify.decorate('verifyAdmin', verifyAdmin);
});
