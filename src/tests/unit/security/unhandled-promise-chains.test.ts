/**
 * Security: Unhandled Promise Chains (.then() without .catch())
 *
 * Scans all .ts source files for `.then()` calls that are not followed
 * by a `.catch()` and are not inside a try/catch or awaited.
 *
 * Unhandled rejections can crash the process or silently lose errors.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../../..');

function walkDir(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(full));
    } else if (entry.isFile() && full.endsWith('.ts') && !full.includes('.test.')) {
      results.push(full);
    }
  }
  return results;
}

interface UnhandledThen {
  file: string;
  line: number;
  snippet: string;
}

function findUnhandledThens(srcRoot: string): UnhandledThen[] {
  const files = walkDir(srcRoot);
  const issues: UnhandledThen[] = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.includes('.then(')) continue;

      if (line.includes('await ')) continue;

      let inTryBlock = false;
      for (let j = i - 1; j >= Math.max(0, i - 20); j--) {
        if (/\btry\s*\{/.test(lines[j])) {
          inTryBlock = true;
          break;
        }
        if (/^\s*(async\s+)?(function |export |const |let |class )/.test(lines[j]) && j < i) {
          break;
        }
      }

      let hasCatch = false;
      let chainDepth = 0;
      let startedChain = false;
      for (let j = i; j < Math.min(lines.length, i + 80); j++) {
        const trimmed = lines[j];
        if (j >= i && /\.catch\s*\(/.test(trimmed) && (j > i || trimmed.indexOf('.catch') > trimmed.indexOf('.then'))) {
          hasCatch = true;
          break;
        }
        for (let ci = 0; ci < trimmed.length; ci++) {
          const ch = trimmed[ci];
          if (ch === '(') chainDepth++;
          else if (ch === ')') {
            chainDepth--;
            if (chainDepth < 0 && startedChain) break;
          }
        }
        if (j === i) startedChain = true;
        if (trimmed.trimEnd().endsWith(';') && chainDepth <= 0 && j > i) break;
      }

      if (!hasCatch && !inTryBlock) {
        issues.push({
          file: path.relative(ROOT, file),
          line: i + 1,
          snippet: line.trim().slice(0, 80),
        });
      }
    }
  }

  return issues;
}

describe('Unhandled Promise Chains', () => {
  it('every .then() should have a .catch() or be inside try/catch', () => {
    const issues = findUnhandledThens(path.join(ROOT, 'src'));

    if (issues.length > 0) {
      const details = issues.map((i) => `  ${i.file}:${i.line} — ${i.snippet}`).join('\n');
      expect.fail(`Found ${issues.length} .then() chain(s) without .catch():\n${details}`);
    }

    expect(issues).toHaveLength(0);
  });
});
