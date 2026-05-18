import { logger } from '@shared/utils/logger.js';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as path from 'path';
import * as fs from 'fs';
import { AdminLoginBodyRoute, DebugVerifyTokenBodyRoute } from '@shared/types/routes.js';
import { webLogin } from '../services/auth.service.js';
import { getDashboardData, getEmptyDashboardData } from '../controllers/admin/dashboard.controller.js';
import { getUsersPageData } from '../controllers/admin/users-page.controller.js';
import { getUserEditPageData } from '../controllers/admin/user-edit-page.controller.js';
import { getMachinesPageData } from '../controllers/admin/machines-page.controller.js';
import { getMachineDetailPageData } from '../controllers/admin/machine-detail-page.controller.js';
import { getSessionsPageData } from '../controllers/admin/sessions-page.controller.js';
import { getSessionDetailPageData } from '../controllers/admin/session-detail-page.controller.js';
import { getCreditsHistoryPageData } from '../controllers/admin/credits-page.controller.js';
import { getLogsPageData } from '../controllers/admin/logs-page.controller.js';
import { getProfilePageData } from '../controllers/admin/profile-page.controller.js';
import { getSafeErrorMessage } from '../utils/response.js';
import { env } from '../config/env.js';
import { numericIdParamSchema } from '../schemas/index.js';

function requireAdmin(request: FastifyRequest, _reply: FastifyReply): boolean {
  if (request.user?.role !== 'admin') {
    return false;
  }
  return true;
}

export default async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/viewer', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { sessionId?: string };
    if (!query.sessionId) {
      return reply.redirect('/admin/login');
    }

    // 返回 remote-control.html，由前端处理实时画面显示
    // 开发环境: public/remote-control.html
    // 生产环境: dist/src/public/remote-control.html
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

        const { getUserById } = await import('../services/user.service.js');
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

  fastify.post('/admin/logout', async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.clearCookie('token', { path: '/' });
    return reply.redirect('/admin/login');
  });

  fastify.get('/admin/logout', async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.clearCookie('token', { path: '/' });
    return reply.redirect('/admin/login');
  });

  fastify.register(async function debugRoutes(fastify) {
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
        const { env: _env } = await import('../config/env.js');

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
        const { getUserById } = await import('../services/user.service.js');
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
  });

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
