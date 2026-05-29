import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getProfilePageData } from '../../controllers/admin/profile-page.controller.js';
import { getSafeErrorMessage } from '../../utils/response.js';

export default async function adminProfilePageRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/admin/profile',
    { onRequest: [fastify.verifyJWT] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!request.user) {
          request.flash('error', '未登录');
          return reply.redirect('/admin/login');
        }
        const data = await getProfilePageData(request.user.id);
        if (!data) {
          request.flash('error', '用户不存在');
          return reply.redirect('/admin');
        }

        return reply.view('pages/profile', {
          title: '个人资料',
          subtitle: '管理个人信息',
          path: request.url,
          user: {
            ...request.user,
            ...data.userData,
          },
          creditHistory: data.creditHistory,
          baseUrl: data.baseUrl,
          wsUrl: data.wsUrl,
          proxyPort: data.proxyPort,
          flash: request.flash,
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '获取个人资料失败');
        request.flash('error', '获取个人资料失败: ' + getSafeErrorMessage(error));
        return reply.redirect('/admin');
      }
    }
  );
}
