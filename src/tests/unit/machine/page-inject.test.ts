import { describe, it, expect, vi } from 'vitest';

import { injectFocusinScript, injectMouseTrackingScript } from '@machine/session_handlers/page-inject.js';

vi.mock('@shared/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@machine/utils.js', () => ({
  sessionFocusEmitter: {
    emit: vi.fn(),
  },
}));

function createMockPage() {
  return {
    evaluateOnNewDocument: vi.fn().mockResolvedValue(undefined),
    exposeFunction: vi.fn().mockResolvedValue(undefined),
  };
}

describe('injectFocusinScript', () => {
  it('should call evaluateOnNewDocument and exposeFunction', async () => {
    const page = createMockPage();
    await injectFocusinScript('test-session-123', page as unknown as import('puppeteer-core').Page);

    expect(page.evaluateOnNewDocument).toHaveBeenCalledOnce();
    expect(page.evaluateOnNewDocument).toHaveBeenCalledWith(expect.any(Function), '_focusHandler_test_session_123');
    expect(page.exposeFunction).toHaveBeenCalledOnce();
    expect(page.exposeFunction).toHaveBeenCalledWith('_focusHandler_test_session_123', expect.any(Function));
  });

  it('should warn when exposeFunction throws "already exists" error', async () => {
    const page = createMockPage();
    page.exposeFunction.mockRejectedValue(new Error('Function already exists'));

    await expect(
      injectFocusinScript('test-session', page as unknown as import('puppeteer-core').Page)
    ).resolves.toBeUndefined();

    const { logger } = await import('@shared/utils/logger.js');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('already exposed'));
  });

  it('should rethrow non-"already exists" errors from exposeFunction', async () => {
    const page = createMockPage();
    page.exposeFunction.mockRejectedValue(new Error('Some other error'));

    await expect(injectFocusinScript('test-session', page as unknown as import('puppeteer-core').Page)).rejects.toThrow(
      'Some other error'
    );
  });
});

describe('injectMouseTrackingScript', () => {
  it('should call evaluateOnNewDocument with cursor script', async () => {
    const page = createMockPage();
    await injectMouseTrackingScript(page as unknown as import('puppeteer-core').Page);

    expect(page.evaluateOnNewDocument).toHaveBeenCalledOnce();
  });

  it('should handle evaluateOnNewDocument rejection gracefully', async () => {
    const page = createMockPage();
    page.evaluateOnNewDocument.mockReturnValue({
      catch: vi.fn().mockResolvedValue(undefined),
    });

    await expect(injectMouseTrackingScript(page as unknown as import('puppeteer-core').Page)).resolves.toBeUndefined();
  });
});
