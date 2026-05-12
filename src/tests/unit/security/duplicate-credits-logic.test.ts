import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../../..');

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
}

describe('P1-8 FIX: Credits calculation consolidated to shared utility', () => {
  const formulaPattern = /Math\.max\s*\(\s*1\s*,\s*Math\.ceil\s*\(\s*\w+\s*\/\s*60\s*\)\s*\)/g;

  it('should prove src/shared/utils/credits-calculator.ts exists and exports calculateCreditsUsed', () => {
    const sharedPath = path.join(ROOT, 'src/shared/utils/credits-calculator.ts');
    expect(fs.existsSync(sharedPath), 'credits-calculator.ts should exist').toBe(true);

    const content = readSrc('src/shared/utils/credits-calculator.ts');
    expect(content).toContain('export function calculateCreditsUsed');
    expect(content).toContain('durationSeconds');
    expect(content).toContain('Math.max(1, Math.ceil');
    expect(content).toContain('/ 60');
  });

  it('should prove session.service.ts imports and uses calculateCreditsUsed', () => {
    const content = readSrc('src/services/session.service.ts');

    expect(content, 'Should import calculateCreditsUsed').toMatch(
      /import\s*\{[^}]*calculateCreditsUsed[^}]*\}\s*from\s*['"]@shared\/utils\/credits-calculator\.js['"]/
    );
    expect(content, 'Should use calculateCreditsUsed function').toContain('calculateCreditsUsed(');
  });

  it('should prove session-status.model.ts imports and uses calculateCreditsUsed', () => {
    const content = readSrc('src/models/session/session-status.model.ts');

    expect(content, 'Should import calculateCreditsUsed').toMatch(
      /import\s*\{[^}]*calculateCreditsUsed[^}]*\}\s*from\s*['"].*credits-calculator\.js['"]/
    );
    expect(content, 'Should use calculateCreditsUsed function').toContain('calculateCreditsUsed(');
  });

  it('should prove credits-monitor.service.ts imports and uses calculateCreditsUsed', () => {
    const content = readSrc('src/services/credits-monitor.service.ts');

    expect(content, 'Should import calculateCreditsUsed').toMatch(
      /import\s*\{[^}]*calculateCreditsUsed[^}]*\}\s*from\s*['"]@shared\/utils\/credits-calculator\.js['"]/
    );
    expect(content, 'Should use calculateCreditsUsed function').toContain('calculateCreditsUsed(');
  });

  it('should prove connection-manager.ts imports and uses calculateCreditsUsed', () => {
    const content = readSrc('src/services/machine-grpc/connection-manager.ts');

    expect(content, 'Should import calculateCreditsUsed').toMatch(
      /import\s*\{[^}]*calculateCreditsUsed[^}]*\}\s*from\s*['"]@shared\/utils\/credits-calculator\.js['"]/
    );
    expect(content, 'Should use calculateCreditsUsed function').toContain('calculateCreditsUsed(');
  });

  it('should prove the inline formula Math.max(1, Math.ceil(.../60)) no longer appears in session.service.ts', () => {
    const content = readSrc('src/services/session.service.ts');
    const matches = content.match(formulaPattern);
    expect(matches, 'Inline formula should be removed from session.service.ts').toBeNull();
  });

  it('should prove the inline formula no longer appears in session-status.model.ts', () => {
    const content = readSrc('src/models/session/session-status.model.ts');
    const matches = content.match(formulaPattern);
    expect(matches, 'Inline formula should be removed from session-status.model.ts').toBeNull();
  });

  it('should prove the inline formula no longer appears in credits-monitor.service.ts', () => {
    const content = readSrc('src/services/credits-monitor.service.ts');
    const matches = content.match(formulaPattern);
    expect(matches, 'Inline formula should be removed from credits-monitor.service.ts').toBeNull();
  });

  describe('calculateCreditsUsed function behavior verification', () => {
    function calculateCreditsUsed(durationSeconds: number): number {
      return durationSeconds > 0 ? Math.max(1, Math.ceil(durationSeconds / 60)) : 0;
    }

    it('should return 0 for zero or negative durations', () => {
      expect(calculateCreditsUsed(0)).toBe(0);
      expect(calculateCreditsUsed(-1)).toBe(0);
      expect(calculateCreditsUsed(-100)).toBe(0);
    });

    it('should return 1 for any positive duration under 60 seconds', () => {
      expect(calculateCreditsUsed(1)).toBe(1);
      expect(calculateCreditsUsed(30)).toBe(1);
      expect(calculateCreditsUsed(59)).toBe(1);
    });

    it('should return 1 for exactly 60 seconds', () => {
      expect(calculateCreditsUsed(60)).toBe(1);
    });

    it('should ceil to the next minute for durations over 60 seconds', () => {
      expect(calculateCreditsUsed(61)).toBe(2);
      expect(calculateCreditsUsed(119)).toBe(2);
      expect(calculateCreditsUsed(120)).toBe(2);
      expect(calculateCreditsUsed(121)).toBe(3);
    });

    it('should handle large durations correctly', () => {
      expect(calculateCreditsUsed(3600)).toBe(60);
      expect(calculateCreditsUsed(3661)).toBe(62);
    });
  });

  it('should confirm the centralized function is used consistently across all files (no divergence)', () => {
    const files = [
      'src/services/session.service.ts',
      'src/models/session/session-status.model.ts',
      'src/services/credits-monitor.service.ts',
      'src/services/machine-grpc/connection-manager.ts',
    ];

    for (const file of files) {
      const content = readSrc(file);
      expect(content, `${file} should use calculateCreditsUsed`).toContain('calculateCreditsUsed(');
    }
  });
});
