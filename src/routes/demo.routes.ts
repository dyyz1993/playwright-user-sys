import { FastifyInstance } from 'fastify';
import { DemoService } from '../services/demo.service.js';

const demoService = new DemoService();
let initialized = false;

async function ensureInit() {
  if (!initialized) {
    await demoService.initialize();
    initialized = true;
  }
}

export default async function demoRoutes(fastify: FastifyInstance) {
  fastify.get('/demo', async (_request, reply) => {
    return reply.view('pages/demo', {
      title: '远程浏览器体验',
      demoEnabled: process.env.DEMO_ENABLED !== 'false',
      idleTimeout: parseInt(process.env.DEMO_IDLE_TIMEOUT || '300', 10),
    });
  });

  fastify.post('/api/demo/session', async (request, reply) => {
    try {
      if (process.env.DEMO_ENABLED === 'false') {
        return reply.code(503).send({ success: false, error: 'Demo 功能已禁用' });
      }
      await ensureInit();

      const ip = request.ip || (request.headers['x-forwarded-for'] as string) || 'unknown';
      const result = await demoService.createSession(String(ip).split(',')[0].trim());

      return reply.code(201).send({ success: true, data: result });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '创建会话失败';
      const code = msg.includes('较多') ? 503 : 500;
      return reply.code(code).send({ success: false, error: msg });
    }
  });

  fastify.get('/api/demo/session/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string };
    const status = demoService.getSessionStatus(id);
    if (!status) {
      return reply.code(404).send({ success: false, error: '会话不存在' });
    }
    return reply.send({ success: true, data: { sessionId: id, ...status } });
  });

  fastify.post('/api/demo/activity', async (request, reply) => {
    const { sessionId } = request.body as { sessionId?: string };
    if (!sessionId) {
      return reply.code(400).send({ success: false, error: '缺少 sessionId' });
    }
    const refreshed = demoService.refreshActivity(sessionId);
    return reply.send({ success: refreshed });
  });

  fastify.get('/api/demo/stats', async (_request, reply) => {
    return reply.send({
      success: true,
      data: {
        activeSessions: demoService.getActiveCount(),
        maxSessions: demoService.getMaxSessions(),
      },
    });
  });

  fastify.delete('/api/demo/session', async (request, reply) => {
    const { sessionId } = request.body as { sessionId: string };
    if (!sessionId) {
      return reply.code(400).send({ success: false, error: '缺少 sessionId' });
    }
    await demoService.releaseSession(sessionId);
    return reply.send({ success: true });
  });
}
