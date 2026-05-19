import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BrowserService } from '@machine/browser.service.js';

describe('BrowserService Session Manager API', () => {
  let service: BrowserService;
  const createdSessionIds: string[] = [];

  beforeEach(() => {
    service = BrowserService.getInstance();
    service.stopActivityReporting();
  });

  afterEach(() => {
    for (const id of createdSessionIds) {
      service.deleteSession(id);
    }
    createdSessionIds.length = 0;
  });

  function trackSetSession(id: string, ctx: Parameters<BrowserService['setSession']>[1]) {
    createdSessionIds.push(id);
    service.setSession(id, ctx);
  }

  describe('getSession', () => {
    it('should return undefined for non-existent session', () => {
      expect(service.getSession('non-existent')).toBeUndefined();
    });

    it('should return session info after setSession', async () => {
      const ctx = {
        port: 9222,
        browser: {} as unknown as Record<string, unknown>,
        path: '/devtools/browser/abc',
        lastActivity: Date.now(),
        startTime: Date.now(),
        wsEndpoint: 'ws://127.0.0.1:9222/devtools/browser/abc',
        config: {},
      };
      trackSetSession('test-id', ctx);
      expect(service.getSession('test-id')).toEqual(ctx);
    });
  });

  describe('hasSession', () => {
    it('should return false for non-existent session', () => {
      expect(service.hasSession('non-existent')).toBe(false);
    });

    it('should return true after setSession', () => {
      trackSetSession('test-id', {
        port: 9222,
        browser: {} as unknown as Record<string, unknown>,
        path: '/devtools/browser/abc',
        lastActivity: Date.now(),
        startTime: Date.now(),
        wsEndpoint: 'ws://127.0.0.1:9222/devtools/browser/abc',
        config: {},
      });
      expect(service.hasSession('test-id')).toBe(true);
    });
  });

  describe('setSession / getSession / deleteSession', () => {
    it('should set, get, and delete a session', () => {
      const ctx = {
        port: 9222,
        browser: {} as unknown as Record<string, unknown>,
        path: '/devtools/browser/abc',
        lastActivity: 1000,
        startTime: 1000,
        wsEndpoint: 'ws://127.0.0.1:9222/devtools/browser/abc',
        config: { fps: 15 },
      };

      trackSetSession('s1', ctx);
      expect(service.getSession('s1')).toEqual(ctx);
      expect(service.hasSession('s1')).toBe(true);

      const deleted = service.deleteSession('s1');
      expect(deleted).toBe(true);
      expect(service.getSession('s1')).toBeUndefined();
      expect(service.hasSession('s1')).toBe(false);
    });

    it('deleteSession returns false for non-existent session', () => {
      expect(service.deleteSession('ghost')).toBe(false);
    });
  });

  describe('sessionCount', () => {
    it('should reflect added and removed sessions', () => {
      const ctx = {
        port: 9222,
        browser: {} as unknown as Record<string, unknown>,
        path: '/devtools/browser/abc',
        lastActivity: Date.now(),
        startTime: Date.now(),
        wsEndpoint: 'ws://127.0.0.1:9222/devtools/browser/abc',
        config: {},
      };

      const countBefore = service.sessionCount();
      trackSetSession('a', ctx);
      trackSetSession('b', ctx);
      expect(service.sessionCount()).toBe(countBefore + 2);

      service.deleteSession('a');
      expect(service.sessionCount()).toBe(countBefore + 1);
    });
  });

  describe('sessionKeys', () => {
    it('should return all session IDs after adding', () => {
      const ctx = {
        port: 9222,
        browser: {} as unknown as Record<string, unknown>,
        path: '/devtools/browser/abc',
        lastActivity: Date.now(),
        startTime: Date.now(),
        wsEndpoint: 'ws://127.0.0.1:9222/devtools/browser/abc',
        config: {},
      };

      trackSetSession('x', ctx);
      trackSetSession('y', ctx);
      const keys = service.sessionKeys();
      expect(keys).toContain('x');
      expect(keys).toContain('y');
    });
  });

  describe('sessionValues', () => {
    it('should return all session contexts', () => {
      const ctx1 = {
        port: 9222,
        browser: {} as unknown as Record<string, unknown>,
        path: '/devtools/browser/abc',
        lastActivity: Date.now(),
        startTime: Date.now(),
        wsEndpoint: 'ws://127.0.0.1:9222/devtools/browser/abc',
        config: { fps: 15 },
      };
      const ctx2 = {
        port: 9223,
        browser: {} as unknown as Record<string, unknown>,
        path: '/devtools/browser/def',
        lastActivity: Date.now(),
        startTime: Date.now(),
        wsEndpoint: 'ws://127.0.0.1:9223/devtools/browser/def',
        config: { fps: 30 },
      };

      trackSetSession('a', ctx1);
      trackSetSession('b', ctx2);
      const values = service.sessionValues();
      expect(values.map((v) => v.port)).toEqual(expect.arrayContaining([9222, 9223]));
    });
  });

  describe('forEachSession', () => {
    it('should iterate over added sessions', () => {
      const ctx = {
        port: 9222,
        browser: {} as unknown as Record<string, unknown>,
        path: '/devtools/browser/abc',
        lastActivity: Date.now(),
        startTime: Date.now(),
        wsEndpoint: 'ws://127.0.0.1:9222/devtools/browser/abc',
        config: {},
      };

      trackSetSession('a', ctx);
      trackSetSession('b', ctx);

      const collected: Array<{ id: string; port: number }> = [];
      service.forEachSession((session, id) => {
        if (id === 'a' || id === 'b') {
          collected.push({ id, port: session.port });
        }
      });

      expect(collected).toHaveLength(2);
      expect(collected.map((c) => c.id)).toEqual(expect.arrayContaining(['a', 'b']));
    });
  });

  describe('getSessionStartTime', () => {
    it('should return undefined for non-existent session', () => {
      expect(service.getSessionStartTime('non-existent')).toBeUndefined();
    });

    it('should return startTime from session', () => {
      const now = Date.now();
      trackSetSession('s1', {
        port: 9222,
        browser: {} as unknown as Record<string, unknown>,
        path: '/devtools/browser/abc',
        lastActivity: now,
        startTime: now,
        wsEndpoint: 'ws://127.0.0.1:9222/devtools/browser/abc',
        config: {},
      });
      expect(service.getSessionStartTime('s1')).toBe(now);
    });
  });
});
