import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL_ENV = process.env.NODE_ENV;
const ORIGINAL_LOG_LEVEL = process.env.LOG_LEVEL;

function resetEnv() {
  process.env.NODE_ENV = ORIGINAL_ENV;
  if (ORIGINAL_LOG_LEVEL !== undefined) {
    process.env.LOG_LEVEL = ORIGINAL_LOG_LEVEL;
  } else {
    delete process.env.LOG_LEVEL;
  }
}

describe('logger config', () => {
  beforeEach(() => {
    vi.resetModules();
    resetEnv();
  });

  afterEach(() => {
    vi.resetModules();
    resetEnv();
  });

  describe('createLoggerConfig', () => {
    it('should export createLoggerConfig as a function', async () => {
      const { createLoggerConfig } = await import('@shared/utils/pino-config.js');
      expect(typeof createLoggerConfig).toBe('function');
    });

    it('should default level to info when LOG_LEVEL is not set', async () => {
      delete process.env.LOG_LEVEL;
      const { createLoggerConfig } = await import('@shared/utils/pino-config.js');
      const config = createLoggerConfig();
      expect(config.level).toBe('info');
    });

    it('should use LOG_LEVEL env var when set', async () => {
      process.env.LOG_LEVEL = 'debug';
      const { createLoggerConfig } = await import('@shared/utils/pino-config.js');
      const config = createLoggerConfig();
      expect(config.level).toBe('debug');
    });

    it('should include pino-pretty transport in non-production', async () => {
      process.env.NODE_ENV = 'development';
      const { createLoggerConfig } = await import('@shared/utils/pino-config.js');
      const config = createLoggerConfig();
      expect(config.transport).toBeDefined();
      expect(config.transport).toEqual({
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      });
    });

    it('should NOT include transport in production', async () => {
      process.env.NODE_ENV = 'production';
      const { createLoggerConfig } = await import('@shared/utils/pino-config.js');
      const config = createLoggerConfig();
      expect(config.transport).toBeUndefined();
    });

    it('should NOT include transport when NODE_ENV=test', async () => {
      process.env.NODE_ENV = 'test';
      const { createLoggerConfig } = await import('@shared/utils/pino-config.js');
      const config = createLoggerConfig();
      expect(config.transport).toBeUndefined();
    });
  });

  describe('request serializer', () => {
    it('should only include method and url, not headers', async () => {
      const { createLoggerConfig } = await import('@shared/utils/pino-config.js');
      const config = createLoggerConfig();
      const reqSerializer = config.serializers!.req as (req: Record<string, unknown>) => Record<string, unknown>;

      const result = reqSerializer({
        method: 'POST',
        url: '/api/login',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
          cookie: 'session=abc123',
        },
        body: { password: 'my-secret' },
      });

      expect(result).toEqual({ method: 'POST', url: '/api/login' });
      expect(result).not.toHaveProperty('headers');
      expect(result).not.toHaveProperty('body');
    });
  });

  describe('response serializer', () => {
    it('should only include statusCode', async () => {
      const { createLoggerConfig } = await import('@shared/utils/pino-config.js');
      const config = createLoggerConfig();
      const resSerializer = config.serializers!.res as (res: Record<string, unknown>) => Record<string, unknown>;

      const result = resSerializer({
        statusCode: 200,
        headers: { 'x-custom': 'value' },
        body: { token: 'secret' },
      });

      expect(result).toEqual({ statusCode: 200 });
      expect(result).not.toHaveProperty('headers');
      expect(result).not.toHaveProperty('body');
    });
  });

  describe('error serializer', () => {
    it('should serialize Error objects correctly', async () => {
      const { createLoggerConfig } = await import('@shared/utils/pino-config.js');
      const config = createLoggerConfig();
      const errSerializer = config.serializers!.err as (err: Error) => Record<string, unknown>;

      const error = new Error('test error');
      const result = errSerializer(error);
      expect(result).toHaveProperty('message', 'test error');
      expect(result).toHaveProperty('stack');
      expect(typeof result.stack).toBe('string');
    });
  });

  describe('sanitize function', () => {
    it('should redact sensitive fields', async () => {
      const { sanitize } = await import('@shared/utils/pino-config.js');
      const result = sanitize({
        username: 'admin',
        password: 'secret123',
        token: 'abc',
        apiKey: 'key123',
        normalField: 'ok',
      });
      expect(result).toEqual({
        username: 'admin',
        password: '***REDACTED***',
        token: '***REDACTED***',
        apiKey: '***REDACTED***',
        normalField: 'ok',
      });
    });

    it('should redact nested sensitive fields', async () => {
      const { sanitize } = await import('@shared/utils/pino-config.js');
      const result = sanitize({
        user: {
          name: 'admin',
          Authorization: 'Bearer xxx',
          profile: { secret: 'hidden' },
        },
      });
      expect(result).toEqual({
        user: {
          name: 'admin',
          Authorization: '***REDACTED***',
          profile: { secret: '***REDACTED***' },
        },
      });
    });

    it('should pass through primitives unchanged', async () => {
      const { sanitize } = await import('@shared/utils/pino-config.js');
      expect(sanitize('hello')).toBe('hello');
      expect(sanitize(42)).toBe(42);
      expect(sanitize(null)).toBe(null);
      expect(sanitize(undefined)).toBe(undefined);
    });

    it('should preserve Error objects', async () => {
      const { sanitize } = await import('@shared/utils/pino-config.js');
      const error = new Error('test');
      expect(sanitize(error)).toBe(error);
    });

    it('should sanitize arrays', async () => {
      const { sanitize } = await import('@shared/utils/pino-config.js');
      const result = sanitize([
        { name: 'ok', password: 'secret' },
        { token: 'abc', value: 1 },
      ]);
      expect(result).toEqual([
        { name: 'ok', password: '***REDACTED***' },
        { token: '***REDACTED***', value: 1 },
      ]);
    });
  });

  describe('Fastify logger integration', () => {
    it('should provide createFastifyLoggerConfig for production', async () => {
      process.env.NODE_ENV = 'production';
      const { createFastifyLoggerConfig } = await import('@shared/utils/pino-config.js');
      const config = createFastifyLoggerConfig();
      expect(config.level).toBe('info');
      expect(config.transport).toBeUndefined();
      expect(config.serializers).toBeDefined();
      expect(config.serializers!.req).toBeDefined();
      expect(config.serializers!.res).toBeDefined();
      expect(config.serializers!.err).toBeDefined();
    });

    it('should provide createFastifyLoggerConfig with pretty for development', async () => {
      process.env.NODE_ENV = 'development';
      const { createFastifyLoggerConfig } = await import('@shared/utils/pino-config.js');
      const config = createFastifyLoggerConfig();
      expect(config.transport).toBeDefined();
      expect(config.transport!.target).toBe('pino-pretty');
    });

    it('should return false for test environment', async () => {
      process.env.NODE_ENV = 'test';
      const { createFastifyLoggerConfig } = await import('@shared/utils/pino-config.js');
      const config = createFastifyLoggerConfig();
      expect(config).toBe(false);
    });
  });
});
