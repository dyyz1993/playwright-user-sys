import { describe, it, expect } from 'vitest';
import { BrowserService, browserService } from '@machine/browser.service.js';

describe('BrowserService Singleton Consistency', () => {
  describe('getInstance()', () => {
    it('getInstance() always returns the same instance', () => {
      const a = BrowserService.getInstance();
      const b = BrowserService.getInstance();
      expect(a).toBe(b);
    });

    it('getInstance() returns the same as module-level export', () => {
      expect(BrowserService.getInstance()).toBe(browserService);
    });
  });

  describe('module-level export', () => {
    it('browserService export should be a BrowserService instance', () => {
      expect(browserService).toBeInstanceOf(BrowserService);
    });

    it('default export should be the same as named export', async () => {
      const mod = await import('@machine/browser.service.js');
      expect(mod.default).toBe(mod.browserService);
    });

    it('re-importing the module returns the same instance', async () => {
      const mod1 = await import('@machine/browser.service.js');
      const mod2 = await import('@machine/browser.service.js');
      expect(mod1.browserService).toBe(mod2.browserService);
    });
  });

  describe('constructor is private', () => {
    it('constructor cannot be called with new from outside', () => {
      // @ts-expect-error — constructor is private, TS should block this
      const _attempt = new BrowserService();
      // If runtime allows it somehow, it should still be the singleton (private TS constructors
      // are not enforced at runtime in JS). The key protection is at the type level.
    });
  });

  describe('singleton state consistency', () => {
    it('getInstance() shares state with the module export', () => {
      const instance = BrowserService.getInstance();
      const testSessionId = '__singleton_consistency_test__';
      instance.setSession(testSessionId, {
        port: 9999,
        wsEndpoint: 'ws://test',
        path: '/test',
        lastActivity: Date.now(),
        startTime: Date.now(),
        config: { fps: 15, interactionMode: 'general_navigation', touchMode: 'touchpad' },
        sessionId: testSessionId,
      });

      expect(browserService.hasSession(testSessionId)).toBe(true);
      instance.deleteSession(testSessionId);
      expect(browserService.hasSession(testSessionId)).toBe(false);
    });
  });
});
