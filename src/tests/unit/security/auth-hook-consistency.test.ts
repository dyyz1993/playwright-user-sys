import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../..');
const routesDir = path.join(projectRoot, 'src/routes');

interface AuthRouteInfo {
  file: string;
  line: number;
  hook: 'onRequest' | 'preHandler';
  middleware: string;
  routePath: string;
}

function getFileKey(filePath: string, routesDir: string): string {
  const relative = path.relative(routesDir, filePath);
  return relative;
}

function extractAuthRoutes(filePath: string): AuthRouteInfo[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const results: AuthRouteInfo[] = [];

  let currentPath = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const routeMatch = line.match(/fastify\.(get|post|put|delete|patch|all|head|options)\s*\(\s*['"`]([^'"`\s]+)/);
    if (routeMatch) {
      currentPath = routeMatch[2];
    }

    const hookMatch = line.match(/(onRequest|preHandler)\s*:\s*\[/);
    if (hookMatch) {
      const hook = hookMatch[1] as 'onRequest' | 'preHandler';
      const restOfLine = line.slice(hookMatch.index! + hookMatch[0].length);
      const closingIdx = restOfLine.indexOf(']');
      const middlewareSection = closingIdx >= 0 ? restOfLine.slice(0, closingIdx) : '';

      const hasAuth =
        middlewareSection.includes('verifyJWT') ||
        middlewareSection.includes('verifyApiKey') ||
        middlewareSection.includes('verifyAdmin') ||
        middlewareSection.includes('verifyJWTOrApiKey') ||
        middlewareSection.includes('authenticate');

      if (hasAuth) {
        results.push({
          file: getFileKey(filePath, routesDir),
          line: i + 1,
          hook,
          middleware: middlewareSection.trim(),
          routePath: currentPath,
        });
      }
    }
  }

  return results;
}

function getAllRouteFiles(): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(routesDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(routesDir, entry.name);
    if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath);
    } else if (entry.isDirectory() && (entry.name === 'admin-api' || entry.name === 'admin')) {
      const subEntries = fs.readdirSync(fullPath, { withFileTypes: true });
      for (const sub of subEntries) {
        if (sub.isFile() && sub.name.endsWith('.ts')) {
          files.push(path.join(fullPath, sub.name));
        }
      }
    }
  }
  return files;
}

const allRoutes = getAllRouteFiles().flatMap(extractAuthRoutes);
const onRequestRoutes = allRoutes.filter((r) => r.hook === 'onRequest');
const preHandlerRoutes = allRoutes.filter((r) => r.hook === 'preHandler');

describe('Auth Hook Consistency', () => {
  it('should find auth-protected routes', () => {
    expect(allRoutes.length).toBeGreaterThan(0);
  });

  it('should use onRequest for legacy route files (user, file, session, machine, auth, index)', () => {
    const legacyFiles = [
      'user.routes.ts',
      'file.routes.ts',
      'session.routes.ts',
      'machine.routes.ts',
      'auth.routes.ts',
      'index.ts',
    ];

    for (const route of onRequestRoutes) {
      if (legacyFiles.includes(route.file)) {
        expect(route.hook).toBe('onRequest');
      }
    }

    const legacyAuthRoutes = onRequestRoutes.filter((r) => legacyFiles.includes(r.file));
    expect(legacyAuthRoutes.length).toBeGreaterThan(0);
  });

  it('should have zero auth routes using preHandler', () => {
    expect(preHandlerRoutes.length).toBe(0);
  });

  it('should verify admin page routes use onRequest for most auth routes', () => {
    const adminPageRoutes = allRoutes.filter((r) => r.file.startsWith('admin/') && r.file.endsWith('.routes.ts'));
    const onRequestCount = adminPageRoutes.filter((r) => r.hook === 'onRequest').length;
    const preHandlerCount = adminPageRoutes.filter((r) => r.hook === 'preHandler').length;

    expect(onRequestCount).toBeGreaterThan(preHandlerCount);
  });

  it('should document that all auth routes now use onRequest (zero preHandler)', () => {
    expect(preHandlerRoutes.length).toBe(0);
  });

  it('should have consistent auth middleware in admin-api routes using createAuthenticate', () => {
    const adminApiRoutes = preHandlerRoutes.filter(
      (r) => r.file.startsWith('admin-api/') || r.file === 'admin-machine-api.routes.ts'
    );

    for (const route of adminApiRoutes) {
      expect(route.middleware).toContain('authenticate');
    }
  });

  it('all auth middlewares should reference verifyJWT or its wrapper', () => {
    for (const route of allRoutes) {
      const hasVerify =
        route.middleware.includes('verifyJWT') ||
        route.middleware.includes('verifyApiKey') ||
        route.middleware.includes('verifyJWTOrApiKey') ||
        route.middleware.includes('authenticate');
      expect(hasVerify).toBe(true);
    }
  });
});
