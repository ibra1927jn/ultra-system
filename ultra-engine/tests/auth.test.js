import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';

// Set API_KEY before requiring auth module
process.env.API_KEY = 'test-secret-key-1234567890abcdef';

const require = createRequire(import.meta.url);
const { apiKeyAuth } = require('../src/middleware/auth');

function mockReq(overrides = {}) {
  return {
    headers: {},
    ...overrides,
  };
}

function mockRes() {
  const res = {
    _status: null,
    _json: null,
  };
  res.status = (code) => { res._status = code; return res; };
  res.json = (data) => { res._json = data; return res; };
  return res;
}

describe('apiKeyAuth middleware', () => {
  beforeEach(() => {
    process.env.API_KEY = 'test-secret-key-1234567890abcdef';
  });

  it('returns 503 when API_KEY is not configured', () => {
    delete process.env.API_KEY;
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    apiKeyAuth(req, res, next);

    expect(res._status).toBe(503);
    expect(res._json.error).toMatch(/API_KEY not set/);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows dashboard requests from same origin (http)', () => {
    const req = mockReq({
      headers: {
        host: 'localhost:3000',
        referer: 'http://localhost:3000/dashboard',
      },
    });
    const res = mockRes();
    const next = vi.fn();

    apiKeyAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res._status).toBeNull();
  });

  it('allows dashboard requests from same origin (https)', () => {
    const req = mockReq({
      headers: {
        host: 'example.com',
        referer: 'https://example.com/page',
      },
    });
    const res = mockRes();
    const next = vi.fn();

    apiKeyAuth(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('rejects requests with no API key and no referer', () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    apiKeyAuth(req, res, next);

    expect(res._status).toBe(401);
    expect(res._json.error).toMatch(/Missing API key/);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects requests with invalid API key', () => {
    const req = mockReq({
      headers: { 'x-api-key': 'wrong-key-of-same-length!!' },
    });
    const res = mockRes();
    const next = vi.fn();

    apiKeyAuth(req, res, next);

    expect(res._status).toBe(403);
    expect(res._json.error).toMatch(/Invalid API key/);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows requests with valid API key', () => {
    const req = mockReq({
      headers: { 'x-api-key': 'test-secret-key-1234567890abcdef' },
    });
    const res = mockRes();
    const next = vi.fn();

    apiKeyAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res._status).toBeNull();
  });

  it('rejects requests with wrong-length API key', () => {
    const req = mockReq({
      headers: { 'x-api-key': 'short' },
    });
    const res = mockRes();
    const next = vi.fn();

    apiKeyAuth(req, res, next);

    expect(res._status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('does not allow referer from different host', () => {
    const req = mockReq({
      headers: {
        host: 'localhost:3000',
        referer: 'http://evil.com/attack',
      },
    });
    const res = mockRes();
    const next = vi.fn();

    apiKeyAuth(req, res, next);

    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('does not accept API key via query string', () => {
    const req = mockReq();
    req.query = { api_key: 'test-secret-key-1234567890abcdef' };
    const res = mockRes();
    const next = vi.fn();

    apiKeyAuth(req, res, next);

    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});
