/**
 * CORS Unsafe Origins Test
 *
 * ORIGINAL BUG (FIXED):
 * file:// and null origins were allowed via CORS.
 *
 * FIX: plugins/index.ts now rejects file: and null origins.
 * This test verifies the fix.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { build } from '../../helpers/app.js';

vi.mock('../../../models/machine.model.js', () => ({
  MachineModel: {},
}));
vi.mock('../../../models/session/index.js', () => ({
  SessionModel: {},
}));
vi.mock('../../../models/operation-log.model.js', () => ({
  OperationLogModel: {},
}));

describe('CORS: file: and null origin rejection verification', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await build();
  });

  afterAll(async () => {
    await app.close();
  });

  it('REJECTS file:///etc/passwd origin (FIX VERIFIED)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/docs',
      headers: { origin: 'file:///etc/passwd' },
    });

    const corsHeader = res.headers['access-control-allow-origin'];
    expect(corsHeader).toBeUndefined();
  });

  it('REJECTS null origin from sandboxed iframe (FIX VERIFIED)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/docs',
      headers: { origin: 'null' },
    });

    const corsHeader = res.headers['access-control-allow-origin'];
    expect(corsHeader).toBeUndefined();
  });

  it('REJECTS various file:// URL origins', async () => {
    const fileOrigins = [
      'file:///home/user/page.html',
      'file:///C:/Users/test/doc.html',
      'file://server/share/file.html',
    ];

    for (const origin of fileOrigins) {
      const res = await app.inject({
        method: 'GET',
        url: '/api/docs',
        headers: { origin },
      });

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    }
  });

  it('still allows requests without origin header (same-origin requests)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/docs',
    });

    expect(res.statusCode).toBeLessThan(500);
  });
});
