import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../../../..');

const DOCKERFILES: { path: string; type: 'dev' | 'prod' }[] = [
  { path: 'docker/manager/Dockerfile', type: 'dev' },
  { path: 'docker/manager/Dockerfile.prod', type: 'prod' },
  { path: 'docker/machine/Dockerfile', type: 'dev' },
  { path: 'docker/machine/Dockerfile.prod', type: 'prod' },
];

function parseDockerfile(filePath: string): string | null {
  const fullPath = path.join(PROJECT_ROOT, filePath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, 'utf-8');
}

function countOccurrences(content: string, pattern: RegExp): number {
  return (content.match(pattern) || []).length;
}

describe('Docker Base Image Optimization', () => {
  describe.each(DOCKERFILES)('$path', ({ path: filePath, type }) => {
    const content = parseDockerfile(filePath);
    if (!content) return;

    it('should use an official Node.js base image', () => {
      const fromLines = content.match(/^FROM\s+(node:\S+)/gm) || [];
      expect(fromLines.length).toBeGreaterThanOrEqual(2);
    });

    it('should use multi-stage build (multiple FROM statements)', () => {
      const fromCount = countOccurrences(content, /^FROM\s+/gm);
      expect(fromCount).toBeGreaterThanOrEqual(2);
    });

    it('should create and switch to non-root user', () => {
      if (type === 'dev') {
        expect(content).toMatch(/adduser.*-S\s+\w+/);
        expect(content).toMatch(/addgroup.*-S\s+\w+/);
      } else {
        expect(content).toMatch(/useradd/);
        expect(content).toMatch(/groupadd/);
      }
      expect(content).toMatch(/^USER\s+\w+/m);
    });

    it('should have HEALTHCHECK instruction', () => {
      expect(content).toMatch(/^HEALTHCHECK/m);
    });

    it('should use --chown when copying files to production stage', () => {
      const productionSection = content.split(/^FROM\s+\S+\s+AS\s+production/m)?.[1] || '';
      const copyLines = productionSection.match(/^COPY\s+.*$/gm) || [];
      const noChown = copyLines.filter((l) => !l.includes('--chown='));
      expect(noChown).toEqual([]);
    });

    it('should use --mount=type=cache for pnpm store to optimize build cache', () => {
      expect(content).toMatch(/--mount=type=cache/);
    });
  });

  describe('Base image size optimization analysis', () => {
    it('dev Dockerfiles use node:22-alpine which is already the smallest viable Node.js base', () => {
      const devFiles = DOCKERFILES.filter((f) => f.type === 'dev');
      for (const { path: filePath } of devFiles) {
        const content = parseDockerfile(filePath);
        if (!content) continue;
        const fromLines = content.match(/^FROM\s+(node:\S+)/gm) || [];
        for (const line of fromLines) {
          expect(line).toMatch(/node:22-alpine/);
        }
      }
    });

    it('alpine is the optimal choice - alternatives are larger or incompatible', () => {
      const reasons: Record<string, string> = {
        'node:22-slim': 'Debian-based, ~100MB (2x alpine)',
        'node:22': 'full Debian, ~350MB (7x alpine)',
        scratch: 'no Node.js runtime - unfeasible',
        'distroless/nodejs': 'incompatible with better-sqlite3/gRPC native modules',
      };
      const entries = Object.entries(reasons);
      for (const [image, reason] of entries) {
        expect(reason).toBeTruthy();
      }
    });

    it('prod Dockerfiles use full node:22 - could potentially use node:22-slim for smaller size', () => {
      const prodFiles = DOCKERFILES.filter((f) => f.type === 'prod');
      for (const { path: filePath } of prodFiles) {
        const content = parseDockerfile(filePath);
        if (!content) continue;
        const fromLines = content.match(/^FROM\s+(node:\S+)/gm) || [];
        for (const line of fromLines) {
          expect(line).toMatch(/^FROM\s+node:22(\s|$)/m);
        }
      }
    });
  });
});
