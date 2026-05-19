import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');

const COMPOSE_FILES = [
  'docker-compose.yml',
  'docker-compose.full.yml',
  'docker/docker-compose.prod.yml',
  'docker/docker-compose.dev.yml',
  'docker/docker-compose.e2e.yml',
];

const DOCKERFILES = [
  'docker/manager/Dockerfile',
  'docker/manager/Dockerfile.prod',
  'docker/machine/Dockerfile',
  'docker/machine/Dockerfile.prod',
];

function parseCompose(filePath: string) {
  const fullPath = path.join(PROJECT_ROOT, filePath);
  if (!fs.existsSync(fullPath)) return null;
  const content = fs.readFileSync(fullPath, 'utf-8');
  return yaml.parse(content);
}

function parseDockerfile(filePath: string) {
  const fullPath = path.join(PROJECT_ROOT, filePath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, 'utf-8');
}

function parseHealthcheckTime(value: string): number {
  const match = value.match(/^(\d+)(s|m)$/);
  if (!match) return 0;
  const num = parseInt(match[1], 10);
  return match[2] === 'm' ? num * 60 : num;
}

describe('Docker Compose Configuration', () => {
  describe('logging configuration', () => {
    COMPOSE_FILES.forEach((file) => {
      describe(file, () => {
        it('should have logging config on every active service', () => {
          const compose = parseCompose(file);
          if (!compose || !compose.services) return;

          const services = Object.entries(compose.services) as [string, Record<string, unknown>][];
          const violations: string[] = [];

          for (const [name, svc] of services) {
            if (!svc.logging) {
              violations.push(name);
            }
          }

          expect(violations, `Services missing logging: ${violations.join(', ')}`).toEqual([]);
        });

        it('should use json-file driver with max-size and max-file', () => {
          const compose = parseCompose(file);
          if (!compose || !compose.services) return;

          const services = Object.entries(compose.services) as [string, Record<string, unknown>][];
          const violations: string[] = [];

          for (const [name, svc] of services) {
            if (!svc.logging) continue;
            const opts = svc.logging.options || {};
            const maxSize = parseInt(String(opts['max-size'] || '0'), 10);
            const maxFile = parseInt(String(opts['max-file'] || '0'), 10);

            if (svc.logging.driver !== 'json-file') {
              violations.push(`${name}: driver is ${svc.logging.driver}`);
            }
            if (maxSize <= 0 || maxSize > 100) {
              violations.push(`${name}: invalid max-size "${opts['max-size']}"`);
            }
            if (maxFile <= 0 || maxFile > 10) {
              violations.push(`${name}: invalid max-file "${opts['max-file']}"`);
            }
          }

          expect(violations, violations.join('; ')).toEqual([]);
        });
      });
    });
  });

  describe('healthcheck start_period', () => {
    COMPOSE_FILES.forEach((file) => {
      describe(file, () => {
        it('should have start_period >= 30s for all services with healthcheck', () => {
          const compose = parseCompose(file);
          if (!compose || !compose.services) return;

          const services = Object.entries(compose.services) as [string, Record<string, unknown>][];
          const violations: string[] = [];

          for (const [name, svc] of services) {
            if (!svc.healthcheck) continue;
            const sp = svc.healthcheck.start_period;
            if (!sp) continue;

            const seconds = parseHealthcheckTime(sp);
            if (seconds < 30) {
              violations.push(`${name}: start_period=${sp} (< 30s)`);
            }
          }

          expect(violations, violations.join('; ')).toEqual([]);
        });
      });
    });

    DOCKERFILES.forEach((file) => {
      describe(file, () => {
        it('should have HEALTHCHECK start-period >= 30s', () => {
          const content = parseDockerfile(file);
          if (!content) return;

          const matches = content.matchAll(/HEALTHCHECK[^C]*--start-period=(\S+)/g);
          const violations: string[] = [];

          for (const match of matches) {
            const sp = match[1];
            const seconds = parseHealthcheckTime(sp);
            if (seconds < 30) {
              violations.push(`start-period=${sp} (< 30s)`);
            }
          }

          expect(violations, violations.join('; ')).toEqual([]);
        });
      });
    });
  });
});
