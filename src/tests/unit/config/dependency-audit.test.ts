import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const KNOWN_DYNAMIC_DEPS = new Set(['better-sqlite3', 'mysql2', 'pino', 'pino-pretty']);

describe('dependency audit', () => {
  it('should not contain clearly unused devDependencies', () => {
    const pkgPath = resolve(process.cwd(), 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

    const removedDeps = ['supertest', '@types/supertest', 'axios'];

    for (const dep of removedDeps) {
      expect(pkg.devDependencies?.[dep], `${dep} should have been removed from devDependencies`).toBeUndefined();
    }
  });

  it('should keep known dynamic dependencies', () => {
    const pkgPath = resolve(process.cwd(), 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

    for (const dep of KNOWN_DYNAMIC_DEPS) {
      expect(pkg.dependencies?.[dep], `${dep} is dynamically loaded and must stay in dependencies`).toBeDefined();
    }
  });
});
