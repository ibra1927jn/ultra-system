const db = require('../db');

async function getNext48h() {
  const items = await db.queryAll(
    `SELECT *,
       (date - CURRENT_DATE) AS days_until,
       CASE
         WHEN (date - CURRENT_DATE) = 0 THEN 'critical'
         WHEN (date - CURRENT_DATE) = 1 THEN 'urgent'
         ELSE 'upcoming'
       END as urgency
     FROM logistics
     WHERE date >= CURRENT_DATE
       AND date <= CURRENT_DATE + INTERVAL '2 days'
       AND status != 'done'
     ORDER BY date ASC`
  );
  return {
    data: items,
    count: items.length,
    summary: {
      critical: items.filter(i => i.urgency === 'critical').length,
      urgent: items.filter(i => i.urgency === 'urgent').length,
      upcoming: items.filter(i => i.urgency === 'upcoming').length,
    },
  };
}

module.exports = { getNext48h };
