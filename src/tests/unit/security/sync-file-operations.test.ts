import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const CONTROLLER_PATH = path.resolve(__dirname, '../../../controllers/file.controller.ts');

describe('P1-12: Synchronous file operations blocking event loop', () => {
  const source = fs.readFileSync(CONTROLLER_PATH, 'utf-8');
  const lines = source.split('\n');

  // Find all *Sync fs calls
  const syncCalls: { line: number; call: string; inHandler: boolean }[] = [];
  const handlerNames = [
    'uploadFile',
    'uploadTempFile',
    'getFileList',
    'cleanupTempFiles',
    'uploadFileForSession',
    'cleanupExpiredUploads',
  ];

  // Track which lines are inside request handlers
  const handlerRanges: { name: string; start: number; end: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    for (const handler of handlerNames) {
      const handlerRegex = new RegExp(`export\\s+async\\s+function\\s+${handler}\\b`);
      if (handlerRegex.test(lines[i])) {
        // Find closing brace
        let depth = 0;
        let end = i;
        for (let j = i; j < lines.length; j++) {
          for (const ch of lines[j]) {
            if (ch === '{') depth++;
            if (ch === '}') depth--;
          }
          if (depth === 0) {
            end = j;
            break;
          }
        }
        handlerRanges.push({ name: handler, start: i + 1, end: end + 1 });
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const syncMatch = lines[i].match(/fs\.\w+Sync\(/g);
    if (syncMatch) {
      const inHandler = handlerRanges.some((r) => i + 1 > r.start && i + 1 < r.end);
      syncCalls.push({
        line: i + 1,
        call: syncMatch[0],
        inHandler,
      });
    }
  }

  it('finds synchronous fs calls in the file controller', () => {
    expect(syncCalls.length, 'Should have at least one *Sync fs call').toBeGreaterThan(0);
  });

  it('proves sync calls exist inside request handlers (not just module-level)', () => {
    const handlerSyncCalls = syncCalls.filter((c) => c.inHandler);
    expect(handlerSyncCalls.length, 'Should have *Sync calls inside request handlers').toBeGreaterThan(0);

    // Specific calls expected in handlers:
    // getFileList: readdirSync, statSync (inside map)
    // cleanupTempFiles: existsSync, readdirSync, statSync, unlinkSync (inside loop)
    const uniqueCalls = [...new Set(handlerSyncCalls.map((c) => c.call))];
    expect(uniqueCalls).toContain('fs.readdirSync(');
    expect(uniqueCalls).toContain('fs.statSync(');
    expect(uniqueCalls).toContain('fs.unlinkSync(');
  });

  it('documents each blocking call and its location', () => {
    const handlerSyncCalls = syncCalls.filter((c) => c.inHandler);
    const moduleSyncCalls = syncCalls.filter((c) => !c.inHandler);

    // Module-level (runs once at import — less critical but still blocks)
    expect(moduleSyncCalls.length).toBeGreaterThanOrEqual(2); // existsSync + mkdirSync x2

    // Handler-level (blocks per request — critical)
    expect(handlerSyncCalls.length).toBeGreaterThanOrEqual(4); // readdirSync, statSync, existsSync, unlinkSync
  });

  it('shows the correct async alternatives', () => {
    const handlerSyncCalls = syncCalls.filter((c) => c.inHandler);

    const alternatives: Record<string, string> = {
      'fs.readdirSync(': 'await fs.promises.readdir(',
      'fs.statSync(': 'await fs.promises.stat(',
      'fs.existsSync(': 'await fs.promises.access(',
      'fs.unlinkSync(': 'await fs.promises.unlink(',
      'fs.mkdirSync(': 'await fs.promises.mkdir(',
    };

    for (const call of handlerSyncCalls) {
      expect(
        alternatives[call.call],
        `Blocking call "${call.call}" at line ${call.line} should use async alternative`
      ).toBeDefined();
    }
  });
});
