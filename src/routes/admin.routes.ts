import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

// 管理后台路由
export default async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  // 登录页面
  fastify.get('/admin/login', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.view('pages/login-new', {
      title: '登录',
      flash: request.flash
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

      // 记录登录操作
      try {
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
      } catch (logError) {
        request.log.warn('记录登录操作失败:', logError);
        // 不影响登录流程
      }

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

        // 计算已使用的点数（通过会话时长）
        const sessionsResult = await db('sessions').sum('duration as total').first();
        request.log.info('获取已使用点数成功', { result: sessionsResult });
        usedCredits = sessionsResult ? Number(sessionsResult.total) : 0;

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
        recentSessions = recentSessionsData.items.map(session => ({
          id: session.id,
          status: session.status,
          created_at: session.created_at,
          ended_at: session.end_time,
          username: usersMap[session.user_id] || `用户 ${session.user_id}`,
          duration: session.duration || 0
        }));
      } catch (err: any) {
        request.log.error('获取其他数据失败', { error: err.message, stack: err.stack });
      }

      request.log.info('所有数据获取完成，准备渲染仪表盘');
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

      // 模拟用户数据
      const users = [
        {
          id: 1,
          username: 'admin',
          email: 'admin@example.com',
          role: 'admin',
          status: 'active',
          credits: 1000,
          used_credits: 200,
          created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        },
        {
          id: 2,
          username: 'user1',
          email: 'user1@example.com',
          role: 'user',
          status: 'active',
          credits: 500,
          used_credits: 100,
          created_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
        },
        {
          id: 3,
          username: 'user2',
          email: 'user2@example.com',
          role: 'user',
          status: 'active',
          credits: 300,
          used_credits: 50,
          created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
        }
      ];

      // 模拟用户总数
      const totalUsers = users.length;

      return reply.view('pages/users', {
        title: '用户管理',
        subtitle: '管理系统用户',
        user: request.user,
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
      const sessions = sessionsData.items.map(session => ({
        id: session.id,
        status: session.status,
        created_at: session.created_at,
        ended_at: session.end_time,
        username: usersMap[session.user_id] || `用户 ${session.user_id}`,
        machine_name: session.machine_id ? (machinesMap[session.machine_id] || session.machine_id) : '-',
        duration: session.duration || 0
      }));

      return reply.view('pages/sessions', {
        title: '会话管理',
        subtitle: '管理 Playwright 会话',
        user: request.user,
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
        sessions: [],
        page: 1,
        limit: 10,
        totalSessions: 0,
        flash: { error: '获取会话列表失败: ' + error.message }
      });
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

      // 获取历史数据（这里需要实现一个新的方法来获取历史数据）
      // 暂时使用模拟数据
      const historyData = {
        cpu: generateMockHistoryData(24, machineData.cpuUsage),
        memory: generateMockHistoryData(24, machineData.memoryUsage),
        disk: generateMockHistoryData(24, machineData.diskUsage),
        sessions: generateMockHistoryData(24, machineData.activeSessions, machineData.maxSessions),
      };

      return reply.view('pages/machine-detail', {
        title: `机器详情: ${machineData.name}`,
        subtitle: '查看和管理机器详细信息',
        user: request.user,
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

  // 生成模拟历史数据的辅助函数
  function generateMockHistoryData(hours: number, currentValue: number, maxValue?: number) {
    const data = [];
    const now = new Date();

    for (let i = hours - 1; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 60 * 60 * 1000);
      // 生成一个围绕当前值波动的随机值
      const value = Math.max(0, currentValue + (Math.random() - 0.5) * 20);
      data.push({
        time: time.toISOString(),
        value: Math.min(value, maxValue || 100),
      });
    }

    return data;
  }


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

      // 模拟日志数据
      const logs = [
        {
          id: 1,
          admin_id: 1,
          username: 'admin',
          role: 'admin',
          action: 'login',
          details: '管理员登录系统',
          ip_address: '192.168.1.100',
          created_at: new Date(Date.now() - 30 * 60000)
        },
        {
          id: 2,
          admin_id: 1,
          username: 'admin',
          role: 'admin',
          action: 'add_credits',
          details: '为用户 user1 添加 100 点算力',
          ip_address: '192.168.1.100',
          created_at: new Date(Date.now() - 60 * 60000)
        },
        {
          id: 3,
          admin_id: 1,
          username: 'admin',
          role: 'admin',
          action: 'create_user',
          details: '创建新用户 user2',
          ip_address: '192.168.1.100',
          created_at: new Date(Date.now() - 120 * 60000)
        }
      ];

      // 模拟日志总数
      const totalLogs = logs.length;

      return reply.view('pages/logs', {
        title: '操作日志',
        subtitle: '查看系统操作记录',
        user: request.user,
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
      // 模拟用户信息
      const user = {
        id: request.user?.id,
        username: request.user?.username,
        email: 'admin@example.com',
        role: request.user?.role,
        status: 'active',
        api_key: 'api_key_' + request.user?.id,
        credits: 1000,
        used_credits: 200,
        webhook_url: 'https://webhook.example.com/callback',
        created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      };

      // 点数使用记录（模拟数据）
      const creditHistory = [
        {
          id: 1,
          user_id: user.id,
          amount: 100,
          action: 'add',
          reason: '管理员分配',
          created_at: new Date(Date.now() - 86400000 * 2) // 2 天前
        },
        {
          id: 2,
          user_id: user.id,
          amount: -30,
          action: 'use',
          reason: '使用会话',
          created_at: new Date(Date.now() - 86400000) // 1 天前
        }
      ];

      return reply.view('pages/profile', {
        title: '个人资料',
        subtitle: '管理您的账户信息',
        user,
        creditHistory,
        flash: request.flash
      });
    } catch (error: any) {
      request.log.error('获取个人资料失败:', error);
      return reply.view('pages/profile', {
        title: '个人资料',
        subtitle: '管理您的账户信息',
        user: request.user,
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
        flash: request.flash
      });
    } catch (error: any) {
      request.log.error('获取设置页面失败:', error);
      return reply.view('pages/settings', {
        title: '系统设置',
        subtitle: '配置系统参数',
        user: request.user,
        flash: { error: '获取设置页面失败: ' + error.message }
      });
    }
  });
}
