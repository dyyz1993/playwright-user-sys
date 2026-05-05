import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// 辅助函数：生成模拟历史数据
function generateMockHistoryData(type: string) {
  const now = Date.now();
  const data = [];
  for (let i = 23; i >= 0; i--) {
    const time = new Date(now - i * 3600000);
    let value;
    switch (type) {
      case 'cpu':
        value = Math.floor(Math.random() * 40) + 20; // 20-60%
        break;
      case 'memory':
        value = Math.floor(Math.random() * 30) + 40; // 40-70%
        break;
      case 'disk':
        value = Math.floor(Math.random() * 20) + 30; // 30-50%
        break;
      case 'sessions':
        value = Math.floor(Math.random() * 5) + 1; // 1-6
        break;
      default:
        value = 0;
    }
    data.push({
      time: time.toISOString(),
      value,
    });
  }
  return data;
}

// 管理后台路由
export default async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  // 登录页面
  fastify.get('/admin/login', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.view('pages/login-new', {
      title: '登录',
      flash: request.flash,
      path: request.url,
    });
  });

  // 登录处理
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
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as any;
        const username = body.username;
        const password = body.password;

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

        // 验证密码
        const { verifyPasswordWithMigration, hashPassword } = await import('../utils/auth.js');
        const { valid: isPasswordValid, needsMigration } = await verifyPasswordWithMigration(password, user.password);

        if (!isPasswordValid) {
          console.log('Invalid password');
          request.flash('error', '用户名或密码错误');
          return reply.redirect('/admin/login');
        }

        if (needsMigration) {
          const newHash = await hashPassword(password);
          await UserModel.update(user.id, { password: newHash } as any);
          request.log.info({ userId: user.id }, 'Password migrated from SHA-256 to bcrypt');
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
          role: user.role,
        });

        // 设置 Cookie
        reply.setCookie('token', token, {
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax', // 使用 lax 提高兼容性
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 天
        });

        // 记录登录操作日志
        const { OperationLogModel } = await import('../models/operation-log.model.js');
        OperationLogModel.create({
          admin_id: user.id,
          action: '登录',
          details: {
            username: user.username,
            role: user.role,
            ip: request.ip,
          },
        }).catch((logError) => {
          request.log.error({ err: logError }, '记录登录操作日志失败');
        });

        // 重定向到仪表盘
        return reply.redirect('/admin');
      } catch (error: any) {
        console.error('Login error:', error);
        request.flash('error', '登录失败: ' + error.message);
        return reply.redirect('/admin/login');
      }
    }
  );

  // 仪表盘页面
  fastify.get(
    '/admin',
    {
      onRequest: [fastify.verifyJWT],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
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
          recentSessions,
        ] = await Promise.all([
          SessionModel.countActiveSessions(),
          MachineModel.countAll(),
          MachineModel.countOnline(),
          UserModel.countAll(),
          UserModel.countNewUsers(7), // 最近7天新增用户
          UserModel.sumAllCredits(),
          SessionModel.sumUsedCredits(),
          SessionModel.getRecentSessions(10), // 获取最近10个会话
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
            diskUsage: 0,
          },
          recentSessions,
          flash: request.flash,
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
            diskUsage: 0,
          },
          recentSessions: [],
          flash: { error: '获取仪表盘数据失败: ' + errorMessage },
        });
      }
    }
  );

  // 用户管理页面
  fastify.get(
    '/admin/users',
    {
      onRequest: [fastify.verifyJWT],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // 检查是否是管理员
        if (request.user?.role !== 'admin') {
          return reply.redirect('/admin');
        }

        // 获取分页参数和筛选参数
        const query = request.query as {
          page?: string;
          limit?: string;
          role?: string;
          status?: string;
          sort?: string;
          order?: string;
          search?: string;
        };
        const page = parseInt(query.page || '1');
        const limit = parseInt(query.limit || '10');
        const sort = query.sort || 'created_at';
        const order = query.order || 'desc';

        // 获取用户列表
        const { UserModel } = await import('../models/user.model.js');

        // 使用 findAll 方法支持筛选、搜索和排序
        const { items, total, totalPages } = await UserModel.findAll({
          page: query.page || '1',
          limit: query.limit || '10',
          sort: sort as any,
          order: order as any,
          ...(query.search && { search: query.search }),
          ...(query.role && { role: query.role as any }),
          ...(query.status && { status: query.status as any }),
        });

        return reply.view('pages/users', {
          title: '用户管理',
          subtitle: '管理系统用户',
          user: request.user,
          users: items,
          pagination: {
            page,
            limit,
            total,
            totalPages,
          },
          // 直接传递分页变量给模板
          page,
          limit,
          totalUsers: total,
          // 传递筛选和排序参数给模板
          filters: {
            role: query.role || '',
            status: query.status || '',
          },
          query,
          flash: request.flash,
        });
      } catch (error: any) {
        request.log.error({ err: error }, '获取用户列表失败');
        request.flash('error', '获取用户列表失败: ' + error.message);
        return reply.redirect('/admin');
      }
    }
  );

  // 用户编辑页面
  fastify.get(
    '/admin/users/:id/edit',
    {
      onRequest: [fastify.verifyJWT],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
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
            created_at: user.created_at,
          },
          stats,
          flash: request.flash,
        });
      } catch (error: any) {
        request.log.error({ err: error }, '获取用户详情失败');
        request.flash('error', '获取用户详情失败: ' + error.message);
        return reply.redirect('/admin/users');
      }
    }
  );

  // 机器管理页面
  fastify.get(
    '/admin/machines',
    {
      onRequest: [fastify.verifyJWT],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // 检查是否是管理员
        if (request.user?.role !== 'admin') {
          return reply.redirect('/admin');
        }

        // 获取筛选参数
        const query = request.query as {
          status?: string;
        };

        // 获取机器列表
        const { MachineModel } = await import('../models/machine.model.js');
        let machines;

        // 如果有状态筛选，使用筛选后的结果
        if (query.status) {
          const result = await MachineModel.findByStatus(query.status);
          machines = result.items;
        } else {
          machines = await MachineModel.getAll();
        }

        // 转换为模板需要的格式
        const formattedMachines = machines.map((machine) => ({
          id: machine.id,
          name: machine.hostname,
          ip_address: machine.ip,
          grpc_port: machine.grpcPort,
          last_heartbeat: machine.lastSeen,
          active_sessions: machine.instanceCount,
          max_sessions: machine.maxInstances,
          cpu_usage: machine.cpuUsage,
          memory_usage: machine.memoryUsage,
          disk_usage: machine.diskUsage,
          status: machine.status,
          load: Math.round(((machine.instanceCount || 0) / (machine.maxInstances || 1)) * 100),
        }));

        // 添加分页变量（模板需要）
        const totalMachines = formattedMachines.length;
        const page = 1;
        const limit = totalMachines;

        return reply.view('pages/machines', {
          title: '机器管理',
          subtitle: '管理实例机器',
          user: request.user,
          machines: formattedMachines,
          page,
          limit,
          totalMachines,
          // 传递筛选参数给模板
          filters: {
            status: query.status || '',
          },
          flash: request.flash,
        });
      } catch (error: any) {
        request.log.error({ err: error }, '获取机器列表失败');
        request.flash('error', '获取机器列表失败: ' + error.message);
        return reply.redirect('/admin');
      }
    }
  );

  // 机器详情页面
  fastify.get(
    '/admin/machines/:id',
    {
      onRequest: [fastify.verifyJWT],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // 检查是否是管理员
        if (request.user?.role !== 'admin') {
          return reply.redirect('/admin');
        }

        const params = request.params as { id: string };
        const machineId = params.id;

        // 获取机器详情
        const { MachineModel } = await import('../models/machine.model.js');
        const { SessionModel } = await import('../models/session.model.js');

        const machine = await MachineModel.findById(machineId);
        if (!machine) {
          request.flash('error', '机器不存在');
          return reply.redirect('/admin/machines');
        }

        // 获取机器上的会话
        const sessions = await SessionModel.findByMachineId(machineId);

        // 准备历史数据（模拟数据，实际应从数据库获取）
        const historyData = {
          cpu: generateMockHistoryData('cpu'),
          memory: generateMockHistoryData('memory'),
          disk: generateMockHistoryData('disk'),
          sessions: generateMockHistoryData('sessions'),
        };

        // 转换机器数据为模板需要的格式
        const machineData = {
          id: machine.id,
          name: machine.hostname,
          ip: machine.ip,
          status: machine.status,
          cpuUsage: machine.cpuUsage || 0,
          memoryUsage: machine.memoryUsage || 0,
          diskUsage: machine.diskUsage || 0,
          activeSessions: machine.instanceCount || 0,
          maxSessions: machine.maxInstances || 10,
          lastSeen: machine.lastSeen,
          grpcPort: machine.grpcPort,
        };

        return reply.view('pages/machine-detail', {
          title: `机器详情: ${machineData.name}`,
          subtitle: '查看机器详细信息',
          user: request.user,
          machine: machineData,
          sessions,
          historyData,
          flash: request.flash,
        });
      } catch (error: any) {
        request.log.error({ err: error }, '获取机器详情失败');
        request.flash('error', '获取机器详情失败: ' + error.message);
        return reply.redirect('/admin/machines');
      }
    }
  );

  // 会话管理页面
  fastify.get(
    '/admin/sessions',
    {
      onRequest: [fastify.verifyJWT],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // 检查是否是管理员
        if (request.user?.role !== 'admin') {
          return reply.redirect('/admin');
        }

        // 获取分页参数和筛选参数
        const query = request.query as {
          page?: string;
          limit?: string;
          status?: string;
          userId?: string;
          startDate?: string;
          endDate?: string;
          dateRange?: string;
          sort?: string;
          order?: string;
        };
        const page = parseInt(query.page || '1');
        const limit = parseInt(query.limit || '10');
        const sort = query.sort || 'created_at';
        const order = (query.order?.toLowerCase() === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';

        // 获取用户列表（用于用户筛选）
        const { UserModel } = await import('../models/user.model.js');
        // 使用 findAll 获取所有用户，设置较大的 limit 以获取所有用户
        const usersResult = await UserModel.findAll({ limit: '10000' });
        const users = usersResult.items;

        // 构建筛选选项
        const { SessionModel } = await import('../models/session.model.js');
        const filters: { status?: string; userId?: number; startDate?: Date; endDate?: Date } = {};

        // 状态筛选
        if (query.status) {
          filters.status = query.status;
        }

        // 用户筛选
        if (query.userId) {
          filters.userId = parseInt(query.userId);
        }

        // 时间范围筛选
        if (query.dateRange && query.dateRange !== 'all') {
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

          if (query.dateRange === 'today') {
            filters.startDate = today;
          } else if (query.dateRange === 'yesterday') {
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            filters.startDate = yesterday;
            filters.endDate = yesterday;
          } else if (query.dateRange === 'week') {
            const startOfWeek = new Date(today);
            startOfWeek.setDate(today.getDate() - today.getDay());
            filters.startDate = startOfWeek;
          } else if (query.dateRange === 'month') {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            filters.startDate = startOfMonth;
          }
        }

        // 手动指定日期范围
        if (query.startDate) {
          filters.startDate = new Date(query.startDate);
        }
        if (query.endDate) {
          filters.endDate = new Date(query.endDate);
        }

        // 获取会话列表（支持排序）
        const { items, total, totalPages } = await SessionModel.paginateSorted(page, limit, {
          sort,
          order,
          filters,
        });

        // 调试日志
        console.log(`[DEBUG] /admin/sessions: page=${page}, limit=${limit}, filters=`, JSON.stringify(filters));
        console.log(`[DEBUG] /admin/sessions: items.length=${items.length}, total=${total}`);

        return reply.view('pages/sessions', {
          title: '会话管理',
          subtitle: '管理系统会话',
          user: request.user,
          sessions: items,
          users,
          page,
          limit,
          totalSessions: total,
          totalPages,
          pagination: {
            page,
            limit,
            total,
            totalPages,
          },
          // 传递筛选参数给模板
          filters: {
            status: query.status || '',
            userId: query.userId || '',
            dateRange: query.dateRange || 'all',
            startDate: query.startDate || '',
            endDate: query.endDate || '',
            sort,
            order,
          },
          flash: request.flash,
        });
      } catch (error: any) {
        request.log.error({ err: error }, '获取会话列表失败');
        request.flash('error', '获取会话列表失败: ' + error.message);
        return reply.redirect('/admin');
      }
    }
  );

  // 会话详情页
  fastify.get(
    '/admin/sessions/:id',
    {
      onRequest: [fastify.verifyJWT],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // 检查是否是管理员
        if (request.user?.role !== 'admin') {
          return reply.redirect('/admin');
        }

        const params = request.params as { id: string };
        const sessionId = params.id;

        // 获取会话详情
        const { SessionModel } = await import('../models/session.model.js');
        const session = await SessionModel.getDetailById(sessionId);

        if (!session) {
          request.flash('error', '会话不存在');
          return reply.redirect('/admin/sessions');
        }

        return reply.view('pages/session-detail', {
          title: '会话详情',
          subtitle: '查看会话详细信息',
          user: request.user,
          session,
          flash: request.flash,
        });
      } catch (error: any) {
        request.log.error({ err: error }, '获取会话详情失败');
        request.flash('error', '获取会话详情失败: ' + error.message);
        return reply.redirect('/admin/sessions');
      }
    }
  );

  // 系统设置页面
  fastify.get(
    '/admin/settings',
    {
      onRequest: [fastify.verifyJWT],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // 检查是否是管理员
        if (request.user?.role !== 'admin') {
          return reply.redirect('/admin');
        }

        return reply.view('pages/settings', {
          title: '系统设置',
          subtitle: '配置系统参数',
          user: request.user,
          flash: request.flash,
        });
      } catch (error: any) {
        request.log.error({ err: error }, '获取系统设置失败');
        request.flash('error', '获取系统设置失败: ' + error.message);
        return reply.redirect('/admin');
      }
    }
  );

  // 文件上传页面
  fastify.get(
    '/admin/files',
    {
      onRequest: [fastify.verifyJWT],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // 检查是否是管理员
        if (request.user?.role !== 'admin') {
          return reply.redirect('/admin');
        }

        return reply.view('pages/file-upload', {
          title: '文件上传',
          subtitle: '上传和管理文件',
          user: request.user,
          flash: request.flash,
        });
      } catch (error: any) {
        request.log.error({ err: error }, '加载文件上传页面失败');
        request.flash('error', '加载文件上传页面失败: ' + error.message);
        return reply.redirect('/admin');
      }
    }
  );

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

  // Debug endpoints - only available in non-production environments
  fastify.register(async function debugRoutes(fastify) {
    fastify.addHook('preHandler', async (_request: FastifyRequest, reply: FastifyReply) => {
      if (process.env.NODE_ENV === 'production') {
        return reply.code(404).send({ error: 'Not found' });
      }
    });

    // 调试端点 - 查看所有 cookies
    fastify.get(
      '/admin/debug/cookies',
      { preHandler: [fastify.verifyJWT] },
      async (request: FastifyRequest, _reply: FastifyReply) => {
        return {
          cookies: request.cookies,
          headers: request.headers,
          user: request.user,
        };
      }
    );

    // 调试端点 - 手动验证 JWT
    fastify.post('/admin/debug/verify-token', async (request: FastifyRequest, _reply: FastifyReply) => {
      const jwt = (await import('jsonwebtoken')).default;
      const { env } = await import('../config/env.js');

      const body = request.body as any;
      const token = body.token || request.cookies?.token;

      if (!token) {
        return { error: 'No token provided' };
      }

      const jwtSecret =
        process.env.NODE_ENV === 'test' ? 'test-secret-key-for-testing-only-32chars' : String(env.JWT_SECRET);

      try {
        const decoded = jwt.verify(token, jwtSecret);
        return { success: true, decoded };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    });

    // 调试端点 - 测试 verifyJWT 中间件
    fastify.get(
      '/admin/debug/auth',
      {
        onRequest: [fastify.verifyJWT],
      },
      async (request: FastifyRequest, _reply: FastifyReply) => {
        return {
          message: 'Authentication successful',
          user: request.user,
        };
      }
    );

    // 调试端点 - 检查用户是否存在
    fastify.get(
      '/admin/debug/user',
      {
        onRequest: [fastify.verifyJWT],
      },
      async (request: FastifyRequest, _reply: FastifyReply) => {
        const { UserModel } = await import('../models/user.model.js');
        const user = await UserModel.findById(request.user!.id);
        return {
          userId: request.user!.id,
          userExists: !!user,
          userData: user,
        };
      }
    );

    // 调试端点 - 测试 profile 视图渲染
    fastify.get(
      '/admin/debug/profile-view',
      {
        onRequest: [fastify.verifyJWT],
      },
      async (request: FastifyRequest, reply: FastifyReply) => {
        try {
          const { UserModel } = await import('../models/user.model.js');
          const { CreditHistoryModel } = await import('../models/credit-history.model.js');

          const user = await UserModel.findById(request.user!.id);
          if (!user) {
            return { error: 'User not found' };
          }

          const creditHistory = await CreditHistoryModel.findByUserId(user.id, 5);

          // 暂时将已使用的积分设为 0
          const usedCredits = 0;

          console.log('[DEBUG PROFILE VIEW] About to render view...');

          return reply.view('pages/profile', {
            title: '个人资料',
            subtitle: '管理个人信息',
            path: request.url,
            user: {
              ...request.user,
              email: user.email,
              webhook_url: user.webhook_url,
              credits: user.credits,
              api_key: user.api_key,
              created_at: user.created_at,
              used_credits: usedCredits,
            },
            creditHistory,
            flash: request.flash,
          });
        } catch (error: any) {
          return { error: error.message };
        }
      }
    );
  }); // end debug routes register

  // 个人资料页面
  fastify.get(
    '/admin/profile',
    {
      onRequest: [fastify.verifyJWT],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        console.log('[PROFILE] Accessing profile page');
        console.log('[PROFILE] request.user:', request.user);
        console.log('[PROFILE] request.cookies:', request.cookies);

        // 获取当前用户的详细信息
        const { UserModel } = await import('../models/user.model.js');
        const { CreditHistoryModel } = await import('../models/credit-history.model.js');
        const { SessionModel } = await import('../models/session.model.js');

        const user = await UserModel.findById(request.user!.id);
        if (!user) {
          request.flash('error', '用户不存在');
          return reply.redirect('/admin');
        }

        // 获取积分使用历史
        const creditHistory = await CreditHistoryModel.findByUserId(user.id, 5);

        // 获取用户已使用的积分（从会话统计中获取）
        const sessionStats = await SessionModel.getUserSessionStats(user.id);
        const usedCredits = sessionStats.total_credits_used;

        return reply.view('pages/profile', {
          title: '个人资料',
          subtitle: '管理个人信息',
          path: request.url,
          user: {
            ...request.user,
            email: user.email,
            webhook_url: user.webhook_url,
            credits: user.credits,
            api_key: user.api_key,
            created_at: user.created_at,
            used_credits: usedCredits,
          },
          creditHistory,
          flash: request.flash,
        });
      } catch (error: any) {
        console.error('[PROFILE ERROR] Error details:', error);
        console.error('[PROFILE ERROR] Error stack:', error.stack);
        request.log.error({ err: error }, '获取个人资料失败');
        request.flash('error', '获取个人资料失败: ' + error.message);
        return reply.redirect('/admin');
      }
    }
  );

  // 积分历史页面
  fastify.get(
    '/admin/credits/history',
    {
      onRequest: [fastify.verifyJWT],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = request.query as {
          page?: string;
          limit?: string;
          dateRange?: string;
        };
        const page = parseInt(query.page || '1');
        const limit = parseInt(query.limit || '20');

        const { CreditHistoryModel } = await import('../models/credit-history.model.js');
        const { UserModel } = await import('../models/user.model.js');

        const offset = (page - 1) * limit;
        const history = await CreditHistoryModel.findAll(limit, offset);
        const totalRecords = await CreditHistoryModel.count();

        const users = await UserModel.findAll({ limit: '10000' });
        const userMap = new Map(users.items.map((u) => [u.id, u.username]));

        const historyWithUsername = history.map((record) => ({
          ...record,
          username: userMap.get(record.user_id) || null,
        }));

        return reply.view('pages/credits-history', {
          title: '积分历史',
          subtitle: '查看积分变动记录',
          user: request.user,
          history: historyWithUsername,
          page,
          limit,
          totalRecords,
          flash: request.flash,
        });
      } catch (error: any) {
        request.log.error({ err: error }, '获取积分历史失败');
        request.flash('error', '获取积分历史失败: ' + error.message);
        return reply.redirect('/admin');
      }
    }
  );

  // 操作日志页面
  fastify.get(
    '/admin/logs',
    {
      onRequest: [fastify.verifyJWT],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // 检查是否是管理员
        if (request.user?.role !== 'admin') {
          return reply.redirect('/admin');
        }

        // 获取分页参数和筛选参数
        const query = request.query as {
          page?: string;
          limit?: string;
          action?: string;
          dateRange?: string;
        };
        const page = parseInt(query.page || '1');
        const limit = parseInt(query.limit || '20');

        // 构建筛选条件
        const { OperationLogModel } = await import('../models/operation-log.model.js');
        const { UserModel } = await import('../models/user.model.js');

        const filters: Record<string, unknown> = {};

        // 操作类型筛选
        if (query.action) {
          filters.action = query.action;
        }

        // 时间范围筛选
        if (query.dateRange && query.dateRange !== 'all') {
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

          if (query.dateRange === 'today') {
            filters.startDate = today;
          } else if (query.dateRange === 'yesterday') {
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            filters.startDate = yesterday;
            filters.endDate = yesterday;
          } else if (query.dateRange === 'week') {
            const startOfWeek = new Date(today);
            startOfWeek.setDate(today.getDate() - today.getDay());
            filters.startDate = startOfWeek;
          } else if (query.dateRange === 'month') {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            filters.startDate = startOfMonth;
          }
        }

        // 获取日志列表
        const { items, total } = await OperationLogModel.paginate(page, limit, filters);

        // 为每条日志添加用户信息
        const logsWithUserInfo = await Promise.all(
          items.map(async (log) => {
            let adminUser = null;
            if (log.admin_id) {
              adminUser = await UserModel.findById(log.admin_id);
            }
            return {
              ...log,
              username: adminUser?.username || '系统',
              role: adminUser?.role === 'admin' ? '管理员' : '普通用户',
            };
          })
        );

        return reply.view('pages/logs', {
          title: '操作日志',
          subtitle: '查看系统操作记录',
          user: request.user,
          logs: logsWithUserInfo,
          page,
          limit,
          totalLogs: total,
          filters: {
            action: query.action || '',
            dateRange: query.dateRange || 'all',
          },
          flash: request.flash,
        });
      } catch (error: any) {
        request.log.error({ err: error }, '获取操作日志失败');
        request.flash('error', '获取操作日志失败: ' + error.message);
        return reply.redirect('/admin');
      }
    }
  );

  // 存储管理页面
  fastify.get(
    '/admin/storage',
    {
      onRequest: [fastify.verifyJWT],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // 检查是否是管理员
        if (request.user?.role !== 'admin') {
          return reply.redirect('/admin');
        }

        return reply.view('pages/storage', {
          title: '存储管理',
          subtitle: '管理用户存储和清理数据',
          user: request.user,
          flash: request.flash,
        });
      } catch (error: any) {
        request.log.error({ err: error }, '加载存储管理页面失败');
        request.flash('error', '加载存储管理页面失败: ' + error.message);
        return reply.redirect('/admin');
      }
    }
  );
}
