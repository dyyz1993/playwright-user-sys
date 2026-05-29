import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getMachinesPageData } from '../../controllers/admin/machines-page.controller.js';
import { getMachineDetailPageData } from '../../controllers/admin/machine-detail-page.controller.js';
import { getSafeErrorMessage } from '../../utils/response.js';
import { requireAdmin } from './require-admin.js';

export default async function adminMachinePageRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/admin/machines',
    { onRequest: [fastify.verifyJWT] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!requireAdmin(request, reply)) return reply.redirect('/admin');

        const query = request.query as Parameters<typeof getMachinesPageData>[0];
        const data = await getMachinesPageData(query);

        return reply.view('pages/machines', {
          title: '机器管理',
          subtitle: '管理实例机器',
          user: request.user,
          ...data,
          flash: request.flash,
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '获取机器列表失败');
        request.flash('error', '获取机器列表失败: ' + getSafeErrorMessage(error));
        return reply.redirect('/admin');
      }
    }
  );

  fastify.get(
    '/admin/machines/:id',
    { onRequest: [fastify.verifyJWT] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!requireAdmin(request, reply)) return reply.redirect('/admin');

        const params = request.params as { id: string };
        const data = await getMachineDetailPageData(params.id);

        if (!data) {
          request.flash('error', '机器不存在');
          return reply.redirect('/admin/machines');
        }

        return reply.view('pages/machine-detail', {
          title: `机器详情: ${data.machine.name}`,
          subtitle: '查看机器详细信息',
          user: request.user,
          ...data,
          flash: request.flash,
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '获取机器详情失败');
        request.flash('error', '获取机器详情失败: ' + getSafeErrorMessage(error));
        return reply.redirect('/admin/machines');
      }
    }
  );
}
