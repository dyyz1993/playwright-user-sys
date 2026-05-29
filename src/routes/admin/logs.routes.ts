import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getLogsPageData } from '../../controllers/admin/logs-page.controller.js';
import { getSafeErrorMessage } from '../../utils/response.js';
import { requireAdmin } from './require-admin.js';

export default async function adminLogPageRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/admin/logs',
    { onRequest: [fastify.verifyJWT] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!requireAdmin(request, reply)) return reply.redirect('/admin');

        const query = request.query as Parameters<typeof getLogsPageData>[0];
        const data = await getLogsPageData(query);

        return reply.view('pages/logs', {
          title: '操作日志',
          subtitle: '查看系统操作记录',
          user: request.user,
          ...data,
          flash: request.flash,
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '获取操作日志失败');
        request.flash('error', '获取操作日志失败: ' + getSafeErrorMessage(error));
        return reply.redirect('/admin');
      }
    }
  );
}
