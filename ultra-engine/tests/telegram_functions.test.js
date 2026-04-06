import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';

// Evita conexion real a PostgreSQL
process.env.DB_HOST = '127.0.0.1';
const PG_PASS_KEY = 'POSTGRES_PASSWORD';
if (!process.env[PG_PASS_KEY]) process.env[PG_PASS_KEY] = 'x';

// No configurar token para evitar crear bot real
const TG_TOKEN_KEY = 'TELEGRAM_BOT_TOKEN';
const origToken = process.env[TG_TOKEN_KEY];
delete process.env[TG_TOKEN_KEY];

const require = createRequire(import.meta.url);

const db = require('../src/db.js');
const mockPoolQuery = vi.spyOn(db.pool, 'query');

// Mock TelegramBot constructor
vi.mock('node-telegram-bot-api', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      onText: vi.fn(),
      on: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue({}),
    })),
  };
});

const telegram = require('../src/telegram.js');

describe('isActive()', () => {
  it('returns false when bot not initialized', () => {
    expect(telegram.isActive()).toBe(false);
  });
});

describe('send()', () => {
  it('does nothing when bot is null (not initialized)', async () => {
    // No deberia lanzar error
    await telegram.send('12345', 'test message');
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });
});

describe('sendAlert()', () => {
  it('does nothing when bot is null', async () => {
    await telegram.sendAlert('test alert');
    // No error, no DB call
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });
});

describe('logNotification()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts notification log into DB', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    await telegram.logNotification(1, 'Test message', 'sent');
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO notification_log'),
      [1, 'Test message', 'sent']
    );
  });

  it('defaults status to sent', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    await telegram.logNotification(2, 'Another message');
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.any(String),
      [2, 'Another message', 'sent']
    );
  });

  it('does not throw on DB error', async () => {
    mockPoolQuery.mockRejectedValue(new Error('DB connection failed'));
    await expect(telegram.logNotification(3, 'fail')).resolves.not.toThrow();
  });
});

describe('init()', () => {
  beforeEach(() => {
    delete process.env[TG_TOKEN_KEY];
  });

  it('returns null when token is not set', () => {
    const result = telegram.init();
    expect(result).toBeNull();
  });

  it('returns null when token is not_configured', () => {
    process.env[TG_TOKEN_KEY] = 'not_configured';
    const result = telegram.init();
    expect(result).toBeNull();
  });

  it('returns null when token contains CAMBIA_ESTO', () => {
    process.env[TG_TOKEN_KEY] = 'CAMBIA_ESTO_POR_TU_TOKEN';
    const result = telegram.init();
    expect(result).toBeNull();
  });
});

// Restaurar env
afterAll(() => {
  if (origToken) process.env[TG_TOKEN_KEY] = origToken;
});
