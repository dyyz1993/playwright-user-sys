/**
 * P1-14: Empty Catch Blocks Throughout Codebase Proof-of-Concept
 *
 * PROOF OF ISSUE:
 * The codebase contains numerous empty catch blocks (or catch blocks with only
 * whitespace/comments). These silently swallow errors, making debugging impossible
 * and hiding real failures.
 *
 * An empty catch block means:
 * - Errors are silently discarded with no logging
 * - Failures are invisible to monitoring and alerting
 * - Debugging becomes extremely difficult
 * - Data corruption or inconsistency can go unnoticed
 *
 * This test scans all .ts files under src/ and counts catch blocks that
 * contain only whitespace or comments (no actual error handling code).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../../..');

interface EmptyCatch {
  file: string;
  line: number;
  preview: string;
}

function walkDir(dir: string, ext: string[]): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
        results.push(...walkDir(fullPath, ext));
      }
    } else if (ext.some((e) => entry.name.endsWith(e))) {
      if (!entry.name.includes('.test.') && !entry.name.includes('.spec.') && !entry.name.includes('.d.ts')) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

function findEmptyCatchBlocks(sourceFiles: string[]): EmptyCatch[] {
  const emptyCatches: EmptyCatch[] = [];

  // Pattern: catch (...) { } with only whitespace/comments until closing }
  // We need to handle multi-line catch blocks
  const catchPattern = /\bcatch\s*\(\s*\w+\s*\)\s*\{/g;

  for (const filePath of sourceFiles) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const relPath = path.relative(ROOT, filePath);

    let match: RegExpExecArray | null;
    while ((match = catchPattern.exec(content)) !== null) {
      const startPos = match.index;
      const startLine = content.substring(0, startPos).split('\n').length;

      // Find the matching closing brace
      let depth = 1;
      let pos = startPos + match[0].length;
      let bodyChars = '';

      while (depth > 0 && pos < content.length) {
        const ch = content[pos];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        else bodyChars += ch;
        pos++;
      }

      // Strip comments: // ... and /* ... */
      const stripped = bodyChars
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .trim();

      if (stripped.length === 0) {
        const previewLines = lines
          .slice(startLine - 1, startLine + 4)
          .join('\n')
          .trim();
        emptyCatches.push({
          file: relPath,
          line: startLine,
          preview: previewLines.substring(0, 200),
        });
      }
    }
  }

  return emptyCatches;
}

