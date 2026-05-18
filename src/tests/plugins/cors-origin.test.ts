import { describe, it, expect } from 'vitest';
import type { FastifyCorsOptions } from '@fastify/cors';
import type fastifyCors from '@fastify/cors';

type OriginFunction = fastifyCors.OriginFunction;
type AsyncOriginFunction = fastifyCors.AsyncOriginFunction;

function buildCorsOriginChecker(allowedOrigins: string[]): AsyncOriginFunction {
  return (origin: string | undefined): Promise<string | boolean> => {
    if (!origin) return Promise.resolve(true);
    try {
      const originUrl = new URL(origin);
      if (originUrl.origin === 'null' || originUrl.protocol === 'file:') {
        return Promise.resolve(false);
      }
    } catch {
      return Promise.resolve(false);
    }
    if (allowedOrigins.includes(origin)) {
      return Promise.resolve(true);
    }
    try {
      const originHost = new URL(origin).host;
      for (const allowed of allowedOrigins) {
        try {
          if (new URL(allowed).host === originHost) {
            return Promise.resolve(true);
          }
        } catch {
          /* skip */
        }
      }
    } catch {
      /* skip */
    }
    return Promise.resolve(false);
  };
}

describe('CORS origin type safety', () => {
  it('origin function satisfies FastifyCorsOptions.origin', async () => {
    const allowedOrigins = ['http://localhost:3000', 'http://localhost:5173'];
    const originFn = buildCorsOriginChecker(allowedOrigins);

    const opts: FastifyCorsOptions = {
      origin: originFn,
      credentials: true,
    };

    expect(opts.origin).toBe(originFn);
    expect(await originFn(undefined)).toBe(true);
    expect(await originFn('http://localhost:3000')).toBe(true);
    expect(await originFn('http://evil.com')).toBe(false);
  });

  it('rejects null and file origins', async () => {
    const originFn = buildCorsOriginChecker(['http://localhost:3000']);
    expect(await originFn('null')).toBe(false);
    expect(await originFn('file:///etc/passwd')).toBe(false);
  });
});
