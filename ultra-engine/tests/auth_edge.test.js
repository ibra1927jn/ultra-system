import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

// Test the auth middleware's pure logic for dashboard detection and key validation

describe('auth middleware — dashboard detection logic', () => {
  // Extracted from auth.js: isDashboard check
  function isDashboard(referer, host) {
    return referer && (
      referer.startsWith(`http://${host}`) ||
      referer.startsWith(`https://${host}`)
    );
  }

  it('detects same-origin HTTP requests as dashboard', () => {
    expect(isDashboard('http://localhost:3000/dashboard', 'localhost:3000')).toBe(true);
  });

  it('detects same-origin HTTPS requests as dashboard', () => {
    expect(isDashboard('https://example.com/page', 'example.com')).toBe(true);
  });

  it('rejects cross-origin requests', () => {
    expect(isDashboard('http://evil.com/attack', 'example.com')).toBe(false);
  });

  it('rejects empty referer', () => {
    expect(isDashboard('', 'localhost:3000')).toBeFalsy();
  });

  it('rejects null/undefined referer', () => {
    expect(isDashboard(null, 'localhost:3000')).toBeFalsy();
    expect(isDashboard(undefined, 'localhost:3000')).toBeFalsy();
  });

  // NOTE: current implementation uses startsWith which doesn't enforce
  // exact host boundary. 'http://evil.com.attacker.net' starts with
  // 'http://evil.com' so this passes as dashboard. This is mitigated
  // by the API key still being required for actual mutations, but
  // could be hardened by checking for a trailing '/' or ':' after host.
  it('startsWith check allows host prefix matches (known limitation)', () => {
    expect(isDashboard('http://evil.com.attacker.net/x', 'evil.com')).toBe(true);
  });

  it('handles host with port', () => {
    expect(isDashboard('http://192.168.1.1:8080/api', '192.168.1.1:8080')).toBe(true);
  });
});

describe('auth middleware — timing-safe comparison', () => {
  function timingSafeEqual(a, b) {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  it('returns true for matching keys', () => {
    expect(timingSafeEqual('abc123', 'abc123')).toBe(true);
  });

  it('returns false for different keys of same length', () => {
    expect(timingSafeEqual('abc123', 'xyz789')).toBe(false);
  });

  it('throws for different length keys', () => {
    expect(() => timingSafeEqual('short', 'longer-key')).toThrow();
  });
});
