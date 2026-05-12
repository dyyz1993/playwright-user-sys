/**
 * Machine Routes Authentication Test
 *
 * ORIGINAL BUG (FIXED):
 * POST /register and PUT /:id/status had NO auth middleware.
 *
 * FIX: Added onRequest: [fastify.verifyApiKey] to both routes.
 * This test now verifies the fix — both routes should REJECT unauthenticated requests.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { build } from '../../helpers/app.js';

vi.mock('../../../models/machine.model.js', () => ({
  MachineModel: {
    register: vi.fn().mockResolvedValue({
      id: 'machine-uuid-1',
      hostname: 'rogue-host',
      ip: '10.0.0.1',
      max_instances: 5,
      status: 'online',
    }),
    findById: vi.fn().mockResolvedValue({
      id: 'machine-uuid-1',
      hostname: 'rogue-host',
      ip: '10.0.0.1',
      status: 'online',
    }),
    update: vi.fn().mockResolvedValue({
      id: 'machine-uuid-1',
      hostname: 'rogue-host',
      ip: '10.0.0.1',
      cpu_usage: 99,
      status: 'online',
    }),
  },
}));

vi.mock('../../../models/session.model.js', () => ({
  SessionModel: {},
}));

vi.mock('../../../models/operation-log.model.js', () => ({
  OperationLogModel: {},
}));

describe('SECURITY: machine routes authentication verification', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await build();
  });

  afterAll(async () => {
    await app.close();
  });

  const AUTH_REQUIRED_STATUS = [401, 403] as const;

  it('GET /api/machines (admin route) REJECTS unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/machines',
    });

    expect(res.statusCode).toBe(401);
  });

  it('POST /api/machines/register NOW REJECTS unauthenticated requests (FIX VERIFIED)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/machines/register',
      payload: {
        id: 'machine-uuid-1',
        hostname: 'rogue-host',
        ip: '10.0.0.1',
      },
    });

    expect(AUTH_REQUIRED_STATUS).toContain(res.statusCode);
  });

  it('PUT /api/machines/:id/status NOW REJECTS unauthenticated requests (FIX VERIFIED)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/machines/machine-uuid-1/status',
      payload: {
        cpuUsage: 99,
        memoryUsage: 50,
        diskUsage: 30,
      },
    });

    expect(AUTH_REQUIRED_STATUS).toContain(res.statusCode);
  });

  it('POST /api/machines/:id/offline REJECTS unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/machines/machine-uuid-1/offline',
    });

    expect(res.statusCode).toBe(401);
  });

  it('GET /api/machines/:id REJECTS unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/machines/machine-uuid-1',
    });

    expect(res.statusCode).toBe(401);
  });

  it('DELETE /api/machines/:id REJECTS unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/machines/machine-uuid-1',
      payload: {},
    });

    expect(res.statusCode).toBe(401);
  });

  it('POST /api/machines/refresh REJECTS unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/machines/refresh',
    });

    expect(res.statusCode).toBe(401);
  });

  it('POST /api/machines/:id/restart REJECTS unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/machines/machine-uuid-1/restart',
    });

    expect(res.statusCode).toBe(401);
  });

  it('POST /api/machines/cleanup REJECTS unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/machines/cleanup',
      payload: { daysThreshold: 30 },
    });

    expect(res.statusCode).toBe(401);
  });

  it('verifies ALL machine routes now enforce authentication (no gaps)', async () => {
    const allEndpoints = [
      { method: 'GET', url: '/api/machines' },
      { method: 'GET', url: '/api/machines/machine-uuid-1' },
      { method: 'GET', url: '/api/machines/machine-uuid-1/sessions' },
      { method: 'POST', url: '/api/machines/machine-uuid-1/offline' },
      { method: 'POST', url: '/api/machines/refresh' },
      { method: 'POST', url: '/api/machines/machine-uuid-1/restart' },
      { method: 'DELETE', url: '/api/machines/machine-uuid-1' },
      { method: 'POST', url: '/api/machines/cleanup' },
      { method: 'POST', url: '/api/machines/register', payload: { id: 'x', hostname: 'x', ip: '10.0.0.1' } },
      {
        method: 'PUT',
        url: '/api/machines/machine-uuid-1/status',
        payload: { cpuUsage: 1, memoryUsage: 1, diskUsage: 1 },
      },
    ];

    for (const endpoint of allEndpoints) {
      const res = await app.inject({
        method: endpoint.method as 'GET' | 'POST' | 'PUT' | 'DELETE',
        url: endpoint.url,
        payload: endpoint.method !== 'GET' ? endpoint.payload || {} : undefined,
      });
      expect(
        AUTH_REQUIRED_STATUS,
        `${endpoint.method} ${endpoint.url} should reject with 401/403 but got ${res.statusCode}`
      ).toContain(res.statusCode);
    }
  });
});
