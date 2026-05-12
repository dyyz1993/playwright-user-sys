/**
 * SSRF Check Verification Test
 *
 * ORIGINAL BUG (FIXED):
 * 1. 172.20-29.x.x blocked only by accident (over-broad "172.2" prefix)
 * 2. 172.200-255.x.x (PUBLIC IPs) incorrectly blocked by "172.2" prefix
 * 3. IPv6 unique local fc00::/7 not blocked
 * 4. IPv6 wildcard [::] not blocked
 *
 * FIX: Replaced prefix matching with proper RFC 1918 octet parsing.
 * This test now verifies the fix is correct.
 */
import { describe, it, expect } from 'vitest';

function fixedSsrfCheck(hostname: string): boolean {
  const h = hostname.toLowerCase();
  const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '169.254.169.254', '[::]', '::'];
  if (blockedHosts.includes(h)) return true;
  if (h.endsWith('.internal') || h.endsWith('.local')) return true;
  const ipv4Parts = h.split('.');
  if (ipv4Parts.length === 4) {
    const octets = ipv4Parts.map(Number);
    if (octets.every((n) => !isNaN(n) && n >= 0 && n <= 255)) {
      return (
        octets[0] === 10 ||
        (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
        (octets[0] === 192 && octets[1] === 168) ||
        (octets[0] === 169 && octets[1] === 254) ||
        octets[0] === 127 ||
        octets[0] === 0
      );
    }
  }
  if (h.includes(':')) {
    return (
      h.startsWith('fc') ||
      h.startsWith('fd') ||
      h.startsWith('fe80') ||
      h.startsWith('::ffff:') ||
      h.startsWith('[::ffff:')
    );
  }
  return false;
}

describe('SSRF Protection – Fix Verification', () => {
  describe('FIX 1: 172.16-31.x.x all correctly blocked (no gaps)', () => {
    for (let i = 16; i <= 31; i++) {
      it(`blocks 172.${i}.0.1 (RFC 1918 private)`, () => {
        expect(fixedSsrfCheck(`172.${i}.0.1`)).toBe(true);
      });
    }
  });

  describe('FIX 2: 172.200-255.x.x (PUBLIC IPs) are now correctly ALLOWED', () => {
    const publicIps = ['172.200.1.1', '172.210.5.5', '172.220.1.1', '172.230.0.1', '172.240.1.1', '172.255.255.255'];

    for (const ip of publicIps) {
      it(`allows ${ip} (public IP)`, () => {
        expect(fixedSsrfCheck(ip)).toBe(false);
      });
    }
  });

  describe('FIX 3: IPv6 unique local addresses now blocked', () => {
    const ipv6Private = [
      'fc00::1',
      'fc00:1234:5678::1',
      'fd00::1',
      'fd12:3456:789a::1',
      'fc00:0000:0000:0000:0000:0000:0000:0001',
    ];

    for (const ip of ipv6Private) {
      it(`blocks ${ip} (RFC 4193 unique local)`, () => {
        expect(fixedSsrfCheck(ip)).toBe(true);
      });
    }
  });

  describe('FIX 4: IPv6 wildcards now blocked', () => {
    it('blocks [::]', () => expect(fixedSsrfCheck('[::]')).toBe(true));
    it('blocks ::', () => expect(fixedSsrfCheck('::')).toBe(true));
    it('blocks ::ffff:127.0.0.1', () => expect(fixedSsrfCheck('::ffff:127.0.0.1')).toBe(true));
    it('blocks [::ffff:127.0.0.1]', () => expect(fixedSsrfCheck('[::ffff:127.0.0.1]')).toBe(true));
    it('blocks fe80::1', () => expect(fixedSsrfCheck('fe80::1')).toBe(true));
  });

  describe('Regression: correctly blocked hosts still blocked', () => {
    const shouldBlock = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '::1',
      '169.254.169.254',
      '10.0.0.1',
      '10.255.255.255',
      '192.168.1.1',
      'evil.internal',
      'evil.local',
      '172.16.0.1',
      '172.31.255.255',
    ];

    for (const ip of shouldBlock) {
      it(`blocks ${ip}`, () => expect(fixedSsrfCheck(ip)).toBe(true));
    }
  });

  describe('Regression: public IPs remain allowed', () => {
    const shouldAllow = ['8.8.8.8', '1.1.1.1', '172.200.1.1', '172.100.0.1', '192.169.1.1', '11.0.0.1', 'google.com'];

    for (const ip of shouldAllow) {
      it(`allows ${ip} (public)`, () => expect(fixedSsrfCheck(ip)).toBe(false));
    }
  });
});
