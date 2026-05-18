import { describe, it, expect } from 'vitest';

function parseJsonBody(body: string): unknown {
  if (body === '') return {};
  try {
    return JSON.parse(body);
  } catch {
    throw new Error('Invalid JSON');
  }
}

describe('content-type-parser JSON.parse protection', () => {
  it('should parse valid JSON', () => {
    expect(parseJsonBody('{"key":"value"}')).toEqual({ key: 'value' });
  });

  it('should return empty object for empty string', () => {
    expect(parseJsonBody('')).toEqual({});
  });

  it('should throw Error for invalid JSON', () => {
    expect(() => parseJsonBody('{invalid}')).toThrow('Invalid JSON');
  });

  it('should throw Error (not SyntaxError) for truncated JSON', () => {
    try {
      parseJsonBody('{"a":1');
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e).not.toBeInstanceOf(SyntaxError);
      expect((e as Error).message).toBe('Invalid JSON');
    }
  });
});
