import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { DebugVerifyTokenBodyRoute } from '@shared/types/routes.js';
import { getProfilePageData } from '../../controllers/admin/profile-page.controller.js';
import { getSafeErrorMessage } from '../../utils/response.js';

export default async function adminDebugRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', async (_request: FastifyRequest, reply: FastifyReply) => {
    if (process.env.NODE_ENV === 'production') {
      return reply.code(404).send({ success: false, error: 'Not found' });
    }
  });

  fastify.get(
    '/admin/debug/cookies',
    { onRequest: [fastify.verifyJWT] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      return {
        cookies: request.cookies,
        headers: request.headers,
        user: request.user,
      };
    }
  );

  fastify.post(
    '/admin/debug/verify-token',
    async (request: FastifyRequest<DebugVerifyTokenBodyRoute>, _reply: FastifyReply) => {
      const jwt = (await import('jsonwebtoken')).default;
      const { env: _env } = await import('../../config/env.js');

      const body = request.body;
      const token = body.token || request.cookies?.token;

      if (!token) {
        return { success: false, error: 'No token provided' };
      }

      const jwtSecret =
        process.env.JWT_SECRET ||
        (process.env.NODE_ENV === 'test' ? 'test-secret-key-for-testing-only-32chars' : 'dev-only-secret-key');

      try {
        const decoded = jwt.verify(token, jwtSecret);
        return { success: true, decoded };
      } catch (e: unknown) {
        return { success: false, error: getSafeErrorMessage(e) };
      }
    }
  );

  fastify.get(
    '/admin/debug/auth',
    { onRequest: [fastify.verifyJWT] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      return {
        message: 'Authentication successful',
        user: request.user,
      };
    }
  );

  fastify.get(
    '/admin/debug/user',
    { onRequest: [fastify.verifyJWT] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      if (!request.user) {
        return { success: false, error: 'Not authenticated' };
      }
      const { getUserById } = await import('../../services/user.service.js');
      const user = await getUserById(request.user.id);
      return {
        userId: request.user.id,
        userExists: !!user,
        userData: user,
      };
    }
  );

  fastify.get(
    '/admin/debug/profile-view',
    { onRequest: [fastify.verifyJWT] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!request.user) {
          return { success: false, error: 'Not authenticated' };
        }
        const data = await getProfilePageData(request.user.id);
        if (!data) {
          return { success: false, error: 'User not found' };
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
        return { success: false, error: getSafeErrorMessage(error) };
      }
    }
  );
}
