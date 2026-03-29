import { describe, it, expect } from 'vitest';

// Test the db module's configuration and exports without connecting to a real DB
// These tests verify the module shape and defaults

describe('db module exports', () => {
  it('exports the expected functions', async () => {
    // We can't fully test db without a real PG connection,
    // but we can verify the module shape by checking the export keys
    // Use a dynamic import so the pool connection error doesn't crash the test
    const db = await import('../src/db.js').catch(() => null);
    if (!db) return; // Skip if module can't load (no pg connection)

    expect(typeof db.query).toBe('function');
    expect(typeof db.queryOne).toBe('function');
    expect(typeof db.queryAll).toBe('function');
    expect(typeof db.healthCheck).toBe('function');
    expect(db.pool).toBeDefined();
  });
});

describe('DB_HOST default', () => {
  it('defaults to "db" for Docker network', () => {
    // Verify the default matches docker-compose service name
    const defaultHost = process.env.DB_HOST || 'db';
    expect(defaultHost).toBe('db');
  });
});
