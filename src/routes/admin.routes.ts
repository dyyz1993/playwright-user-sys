import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

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

      // 查找用户
      console.log('Looking for user with username:', username);
      // 模拟用户查询
      const user = username === 'admin' ? {
        id: 1,
        username: 'admin',
        password: '$2a$10$XpC5o8bCuXHt1XZD0qA.AOC9.4.dR22kbUw1K3L5iLODUUQzcUKSG', // REDACTED_ADMIN_PASS 的哈希
        role: 'admin',
        status: 'active'
      } : null;

      console.log('User found:', user);

      if (!user) {
        request.flash('error', '用户名或密码错误');
        return reply.redirect('/admin/login');
      }

      // 验证密码
      console.log('Validating password...');
      // 模拟密码验证
      const isPasswordValid = password === 'REDACTED_ADMIN_PASS';
      console.log('Password valid:', isPasswordValid);

      if (!isPasswordValid) {
        console.log('Password validation failed');
        request.flash('error', '用户名或密码错误');
        return reply.redirect('/admin/login');
      }

      // 检查用户状态
      if (user.status !== 'active') {
        request.flash('error', '账户已被禁用');
        return reply.redirect('/admin/login');
      }

      // 生成 JWT 令牌
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        'your-secret-key',
        { expiresIn: '7d' }
      );

      // 设置 cookie
      reply.setCookie('token', token, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 7 // 7 天
      });

      // 记录登录操作 - 异步处理
      // 模拟记录登录操作
      console.log('记录登录操作:', {
        admin_id: user.id,
        action: 'login',
        details: {
          username: user.username,
          role: user.role,
          ip: request.ip
        }
      });

      // 重定向到仪表盘
      return reply.redirect('/admin');
    } catch (error: any) {
      request.log.error('登录失败:', error);
      request.flash('error', '登录失败: ' + error.message);
      return reply.redirect('/admin/login');
    }
  });

  // 退出登录
  fastify.get('/admin/logout', async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.clearCookie('token', { path: '/' });
    return reply.redirect('/admin/login');
  });

  // 从 cookie 中解析 JWT 令牌并设置用户信息
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // 登录页面不需要验证
      if (request.url === '/admin/login') {
        return;
      }

      // 从 cookie 中获取令牌
      const token = request.cookies.token;

      if (!token) {
        // 没有令牌，重定向到登录页面
        return reply.redirect('/admin/login');
      }

      // 验证令牌
      const decoded = jwt.verify(token, 'your-secret-key') as { id: number; username: string; role: string };

      // 设置用户信息
      request.user = {
        id: decoded.id,
        username: decoded.username,
        role: decoded.role as 'admin' | 'user'
      };

      console.log('User authenticated:', request.user);
    } catch (error) {
      // 令牌无效，清除 cookie 并重定向到登录页面
      console.error('Token verification failed:', error);
      reply.clearCookie('token', { path: '/' });
      return reply.redirect('/admin/login');
    }
  });

  // 仪表盘
  fastify.get('/admin', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // 从数据库获取真实数据
      request.log.info('开始获取仪表盘数据');

      let activeSessions = 0;
      let totalMachines = 0;
      let onlineMachines = 0;
      let totalUsers = 0;
      let newUsers = 0;
      let totalCredits = 0;
      let usedCredits = 0;
      let sessionChange = 0;
      let cpuUsage = 0;
      let memoryUsage = 0;
      let diskUsage = 0;
      let recentSessions: any[] = [];

      try {
        const { SessionModel } = await import('../models/session.model.js');
        request.log.info('导入 SessionModel 成功');

        // 获取活跃会话数
        const activeSessions_result = await SessionModel.findActiveSessions();
        request.log.info('获取活跃会话成功', { count: activeSessions_result.length });
        activeSessions = activeSessions_result.length;
      } catch (err: any) {
        request.log.error('获取活跃会话失败', { error: err.message, stack: err.stack });
      }

      try {
        const { MachineModel } = await import('../models/machine.model.js');
        request.log.info('导入 MachineModel 成功');

        // 获取机器数据
        const machinesData = await MachineModel.findAll({ limit: 100 });
        request.log.info('获取机器数据成功', { count: machinesData.items.length });

        totalMachines = machinesData.total;
        onlineMachines = machinesData.items.filter(m => m.status === 'online').length;

        // 获取系统状态数据（从在线机器的平均值计算）
        const onlineMachinesList = machinesData.items.filter(m => m.status === 'online');
        if (onlineMachinesList.length > 0) {
          cpuUsage = Math.round(onlineMachinesList.reduce((sum, m) => sum + (m.cpuUsage || 0), 0) / onlineMachinesList.length);
          memoryUsage = Math.round(onlineMachinesList.reduce((sum, m) => sum + (m.memoryUsage || 0), 0) / onlineMachinesList.length);
          diskUsage = Math.round(onlineMachinesList.reduce((sum, m) => sum + (m.diskUsage || 0), 0) / onlineMachinesList.length);
        }
      } catch (err: any) {
        request.log.error('获取机器数据失败', { error: err.message, stack: err.stack });
      }

      try {
        const { UserModel } = await import('../models/user.model.js');
        request.log.info('导入 UserModel 成功');

        // 获取用户数据
        const usersData = await UserModel.findAll({ limit: 100 });
        request.log.info('获取用户数据成功', { count: usersData.items.length });
        totalUsers = usersData.total;
      } catch (err: any) {
        request.log.error('获取用户数据失败', { error: err.message, stack: err.stack });
      }

      try {
        const { db } = await import('../config/database.js');
        request.log.info('导入数据库成功');

        // 获取新用户数（过去30天）
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const newUsersResult = await db('users')
          .where('created_at', '>=', thirtyDaysAgo)
          .count('id as count')
          .first();
        request.log.info('获取新用户数成功', { result: newUsersResult });
        newUsers = newUsersResult ? Number(newUsersResult.count) : 0;

        // 获取总点数和已使用点数
        const creditsResult = await db('users').sum('credits as total').first();
        request.log.info('获取总点数成功', { result: creditsResult });
        totalCredits = creditsResult ? Number(creditsResult.total) : 0;

        // 计算已使用的点数（优先使用 credits_used 字段）
        const sessionsResult = await db('sessions').sum('credits_used as total').first();
        request.log.info('获取已使用点数成功', { result: sessionsResult });
        usedCredits = sessionsResult ? Number(sessionsResult.total) : 0;

        // 如果 credits_used 字段的总和为 0，则使用会话时长计算
        if (usedCredits === 0) {
          const durationResult = await db('sessions').sum('duration as total').first();
          request.log.info('使用会话时长计算已使用点数', { result: durationResult });
          const totalDuration = durationResult ? Number(durationResult.total) : 0;
          usedCredits = totalDuration > 0 ? Math.ceil(totalDuration / 60) : 0;
        }

        // 计算会话变化率（与昨天相比）
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

        const todaySessionsResult = await db('sessions')
          .where('created_at', '>=', yesterday)
          .count('id as count')
          .first();
        const yesterdaySessionsResult = await db('sessions')
          .where('created_at', '>=', twoDaysAgo)
          .where('created_at', '<', yesterday)
          .count('id as count')
          .first();

        const todaySessions = todaySessionsResult ? Number(todaySessionsResult.count) : 0;
        const yesterdaySessions = yesterdaySessionsResult ? Number(yesterdaySessionsResult.count) : 0;

        if (yesterdaySessions > 0) {
          sessionChange = Math.round(((todaySessions - yesterdaySessions) / yesterdaySessions) * 100);
        }

        // 获取最近的会话
        const { SessionModel } = await import('../models/session.model.js');
        const recentSessionsData = await SessionModel.findAll({ limit: 5, sort: 'created_at', order: 'desc' });
        request.log.info('获取最近会话成功', { count: recentSessionsData.items.length });

        // 获取用户名映射
        const userIds = recentSessionsData.items.map(session => session.user_id);
        const usersMap: Record<number, string> = {};
        if (userIds.length > 0) {
          const users = await db('users').whereIn('id', userIds);
          users.forEach(user => {
            usersMap[user.id] = user.username;
          });
        }

        // 格式化会话数据
        recentSessions = recentSessionsData.items.map(session => {
          // 使用数据库中的 credits_used 字段，如果没有则计算
          // 即使会话只运行了几秒钟，也至少消耗 1 点
          const creditsUsed = session.credits_used || (session.duration > 0 ? Math.max(1, Math.ceil(session.duration / 60)) : 0);

          return {
            id: session.id,
            status: session.status,
            created_at: session.created_at,
            ended_at: session.end_time,
            username: usersMap[session.user_id] || `用户 ${session.user_id}`,
            duration: session.duration || 0,
            credits_used: creditsUsed
          };
        });
      } catch (err: any) {
        request.log.error('获取其他数据失败', { error: err.message, stack: err.stack });
      }

      request.log.info('所有数据获取完成，准备渲染仪表盘');
      return reply.view('pages/dashboard', {
        title: '仪表盘',
        subtitle: '系统概览',
        user: request.user,
        path: request.url,
        stats: {
          activeSessions,
          totalMachines,
          onlineMachines,
          totalUsers,
          newUsers,
          totalCredits,
          usedCredits,
          sessionChange,
          cpuUsage,
          memoryUsage,
          diskUsage
        },
        recentSessions
      });
    } catch (error: any) {
      request.log.error('获取仪表盘数据失败:', { error: error.message, stack: error.stack });

      // 尝试将错误对象转换为字符串
      let errorMessage = '';
      try {
        errorMessage = error.message || JSON.stringify(error);
      } catch (e) {
        errorMessage = '无法序列化错误对象';
      }

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

  // 用户编辑页面
  fastify.get('/admin/users/:id/edit', async (request: FastifyRequest, reply: FastifyReply) => {
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

  // 用户管理页面
  fastify.get('/admin/users', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // 检查是否是管理员
      if (request.user?.role !== 'admin') {
        return reply.redirect('/admin');
      }

      // 获取分页参数
      const query = request.query as { page?: string; limit?: string };
      const page = parseInt(query.page || '1');
      const limit = parseInt(query.limit || '10');

      // 从数据库获取用户数据
      const { UserModel } = await import('../models/user.model.js');
      const usersData = await UserModel.findAll({
        page,
        limit,
        sort: 'created_at',
        order: 'desc'
      });

      // 格式化用户数据
      const users = usersData.items.map(user => ({
        id: user.id,
        username: user.username,
        email: user.email || '',
        role: user.role,
        status: user.status,
        credits: user.credits,
        used_credits: 0, // 可以从会话表中计算，或者添加一个方法来获取
        created_at: user.created_at
      }));

      // 用户总数
      const totalUsers = usersData.total;

      return reply.view('pages/users', {
        title: '用户管理',
        subtitle: '管理系统用户',
        user: request.user,
        path: request.url,
        users,
        page,
        limit,
        totalUsers,
        flash: request.flash
      });
    } catch (error: any) {
      request.log.error('获取用户列表失败:', error);
      return reply.view('pages/users', {
        title: '用户管理',
        subtitle: '管理系统用户',
        user: request.user,
        path: request.url,
        users: [],
        page: 1,
        limit: 10,
        totalUsers: 0,
        flash: { error: '获取用户列表失败: ' + error.message }
      });
    }
  });

  // 会话管理页面
  fastify.get('/admin/sessions', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // 获取分页参数
      const query = request.query as { page?: string; limit?: string };
      const page = parseInt(query.page || '1');
      const limit = parseInt(query.limit || '10');

      // 从数据库获取会话数据
      const { SessionModel } = await import('../models/session.model.js');
      const { db } = await import('../config/database.js');

      // 根据用户角色获取会话
      let sessionsData;
      if (request.user?.role === 'admin') {
        // 管理员可以看到所有会话
        sessionsData = await SessionModel.findAll({
          page,
          limit,
          sort: 'created_at',
          order: 'desc'
        });
      } else {
        // 普通用户只能看到自己的会话
        sessionsData = await SessionModel.findByUserId(request.user?.id || 0, {
          page,
          limit,
          sort: 'created_at',
          order: 'desc'
        });
      }

      // 获取用户和机器信息
      const userIds = sessionsData.items.map(session => session.user_id);
      const machineIds = sessionsData.items.map(session => session.machine_id).filter(id => id) as string[];

      // 获取用户名映射
      const usersMap: Record<number, string> = {};
      if (userIds.length > 0) {
        const users = await db('users').whereIn('id', userIds);
        users.forEach(user => {
          usersMap[user.id] = user.username;
        });
      }

      // 获取机器名映射
      const machinesMap: Record<string, string> = {};
      if (machineIds.length > 0) {
        const machines = await db('machines').whereIn('id', machineIds);
        machines.forEach(machine => {
          machinesMap[machine.id] = machine.hostname;
        });
      }

      // 格式化会话数据
      const sessions = sessionsData.items.map(session => {
        // 使用数据库中的 credits_used 字段，如果没有则计算
        // 即使会话只运行了几秒钟，也至少消耗 1 点
        const creditsUsed = session.credits_used || (session.duration > 0 ? Math.max(1, Math.ceil(session.duration / 60)) : 0);

        return {
          id: session.id,
          status: session.status,
          created_at: session.created_at,
          ended_at: session.end_time,
          username: usersMap[session.user_id] || `用户 ${session.user_id}`,
          machine_name: session.machine_id ? (machinesMap[session.machine_id] || session.machine_id) : '-',
          duration: session.duration || 0,
          credits_used: creditsUsed
        };
      });

      return reply.view('pages/sessions', {
        title: '会话管理',
        subtitle: '管理 Playwright 会话',
        user: request.user,
        path: request.url,
        sessions,
        page,
        limit,
        totalSessions: sessionsData.total,
        flash: request.flash
      });
    } catch (error: any) {
      request.log.error('获取会话列表失败:', error);
      return reply.view('pages/sessions', {
        title: '会话管理',
        subtitle: '管理 Playwright 会话',
        user: request.user,
        path: request.url,
        sessions: [],
        page: 1,
        limit: 10,
        totalSessions: 0,
        flash: { error: '获取会话列表失败: ' + error.message }
      });
    }
  });

  // 会话详情页面
  fastify.get('/admin/sessions/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const sessionId = (request.params as any).id;

      // 从数据库获取会话数据
      const { SessionModel } = await import('../models/session.model.js');
      const { UserModel } = await import('../models/user.model.js');
      const { MachineModel } = await import('../models/machine.model.js');

      // 获取会话详情
      const session = await SessionModel.findById(sessionId);
      if (!session) {
        request.flash('error', '找不到指定的会话');
        return reply.redirect('/admin/sessions');
      }

      // 获取用户信息
      const user = await UserModel.findById(session.user_id);

      // 获取机器信息
      let machine = null;
      if (session.machine_id) {
        machine = await MachineModel.findById(session.machine_id);
      }

      // 使用数据库中的 credits_used 字段，如果没有则计算
      // 即使会话只运行了几秒钟，也至少消耗 1 点
      const creditsUsed = session.credits_used || (session.duration > 0 ? Math.max(1, Math.ceil(session.duration / 60)) : 0);

      // 格式化会话数据
      const sessionData = {
        id: session.id,
        status: session.status,
        created_at: session.created_at,
        start_time: session.start_time,
        end_time: session.end_time,
        duration: session.duration || 0,
        credits_used: creditsUsed,
        port: session.port,
        screenshot_url: session.screenshot_url,
        options: session.options,
        error_message: session.error_message,
        last_activity: session.last_activity,
        user: user ? {
          id: user.id,
          username: user.username,
          email: user.email,
          credits: user.credits
        } : { username: `用户 ${session.user_id}` },
        machine: machine ? {
          id: machine.id,
          name: machine.hostname,
          ip: machine.ip,
          status: machine.status
        } : null
      };

      return reply.view('pages/session-detail', {
        title: `会话详情: ${session.id}`,
        subtitle: '查看会话详细信息',
        user: request.user,
        path: request.url,
        session: sessionData,
        flash: request.flash
      });
    } catch (error: any) {
      request.log.error('获取会话详情失败:', error);
      request.flash('error', '获取会话详情失败: ' + error.message);
      return reply.redirect('/admin/sessions');
    }
  });

  // 机器详情页面
  fastify.get('/admin/machines/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // 检查是否是管理员
      if (request.user?.role !== 'admin') {
        return reply.redirect('/admin');
      }

      const machineId = (request.params as any).id;

      // 从数据库获取机器数据
      const { MachineModel } = await import('../models/machine.model.js');
      const { SessionModel } = await import('../models/session.model.js');
      const { memoryStore } = await import('../services/memory-store.service.js');

      // 优先从内存存储中获取机器信息
      let machine = memoryStore.getMachine(machineId);
      let machineData;

      if (machine) {
        // 如果内存中有数据，使用内存中的数据
        machineData = {
          id: machine.machine_id,
          name: machine.name,
          ip: machine.ip,
          status: machine.online ? 'online' : 'offline',
          grpcPort: machine.grpc_port,
          cpuUsage: machine.cpu_usage,
          memoryUsage: machine.memory_usage,
          diskUsage: machine.disk_space,
          activeSessions: machine.active_sessions,
          maxSessions: machine.max_sessions,
          lastSeen: machine.last_heartbeat,
        };
      } else {
        // 如果内存中没有数据，从数据库获取
        const dbMachine = await MachineModel.findById(machineId);
        if (!dbMachine) {
          request.flash('error', '找不到指定的机器');
          return reply.redirect('/admin/machines');
        }

        machineData = {
          id: dbMachine.id,
          name: dbMachine.hostname,
          ip: dbMachine.ip,
          status: dbMachine.status,
          grpcPort: dbMachine.grpcPort,
          cpuUsage: dbMachine.cpuUsage || 0,
          memoryUsage: dbMachine.memoryUsage || 0,
          diskUsage: dbMachine.diskUsage || 0,
          activeSessions: 0,
          maxSessions: dbMachine.maxInstances,
          lastSeen: dbMachine.lastSeen,
        };
      }

      // 获取该机器上的会话
      const sessions = await SessionModel.findByMachineId(machineId);

      // 从数据库获取历史数据
      // 注意：这里需要实现一个新的方法来获取历史数据
      // 如果没有实现该方法，可以返回空数据
      const historyData = {
        cpu: [],
        memory: [],
        disk: [],
        sessions: [],
      };

      return reply.view('pages/machine-detail', {
        title: `机器详情: ${machineData.name}`,
        subtitle: '查看和管理机器详细信息',
        user: request.user,
        path: request.url,
        machine: machineData,
        sessions,
        historyData,
        flash: request.flash
      });
    } catch (error: any) {
      request.log.error('获取机器详情失败:', error);
      request.flash('error', '获取机器详情失败: ' + error.message);
      return reply.redirect('/admin/machines');
    }
  });


  // 机器管理页面
  fastify.get('/admin/machines', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // 检查是否是管理员
      if (request.user?.role !== 'admin') {
        return reply.redirect('/admin');
      }

      // 获取分页参数
      const query = request.query as { page?: string; limit?: string };
      const page = parseInt(query.page || '1');
      const limit = parseInt(query.limit || '10');

      // 从数据库获取机器数据
      const { MachineModel } = await import('../models/machine.model.js');
      const { SessionModel } = await import('../models/session.model.js');

      const machinesData = await MachineModel.findAll({
        page,
        limit,
        sort: 'last_seen',
        order: 'desc'
      });

      // 获取每台机器的活跃会话数
      const machines = [];
      for (const machine of machinesData.items) {
        const sessions = await SessionModel.findByMachineId(machine.id);
        const activeSessions = sessions.filter(s =>
          s.status === 'created' || s.status === 'connected'
        ).length;

        machines.push({
          id: machine.id,
          name: machine.hostname,
          ip_address: machine.ip,
          status: machine.status,
          last_heartbeat: machine.lastSeen,
          max_sessions: machine.maxInstances,
          active_sessions: activeSessions,
          load: machine.cpuUsage || 0
        });
      }

      return reply.view('pages/machines', {
        title: '机器管理',
        subtitle: '管理 Playwright 实例机器',
        user: request.user,
        path: request.url,
        machines,
        page,
        limit,
        totalMachines: machinesData.total,
        flash: request.flash
      });
    } catch (error: any) {
      request.log.error('获取机器列表失败:', error);
      return reply.view('pages/machines', {
        title: '机器管理',
        subtitle: '管理 Playwright 实例机器',
        user: request.user,
        path: request.url,
        machines: [],
        page: 1,
        limit: 10,
        totalMachines: 0,
        flash: { error: '获取机器列表失败: ' + error.message }
      });
    }
  });

  // 操作日志页面
  fastify.get('/admin/logs', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // 检查是否是管理员
      if (request.user?.role !== 'admin') {
        return reply.redirect('/admin');
      }

      // 获取分页参数
      const query = request.query as { page?: string; limit?: string };
      const page = parseInt(query.page || '1');
      const limit = parseInt(query.limit || '10');

      // 从数据库获取日志数据
      const { OperationLogModel } = await import('../models/operation-log.model.js');
      const { UserModel } = await import('../models/user.model.js');

      // 获取日志数据
      const logsData = await OperationLogModel.findAll({
        page,
        limit,
        sort: 'created_at',
        order: 'desc'
      });

      // 获取管理员用户名映射
      const adminIds = logsData.items.map(log => log.admin_id);
      const adminsMap = {};

      if (adminIds.length > 0) {
        const admins = await Promise.all(
          [...new Set(adminIds)].map(id => UserModel.findById(id))
        );

        admins.forEach(admin => {
          if (admin) {
            adminsMap[admin.id] = {
              username: admin.username,
              role: admin.role
            };
          }
        });
      }

      // 格式化日志数据
      const logs = logsData.items.map(log => {
        const admin = adminsMap[log.admin_id] || { username: `用户 ${log.admin_id}`, role: 'unknown' };

        // 直接传递details对象，不进行额外的字符串转换
        // 模板中会根据类型进行适当处理

        return {
          id: log.id,
          admin_id: log.admin_id,
          username: admin.username,
          role: admin.role,
          action: log.action,
          details: log.details,
          ip_address: log.ip || '0.0.0.0',
          created_at: log.created_at
        };
      });

      // 日志总数
      const totalLogs = logsData.total;

      return reply.view('pages/logs', {
        title: '操作日志',
        subtitle: '查看系统操作记录',
        user: request.user,
        path: request.url,
        logs,
        page,
        limit,
        totalLogs,
        flash: request.flash
      });
    } catch (error: any) {
      request.log.error('获取操作日志失败:', error);
      return reply.view('pages/logs', {
        title: '操作日志',
        subtitle: '查看系统操作记录',
        user: request.user,
        path: request.url,
        logs: [],
        page: 1,
        limit: 10,
        totalLogs: 0,
        flash: { error: '获取操作日志失败: ' + error.message }
      });
    }
  });

  // 个人资料页面
  fastify.get('/admin/profile', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // 从数据库获取用户信息
      const { UserModel } = await import('../models/user.model.js');
      const { OperationLogModel } = await import('../models/operation-log.model.js');
      const { SessionModel } = await import('../models/session.model.js');

      if (!request.user?.id) {
        return reply.redirect('/admin/login');
      }

      // 获取完整的用户信息
      const userData = await UserModel.findById(request.user.id);
      if (!userData) {
        request.flash('error', '无法获取用户信息');
        return reply.redirect('/admin/login');
      }

      // 计算已使用的点数
      const sessions = await SessionModel.getAllByUserId(userData.id);
      const usedCredits = sessions.reduce((total, session) => {
        // 如果有持续时间，则按分钟计算（向上取整）
        if (session.duration) {
          return total + Math.ceil(session.duration / 60);
        }
        return total;
      }, 0);

      const user = {
        id: userData.id,
        username: userData.username,
        email: userData.email || '',
        role: userData.role,
        status: userData.status,
        api_key: userData.api_key || '',
        credits: userData.credits,
        used_credits: usedCredits,
        webhook_url: userData.webhook_url || '',
        created_at: userData.created_at
      };

      // 获取点数操作历史
      const logs = await OperationLogModel.findByTargetUserId(userData.id, {
        limit: 10,
        sort: 'created_at',
        order: 'desc'
      });

      // 格式化点数历史记录
      let creditHistory = [];

      // 确保 logs 是数组并且有数据
      if (Array.isArray(logs) && logs.length > 0) {
        creditHistory = logs
          .filter(log => log && (log.action === '添加点数' || log.action === '扣除点数'))
          .map(log => ({
            id: log.id,
            user_id: log.target_user_id,
            amount: log.action === '添加点数' ?
              (log.details && log.details.amount ? Number(log.details.amount) : 0) :
              (log.details && log.details.amount ? -Number(log.details.amount) : 0),
            action: log.action === '添加点数' ? 'add' : 'use',
            reason: log.details && log.details.reason ? log.details.reason : log.action,
            created_at: log.created_at
          }));
      } else {
        request.log.warn(`用户 ${userData.id} 的日志数据不是数组或为空: ${JSON.stringify(logs)}`);
      }

      return reply.view('pages/profile', {
        title: '个人资料',
        subtitle: '管理您的账户信息',
        user,
        path: request.url,
        creditHistory,
        flash: request.flash
      });
    } catch (error: any) {
      request.log.error('获取个人资料失败:', error);
      return reply.view('pages/profile', {
        title: '个人资料',
        subtitle: '管理您的账户信息',
        user: request.user,
        path: request.url,
        creditHistory: [],
        flash: { error: '获取个人资料失败: ' + error.message }
      });
    }
  });

  // 设置页面
  fastify.get('/admin/settings', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return reply.view('pages/settings', {
        title: '系统设置',
        subtitle: '配置系统参数',
        user: request.user,
        path: request.url,
        flash: request.flash
      });
    } catch (error: any) {
      request.log.error('获取设置页面失败:', error);
      return reply.view('pages/settings', {
        title: '系统设置',
        subtitle: '配置系统参数',
        user: request.user,
        path: request.url,
        flash: { error: '获取设置页面失败: ' + error.message }
      });
    }
  });
}
