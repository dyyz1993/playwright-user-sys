import { describe, it, expect } from 'vitest';

// Pure logic test for WS Origin validation
function shouldAllowWebSocketUpgrade(origin: string | undefined, nodeEnv: string): boolean {
  // In production: reject connections without Origin header
  if (nodeEnv === 'production' && !origin) {
    return false;
  }

  // If no origin (non-browser clients in dev), allow
  if (!origin) {
    return true;
  }

  // Validate origin format
  try {
    const originHost = new URL(origin).hostname;
    const allowedHosts = ['localhost', '127.0.0.1'];

    // Allow localhost/127.0.0.1 always
    if (allowedHosts.includes(originHost)) {
      return true;
    }

    // In production: allow non-localhost origins (production domains)
    if (nodeEnv === 'production') {
      return true;
    }

    // In development: only allow localhost
    return false;
  } catch {
    return false;
  }
}

describe('WebSocket Origin validation', () => {
  describe('production environment', () => {
    it('should reject connections without Origin header', () => {
      expect(shouldAllowWebSocketUpgrade(undefined, 'production')).toBe(false);
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
  });

  describe('development environment', () => {
    it('should allow connections without Origin header', () => {
      expect(shouldAllowWebSocketUpgrade(undefined, 'development')).toBe(true);
    });

    it('should allow localhost Origin', () => {
      expect(shouldAllowWebSocketUpgrade('http://localhost:3000', 'development')).toBe(true);
    });

    it('should reject non-localhost Origin in dev', () => {
      expect(shouldAllowWebSocketUpgrade('https://evil.com', 'development')).toBe(false);
    });
  });

  describe('test environment', () => {
    it('should allow connections without Origin header', () => {
      expect(shouldAllowWebSocketUpgrade(undefined, 'test')).toBe(true);
    });
  });
});
