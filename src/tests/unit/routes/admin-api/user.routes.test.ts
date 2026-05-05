import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { UserRole, UserStatus } from '../../../../shared/types/index.js';

const mockAuth = vi.hoisted(() => ({ behavior: 'reject' as 'reject' | 'pass' }));

vi.mock('../../../../routes/admin-api/authenticate.js', () => ({
  createAuthenticate: () => async (request: any, reply: any) => {
    if (mockAuth.behavior === 'reject') {
      return reply.status(401).send({ success: false, error: '未授权' });
    }
    request.user = { id: 1, role: 'admin' };
  },
}));

vi.mock('../../../../models/user.model.js', () => ({
  UserModel: {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    addCredits: vi.fn(),
  },
}));

vi.mock('../../../../models/operation-log.model.js', () => ({
  OperationLogModel: {
    create: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../../utils/auth.js', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed_password'),
}));

vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('test-uuid-key'),
}));

function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('verifyJWT', async () => {});
  app.decorateRequest('user', undefined as any);

  return import('../../../../routes/admin-api/user.routes.js').then((mod) => {
    app.register(mod.adminApiUserRoutes);
    return app.ready().then(() => app);
  });
}

describe('admin-api user routes - auth enforcement', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuth.behavior = 'reject';
    app = await buildApp();
  });

  it('POST /api/admin/users should require auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      payload: { username: 'test', password: 'pass' },
    });
    expect([401, 500]).toContain(res.statusCode);
  });

  it('GET /api/admin/users should require auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/users' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/admin/users/:id should require auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/users/1' });
    expect(res.statusCode).toBe(401);
  });

  it('PUT /api/admin/users/:id should require auth', async () => {
    const res = await app.inject({ method: 'PUT', url: '/api/admin/users/1', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('DELETE /api/admin/users/:id should require auth', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/admin/users/1' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/admin/users/:id/credits should require auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/users/1/credits',
      payload: { amount: 100 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/admin/users/:id/reset-api-key should require auth', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/admin/users/1/reset-api-key' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/admin/users/export should require auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/users/export' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/admin/users/:id/session-stats should require auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/users/1/session-stats' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/admin/users/batch-delete should require auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/users/batch-delete',
      payload: { userIds: [1] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/admin/users/batch-recharge should require auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/users/batch-recharge',
      payload: { userIds: [1], credits: 10 },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('admin-api user routes - authenticated CRUD', () => {
  let app: FastifyInstance;
  let UserModel: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuth.behavior = 'pass';
    const mod = await import('../../../../models/user.model.js');
    UserModel = mod.UserModel;
    app = await buildApp();
  });

  it('POST /api/admin/users should create a user and return 201', async () => {
    UserModel.create.mockResolvedValue({
      id: 1,
      username: 'newuser',
      email: 'new@test.com',
      role: 'user',
      status: 'active',
      credits: 0,
      api_key: 'test-uuid-key',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      payload: { username: 'newuser', password: 'pass123' },
    });

    expect(res.statusCode).toBe(201);
    const payload = res.json();
    expect(payload.success).toBe(true);
    expect(payload.data.username).toBe('newuser');
  });

  it('GET /api/admin/users/:id should return user details', async () => {
    UserModel.findById.mockResolvedValue({
      id: 1,
      username: 'testuser',
      email: 'test@test.com',
      role: 'user',
      status: 'active',
      credits: 100,
      webhook_url: null,
      api_key: 'key123',
      created_at: new Date(),
    });

    const res = await app.inject({ method: 'GET', url: '/api/admin/users/1' });

    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload.success).toBe(true);
    expect(payload.data.id).toBe(1);
    expect(payload.data.username).toBe('testuser');
  });

  it('GET /api/admin/users/:id should return 404 for non-existent user', async () => {
    UserModel.findById.mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: '/api/admin/users/999' });

    expect(res.statusCode).toBe(404);
    const payload = res.json();
    expect(payload.success).toBe(false);
  });

  it('PUT /api/admin/users/:id should update user', async () => {
    UserModel.findById.mockResolvedValue({
      id: 1,
      username: 'testuser',
      email: 'test@test.com',
      role: 'user',
      status: 'active',
      credits: 100,
      webhook_url: null,
    });
    UserModel.update.mockResolvedValue({
      id: 1,
      username: 'testuser',
      email: 'updated@test.com',
      role: 'admin',
      status: 'active',
      credits: 100,
      webhook_url: 'https://hook.url',
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/api/admin/users/1',
      payload: { email: 'updated@test.com', role: 'admin' },
    });

    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload.success).toBe(true);
    expect(payload.data.email).toBe('updated@test.com');
  });

  it('DELETE /api/admin/users/:id should delete non-admin user', async () => {
    UserModel.findById.mockResolvedValue({ id: 2, username: 'normaluser', role: UserRole.USER });
    UserModel.delete.mockResolvedValue(true);

    const res = await app.inject({ method: 'DELETE', url: '/api/admin/users/2' });

    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload.success).toBe(true);
  });

  it('DELETE /api/admin/users/:id should refuse to delete admin', async () => {
    UserModel.findById.mockResolvedValue({ id: 1, username: 'admin', role: UserRole.ADMIN });

    const res = await app.inject({ method: 'DELETE', url: '/api/admin/users/1' });

    expect(res.statusCode).toBe(403);
    const payload = res.json();
    expect(payload.success).toBe(false);
    expect(payload.error).toContain('管理员');
  });

  it('POST /api/admin/users/:id/credits should add credits', async () => {
    UserModel.findById.mockResolvedValue({ id: 1, username: 'testuser' });
    UserModel.addCredits.mockResolvedValue({ id: 1, username: 'testuser', credits: 200 });

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/users/1/credits',
      payload: { amount: 100 },
    });

    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload.success).toBe(true);
    expect(payload.data.credits).toBe(200);
  });

  it('POST /api/admin/users/:id/credits should reject invalid amount', async () => {
    UserModel.findById.mockResolvedValue({ id: 1, username: 'testuser' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/users/1/credits',
      payload: { amount: -1 },
    });

    expect([400, 500]).toContain(res.statusCode);
  });

  it('POST /api/admin/users/:id/reset-api-key should generate new key', async () => {
    UserModel.findById.mockResolvedValue({ id: 1, username: 'testuser' });
    UserModel.update.mockResolvedValue({ id: 1, api_key: 'test-uuid-key' });

    const res = await app.inject({ method: 'POST', url: '/api/admin/users/1/reset-api-key' });

    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload.success).toBe(true);
    expect(payload.data.api_key).toBe('test-uuid-key');
  });

  it('GET /api/admin/users should list users', async () => {
    UserModel.findAll.mockResolvedValue({
      items: [
        {
          id: 1,
          username: 'user1',
          email: 'u1@test.com',
          role: 'user',
          status: 'active',
          credits: 50,
          created_at: new Date(),
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    const res = await app.inject({ method: 'GET', url: '/api/admin/users' });

    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload.success).toBe(true);
    expect(payload.data.items.length).toBe(1);
  });

  it('GET /api/admin/users/:id should reject invalid user id', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/users/abc' });

    expect(res.statusCode).toBe(400);
    const payload = res.json();
    expect(payload.success).toBe(false);
  });
});