function findLogOnlyCatchBlocks(sourceFiles: string[]): EmptyCatch[] {
  const logOnlyCatches: EmptyCatch[] = [];
  const catchPattern = /\bcatch\s*\(\s*\w+\s*\)\s*\{/g;

  for (const filePath of sourceFiles) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const relPath = path.relative(ROOT, filePath);

    let match: RegExpExecArray | null;
    while ((match = catchPattern.exec(content)) !== null) {
      const startPos = match.index;
      const startLine = content.substring(0, startPos).split('\n').length;

      let depth = 1;
      let pos = startPos + match[0].length;
      let body = '';

      while (depth > 0 && pos < content.length) {
        const ch = content[pos];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        else body += ch;
        pos++;
      }

      const stripped = body
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .trim();

      // Check if the body ONLY contains logging (logger.error, logger.warn, console.error)
      const statements = stripped
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const allLogging = statements.every(
        (s) => /^logger\.(error|warn|info|debug)\(/.test(s) || /^console\.(error|warn|log)\(/.test(s)
      );

      const hasRethrow = stripped.includes('throw') || stripped.includes('reject(');

      if (allLogging && !hasRethrow && statements.length > 0) {
        logOnlyCatches.push({
          file: relPath,
          line: startLine,
          preview: stripped.substring(0, 150),
        });
      }
    }
  }

  return logOnlyCatches;
}

describe('P1-14: Empty catch blocks throughout codebase', () => {
  let sourceFiles: string[];
  let emptyCatches: EmptyCatch[];
  let logOnlyCatches: EmptyCatch[];

  beforeAll(() => {
    sourceFiles = walkDir(path.join(ROOT, 'src'), ['.ts']);
    emptyCatches = findEmptyCatchBlocks(sourceFiles);
    logOnlyCatches = findLogOnlyCatchBlocks(sourceFiles);
  });

  it('should prove that empty or log-only catch blocks exist in the codebase', () => {
    // Truly empty catch blocks
    expect(emptyCatches.length).toBeGreaterThan(0);

    // "Log-only" catches that swallow errors without rethrowing are also problematic
    expect(logOnlyCatches.length).toBeGreaterThan(0);

    // Combined: total catch blocks that silently swallow errors
    const totalProblematic = emptyCatches.length + logOnlyCatches.length;
    expect(totalProblematic).toBeGreaterThanOrEqual(20);
  });

  it('should report empty catch blocks and log-only catches combined', () => {
    const total = emptyCatches.length + logOnlyCatches.length;

    expect(total).toBeGreaterThanOrEqual(20);

    const affectedFiles = [...new Set([...emptyCatches.map((e) => e.file), ...logOnlyCatches.map((e) => e.file)])];

    expect(affectedFiles.length).toBeGreaterThanOrEqual(5);

    // Report for visibility
    console.log('\n=== Empty catch blocks found ===');
    for (const ec of emptyCatches) {
      console.log(`  ${ec.file}:${ec.line}`);
    }
    console.log(`\nEmpty total: ${emptyCatches.length}`);
    console.log('\n=== Log-only catch blocks (no rethrow) ===');
    for (const lc of logOnlyCatches.slice(0, 30)) {
      console.log(`  ${lc.file}:${lc.line}`);
    }
    console.log(`\nLog-only total: ${logOnlyCatches.length}`);
    console.log(`\nGrand total problematic: ${total} in ${affectedFiles.length} files\n`);
  });

  it('should prove that catch blocks with only logging (no rethrow) are also prevalent', () => {
    // Log-only catch blocks are better than empty ones, but they still
    // swallow errors silently. The caller never knows the operation failed.
    expect(logOnlyCatches.length).toBeGreaterThan(0);

    console.log('\n=== Log-only catch blocks (no rethrow) ===');
    for (const lc of logOnlyCatches.slice(0, 20)) {
      console.log(`  ${lc.file}:${lc.line}`);
    }
    console.log(`\nTotal: ${logOnlyCatches.length} log-only catch blocks\n`);
  });

  it('should show specific examples of empty catch blocks', () => {
    // Ensure we have concrete evidence
    expect(emptyCatches.length).toBeGreaterThan(0);

    // Show first few examples with file:line
    const examples = emptyCatches.slice(0, 5);
    for (const ex of examples) {
      expect(ex.file).toBeTruthy();
      expect(ex.line).toBeGreaterThan(0);
    }
  });

  it('should demonstrate what a proper catch block looks like vs empty', () => {
    // BAD: empty catch block (as found in codebase)
    function badExample(): void {
      try {
        JSON.parse('invalid');
      } catch (_e) {
        // silently swallowed - error is lost forever
      }
    }

    // GOOD: proper error handling
    function goodExample(): { success: boolean; error?: string } {
      try {
        JSON.parse('invalid');
        return { success: true };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        // Options: rethrow, return error result, or at minimum log + propagate
        return { success: false, error: message };
      }
    }

    badExample();
    const result = goodExample();
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('should categorize empty catches by directory to identify hotspots', () => {
    const byDir = new Map<string, number>();
    for (const ec of emptyCatches) {
      const dir = path.dirname(ec.file);
      byDir.set(dir, (byDir.get(dir) || 0) + 1);
    }

    const sorted = [...byDir.entries()].sort((a, b) => b[1] - a[1]);

    console.log('\n=== Empty catch blocks by directory ===');
    for (const [dir, count] of sorted) {
      console.log(`  ${dir}: ${count}`);
    }

    expect(sorted.length).toBeGreaterThan(0);
  });
});
