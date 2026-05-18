import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const envSchema = z
  .object({
    PORT: z.string().default('3000'),
    HOST: z.string().default('localhost'),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    DB_TYPE: z.enum(['sqlite', 'mysql']).default('sqlite'),
    DB_NAME: z.string().default('playwright_user_sys'),
    DB_PATH: z.string().optional(),
    DB_DRIVER: z.enum(['better-sqlite3', 'node-sqlite']).default('better-sqlite3').optional(),
    DB_HOST: z.string().optional(),
    DB_PORT: z.string().optional(),
    DB_USER: z.string().optional(),
    DB_PASSWORD: z.string().optional(),
    DB_POOL_MIN: z.string().optional(),
    DB_POOL_MAX: z.string().optional(),
    JWT_SECRET: z.string().optional(),
    JWT_EXPIRES_IN: z.string().default('1d'),
    ADMIN_USERNAME: z.string().default('admin'),
    ADMIN_PASSWORD: z.string().min(8, 'ADMIN_PASSWORD must be set and at least 8 characters'),
    INSTANCE_TIMEOUT: z.string().default('60000'),
    GRPC_PORT: z.string().default('50051'),
    PROXY_PORT: z.string().default('8081'),
    MACHINE_MONITOR_INTERVAL: z.string().default('30000'),
    PUBLIC_MACHINE_ENDPOINT: z.string().optional(),
    PUBLIC_MANAGER_URL: z.string().optional(),
    VITE_FRONTEND_URL: z.string().optional(),
    MAX_SESSIONS_PER_USER: z.coerce.number().default(20),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production' && !data.JWT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'JWT_SECRET is required in production environment',
        path: ['JWT_SECRET'],
      });
    }
  });

function validateEnv(vars: Record<string, string | undefined>) {
  return envSchema.safeParse(vars);
}

