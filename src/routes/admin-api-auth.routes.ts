import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { UserModel } from '../models/user.model.js';
import { OperationLogModel } from '../models/operation-log.model.js';
import { UserRole } from '../types/index.js';
import { compare } from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  adminLoginRequestSchema,
  adminLoginResponseSchema,
  dashboardStatsResponseSchema,
  errorResponseSchema
} from '../schemas/index.js';
import { config } from '@/config/index.js';

// 管理后台 API 路由
export default async function adminApiAuthRoutes(fastify: FastifyInstance): Promise<void> {
  // 登录 API
  fastify.post('/api/admin/login', {
    schema: {
      body: zodToJsonSchema(adminLoginRequestSchema),
      response: {
        200: zodToJsonSchema(adminLoginResponseSchema),
        400: zodToJsonSchema(errorResponseSchema),
        401: zodToJsonSchema(errorResponseSchema),
      },
      tags: ['auth'],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { username: string; password: string };
      const { username, password } = body;

      // 查找用户
      const user = await UserModel.findByUsername(username);
      if (!user) {
        return reply.status(401).send({ success: false, error: '用户名或密码错误' });
      }

      // 验证密码
      const isPasswordValid = await compare(password, user.password);
      if (!isPasswordValid) {
        return reply.status(401).send({ success: false, error: '用户名或密码错误' });
      }

      // 检查用户状态
      if (user.status !== 'active') {
        return reply.status(401).send({ success: false, error: '账户已被禁用' });
      }

      // 检查用户角色 - 允许普通用户登录
      // 不再限制只有管理员可以登录

      // 生成 JWT 令牌
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        config.jwt.secret,
        { expiresIn:  config.jwt.expiresIn  }
      );

      // 记录登录操作 - 异步处理
      OperationLogModel.create({
        admin_id: user.id,
        action: 'login',
        details: {
          username: user.username,
          role: user.role,
          ip: request.ip
        }
      }).catch(logError => {
        request.log.warn('记录登录操作失败:', logError);
        // 不影响登录流程
      });

      return reply.send({
        success: true,
        message: '登录成功',
        data: {
          id: user.id,
          username: user.username,
          role: user.role,
          token
        }
      });
    } catch (error: any) {
      request.log.error('登录失败:', error);
      return reply.status(500).send({ success: false, error: '登录失败: ' + error.message });
    }
  });

  // 仪表盘统计 API
  fastify.get('/api/admin/dashboard/stats', {
    schema: {
      response: {
        200: zodToJsonSchema(dashboardStatsResponseSchema),
        401: zodToJsonSchema(errorResponseSchema),
        403: zodToJsonSchema(errorResponseSchema),
      },
      tags: ['admin'],
    },
    preHandler: [async (request, reply) => {
      try {
        // 使用 fastify 的 JWT 验证中间件
        await fastify.verifyJWT(request, reply);

        // 如果返回已经发送，直接返回
        if (reply.sent) return;

        // 验证管理员权限
        if (!request.user) {
          return reply.status(401).send({ success: false, error: '未授权' });
        }

        if (request.user.role !== UserRole.ADMIN) {
          return reply.status(403).send({ success: false, error: '需要管理员权限' });
        }
      } catch (error) {
        // 如果返回已经发送，不再发送新的响应
        if (reply.sent) return;

        request.log.error('认证失败:', error);
        return reply.status(401).send({ success: false, error: '认证失败' });
      }
    }]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // 导入内存存储服务
      const { memoryStore } = await import('../services/memory-store.service.js');

      // 从数据库获取用户统计数据
      const { UserModel } = await import('../models/user.model.js');
      const usersData = await UserModel.getStats();
      const totalUsers = usersData.total || 0;
      const activeUsers = usersData.active || 0;

      // 从内存中获取机器和会话的实时数据
      const machineStats = memoryStore.getMachineStats();
      const sessionStats = memoryStore.getSessionStats();

      // 如果内存中没有数据，则尝试加载初始数据
      if (machineStats.total === 0 && sessionStats.total === 0) {
        await memoryStore.loadInitialData();
      }

      // 强制刷新内存数据，确保显示最新状态
      console.log('开始强制刷新内存数据...');
      await memoryStore.loadInitialData();
      console.log('内存数据刷新完成');

      // 获取所有机器的详细状态
      const allMachines = memoryStore.getAllMachines();
      console.log('内存中的机器详细状态:');
      for (const machine of allMachines) {
        console.log(`- 机器 ${machine.machine_id}: 状态=${machine.online ? '在线' : '离线'}, 活跃会话=${machine.active_sessions}`);
      }

      // 再次获取统计数据
      const updatedMachineStats = memoryStore.getMachineStats();
      const updatedSessionStats = memoryStore.getSessionStats();

      // 输出调试信息
      console.log(`当前在线机器数量: ${updatedMachineStats.online}/${updatedMachineStats.total}`);
      console.log(`当前活跃会话数量: ${updatedSessionStats.active}/${updatedSessionStats.total}`);

      // 获取点数统计
      const creditsData = await UserModel.getCreditsStats();
      const totalCredits = creditsData.total || 0;
      const usedCredits = creditsData.used || 0;

      return reply.send({
        success: true,
        data: {
          totalUsers,
          activeUsers,
          totalMachines: updatedMachineStats.total,
          onlineMachines: updatedMachineStats.online,
          totalSessions: updatedSessionStats.total,
          activeSessions: updatedSessionStats.active,
          totalCredits,
          usedCredits
        }
      });
    } catch (error: any) {
      request.log.error('获取仪表盘统计数据失败:', error);
      return reply.status(500).send({ success: false, error: '获取仪表盘统计数据失败: ' + error.message });
    }
  });
}
