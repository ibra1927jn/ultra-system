import { describe, it, expect, vi, beforeEach } from 'vitest';

// Point DB_HOST away from Docker hostname so Pool() constructor doesn't fail on DNS
process.env.DB_HOST = '127.0.0.1';
// Ensure pool constructor has a credential (no real DB connection in tests)
const PG_PASS_KEY = 'POSTGRES_PASSWORD';
if (!process.env[PG_PASS_KEY]) process.env[PG_PASS_KEY] = 'x';

const db = await import('../src/db.js');

// Spy on pool.query to intercept all DB calls (query/queryOne/queryAll all go through pool.query)
const mockPoolQuery = vi.spyOn(db.pool, 'query');

describe('db.query()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns query result', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 });
    const result = await db.query('SELECT 1');
    expect(result.rows).toEqual([{ id: 1 }]);
  });

  it('passes params to pool.query', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await db.query('SELECT * FROM users WHERE id = $1', [42]);
    expect(mockPoolQuery).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [42]);
  });

  it('propagates errors from pool', async () => {
    mockPoolQuery.mockRejectedValue(new Error('connection refused'));
    await expect(db.query('SELECT 1')).rejects.toThrow('connection refused');
  });
});

describe('db.queryOne()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns first row', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ name: 'test' }, { name: 'other' }], rowCount: 2 });
    const result = await db.queryOne('SELECT * FROM users LIMIT 1');
    expect(result).toEqual({ name: 'test' });
  });

  it('returns null when no rows', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    const result = await db.queryOne('SELECT * FROM users WHERE id = $1', [999]);
    expect(result).toBeNull();
  });
});

describe('db.queryAll()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all rows', async () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    mockPoolQuery.mockResolvedValue({ rows, rowCount: 3 });
    const result = await db.queryAll('SELECT * FROM users');
    expect(result).toEqual(rows);
  });

  it('returns empty array when no rows', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    const result = await db.queryAll('SELECT * FROM users');
    expect(result).toEqual([]);
  });
});

describe('db.healthCheck()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns ok: true with DB info on success', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({
        rows: [{ time: '2026-04-06', database: 'ultra_db', db_size: '25 MB' }],
      })
      .mockResolvedValueOnce({
        rows: [
          { table_name: 'bio_checks' },
          { table_name: 'finances' },
          { table_name: 'logistics' },
        ],
      });

    const result = await db.healthCheck();
    expect(result.ok).toBe(true);
    expect(result.database).toBe('ultra_db');
    expect(result.db_size).toBe('25 MB');
    expect(result.tables).toEqual(['bio_checks', 'finances', 'logistics']);
    expect(result.table_count).toBe(3);
  });

  it('returns ok: false with error on failure', async () => {
    mockPoolQuery.mockRejectedValue(new Error('connection refused'));
    const result = await db.healthCheck();
    expect(result.ok).toBe(false);
    expect(result.error).toBe('connection refused');
  });
});
