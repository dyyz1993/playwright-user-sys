import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getCreditsHistoryPageData } from '../../controllers/admin/credits-page.controller.js';
import { getSafeErrorMessage } from '../../utils/response.js';

export default async function adminCreditsPageRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/admin/credits/history',
    { onRequest: [fastify.verifyJWT] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = request.query as Parameters<typeof getCreditsHistoryPageData>[0];
        const data = await getCreditsHistoryPageData(query);

        return reply.view('pages/credits-history', {
          title: '积分历史',
          subtitle: '查看积分变动记录',
          user: request.user,
          ...data,
          flash: request.flash,
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '获取积分历史失败');
        request.flash('error', '获取积分历史失败: ' + getSafeErrorMessage(error));
        return reply.redirect('/admin');
      }
    }
  );
}
