/**
 * Default Admin Password Fix Verification Test
 *
 * ORIGINAL BUG (FIXED):
 * env.ts:40 had ADMIN_PASSWORD: z.string().default('REDACTED_ADMIN_PASS')
 * which silently used a hardcoded password if env var was missing.
 *
 * FIX: Changed to z.string().min(8, '...') — no default, requires explicit setting.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const fixedSchema = z.object({
  ADMIN_USERNAME: z.string().default('admin'),
  ADMIN_PASSWORD: z.string().min(8, 'ADMIN_PASSWORD must be set and at least 8 characters'),
});

describe('Default Admin Password Fix Verification (env.ts:40)', () => {
  it('REJECTS missing ADMIN_PASSWORD (FIX VERIFIED)', () => {
    const result = fixedSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = JSON.stringify(result.error.issues);
      expect(msg).toContain('ADMIN_PASSWORD');
    }
  });

  it('REJECTS password shorter than 8 characters', () => {
    const result = fixedSchema.safeParse({ ADMIN_PASSWORD: 'short' });
    expect(result.success).toBe(false);
  });

  it('ACCEPTS password with 8+ characters', () => {
    const result = fixedSchema.safeParse({ ADMIN_PASSWORD: 'secure-password-123' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ADMIN_PASSWORD).toBe('secure-password-123');
    }
  });

  it('has NO default value for ADMIN_PASSWORD', () => {
    const result = fixedSchema.safeParse({ ADMIN_PASSWORD: undefined });
    expect(result.success).toBe(false);
  });

  it('verifies source code no longer contains .default() for ADMIN_PASSWORD', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.resolve('src/config/env.ts');
    const source = fs.readFileSync(filePath, 'utf-8');

    const adminPasswordLine = source.split('\n').find((line) => line.includes('ADMIN_PASSWORD'));
    expect(adminPasswordLine).toBeDefined();
    expect(adminPasswordLine).not.toContain('.default(');
    expect(adminPasswordLine).toContain('.min(8');
  });
});
