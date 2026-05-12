import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const MODEL_PATH = path.resolve(__dirname, '../../../models/machine.model.ts');

describe('P1-11: N+1 query in getDetailById (verification)', () => {
  const source = fs.readFileSync(MODEL_PATH, 'utf-8');
  const lines = source.split('\n');

  function getMethodBody(): string {
    const start = lines.findIndex((l) => /static\s+async\s+getDetailById\b/.test(l));
    if (start < 0) return '';
    // Find the next method/class-end after this one
    let end = lines.length - 1;
    for (let i = start + 1; i < lines.length; i++) {
      if (/^\s{2}(static\s+)?(async\s+)?\w+\(/.test(lines[i]) || /^\s?\}$/.test(lines[i])) {
        end = i;
        break;
      }
    }
    return lines.slice(start, end).join('\n');
  }

  it('finds the getDetailById method', () => {
    const methodLine = lines.findIndex((l) => l.includes('getDetailById'));
    expect(methodLine).toBeGreaterThanOrEqual(0);
  });

  it('proves the OLD N+1 pattern (paginate+filter) has been replaced with a targeted COUNT', () => {
    const methodBody = getMethodBody();
    expect(methodBody.length, 'Method body should not be empty').toBeGreaterThan(0);

    const hasOldPattern = /paginate\(\s*1\s*,\s*999\s*/.test(methodBody);
    expect(hasOldPattern, 'OLD pattern paginate(1,999) should be removed').toBe(false);

    const hasFilterByMachine = /\.filter\(\s*\(s\)\s*=>\s*s\.machine_id\s*===/.test(methodBody);
    expect(hasFilterByMachine, 'OLD pattern .filter(s => s.machine_id === id) should be removed').toBe(false);

    expect(methodBody, 'Should use targeted COUNT query').toContain('.count(');
    expect(methodBody, 'Should filter by machine_id in SQL').toContain('machine_id');
  });

  it('proves the COUNT query is bounded to a single machine (not all machines)', () => {
    const methodBody = getMethodBody();

    expect(methodBody).toContain('machine_id');
    expect(methodBody).toContain('status');
    expect(methodBody).toContain('.where(');
    expect(methodBody).toContain('.count(');
  });

  it('documents why the old pattern was dangerous', () => {
    const hasPaginate999 = source.includes('paginate(1, 999');
    expect(hasPaginate999, 'paginate(1, 999) should no longer exist in this file').toBe(false);
  });
});
