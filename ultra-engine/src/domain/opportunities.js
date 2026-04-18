const db = require('../db');

async function getHighScoreOpps({ minScore = 8, limit = 20 } = {}) {
  const rows = await db.queryAll(
    `SELECT id, title, source, url, category, payout_type, salary_min, salary_max, currency,
       match_score, status, posted_at, last_seen
     FROM opportunities
     WHERE match_score >= $1 AND status = 'new'
     ORDER BY match_score DESC, posted_at DESC NULLS LAST
     LIMIT $2`,
    [minScore, limit]
  );
  return { count: rows.length, data: rows };
}

module.exports = { getHighScoreOpps };
