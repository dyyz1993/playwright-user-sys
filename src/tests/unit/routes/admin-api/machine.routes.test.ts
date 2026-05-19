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

const mockAddMachine = vi.hoisted(() => vi.fn().mockRejectedValue(new Error('should not be called')));
const mockBatchRestartMachines = vi.hoisted(() => vi.fn().mockRejectedValue(new Error('should not be called')));

vi.mock('../../../../services/admin-machine.service.js', () => ({
  addMachine: mockAddMachine,
  batchRestartMachines: mockBatchRestartMachines,
}));

function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('verifyJWT', async () => {});
  app.decorateRequest('user', undefined as unknown as Record<string, unknown>);

  return import('../../../../routes/admin-api/machine.routes.js').then((mod) => {
    app.register(mod.adminApiMachineRoutes);
    return app.ready().then(() => app);
  });
}

describe('admin-api machine routes - auth enforcement', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuth.behavior = 'reject';
    app = await buildApp();
  });

  it('POST /api/admin/machines should require auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/machines',
      payload: { hostname: 'test', ip: '192.168.1.1' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/admin/machines/batch-restart should require auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/machines/batch-restart',
      payload: { machineIds: ['m1'] },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('admin-api machine routes - add machine validation', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuth.behavior = 'pass';
    app = await buildApp();
  });

  it('POST /api/admin/machines should reject missing hostname', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/machines',
      payload: { hostname: '', ip: '192.168.1.1' },
    });

    expect(res.statusCode).toBe(400);
    const payload = res.json();
    expect(payload.success).toBe(false);
    expect(payload.error).toContain('主机名');
  });

  it('POST /api/admin/machines should reject invalid IP format', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/machines',
      payload: { hostname: 'test-machine', ip: 'invalid-ip' },
    });

    expect(res.statusCode).toBe(400);
    const payload = res.json();
    expect(payload.success).toBe(false);
    expect(payload.error).toContain('IP');
  });

  it('POST /api/admin/machines should reject out-of-range grpcPort', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/machines',
      payload: { hostname: 'test-machine', ip: '192.168.1.100', grpcPort: 99999 },
    });

    expect(res.statusCode).toBe(400);
    const payload = res.json();
    expect(payload.success).toBe(false);
    expect(payload.error).toContain('gRPC');
  });

  it('POST /api/admin/machines should reject out-of-range proxyPort', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/machines',
      payload: { hostname: 'test-machine', ip: '192.168.1.100', proxyPort: 0 },
    });

    expect(res.statusCode).toBe(400);
    const payload = res.json();
    expect(payload.success).toBe(false);
    expect(payload.error).toContain('代理');
  });

  it('POST /api/admin/machines/batch-restart should reject empty machineIds', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/machines/batch-restart',
      payload: { machineIds: [] },
    });

    expect(res.statusCode).toBe(400);
    const payload = res.json();
    expect(payload.success).toBe(false);
  });
});

describe('admin-api machine routes - add machine success', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuth.behavior = 'pass';

    mockAddMachine.mockResolvedValue({
      id: 'test-machine-uuid',
      hostname: 'test-machine',
      ip: '192.168.1.100',
      grpcPort: 50051,
      proxyPort: 8080,
      maxInstances: 10,
      status: 'offline',
    });

    app = await buildApp();
  });

  it('POST /api/admin/machines should create machine with valid data', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/machines',
      payload: {
        hostname: 'test-machine',
        ip: '192.168.1.100',
        grpcPort: 50051,
        proxyPort: 8080,
        maxInstances: 10,
      },
    });

    expect(res.statusCode).toBe(201);
    const payload = res.json();
    expect(payload.success).toBe(true);
    expect(payload.data.hostname).toBe('test-machine');
    expect(payload.data.ip).toBe('192.168.1.100');
  });
});
