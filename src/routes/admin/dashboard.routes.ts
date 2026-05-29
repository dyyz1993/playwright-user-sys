import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDashboardData, getEmptyDashboardData } from '../../controllers/admin/dashboard.controller.js';
import { getSafeErrorMessage } from '../../utils/response.js';
import { logger } from '@shared/utils/logger.js';
import { requireAdmin } from './require-admin.js';

export default async function adminDashboardPageRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/admin', { onRequest: [fastify.verifyJWT] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!request.user) {
        return reply.redirect('/admin/login');
      }

      if (!requireAdmin(request, reply)) {
        request.flash('error', '需要管理员权限');
        return reply.redirect('/admin/login');
      }

      const data = await getDashboardData(request.user.id);

      return reply.view('pages/dashboard', {
        title: '仪表盘',
        subtitle: '系统概览',
        user: request.user,
        ...data,
        flash: request.flash,
      });
    } catch (error: unknown) {
      logger.error('获取仪表盘数据失败:', error);
      const data = getEmptyDashboardData();

      return reply.view('pages/dashboard', {
        title: '仪表盘',
        subtitle: '系统概览',
        user: request.user,
        ...data,
        flash: { error: '获取仪表盘数据失败: ' + getSafeErrorMessage(error) },
      });
    }
  });
}
