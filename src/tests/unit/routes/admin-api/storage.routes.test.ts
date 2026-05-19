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

  return import('../../../../routes/admin-api/storage.routes.js').then((mod) => {
    app.register(mod.adminApiStorageRoutes);
    return app.ready().then(() => app);
  });
}

describe('admin-api storage routes - auth enforcement', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuth.behavior = 'reject';
    app = await buildApp();
  });

  it('GET /api/admin/storage/stats should require auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/storage/stats' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/admin/storage/cleanup should require auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/storage/cleanup',
      payload: { userIds: [1], type: 'all' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/admin/storage/cleanup-all should require auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/storage/cleanup-all',
      payload: { days: 30 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/admin/storage/system-stats should require auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/storage/system-stats' });
    expect(res.statusCode).toBe(401);
  });
});

describe('admin-api storage routes - cleanup validation', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuth.behavior = 'pass';
    app = await buildApp();
  });

  it('POST /api/admin/storage/cleanup should reject empty userIds', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/storage/cleanup',
      payload: { userIds: [], type: 'all' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('POST /api/admin/storage/cleanup should reject invalid type', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/storage/cleanup',
      payload: { userIds: [1], type: 'invalid' },
    });

    expect([400, 500]).toContain(res.statusCode);
  });
});
