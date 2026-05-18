import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('events.handler - appendFileSync error handling', () => {
  const SOURCE_PATH = path.resolve(__dirname, '../../../machine/session_handlers/events.handler.ts');

  it('should wrap fs.appendFileSync in try/catch', () => {
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');
    const lines = source.split('\n');

    let appendLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('fs.appendFileSync')) {
        appendLineIdx = i;
        break;
      }
    }
    expect(appendLineIdx).toBeGreaterThanOrEqual(0);

    const contextStart = Math.max(0, appendLineIdx - 5);
    const contextEnd = Math.min(lines.length - 1, appendLineIdx + 5);
    const context = lines.slice(contextStart, contextEnd + 1).join('\n');

    const hasTryBefore = context.substring(0, context.indexOf('fs.appendFileSync')).includes('try');
    const hasCatchAfter = context.substring(context.indexOf('fs.appendFileSync')).includes('catch');

    expect(hasTryBefore || context.includes('try')).toBe(true);
    expect(hasCatchAfter).toBe(true);
  });

  it('should log error when appendFileSync fails', () => {
    const source = fs.readFileSync(SOURCE_PATH, 'utf-8');
    const lines = source.split('\n');

    let appendLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('fs.appendFileSync')) {
        appendLineIdx = i;
        break;
      }
    }

    const contextEnd = Math.min(lines.length - 1, appendLineIdx + 10);
    const afterContext = lines.slice(appendLineIdx, contextEnd + 1).join('\n');

    expect(afterContext).toMatch(/catch/);
    expect(afterContext).toMatch(/logger\.(error|warn)/);
  });
});
