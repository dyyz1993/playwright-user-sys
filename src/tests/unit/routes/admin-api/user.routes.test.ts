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
    findByUsername: vi.fn(),
    getStats: vi.fn(),
    getCreditsStats: vi.fn(),
    countAll: vi.fn(),
    countNewUsers: vi.fn(),
    sumAllCredits: vi.fn(),
    resetApiKey: vi.fn(),
  },
}));

vi.mock('../../../../models/operation-log.model.js', () => ({
  OperationLogModel: {
    create: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../../services/user.service.js', () => ({
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  batchDeleteUsers: vi.fn(),
  addCredits: vi.fn(),
  batchRecharge: vi.fn(),
  resetApiKey: vi.fn(),
  listUsers: vi.fn(),
  getUserById: vi.fn(),
  getUserStats: vi.fn(),
  getUserSessionStats: vi.fn(),
  exportUsersCsv: vi.fn(),
  getCreditsStats: vi.fn(),
  countAll: vi.fn(),
  sumAllCredits: vi.fn(),
  findByUsername: vi.fn(),
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
      payload: { username: 'test', password: 'Test1234' },
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
  let UserService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuth.behavior = 'pass';
    const mod = await import('../../../../services/user.service.js');
    UserService = mod;
    app = await buildApp();
  });

  it('POST /api/admin/users should create a user and return 201', async () => {
    UserService.createUser.mockResolvedValue({
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
      payload: { username: 'newuser', password: 'Test1234' },
    });

    expect(res.statusCode).toBe(201);
    const payload = res.json();
    expect(payload.success).toBe(true);
    expect(payload.data.username).toBe('newuser');
  });

  it('GET /api/admin/users/:id should return user details', async () => {
    UserService.getUserById.mockResolvedValue({
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
    UserService.getUserById.mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: '/api/admin/users/999' });

    expect(res.statusCode).toBe(404);
    const payload = res.json();
    expect(payload.success).toBe(false);
  });

  it('PUT /api/admin/users/:id should update user', async () => {
    UserService.updateUser.mockResolvedValue({
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
    UserService.deleteUser.mockResolvedValue(true);

    const res = await app.inject({ method: 'DELETE', url: '/api/admin/users/2' });

    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload.success).toBe(true);
  });

  it('DELETE /api/admin/users/:id should refuse to delete admin', async () => {
    UserService.deleteUser.mockRejectedValue(new Error('不允许删除管理员账号'));

    const res = await app.inject({ method: 'DELETE', url: '/api/admin/users/1' });

    expect(res.statusCode).toBe(403);
    const payload = res.json();
    expect(payload.success).toBe(false);
    expect(payload.error).toContain('管理员');
  });

  it('POST /api/admin/users/:id/credits should add credits', async () => {
    UserService.addCredits.mockResolvedValue({ id: 1, username: 'testuser', credits: 200 });

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
    UserService.addCredits.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/users/1/credits',
      payload: { amount: -1 },
    });

    expect([400, 500]).toContain(res.statusCode);
  });

  it('POST /api/admin/users/:id/reset-api-key should generate new key', async () => {
    UserService.resetApiKey.mockResolvedValue('test-uuid-key');

    const res = await app.inject({ method: 'POST', url: '/api/admin/users/1/reset-api-key' });

    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload.success).toBe(true);
    expect(payload.data.api_key).toBe('test-uuid-key');
  });

  it('GET /api/admin/users should list users', async () => {
    UserService.listUsers.mockResolvedValue({
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
