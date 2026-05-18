import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import path from 'path';
import fs from 'fs';

const SOURCE_PATH = path.resolve(__dirname, '../../../controllers/file.controller.ts');

describe('file.controller - P1 fixes', () => {
  const source = fs.readFileSync(SOURCE_PATH, 'utf-8');
  const lines = source.split('\n');

  describe('machine_id null guard', () => {
    it('should not use non-null assertion (!) on session.machine_id', () => {
      const hasNonNullAssertion = lines.some(
        (line) => line.includes('session.machine_id!') && !line.trim().startsWith('//')
      );
      expect(hasNonNullAssertion).toBe(false);
    });

    it('should check machine_id before using it', () => {
      expect(source).toMatch(/machine_id/);
      const machineIdUsages = lines.filter(
        (l) =>
          l.includes('machine_id') &&
          !l.trim().startsWith('//') &&
          !l.includes('machine_id !==') &&
          !l.includes('machine_id ===') &&
          !l.includes('machine_id?')
      );

      const hasGuard = source.match(/if\s*\(\s*!.*machine_id|machine_id\s*===?\s*null|!session\.machine_id/);
      expect(hasGuard).toBeTruthy();
    });
  });

  describe('silent catch blocks', () => {
    it('should log in URL parsing catch block (around L212-214)', () => {
      const urlCatchIdx = lines.findIndex((l) => l.includes('URL parsing failed'));
      if (urlCatchIdx === -1) {
        const catchBlockLine = lines.findIndex((l, i) => i > 200 && i < 220 && l.includes('catch'));
        const contextLines = lines.slice(catchBlockLine, catchBlockLine + 3).join('\n');
        expect(contextLines).toMatch(/logger\./);
        return;
      }
      const catchContext = lines.slice(urlCatchIdx, urlCatchIdx + 3).join('\n');
      expect(catchContext).toMatch(/logger\./);
    });

    it('should log in cleanupExpiredUploads catch block (around L346-348)', () => {
      const cleanupFnStart = lines.findIndex((l) => l.includes('cleanupExpiredUploads'));
      expect(cleanupFnStart).toBeGreaterThanOrEqual(0);

      const fnBody = lines.slice(cleanupFnStart).join('\n');
      const catchIdx = fnBody.indexOf('catch');
      expect(catchIdx).toBeGreaterThanOrEqual(0);

      const afterCatch = fnBody.substring(catchIdx, catchIdx + 200);
      expect(afterCatch).toMatch(/logger\./);
    });
  });
});
