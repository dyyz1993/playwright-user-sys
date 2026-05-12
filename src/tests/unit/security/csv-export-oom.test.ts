import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SERVICE_PATH = path.resolve(__dirname, '../../../services/user.service.ts');

describe('P1-15: CSV export memory risk (verification)', () => {
  const source = fs.readFileSync(SERVICE_PATH, 'utf-8');
  const lines = source.split('\n');

  it('finds the hardcoded limit in exportUsersCsv', () => {
    const limitLine = lines.find((l) => l.includes("limit: '10000'"));
    expect(limitLine, "Should find limit: '10000' pattern").toBeDefined();
  });

  it('proves all rows are loaded into a single array before processing', () => {
    const exportStart = lines.findIndex((l) => l.includes('exportUsersCsv'));
    expect(exportStart).toBeGreaterThanOrEqual(0);

    const findAllLine = lines.findIndex((l, i) => i > exportStart && l.includes('UserModel.findAll'));
    expect(findAllLine).toBeGreaterThan(exportStart);

    const itemsLine = lines.findIndex((l, i) => i > findAllLine && l.includes('= result.items'));
    expect(itemsLine, 'Should assign result.items (loads all into memory)').toBeGreaterThan(findAllLine);
  });

  it('proves iteration is synchronous with for...of (no streaming)', () => {
    const exportStart = lines.findIndex((l) => l.includes('exportUsersCsv'));
    const funcBody = extractFunctionBody(lines, exportStart);

    expect(funcBody).toContain('for (const user of users)');
    expect(funcBody).toContain('csvRows.push(');
    expect(funcBody).toContain('csvRows.join(');
  });

  it('documents the remaining risk: 10K rows still loaded entirely in memory', () => {
    const limitMatch = source.match(/limit:\s*'(\d+)'/);
    expect(limitMatch).not.toBeNull();

    const limit = parseInt(limitMatch?.[1] ?? '0', 10);
    expect(limit).toBe(10_000);

    // 10K is better than 1M but still loads all rows into memory
    // Estimation: ~500 bytes/user × 10K = ~5MB + CSV string ~2MB = ~7MB peak
    // For a true scalable solution, should use knex .stream() or cursor pagination
  });

  it('proves no streaming mechanism exists', () => {
    const exportStart = lines.findIndex((l) => l.includes('exportUsersCsv'));
    const funcBody = extractFunctionBody(lines, exportStart);

    expect(funcBody).not.toContain('stream');
    expect(funcBody).not.toContain('cursor');
    expect(funcBody).not.toContain('chunk');
    expect(funcBody).not.toContain('yield');
    expect(funcBody).not.toContain('Transform');
    expect(funcBody).not.toContain('Readable');
    expect(funcBody).not.toContain('pipeline');
  });
});

function extractFunctionBody(lines: string[], startIdx: number): string {
  let depth = 0;
  let end = startIdx;
  for (let i = startIdx; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
    }
    if (depth === 0 && i > startIdx) {
      end = i;
      break;
    }
  }
  return lines.slice(startIdx, end + 1).join('\n');
}