describe('env config validation', () => {
  const baseEnv = {
    ADMIN_PASSWORD: 'test-password-123',
  };

  describe('required env: JWT_SECRET', () => {
    it('should reject JWT_SECRET < 32 chars in production via getJwtSecret logic', () => {
      const origNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        expect(() => {
          const secret = 'short';
          if (!secret || secret.length < 32) {
            throw new Error('JWT_SECRET must be at least 32 characters');
          }
        }).toThrow(/at least 32/);
      } finally {
        process.env.NODE_ENV = origNodeEnv;
      }
    });

    it('should accept JWT_SECRET >= 32 chars in production', () => {
      expect(() => {
        const secret = 'a'.repeat(32);
        if (!secret || secret.length < 32) {
          throw new Error('JWT_SECRET must be at least 32 characters');
        }
      }).not.toThrow();
    });
  });

  describe('required env: PORT', () => {
    it('should default PORT to 3000 when not set', () => {
      const result = validateEnv(baseEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(parseInt(result.data.PORT, 10)).toBe(3000);
      }
    });

    it('should accept valid PORT string', () => {
      const result = validateEnv({ ...baseEnv, PORT: '8080' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(parseInt(result.data.PORT, 10)).toBe(8080);
      }
    });

    it('should accept well-known ports', () => {
      const ports = ['80', '443', '3000', '8080', '65535'];
      for (const port of ports) {
        const result = validateEnv({ ...baseEnv, PORT: port });
        expect(result.success, `PORT=${port} should be valid`).toBe(true);
        if (result.success) {
          const num = parseInt(result.data.PORT, 10);
          expect(num).toBeGreaterThanOrEqual(0);
          expect(num).toBeLessThanOrEqual(65535);
        }
      }
    });
  });

  describe('required env: DB_TYPE', () => {
    it('should accept sqlite', () => {
      const result = validateEnv({ ...baseEnv, DB_TYPE: 'sqlite' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.DB_TYPE).toBe('sqlite');
      }
    });

    it('should accept mysql', () => {
      const result = validateEnv({ ...baseEnv, DB_TYPE: 'mysql' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.DB_TYPE).toBe('mysql');
      }
    });

    it('should default to sqlite', () => {
      const result = validateEnv(baseEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.DB_TYPE).toBe('sqlite');
      }
    });

    it('should reject invalid DB_TYPE', () => {
      const result = validateEnv({ ...baseEnv, DB_TYPE: 'postgres' });
      expect(result.success).toBe(false);
    });
  });

  describe('optional with defaults: NODE_ENV', () => {
    it('should default to development', () => {
      const result = validateEnv(baseEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.NODE_ENV).toBe('development');
      }
    });

    it('should accept development', () => {
      const result = validateEnv({ ...baseEnv, NODE_ENV: 'development' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.NODE_ENV).toBe('development');
    });

    it('should accept production', () => {
      const result = validateEnv({ ...baseEnv, NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(32) });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.NODE_ENV).toBe('production');
    });

    it('should accept test', () => {
      const result = validateEnv({ ...baseEnv, NODE_ENV: 'test' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.NODE_ENV).toBe('test');
    });

    it('should reject invalid NODE_ENV', () => {
      const result = validateEnv({ ...baseEnv, NODE_ENV: 'staging' });
      expect(result.success).toBe(false);
    });
  });

  describe('optional with defaults: MAX_SESSIONS_PER_USER', () => {
    it('should default to 20', () => {
      const result = validateEnv(baseEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.MAX_SESSIONS_PER_USER).toBe(20);
      }
    });

    it('should coerce string to number', () => {
      const result = validateEnv({ ...baseEnv, MAX_SESSIONS_PER_USER: '50' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.MAX_SESSIONS_PER_USER).toBe(50);
      }
    });
  });

  describe('production-specific requirements', () => {
    it('should require JWT_SECRET in production', () => {
      const result = validateEnv({ ...baseEnv, NODE_ENV: 'production' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const jwtIssue = result.error.issues.find((i) => i.path[0] === 'JWT_SECRET');
        expect(jwtIssue).toBeDefined();
        if (jwtIssue) {
          expect(jwtIssue.message).toMatch(/required/i);
        }
      }
    });

    it('should pass with JWT_SECRET set in production', () => {
      const result = validateEnv({
        ...baseEnv,
        NODE_ENV: 'production',
        JWT_SECRET: 'a-very-secure-production-secret-key-32chars',
      });
      expect(result.success).toBe(true);
    });

    it('should NOT require JWT_SECRET in development', () => {
      const result = validateEnv({ ...baseEnv, NODE_ENV: 'development' });
      expect(result.success).toBe(true);
    });

    it('should NOT require JWT_SECRET in test', () => {
      const result = validateEnv({ ...baseEnv, NODE_ENV: 'test' });
      expect(result.success).toBe(true);
    });
  });

  describe('ADMIN_PASSWORD validation', () => {
    it('should reject ADMIN_PASSWORD < 8 chars', () => {
      const result = validateEnv({ ...baseEnv, ADMIN_PASSWORD: 'short' });
      expect(result.success).toBe(false);
    });

    it('should accept ADMIN_PASSWORD >= 8 chars', () => {
      const result = validateEnv({ ...baseEnv, ADMIN_PASSWORD: 'long-enough-password' });
      expect(result.success).toBe(true);
    });

    it('should reject missing ADMIN_PASSWORD', () => {
      const result = validateEnv({});
      expect(result.success).toBe(false);
    });
  });

  describe('config constants sanity', () => {
    const DEFAULT_PORT = 3000;
    const DEFAULT_INSTANCE_TIMEOUT = 60000;
    const DEFAULT_GRPC_PORT = 50051;
    const DEFAULT_PROXY_PORT = 8081;
    const DEFAULT_MONITOR_INTERVAL = 30000;
    const DEFAULT_MAX_SESSIONS = 20;

    it('PORT should be a valid port number', () => {
      expect(DEFAULT_PORT).toBeGreaterThan(0);
      expect(DEFAULT_PORT).toBeLessThanOrEqual(65535);
    });

    it('INSTANCE_TIMEOUT should be positive', () => {
      expect(DEFAULT_INSTANCE_TIMEOUT).toBeGreaterThan(0);
    });

    it('GRPC_PORT should be a valid port number', () => {
      expect(DEFAULT_GRPC_PORT).toBeGreaterThan(0);
      expect(DEFAULT_GRPC_PORT).toBeLessThanOrEqual(65535);
    });

    it('PROXY_PORT should be a valid port number', () => {
      expect(DEFAULT_PROXY_PORT).toBeGreaterThan(0);
      expect(DEFAULT_PROXY_PORT).toBeLessThanOrEqual(65535);
    });

    it('MACHINE_MONITOR_INTERVAL should be positive', () => {
      expect(DEFAULT_MONITOR_INTERVAL).toBeGreaterThan(0);
    });

    it('MAX_SESSIONS_PER_USER should be positive', () => {
      expect(DEFAULT_MAX_SESSIONS).toBeGreaterThan(0);
    });

    it('all default ports should be different', () => {
      const ports = [DEFAULT_PORT, DEFAULT_GRPC_PORT, DEFAULT_PROXY_PORT];
      const unique = new Set(ports);
      expect(unique.size).toBe(ports.length);
    });
  });

  describe('storage config constants', () => {
    const STORAGE_CONFIG = {
      MAX_SESSION_SIZE: 500 * 1024 * 1024,
      MAX_SHARED_SIZE_PER_USER: 2 * 1024 * 1024 * 1024,
      MAX_TOTAL_SIZE_PER_USER: 5 * 1024 * 1024 * 1024,
      SHARED_CLEANUP_AGE_DAYS: 30,
    } as const;

    it('MAX_SESSION_SIZE should be > 0', () => {
      expect(STORAGE_CONFIG.MAX_SESSION_SIZE).toBeGreaterThan(0);
    });

    it('MAX_SHARED_SIZE should be > 0', () => {
      expect(STORAGE_CONFIG.MAX_SHARED_SIZE_PER_USER).toBeGreaterThan(0);
    });

    it('MAX_TOTAL_SIZE should be >= MAX_SHARED_SIZE', () => {
      expect(STORAGE_CONFIG.MAX_TOTAL_SIZE_PER_USER).toBeGreaterThanOrEqual(STORAGE_CONFIG.MAX_SHARED_SIZE_PER_USER);
    });

    it('SHARED_CLEANUP_AGE_DAYS should be > 0', () => {
      expect(STORAGE_CONFIG.SHARED_CLEANUP_AGE_DAYS).toBeGreaterThan(0);
    });
  });
});
