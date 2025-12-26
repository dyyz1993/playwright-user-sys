import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// 管理后台路由
export default async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  // 登录页面
  fastify.get('/admin/login', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.view('pages/login-new', {
      title: '登录',
      flash: request.flash,
      path: request.url
    });
  });

  // 登录处理
  fastify.post('/admin/login', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // 打印请求信息进行调试
      console.log('Login request body:', request.body);
      console.log('Content-Type:', request.headers['content-type']);

      // 处理表单提交的数据
      const body = request.body as any;
      const username = body.username;
      const password = body.password;

      console.log('Username:', username);
      console.log('Password:', password);

      // 验证输入
      if (!username || !password) {
        console.log('Username or password is empty');
        request.flash('error', '用户名和密码不能为空');
        return reply.redirect('/admin/login');
      }

      // 验证用户凭据
      const { UserModel } = await import('../models/user.model.js');
      const user = await UserModel.findByUsername(username);
      
      if (!user) {
        console.log('User not found');
        request.flash('error', '用户名或密码错误');
        return reply.redirect('/admin/login');
      }

      // 验证密码（使用 SHA256，与 UserModel 保持一致）
      const { comparePassword } = await import('../utils/auth.js');
      const isPasswordValid = await comparePassword(password, user.password);
      
      if (!isPasswordValid) {
        console.log('Invalid password');
        request.flash('error', '用户名或密码错误');
        return reply.redirect('/admin/login');
      }

      // 检查用户状态
      if (user.status !== 'active') {
        console.log('User is not active');
        request.flash('error', '账号已被禁用');
        return reply.redirect('/admin/login');
      }

      // 生成 JWT Token
      const { generateToken } = await import('../utils/auth.js');
      const token = generateToken({
        id: user.id,
        username: user.username,
        role: user.role
      });

      // 设置 Cookie
      reply.setCookie('token', token, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: true,
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 天
      });

      // 重定向到仪表盘
      return reply.redirect('/admin');
    } catch (error: any) {
      console.error('Login error:', error);
      request.flash('error', '登录失败: ' + error.message);
      return reply.redirect('/admin/login');
    }
  });

  // 仪表盘页面
  fastify.get('/admin', {
    onRequest: [fastify.verifyJWT]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // 检查是否已认证
      if (!request.user) {
        return reply.redirect('/admin/login');
      }

      // 获取仪表盘数据
      const { SessionModel } = await import('../models/session.model.js');
      const { MachineModel } = await import('../models/machine.model.js');
      const { UserModel } = await import('../models/user.model.js');

      const [
        activeSessions,
        totalMachines,
        onlineMachines,
        totalUsers,
        newUsers,
        totalCredits,
        usedCredits,
        recentSessions
      ] = await Promise.all([
        SessionModel.countActiveSessions(),
        MachineModel.countAll(),
        MachineModel.countOnline(),
        UserModel.countAll(),
        UserModel.countNewUsers(7), // 最近7天新增用户
        UserModel.sumAllCredits(),
        SessionModel.sumUsedCredits(),
        SessionModel.getRecentSessions(10) // 获取最近10个会话
      ]);

      // 计算会话变化（简单实现）
      const sessionChange = 0;

      return reply.view('pages/dashboard', {
        title: '仪表盘',
        subtitle: '系统概览',
        user: request.user,
        stats: {
          activeSessions,
          totalMachines,
          onlineMachines,
          totalUsers,
          newUsers,
          totalCredits,
          usedCredits,
          sessionChange,
          cpuUsage: 0,
          memoryUsage: 0,
          diskUsage: 0
        },
        recentSessions,
        flash: request.flash
      });
    } catch (error: any) {
      console.error('获取仪表盘数据失败:', error);
      const errorMessage = error.message || '未知错误';

      return reply.view('pages/dashboard', {
        title: '仪表盘',
        subtitle: '系统概览',
        user: request.user,
        stats: {
          activeSessions: 0,
          totalMachines: 0,
          onlineMachines: 0,
          totalUsers: 0,
          newUsers: 0,
          totalCredits: 0,
          usedCredits: 0,
          sessionChange: 0,
          cpuUsage: 0,
          memoryUsage: 0,
          diskUsage: 0
        },
        recentSessions: [],
        flash: { error: '获取仪表盘数据失败: ' + errorMessage }
      });
    }
  });

  // 用户管理页面
  fastify.get('/admin/users', {
    onRequest: [fastify.verifyJWT]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // 检查是否是管理员
      if (request.user?.role !== 'admin') {
        return reply.redirect('/admin');
      }

      // 获取分页参数
      const query = request.query as { page?: string; limit?: string };
      const page = parseInt(query.page || '1');
      const limit = parseInt(query.limit || '10');

      // 获取用户列表
      const { UserModel } = await import('../models/user.model.js');
      const { items, total, totalPages } = await UserModel.paginate(page, limit);

      return reply.view('pages/users', {
        title: '用户管理',
        subtitle: '管理系统用户',
        user: request.user,
        users: items,
        pagination: {
          page,
          limit,
          total,
          totalPages
        },
        // 直接传递分页变量给模板
        page,
        limit,
        totalUsers: total,
        flash: request.flash
      });
    } catch (error: any) {
      request.log.error('获取用户列表失败:', error);
      request.flash('error', '获取用户列表失败: ' + error.message);
      return reply.redirect('/admin');
    }
  });

  // 用户编辑页面
  fastify.get('/admin/users/:id/edit', {
    onRequest: [fastify.verifyJWT]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // 检查是否是管理员
      if (request.user?.role !== 'admin') {
        return reply.redirect('/admin');
      }

      const params = request.params as { id: string };
      const userId = parseInt(params.id, 10);

      if (isNaN(userId)) {
        request.flash('error', '无效的用户 ID');
        return reply.redirect('/admin/users');
      }

      // 从数据库获取用户数据
      const { UserModel } = await import('../models/user.model.js');
      const { SessionModel } = await import('../models/session.model.js');

      // 获取用户详情
      const user = await UserModel.findById(userId);
      if (!user) {
        request.flash('error', '用户不存在');
        return reply.redirect('/admin/users');
      }

      // 获取用户的会话消耗统计
      const stats = await SessionModel.getUserSessionStats(userId);

      return reply.view('pages/user-edit', {
        title: `编辑用户: ${user.username}`,
        subtitle: '编辑用户信息',
        user: request.user,
        path: request.url,
        userData: {
          id: user.id,
          username: user.username,
          email: user.email || '',
          role: user.role,
          status: user.status,
          credits: user.credits,
          api_key: user.api_key || '',
          webhook_url: user.webhook_url || '',
          created_at: user.created_at
        },
        stats,
        flash: request.flash
      });
    } catch (error: any) {
      request.log.error('获取用户详情失败:', error);
      request.flash('error', '获取用户详情失败: ' + error.message);
      return reply.redirect('/admin/users');
    }
  });

  // 机器管理页面
  fastify.get('/admin/machines', {
    onRequest: [fastify.verifyJWT]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // 检查是否是管理员
      if (request.user?.role !== 'admin') {
        return reply.redirect('/admin');
      }

      // 获取机器列表
      const { MachineModel } = await import('../models/machine.model.js');
      const machines = await MachineModel.getAll();

      return reply.view('pages/machines', {
        title: '机器管理',
        subtitle: '管理实例机器',
        user: request.user,
        machines,
        flash: request.flash
      });
    } catch (error: any) {
      request.log.error('获取机器列表失败:', error);
      request.flash('error', '获取机器列表失败: ' + error.message);
      return reply.redirect('/admin');
    }
  });

  // 会话管理页面
  fastify.get('/admin/sessions', {
    onRequest: [fastify.verifyJWT]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // 检查是否是管理员
      if (request.user?.role !== 'admin') {
        return reply.redirect('/admin');
      }

      // 获取分页参数
      const query = request.query as { page?: string; limit?: string };
      const page = parseInt(query.page || '1');
      const limit = parseInt(query.limit || '10');

      // 获取会话列表
      const { SessionModel } = await import('../models/session.model.js');
      const { items, total, totalPages } = await SessionModel.paginate(page, limit);

      return reply.view('pages/sessions', {
        title: '会话管理',
        subtitle: '管理系统会话',
        user: request.user,
        sessions: items,
        pagination: {
          page,
          limit,
          total,
          totalPages
        },
        flash: request.flash
      });
    } catch (error: any) {
      request.log.error('获取会话列表失败:', error);
      request.flash('error', '获取会话列表失败: ' + error.message);
      return reply.redirect('/admin');
    }
  });

  // 系统设置页面
  fastify.get('/admin/settings', {
    onRequest: [fastify.verifyJWT]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // 检查是否是管理员
      if (request.user?.role !== 'admin') {
        return reply.redirect('/admin');
      }

      return reply.view('pages/settings', {
        title: '系统设置',
        subtitle: '配置系统参数',
        user: request.user,
        flash: request.flash
      });
    } catch (error: any) {
      request.log.error('获取系统设置失败:', error);
      request.flash('error', '获取系统设置失败: ' + error.message);
      return reply.redirect('/admin');
    }
  });

  // 文件上传页面
  fastify.get('/admin/files', {
    onRequest: [fastify.verifyJWT]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // 检查是否是管理员
      if (request.user?.role !== 'admin') {
        return reply.redirect('/admin');
      }

      return reply.view('pages/file-upload', {
        title: '文件上传',
        subtitle: '上传和管理文件',
        user: request.user,
        flash: request.flash
      });
    } catch (error: any) {
      request.log.error('加载文件上传页面失败:', error);
      request.flash('error', '加载文件上传页面失败: ' + error.message);
      return reply.redirect('/admin');
    }
  });

  // 登出
  fastify.post('/admin/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    // 清除 Cookie
    reply.clearCookie('token', { path: '/' });

    // 重定向到登录页面
    return reply.redirect('/admin/login');
  });

  // 登出 (GET版本，用于侧边栏链接)
  fastify.get('/admin/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    // 清除 Cookie
    reply.clearCookie('token', { path: '/' });

    // 重定向到登录页面
    return reply.redirect('/admin/login');
  });
}
