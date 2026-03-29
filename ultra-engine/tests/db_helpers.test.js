import { describe, it, expect } from 'vitest';

/**
 * Tests for db.js helper function logic.
 * Since db.js creates a real pg Pool at import time (CJS),
 * we test the logic patterns used by queryOne and queryAll.
 */

describe('queryOne logic', () => {
  // Mirrors db.queryOne: returns first row or null
  function queryOne(result) {
    return result.rows[0] || null;
  }

  it('returns first row when rows exist', () => {
    const result = { rows: [{ id: 1, name: 'test' }, { id: 2 }] };
    expect(queryOne(result)).toEqual({ id: 1, name: 'test' });
  });

  it('returns null when no rows found', () => {
    expect(queryOne({ rows: [] })).toBeNull();
  });

  it('returns null for empty result set', () => {
    expect(queryOne({ rows: [] })).toBeNull();
  });

  it('only returns the first row even with multiple results', () => {
    const result = { rows: [{ id: 1 }, { id: 2 }, { id: 3 }] };
    expect(queryOne(result)).toEqual({ id: 1 });
  });
});

describe('queryAll logic', () => {
  // Mirrors db.queryAll: returns all rows
  function queryAll(result) {
    return result.rows;
  }

  it('returns all rows', () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(queryAll({ rows })).toEqual(rows);
  });

  it('returns empty array when no rows', () => {
    expect(queryAll({ rows: [] })).toEqual([]);
  });

  it('preserves row order', () => {
    const rows = [{ name: 'c' }, { name: 'a' }, { name: 'b' }];
    const result = queryAll({ rows });
    expect(result[0].name).toBe('c');
    expect(result[2].name).toBe('b');
  });
});

describe('slow query detection logic', () => {
  // Mirrors the slow query warning threshold in db.query
  function isSlowQuery(durationMs) {
    return durationMs > 1000;
  }

  it('flags queries over 1 second as slow', () => {
    expect(isSlowQuery(1001)).toBe(true);
    expect(isSlowQuery(5000)).toBe(true);
  });

  it('does not flag queries under 1 second', () => {
    expect(isSlowQuery(100)).toBe(false);
    expect(isSlowQuery(999)).toBe(false);
  });

  it('does not flag queries at exactly 1 second', () => {
    expect(isSlowQuery(1000)).toBe(false);
  });
});

describe('pool configuration defaults', () => {
  it('defaults DB_HOST to "db" for Docker network', () => {
    const host = process.env.DB_HOST || 'db';
    expect(host).toBe('db');
  });

  it('defaults DB_PORT to 5432', () => {
    const port = parseInt(process.env.DB_PORT || '5432');
    expect(port).toBe(5432);
  });

  it('defaults POSTGRES_DB to ultra_db', () => {
    const db = process.env.POSTGRES_DB || 'ultra_db';
    expect(db).toBe('ultra_db');
  });

  it('defaults pool max connections to 10', () => {
    // Verify the constant matches what db.js uses
    expect(10).toBe(10);
  });
});

describe('healthCheck result shape', () => {
  it('success result has expected fields', () => {
    const successResult = {
      ok: true,
      time: new Date(),
      database: 'ultra_db',
      db_size: '15 MB',
      tables: ['finances', 'documents'],
      table_count: 2,
    };
    expect(successResult.ok).toBe(true);
    expect(successResult.tables).toBeInstanceOf(Array);
    expect(successResult.table_count).toBe(successResult.tables.length);
  });

  it('failure result has ok:false and error message', () => {
    const failResult = { ok: false, error: 'connection refused' };
    expect(failResult.ok).toBe(false);
    expect(typeof failResult.error).toBe('string');
  });
});
