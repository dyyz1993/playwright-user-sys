import { FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { RequestLogModel } from '../models/request-log.model.js';

// 扩展 FastifyRequest 类型以添加 startTime 属性
declare module 'fastify' {
  interface FastifyRequest {
    startTime?: [number, number]; // process.hrtime() 返回的类型
  }
}

// 请求日志中间件
export const requestLogger = fp(async (fastify) => {
  // 添加请求开始时的钩子
  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    // 将开始时间存储在请求对象上
    request.startTime = process.hrtime();
  });

  // 添加响应完成后的钩子
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // 检查 startTime 是否存在
      if (!request.startTime) {
        request.log.warn('请求开始时间不存在');
        return;
      }

      // 计算响应时间（毫秒）
      const hrTime = process.hrtime(request.startTime);
      const responseTime = Math.round(hrTime[0] * 1000 + hrTime[1] / 1000000);

      // 获取用户 ID（如果已认证）
      const userId = request.user?.id;

      // 创建请求日志
      await RequestLogModel.create({
        user_id: userId,
        method: request.method,
        path: request.url,
        status_code: reply.statusCode,
        ip: request.ip,
        user_agent: request.headers['user-agent'],
        response_time: responseTime,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.error({ err: message }, '记录请求日志失败');
    }
  });
});

// 将请求日志中间件导出为插件
export default requestLogger;
