import { describe, it, expect } from 'vitest';

// Tests mirror the actual Origin validation logic in native-websocket-proxy.service.ts
function shouldAllowWebSocketUpgrade(origin: string | undefined, nodeEnv: string): boolean {
  // No origin header = allow (Playwright/CDP clients don't send Origin)
  if (!origin) {
    return true;
  }

  // Validate origin format
  try {
    const originHost = new URL(origin).hostname;
    const allowedHosts = ['localhost', '127.0.0.1'];

    if (allowedHosts.includes(originHost)) {
      return true;
    }

    if (nodeEnv === 'production') {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

describe('WebSocket Origin validation', () => {
  describe('production environment', () => {
    it('should allow connections without Origin header (CDP clients)', () => {
      expect(shouldAllowWebSocketUpgrade(undefined, 'production')).toBe(true);
    });

    it('should allow connections with valid Origin', () => {
      expect(shouldAllowWebSocketUpgrade('https://example.com', 'production')).toBe(true);
    });

    it('should allow localhost Origin in production', () => {
      expect(shouldAllowWebSocketUpgrade('http://localhost:3000', 'production')).toBe(true);
    });

    it('should reject malformed Origin', () => {
      expect(shouldAllowWebSocketUpgrade('not-a-url', 'production')).toBe(false);
    });

    it('should allow connections without Origin header for CDP clients like Playwright', () => {
      expect(shouldAllowWebSocketUpgrade(undefined, 'production')).toBe(true);
    });
  });

  describe('development environment', () => {
    it('should allow connections without Origin header', () => {
      expect(shouldAllowWebSocketUpgrade(undefined, 'development')).toBe(true);
    });

    it('should reject non-localhost Origin', () => {
      expect(shouldAllowWebSocketUpgrade('https://evil.com', 'development')).toBe(false);
    });
  });
});
