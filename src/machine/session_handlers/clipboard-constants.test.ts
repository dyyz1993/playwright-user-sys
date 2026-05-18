import { describe, it, expect } from 'vitest';
import { CLIPBOARD_INTERCEPTOR_SCRIPT } from './clipboard-constants.js';

describe('CLIPBOARD_INTERCEPTOR_SCRIPT', () => {
  it('should be a string', () => {
    expect(typeof CLIPBOARD_INTERCEPTOR_SCRIPT).toBe('string');
  });

  it('should be longer than 200 characters', () => {
    expect(CLIPBOARD_INTERCEPTOR_SCRIPT.length).toBeGreaterThan(200);
  });

  it('should include clipboard write interception', () => {
    expect(CLIPBOARD_INTERCEPTOR_SCRIPT).toContain('navigator.clipboard.writeText');
  });

  it('should include clipboard content tracking', () => {
    expect(CLIPBOARD_INTERCEPTOR_SCRIPT).toContain('__clipboardContent');
  });

  it('should include file input click interception', () => {
    expect(CLIPBOARD_INTERCEPTOR_SCRIPT).toContain('__fileInputClickEvent');
  });

  it('should include copy event interception', () => {
    expect(CLIPBOARD_INTERCEPTOR_SCRIPT).toContain('document.execCommand');
  });
});
