import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireAdmin } from './require-admin.js';
import { env } from '../../config/env.js';
import { getSafeErrorMessage } from '../../utils/response.js';

export default async function adminUtilityPageRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/admin/settings',
    { onRequest: [fastify.verifyJWT] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!requireAdmin(request, reply)) return reply.redirect('/admin');

        return reply.view('pages/settings', {
          title: '系统设置',
          subtitle: '配置系统参数',
          user: request.user,
          flash: request.flash,
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '获取系统设置失败');
        request.flash('error', '获取系统设置失败: ' + getSafeErrorMessage(error));
        return reply.redirect('/admin');
      }
    }
  );

  fastify.get(
    '/admin/playground',
    { onRequest: [fastify.verifyJWT] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!requireAdmin(request, reply)) return reply.redirect('/admin');

        const { getUserById } = await import('../../services/user.service.js');
        const fullUser = request.user ? await getUserById(request.user.id) : null;

        return reply.view('pages/api-playground', {
          title: 'API Playground',
          subtitle: 'API 接口调试',
          user: request.user,
          userApiKey: fullUser?.api_key || '',
          grpcPort: env.GRPC_PORT,
          proxyPort: env.PROXY_PORT,
          flash: request.flash,
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '加载 API Playground 失败');
        request.flash('error', '加载 API Playground 失败: ' + getSafeErrorMessage(error));
        return reply.redirect('/admin');
      }
    }
  );

  fastify.get(
    '/admin/files',
    { onRequest: [fastify.verifyJWT] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!requireAdmin(request, reply)) return reply.redirect('/admin');

        return reply.view('pages/file-upload', {
          title: '文件上传',
          subtitle: '上传和管理文件',
          user: request.user,
          flash: request.flash,
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '加载文件上传页面失败');
        request.flash('error', '加载文件上传页面失败: ' + getSafeErrorMessage(error));
        return reply.redirect('/admin');
      }
    }
  );

  fastify.get(
    '/admin/storage',
    { onRequest: [fastify.verifyJWT] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!requireAdmin(request, reply)) return reply.redirect('/admin');

        return reply.view('pages/storage', {
          title: '存储管理',
          subtitle: '管理用户存储和清理数据',
          user: request.user,
          flash: request.flash,
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '加载存储管理页面失败');
        request.flash('error', '加载存储管理页面失败: ' + getSafeErrorMessage(error));
        return reply.redirect('/admin');
      }
    }
  );
}
