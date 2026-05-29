import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getUsersPageData } from '../../controllers/admin/users-page.controller.js';
import { getUserEditPageData } from '../../controllers/admin/user-edit-page.controller.js';
import { getSafeErrorMessage } from '../../utils/response.js';
import { requireAdmin } from './require-admin.js';
import { numericIdParamSchema } from '../../schemas/index.js';

export default async function adminUserPageRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/admin/users',
    { onRequest: [fastify.verifyJWT] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!requireAdmin(request, reply)) return reply.redirect('/admin');

        const query = request.query as Parameters<typeof getUsersPageData>[0];
        const data = await getUsersPageData(query);

        return reply.view('pages/users', {
          title: '用户管理',
          subtitle: '管理系统用户',
          user: request.user,
          ...data,
          flash: request.flash,
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '获取用户列表失败');
        request.flash('error', '获取用户列表失败: ' + getSafeErrorMessage(error));
        return reply.redirect('/admin');
      }
    }
  );

  fastify.get(
    '/admin/users/:id/edit',
    { onRequest: [fastify.verifyJWT] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!requireAdmin(request, reply)) return reply.redirect('/admin');

        let userId: number;
        try {
          ({ id: userId } = numericIdParamSchema.parse(request.params));
        } catch {
          request.flash('error', '无效的用户 ID');
          return reply.redirect('/admin/users');
        }

        const data = await getUserEditPageData(userId);
        if (!data) {
          request.flash('error', '用户不存在');
          return reply.redirect('/admin/users');
        }

        return reply.view('pages/user-edit', {
          title: `编辑用户: ${data.userData.username}`,
          subtitle: '编辑用户信息',
          user: request.user,
          path: request.url,
          ...data,
          flash: request.flash,
        });
      } catch (error: unknown) {
        request.log.error({ err: error }, '获取用户详情失败');
        request.flash('error', '获取用户详情失败: ' + getSafeErrorMessage(error));
        return reply.redirect('/admin/users');
      }
    }
  );
}
