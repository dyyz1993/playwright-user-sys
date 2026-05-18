import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC_ROOT = path.resolve(__dirname, '../../../..');

function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      results.push(full);
    }
  }
  return results;
}

const routeDirs = [path.join(SRC_ROOT, 'routes')];

const routeFiles = routeDirs.flatMap(collectTsFiles);

describe('error response format consistency', () => {
  it('every error .send() in route files must include { success: false }', () => {
    const violations: string[] = [];

    for (const file of routeFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const hasErrorSend =
          /\.(status|code)\(\d{3}\)\.send\(/.test(line) &&
          !/success:\s*true/.test(line) &&
          !/text\/html/.test(line) &&
          !/csvContent/.test(line) &&
          !/send\(html/.test(line) &&
          !/send\(htmlContent/.test(line);

        if (!hasErrorSend) continue;

        const isLiteralObject = /\.send\(\{/.test(line);
        if (!isLiteralObject) {
          const isHelperCall = /sendError|logAndSendError|sendSuccess|sendPaginated|sendCreated/.test(line);
          if (!isHelperCall) {
            violations.push(`${path.relative(SRC_ROOT, file)}:${i + 1}: ${line.trim()}`);
          }
          continue;
        }

        const hasSuccessFalse = /success:\s*false/.test(line);
        if (!hasSuccessFalse) {
          violations.push(`${path.relative(SRC_ROOT, file)}:${i + 1}: ${line.trim()}`);
        }
      }
    }

    expect(violations, `Non-standard error responses:\n${violations.join('\n')}`).toEqual([]);
  });

  it('every error response must have an "error" string field', () => {
    const violations: string[] = [];

    for (const file of routeFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (!/success:\s*false/.test(line)) continue;
        if (!/\.send\(\{/.test(line)) continue;

        if (!/error:/.test(line)) {
          violations.push(`${path.relative(SRC_ROOT, file)}:${i + 1}: ${line.trim()}`);
        }
      }
    }

    expect(violations, `Error responses missing "error" field:\n${violations.join('\n')}`).toEqual([]);
  });
});
