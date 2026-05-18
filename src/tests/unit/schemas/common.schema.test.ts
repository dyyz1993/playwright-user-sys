import { describe, it, expect } from 'vitest';
import {
  numericIdParamSchema,
  paginationParseSchema,
  idParamSchema,
  paginationQuerySchema,
} from '../../../schemas/index.js';

describe('numericIdParamSchema', () => {
  it('should parse valid numeric string id', () => {
    const result = numericIdParamSchema.parse({ id: '42' });
    expect(result).toEqual({ id: 42 });
  });

  it('should parse single digit id', () => {
    const result = numericIdParamSchema.parse({ id: '1' });
    expect(result).toEqual({ id: 1 });
  });

  it('should parse large id', () => {
    const result = numericIdParamSchema.parse({ id: '999999' });
    expect(result).toEqual({ id: 999999 });
  });

  it('should reject non-numeric string', () => {
    expect(() => numericIdParamSchema.parse({ id: 'abc' })).toThrow();
  });

  it('should reject zero', () => {
    expect(() => numericIdParamSchema.parse({ id: '0' })).toThrow();
  });

  it('should reject negative number', () => {
    expect(() => numericIdParamSchema.parse({ id: '-5' })).toThrow();
  });

  it('should reject empty string', () => {
    expect(() => numericIdParamSchema.parse({ id: '' })).toThrow();
  });

  it('should accept parseInt-compatible float string (parseInt("1.5") => 1)', () => {
    const result = numericIdParamSchema.parse({ id: '1.5' });
    expect(result).toEqual({ id: 1 });
  });

  it('should produce ZodError with correct message for invalid id', () => {
    try {
      numericIdParamSchema.parse({ id: 'abc' });
      expect.unreachable('Should have thrown');
    } catch (error: unknown) {
      expect(error).toHaveProperty('issues');
      expect((error as { issues: { message: string }[] }).issues[0].message).toBe('无效的用户 ID');
    }
  });
});

describe('paginationParseSchema', () => {
  it('should use defaults when no params provided', () => {
    const result = paginationParseSchema.parse({});
    expect(result).toEqual({ page: 1, limit: 20 });
  });

  it('should parse valid page and limit strings', () => {
    const result = paginationParseSchema.parse({ page: '3', limit: '50' });
    expect(result).toEqual({ page: 3, limit: 50 });
  });

  it('should enforce page minimum of 1', () => {
    const result = paginationParseSchema.parse({ page: '0', limit: '10' });
    expect(result.page).toBe(1);
  });

  it('should enforce page minimum of 1 for negative values', () => {
    const result = paginationParseSchema.parse({ page: '-5', limit: '10' });
    expect(result.page).toBe(1);
  });

  it('should enforce limit minimum of 1', () => {
    const result = paginationParseSchema.parse({ page: '1', limit: '0' });
    expect(result.limit).toBe(20);
  });

  it('should enforce limit maximum of 100', () => {
    const result = paginationParseSchema.parse({ page: '1', limit: '200' });
    expect(result.limit).toBe(100);
  });

  it('should handle non-numeric page gracefully', () => {
    const result = paginationParseSchema.parse({ page: 'abc', limit: '10' });
    expect(result.page).toBe(1);
  });

  it('should handle non-numeric limit gracefully', () => {
    const result = paginationParseSchema.parse({ page: '1', limit: 'abc' });
    expect(result.limit).toBe(20);
  });

  it('should handle limit exactly at boundary 100', () => {
    const result = paginationParseSchema.parse({ page: '1', limit: '100' });
    expect(result.limit).toBe(100);
  });

  it('should handle limit at boundary 1', () => {
    const result = paginationParseSchema.parse({ page: '1', limit: '1' });
    expect(result.limit).toBe(1);
  });

  it('should handle both non-numeric values', () => {
    const result = paginationParseSchema.parse({ page: 'foo', limit: 'bar' });
    expect(result).toEqual({ page: 1, limit: 20 });
  });
});

describe('idParamSchema (existing)', () => {
  it('should accept any string id', () => {
    const result = idParamSchema.parse({ id: 'session-uuid-123' });
    expect(result).toEqual({ id: 'session-uuid-123' });
  });
});

describe('paginationQuerySchema (existing)', () => {
  it('should accept valid query params', () => {
    const result = paginationQuerySchema.parse({
      page: '1',
      limit: '20',
      sort: 'created_at',
      order: 'desc',
    });
    expect(result.page).toBe('1');
    expect(result.limit).toBe('20');
  });
});
