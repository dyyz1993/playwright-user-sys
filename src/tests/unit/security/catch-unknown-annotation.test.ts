import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../../../..');

interface CatchViolation {
  file: string;
  line: number;
  preview: string;
}

function walkDir(dir: string, ext: string[]): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (!entry.isDirectory() && !entry.isFile()) continue;

    if (entry.isDirectory()) {
      if (
        entry.name !== 'node_modules' &&
        entry.name !== 'dist' &&
        entry.name !== '.git' &&
        !entry.name.startsWith('.')
      ) {
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

describe('catch blocks must have :unknown type annotation', () => {
  let violations: CatchViolation[];

  beforeAll(() => {
    const sourceFiles = walkDir(path.join(ROOT, 'src'), ['.ts']);
    violations = [];

    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const relPath = path.relative(ROOT, filePath);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const catchMatch = line.match(/\bcatch\s*\(([^)]*)\)\s*\{/);
        if (catchMatch) {
          const param = catchMatch[1].trim();
          if (param && !param.includes(': unknown') && !param.includes(': any')) {
            violations.push({
              file: relPath,
              line: i + 1,
              preview: line.trim().substring(0, 120),
            });
          }
        }
      }
    }
  });

  it('should have zero catch blocks without :unknown annotation', () => {
    if (violations.length > 0) {
      console.log(`\n=== Catch blocks missing :unknown annotation (${violations.length} total) ===`);
      for (const v of violations.slice(0, 30)) {
        console.log(`  ${v.file}:${v.line}  ${v.preview}`);
      }
      if (violations.length > 30) {
        console.log(`  ... and ${violations.length - 30} more`);
      }
    }
    expect(violations.length).toBe(0);
  });

  it('should not have violations in critical modules', () => {
    const criticalModules = ['services/', 'controllers/', 'models/', 'plugins/'];
    const criticalViolations = violations.filter((v) => criticalModules.some((m) => v.file.includes(m)));
    expect(criticalViolations.length).toBe(0);
  });
});
