import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

const mockAuth = vi.hoisted(() => ({ behavior: 'reject' as 'reject' | 'pass' }));

vi.mock('../../../../routes/admin-api/authenticate.js', () => ({
  createAuthenticate: () => async (request: Record<string, unknown>, reply: Record<string, unknown>) => {
    if (mockAuth.behavior === 'reject') {
      return reply.status(401).send({ success: false, error: '未授权' });
    }
    request.user = { id: 1, role: 'admin' };
  },
}));

function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('verifyJWT', async () => {});
  app.decorateRequest('user', undefined as unknown as Record<string, unknown>);

  return import('../../../../routes/admin-api/session.routes.js').then((mod) => {
    app.register(mod.adminApiSessionRoutes);
    return app.ready().then(() => app);
  });
}

describe('admin-api session routes - auth enforcement', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuth.behavior = 'reject';
    app = await buildApp();
  });

  it('GET /api/admin/sessions should require auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/sessions' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/admin/sessions/stats should require auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/sessions/stats' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/admin/sessions/:id should require auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/sessions/test-session-id' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/admin/sessions/batch-release should require auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/sessions/batch-release',
      payload: { sessionIds: ['s1'] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/admin/sessions/refresh-status should require auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/sessions/refresh-status',
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/admin/users/:id/sessions should require auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/users/1/sessions' });
    expect(res.statusCode).toBe(401);
  });
});

describe('admin-api session routes - batch-release validation', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuth.behavior = 'pass';
    app = await buildApp();
  });

  it('POST /api/admin/sessions/batch-release should reject empty sessionIds', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/sessions/batch-release',
      payload: { sessionIds: [] },
    });

    expect(res.statusCode).toBe(400);
    const payload = res.json();
    expect(payload.success).toBe(false);
  });
});
