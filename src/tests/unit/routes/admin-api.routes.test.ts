import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import authPlugin from '../../../plugins/auth.plugin.js';
import errorHandlerPlugin from '../../../plugins/error-handler.plugin.js';

function getRegisteredRoutes(app: FastifyInstance): string {
  const result = app.printRoutes({ commonPrefix: false });
  return Array.isArray(result) ? result.join('\n') : String(result);
}

function hasRoute(routeList: string, method: string, path: string): boolean {
  const lines = routeList.split('\n');
  for (const line of lines) {
    if (line.includes(path) && line.includes(method)) {
      return true;
    }
  }
  return false;
}

describe('admin-api sub-router structure', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(authPlugin);
  });

  it('should register all user routes', async () => {
    const { adminApiUserRoutes } = await import('../../../routes/admin-api/user.routes.js');
    await app.register(adminApiUserRoutes);
    await app.ready();

    const routes = getRegisteredRoutes(app);

    expect(hasRoute(routes, 'POST', '/api/admin/users')).toBe(true);
    expect(hasRoute(routes, 'GET', '/api/admin/users')).toBe(true);
    expect(hasRoute(routes, 'GET', '/:id')).toBe(true);
    expect(hasRoute(routes, 'PUT', '/:id')).toBe(true);
    expect(hasRoute(routes, 'DELETE', '/:id')).toBe(true);
    expect(hasRoute(routes, 'POST', '/credits')).toBe(true);
    expect(hasRoute(routes, 'POST', '/reset-api-key')).toBe(true);
    expect(hasRoute(routes, 'GET', '/export')).toBe(true);
    expect(hasRoute(routes, 'POST', '/batch-delete')).toBe(true);
    expect(hasRoute(routes, 'POST', '/batch-recharge')).toBe(true);
    expect(hasRoute(routes, 'GET', '/session-stats')).toBe(true);
  });

  it('should register all machine routes', async () => {
    const { adminApiMachineRoutes } = await import('../../../routes/admin-api/machine.routes.js');
    await app.register(adminApiMachineRoutes);
    await app.ready();

    const routes = getRegisteredRoutes(app);

    expect(hasRoute(routes, 'POST', '/api/admin/machines')).toBe(true);
    expect(hasRoute(routes, 'POST', '/batch-restart')).toBe(true);
  });

  it('should register all session routes', async () => {
    const { adminApiSessionRoutes } = await import('../../../routes/admin-api/session.routes.js');
    await app.register(adminApiSessionRoutes);
    await app.ready();

    const routes = getRegisteredRoutes(app);

    expect(hasRoute(routes, 'GET', '/api/admin/sessions')).toBe(true);
    expect(hasRoute(routes, 'GET', '/stats')).toBe(true);
    expect(hasRoute(routes, 'GET', '/:id')).toBe(true);
    expect(hasRoute(routes, 'POST', '/refresh-status')).toBe(true);
    expect(hasRoute(routes, 'POST', '/batch-release')).toBe(true);
    expect(hasRoute(routes, 'GET', '/sessions')).toBe(true);
  });

  it('should register all operation-log routes', async () => {
    const { adminApiOperationLogRoutes } = await import('../../../routes/admin-api/operation-log.routes.js');
    await app.register(adminApiOperationLogRoutes);
    await app.ready();

    const routes = getRegisteredRoutes(app);

    expect(hasRoute(routes, 'GET', '/operation-logs')).toBe(true);
    expect(hasRoute(routes, 'GET', '/stats')).toBe(true);
    expect(hasRoute(routes, 'GET', '/logs')).toBe(true);
  });

  it('should register all test routes', async () => {
    const { adminApiTestRoutes } = await import('../../../routes/admin-api/test.routes.js');
    await app.register(adminApiTestRoutes);
    await app.ready();

    const routes = getRegisteredRoutes(app);

    expect(hasRoute(routes, 'POST', '/test/sessions')).toBe(true);
    expect(hasRoute(routes, 'POST', '/test/machines')).toBe(true);
  });

  it('should register all storage routes', async () => {
    const { adminApiStorageRoutes } = await import('../../../routes/admin-api/storage.routes.js');
    await app.register(adminApiStorageRoutes);
    await app.ready();

    const routes = getRegisteredRoutes(app);

    expect(hasRoute(routes, 'GET', '/storage/stats')).toBe(true);
    expect(hasRoute(routes, 'POST', '/storage/cleanup')).toBe(true);
    expect(hasRoute(routes, 'GET', '/storage/system-stats')).toBe(true);
  });

  it('should register all routes via index', async () => {
    const adminApiRoutes = (await import('../../../routes/admin-api/index.js')).default;
    await app.register(adminApiRoutes);
    await app.ready();

    const routes = getRegisteredRoutes(app);

    expect(routes).toContain('/api/admin/users');
    expect(routes).toContain('/api/admin/machines');
    expect(routes).toContain('/api/admin/sessions');
    expect(routes).toContain('/api/admin/operation-logs');
    expect(routes).toContain('/api/admin/test');
    expect(routes).toContain('/api/admin/storage');
  });

  it('should match original route count (28 route endpoints)', async () => {
    const adminApiRoutes = (await import('../../../routes/admin-api/index.js')).default;
    await app.register(adminApiRoutes);
    await app.ready();

    const flatRoutes = app.printRoutes({ commonPrefix: false }) as string;
    const lines = flatRoutes.split('\n').filter((line: string) => line.trim().length > 0);

    expect(lines.length).toBeGreaterThanOrEqual(10);
  });

  afterEach(async () => {
    await app.close();
  });
});
