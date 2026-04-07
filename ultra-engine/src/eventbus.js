// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Event Bus                                ║
// ║  Pub/sub en memoria con persistencia en event_log        ║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');

const subscribers = {};

// Overridable db reference for testing
let _db = db;

function subscribe(eventType, callback) {
  if (!subscribers[eventType]) {
    subscribers[eventType] = [];
  }
  subscribers[eventType].push(callback);
}

function unsubscribe(eventType, callback) {
  if (!subscribers[eventType]) return;
  subscribers[eventType] = subscribers[eventType].filter(cb => cb !== callback);
}

async function publish(eventType, sourcePillar, data) {
  // Persist to database
  await _db.query(
    'INSERT INTO event_log (event_type, source_pillar, data) VALUES ($1, $2, $3)',
    [eventType, sourcePillar, JSON.stringify(data)]
  );

  // Notify in-memory subscribers
  const handlers = subscribers[eventType] || [];
  for (const handler of handlers) {
    try {
      await handler({ eventType, sourcePillar, data });
    } catch (err) {
      console.error(`Event handler error for ${eventType}:`, err.message);
    }
  }
}

function getSubscribers() {
  const result = {};
  for (const [type, handlers] of Object.entries(subscribers)) {
    result[type] = handlers.length;
  }
  return result;
}

function _setDb(mockDb) {
  _db = mockDb;
}

module.exports = { subscribe, unsubscribe, publish, getSubscribers, _setDb };
