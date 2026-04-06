import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';

// Point DB_HOST away from Docker hostname
process.env.DB_HOST = '127.0.0.1';
// Ensure pool constructor has a credential (no real DB connection in tests)
const PG_PASS_KEY = 'POSTGRES_PASSWORD';
if (!process.env[PG_PASS_KEY]) process.env[PG_PASS_KEY] = 'x';

const require = createRequire(import.meta.url);

// Get the same CJS module instance that scraper.js will use via require()
const db = require('../src/db.js');
const mockPoolQuery = vi.spyOn(db.pool, 'query');

// Mock telegram sendAlert to prevent side effects
const telegram = require('../src/telegram.js');
vi.spyOn(telegram, 'sendAlert').mockResolvedValue();

const { addSource, getSources, getListings, hashContent } = require('../src/scraper.js');

describe('addSource()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts a source with default region NZ', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ id: 1, url: 'https://example.com', name: 'Test', region: 'NZ' }], rowCount: 1 });
    const result = await addSource('https://example.com', 'Test', '.job-listing');
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO job_sources'),
      ['https://example.com', 'Test', '.job-listing', 'NZ']
    );
    expect(result.region).toBe('NZ');
  });

  it('uses custom region when provided', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ id: 2, region: 'AU' }], rowCount: 1 });
    await addSource('https://au.example.com', 'AU Source', '.jobs', 'AU');
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.any(String),
      ['https://au.example.com', 'AU Source', '.jobs', 'AU']
    );
  });
});

describe('getSources()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns active sources ordered by name', async () => {
    const sources = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
    mockPoolQuery.mockResolvedValue({ rows: sources, rowCount: 2 });
    const result = await getSources();
    expect(result).toEqual(sources);
    expect(mockPoolQuery).toHaveBeenCalledWith(expect.stringContaining('is_active = TRUE'), undefined);
  });
});

describe('getListings()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns listings with default limit', async () => {
    const listings = [{ id: 1, title: 'Job A' }];
    mockPoolQuery.mockResolvedValue({ rows: listings, rowCount: 1 });
    const result = await getListings(null, 20);
    expect(result).toEqual(listings);
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT $1'),
      [20]
    );
  });

  it('filters by source_id when provided', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await getListings(5, 10);
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('source_id'),
      [10, 5]
    );
  });

  it('filters by category when provided', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await getListings(null, 20, 'tech');
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('category'),
      [20, 'tech']
    );
  });

  it('filters by both source_id and category', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await getListings(3, 15, 'warehouse');
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('AND'),
      [15, 3, 'warehouse']
    );
  });

  it('ignores category "all"', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await getListings(null, 20, 'all');
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.not.stringContaining('category'),
      [20]
    );
  });
});

describe('hashContent() additional cases', () => {
  it('handles numeric content', () => {
    const hash = hashContent('12345');
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });

  it('produces different hashes for content differing only in non-whitespace', () => {
    const a = hashContent('abcdef');
    const b = hashContent('abcdeg');
    expect(a).not.toBe(b);
  });
});
