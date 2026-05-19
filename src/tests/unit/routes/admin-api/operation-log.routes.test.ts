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

vi.mock('../../../../models/operation-log.model.js', () => ({
  OperationLogModel: {
    findByTargetUserId: vi.fn(),
    paginate: vi.fn(),
    getStats: vi.fn(),
  },
}));

vi.mock('../../../../models/user.model.js', () => ({
  UserModel: {
    findById: vi.fn(),
  },
}));

function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('verifyJWT', async () => {});
  app.decorateRequest('user', undefined as unknown as Record<string, unknown>);

  return import('../../../../routes/admin-api/operation-log.routes.js').then((mod) => {
    app.register(mod.adminApiOperationLogRoutes);
    return app.ready().then(() => app);
  });
}

describe('admin-api operation-log routes - auth enforcement', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuth.behavior = 'reject';
    app = await buildApp();
  });

  it('GET /api/admin/operation-logs should require auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/operation-logs' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/admin/operation-logs/stats should require auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/operation-logs/stats' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/admin/users/:id/logs should require auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/users/1/logs' });
    expect(res.statusCode).toBe(401);
  });
});

describe('admin-api operation-log routes - data retrieval', () => {
  let app: FastifyInstance;
  let OperationLogModel: ReturnType<typeof vi.fn>;
  let UserModel: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuth.behavior = 'pass';
    const logMod = await import('../../../../models/operation-log.model.js');
    OperationLogModel = logMod.OperationLogModel;
    const userMod = await import('../../../../models/user.model.js');
    UserModel = userMod.UserModel;
    app = await buildApp();
  });

  it('GET /api/admin/users/:id/logs should return 400 for invalid id', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/users/abc/logs' });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/admin/users/:id/logs should return 404 for non-existent user', async () => {
    UserModel.findById.mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: '/api/admin/users/999/logs' });
    expect(res.statusCode).toBe(404);
  });

  it('GET /api/admin/users/:id/logs should return logs for valid user', async () => {
    UserModel.findById.mockResolvedValue({ id: 1, username: 'testuser' });
    OperationLogModel.findByTargetUserId.mockResolvedValue({
      items: [
        { id: 1, action: '创建用户', admin_id: 1, target_user_id: 1, created_at: new Date(), updated_at: new Date() },
      ],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    });

    const res = await app.inject({ method: 'GET', url: '/api/admin/users/1/logs' });
    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload.success).toBe(true);
    expect(payload.data.items.length).toBe(1);
  });

  it('GET /api/admin/operation-logs should return paginated logs', async () => {
    OperationLogModel.paginate.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });

    const res = await app.inject({ method: 'GET', url: '/api/admin/operation-logs' });
    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload.success).toBe(true);
  });

  it('GET /api/admin/operation-logs/stats should return stats', async () => {
    OperationLogModel.getStats.mockResolvedValue({
      total: 10,
      byAction: { 创建用户: 5, 删除用户: 5 },
    });

    const res = await app.inject({ method: 'GET', url: '/api/admin/operation-logs/stats' });
    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload.success).toBe(true);
    expect(payload.data.total).toBe(10);
  });
});
