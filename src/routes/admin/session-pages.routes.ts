import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getSessionsPageData } from '../../controllers/admin/sessions-page.controller.js';
import { getSessionDetailPageData } from '../../controllers/admin/session-detail-page.controller.js';
import { getSafeErrorMessage } from '../../utils/response.js';
import { requireAdmin } from './require-admin.js';

export default async function adminSessionPageRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/admin/sessions',
    { onRequest: [fastify.verifyJWT] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!requireAdmin(request, reply)) return reply.redirect('/admin');

        const query = request.query as Parameters<typeof getSessionsPageData>[0];
        const data = await getSessionsPageData(query);

        return reply.view('pages/sessions', {
          title: '会话管理',
          subtitle: '管理系统会话',
          user: request.user,
          ...data,
          flash: request.flash,
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '获取会话列表失败');
        request.flash('error', '获取会话列表失败: ' + getSafeErrorMessage(error));
        return reply.redirect('/admin');
      }
    }
  );

  fastify.get(
    '/admin/sessions/:id',
    { onRequest: [fastify.verifyJWT] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!requireAdmin(request, reply)) return reply.redirect('/admin');

        const params = request.params as { id: string };
        const data = await getSessionDetailPageData(params.id);

        if (!data) {
          request.flash('error', '会话不存在');
          return reply.redirect('/admin/sessions');
        }

        return reply.view('pages/session-detail', {
          title: '会话详情',
          subtitle: '查看会话详细信息',
          user: request.user,
          ...data,
          flash: request.flash,
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '获取会话详情失败');
        request.flash('error', '获取会话详情失败: ' + getSafeErrorMessage(error));
        return reply.redirect('/admin/sessions');
      }
    }
  );
}
