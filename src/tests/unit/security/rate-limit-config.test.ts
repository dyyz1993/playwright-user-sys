import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../..');
const srcDir = path.join(projectRoot, 'src');

interface RateLimitConfig {
  max: number;
  timeWindow: string;
}

function fileHasRateLimit(filePath: string): RateLimitConfig | null {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf-8');
  const m = content.match(/rateLimit\s*:\s*\{[\s\S]*?max\s*:\s*(\d+)\s*,[\s\S]*?timeWindow\s*:\s*'([^']+)'/);
  if (m) return { max: parseInt(m[1], 10), timeWindow: m[2] };
  return null;
}

function routeHasRateLimit(filePath: string, method: string, routePath: string): RateLimitConfig | null {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf-8');
  const esc = routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    'fastify\\.' +
      method.toLowerCase() +
      '\\s*\\(\\s*[\'"`]' +
      esc +
      '[\'"`]' +
      '\\s*,[\\s\\S]*?rateLimit\\s*:\\s*\\{[\\s\\S]*?max\\s*:\\s*(\\d+)' +
      '[\\s\\S]*?timeWindow\\s*:\\s*[\'"`]([^\'"`]+)[\'"`]',
    'm'
  );
  const m = content.match(re);
  if (m) return { max: parseInt(m[1], 10), timeWindow: m[2] };
  return null;
}

describe('Rate Limit Configuration', () => {
  describe('Global rate limit in plugins/index.ts', () => {
    it('should have global rate limit configured', () => {
      const content = fs.readFileSync(path.join(srcDir, 'plugins/index.ts'), 'utf-8');
      expect(content).toContain('@fastify/rate-limit');
      expect(content).toContain('max:');
      expect(content).toContain('timeWindow:');
    });

    it('should use reasonable global limits (100 req/min)', () => {
      const content = fs.readFileSync(path.join(srcDir, 'plugins/index.ts'), 'utf-8');
      const maxMatch = content.match(/max:\s*(\d+)/);
      const twMatch = content.match(/timeWindow:\s*'([^']+)'/);
      expect(maxMatch).not.toBeNull();
      expect(twMatch).not.toBeNull();
      expect(parseInt(maxMatch![1], 10)).toBe(100);
      expect(twMatch![1]).toBe('1 minute');
    });

    it('should use IP-based key generation', () => {
      const content = fs.readFileSync(path.join(srcDir, 'plugins/index.ts'), 'utf-8');
      expect(content).toContain('keyGenerator');
      expect(content).toContain('request.ip');
    });
  });

  describe('Login endpoints - strict rate limit (5 req/min)', () => {
    const cases = [
      { file: 'auth.routes.ts', method: 'POST', path: '/login' },
      { file: 'admin/auth.routes.ts', method: 'POST', path: '/admin/login' },
      { file: 'admin-api-auth.routes.ts', method: 'POST', path: '/api/admin/login' },
    ];
    for (const c of cases) {
      it(`${c.method} ${c.path} in ${c.file} should have rate limit <= 5 req/min`, () => {
        const rl = routeHasRateLimit(path.join(srcDir, 'routes', c.file), c.method, c.path);
        expect(rl).not.toBeNull();
        expect(rl!.max).toBeLessThanOrEqual(5);
        expect(rl!.timeWindow).toContain('minute');
      });
    }
  });

  describe('File upload endpoints - strict rate limit (10 req/min)', () => {
    const cases = [
      { file: 'file.routes.ts', method: 'POST', path: '/api/files/upload' },
      { file: 'file.routes.ts', method: 'POST', path: '/api/files/upload-temp' },
      { file: 'file.routes.ts', method: 'POST', path: '/api/files/upload-session' },
    ];
    for (const c of cases) {
      it(`${c.method} ${c.path} should have rate limit <= 10 req/min`, () => {
        const rl = routeHasRateLimit(path.join(srcDir, 'routes', c.file), c.method, c.path);
        expect(rl).not.toBeNull();
        expect(rl!.max).toBeLessThanOrEqual(10);
        expect(rl!.timeWindow).toContain('minute');
      });
    }
  });

  describe('Password & API key endpoints - strict rate limit (5 req/min)', () => {
    const cases = [
      { file: 'user.routes.ts', method: 'PUT', path: '/me/password' },
      { file: 'user.routes.ts', method: 'POST', path: '/me/apikey/regenerate' },
    ];
    for (const c of cases) {
      it(`${c.method} ${c.path} should have rate limit <= 5 req/min`, () => {
        const rl = routeHasRateLimit(path.join(srcDir, 'routes', c.file), c.method, c.path);
        expect(rl).not.toBeNull();
        expect(rl!.max).toBeLessThanOrEqual(5);
        expect(rl!.timeWindow).toContain('minute');
      });
    }
  });

  describe('Session creation - rate limited', () => {
    it('POST / should have rate limit <= 30 req/min', () => {
      const rl = routeHasRateLimit(path.join(srcDir, 'routes/session.routes.ts'), 'POST', '/');
      expect(rl).not.toBeNull();
      expect(rl!.max).toBeLessThanOrEqual(30);
      expect(rl!.timeWindow).toContain('minute');
    });
  });

  describe('Demo endpoints - rate limited', () => {
    it('POST /api/demo/session should have rate limit', () => {
      const rl = routeHasRateLimit(path.join(srcDir, 'routes/demo.routes.ts'), 'POST', '/api/demo/session');
      expect(rl).not.toBeNull();
      expect(rl!.max).toBeLessThanOrEqual(5);
    });
  });

  describe('GET endpoints do not need route-level rate limit (global covers them)', () => {
    it('GET /me in auth.routes.ts should NOT have route-level rate limit', () => {
      const rl = routeHasRateLimit(path.join(srcDir, 'routes/auth.routes.ts'), 'GET', '/me');
      expect(rl).toBeNull();
    });
  });

  describe('All sensitive route files must contain rate limit config', () => {
    const files = [
      'auth.routes.ts',
      'file.routes.ts',
      'user.routes.ts',
      'session.routes.ts',
      'demo.routes.ts',
      'admin/auth.routes.ts',
      'admin-api-auth.routes.ts',
    ];
    for (const f of files) {
      it(`${f} should have rate limit config`, () => {
        const rl = fileHasRateLimit(path.join(srcDir, 'routes', f));
        expect(rl).not.toBeNull();
      });
    }
  });
});
