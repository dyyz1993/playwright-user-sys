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

const mockGetMachineDetail = vi.hoisted(() => vi.fn());
const mockUpdateMachineConfig = vi.hoisted(() => vi.fn());
const mockHealthCheckMachine = vi.hoisted(() => vi.fn());
const mockBatchHealthCheck = vi.hoisted(() => vi.fn());

vi.mock('../../../../services/admin-machine.service.js', () => ({
  getMachineDetail: mockGetMachineDetail,
  updateMachineConfig: mockUpdateMachineConfig,
  healthCheckMachine: mockHealthCheckMachine,
  batchHealthCheck: mockBatchHealthCheck,
}));

function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('verifyJWT', async () => {});
  app.decorateRequest('user', undefined as unknown as Record<string, unknown>);

  return import('../../../../routes/admin-machine-api.routes.js').then((mod) => {
    app.register(mod.default);
    return app.ready().then(() => app);
  });
}

describe('admin-machine-api routes - params.id validation', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuth.behavior = 'pass';
    mockGetMachineDetail.mockResolvedValue(null);
    mockUpdateMachineConfig.mockResolvedValue({
      id: '1',
      hostname: 'test',
      ip: '192.168.1.1',
      grpcPort: 50051,
      proxyPort: 8080,
      maxInstances: 10,
      status: 'offline',
    });
    mockHealthCheckMachine.mockResolvedValue({
      machineId: '1',
      status: 'healthy',
      grpcConnected: true,
      checkedAt: new Date().toISOString(),
    });
    app = await buildApp();
  });

  it('GET /api/admin/machines/:id should reject non-numeric id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/machines/abc',
    });
    expect(res.statusCode).toBe(400);
    const payload = res.json();
    expect(payload.success).toBe(false);
  });

  it('GET /api/admin/machines/:id should reject negative id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/machines/-1',
    });
    expect(res.statusCode).toBe(400);
    const payload = res.json();
    expect(payload.success).toBe(false);
  });

  it('GET /api/admin/machines/:id should reject zero id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/machines/0',
    });
    expect(res.statusCode).toBe(400);
    const payload = res.json();
    expect(payload.success).toBe(false);
  });

  it('GET /api/admin/machines/:id should accept valid numeric id', async () => {
    mockGetMachineDetail.mockResolvedValue({
      id: '1',
      hostname: 'test',
      ip: '192.168.1.1',
      grpcPort: 50051,
      proxyPort: 8080,
      instanceCount: 0,
      maxInstances: 10,
      status: 'offline',
      lastSeen: null,
      activeSessions: 0,
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/machines/1',
    });
    expect(res.statusCode).toBe(200);
  });

  it('PUT /api/admin/machines/:id should reject non-numeric id', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/admin/machines/abc',
      payload: { hostname: 'test' },
    });
    expect(res.statusCode).toBe(400);
    const payload = res.json();
    expect(payload.success).toBe(false);
  });

  it('POST /api/admin/machines/:id/health-check should reject non-numeric id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/machines/abc/health-check',
    });
    expect(res.statusCode).toBe(400);
    const payload = res.json();
    expect(payload.success).toBe(false);
  });
});
