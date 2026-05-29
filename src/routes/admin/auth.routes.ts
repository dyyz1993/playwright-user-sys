import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as path from 'path';
import * as fs from 'fs';
import { AdminLoginBodyRoute } from '@shared/types/routes.js';
import { webLogin } from '../../services/auth.service.js';
import { getSafeErrorMessage } from '../../utils/response.js';
import { logger } from '@shared/utils/logger.js';

export default async function adminAuthPageRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/viewer', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { sessionId?: string };
    if (!query.sessionId) {
      return reply.redirect('/admin/login');
    }

    const isDev = process.env.NODE_ENV !== 'production';
    const htmlPath = isDev
      ? path.join(process.cwd(), 'public', 'remote-control.html')
      : path.join(process.cwd(), 'dist', 'src', 'public', 'remote-control.html');

    if (!fs.existsSync(htmlPath)) {
      logger.error('remote-control.html not found:', htmlPath);
      return reply.status(404).send({ success: false, error: 'File not found' });
    }

    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    return reply.type('text/html').send(htmlContent);
  });

  fastify.get('/admin/login', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.view('pages/login-new', {
      title: '登录',
      flash: request.flash,
      path: request.url,
    });
  });

  fastify.post(
    '/admin/login',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
    },
    async (request: FastifyRequest<AdminLoginBodyRoute>, reply: FastifyReply) => {
      try {
        const body = request.body;
        const username = body.username;
        const password = body.password;

        if (!username || !password) {
          request.flash('error', '用户名和密码不能为空');
          return reply.redirect('/admin/login');
        }

        const { user: _user, token } = await webLogin(username, password, request.ip);

        reply.setCookie('token', token, {
          path: '/',
          httpOnly: true,
          secure: request.protocol === 'https' || (request.headers['x-forwarded-proto'] as string) === 'https',
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        return reply.redirect('/admin');
      } catch (error: unknown) {
        logger.error('Login error:', error);
        const msg = getSafeErrorMessage(error);
        request.flash('error', msg.includes('禁用') ? msg : '登录失败: ' + msg);
        return reply.redirect('/admin/login');
      }
    }
  );

  fastify.post('/admin/logout', async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.clearCookie('token', { path: '/' });
    return reply.redirect('/admin/login');
  });

  fastify.get('/admin/logout', async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.clearCookie('token', { path: '/' });
    return reply.redirect('/admin/login');
  });
}
