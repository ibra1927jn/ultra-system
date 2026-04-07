// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Kiwi.com Tequila API (P6)                ║
// ║                                                          ║
// ║  STUB: requiere KIWI_API_KEY en .env                     ║
// ║  Docs: https://tequila.kiwi.com/portal/docs              ║
// ║                                                          ║
// ║  Único API que ofrece /v2/nomad — multi-city flight      ║
// ║  optimization para nómadas (sin equivalente gratuito).   ║
// ╚══════════════════════════════════════════════════════════╝

const TEQUILA_BASE = 'https://api.tequila.kiwi.com';

function isConfigured() {
  return !!process.env.KIWI_API_KEY;
}

async function _fetch(path) {
  const res = await fetch(`${TEQUILA_BASE}${path}`, {
    headers: {
      'apikey': process.env.KIWI_API_KEY,
      'Accept': 'application/json',
      'User-Agent': 'UltraSystem/1.0',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    throw new Error(`Tequila HTTP ${res.status}: ${await res.text().catch(() => '')}`);
  }
  return res.json();
}

/**
 * Búsqueda one-way clásica.
 * /v2/search?fly_from=AKL&fly_to=BCN&date_from=01/05/2026&date_to=31/05/2026&adults=1
 */
async function searchOneway(from, to, dateFrom, dateTo) {
  if (!isConfigured()) return { skipped: 'KIWI_API_KEY no configurada' };
  const params = new URLSearchParams({
    fly_from: from,
    fly_to: to,
    date_from: dateFrom,
    date_to: dateTo,
    adults: '1',
    curr: 'NZD',
    sort: 'price',
    limit: '5',
  });
  return await _fetch(`/v2/search?${params}`);
}

/**
 * Multi-city /v2/nomad — optimiza orden de visitas para minimizar coste total.
 * via=ciudades intermedias, sort_by=quality | price | duration
 */
async function nomadSearch(cities, dateFrom, dateTo, nightsPerCity = 7) {
  if (!isConfigured()) return { skipped: 'KIWI_API_KEY no configurada' };
  const params = new URLSearchParams({
    via: cities.join(','),
    date_from: dateFrom,
    date_to: dateTo,
    nights_in_dst_from: String(nightsPerCity),
    nights_in_dst_to: String(nightsPerCity + 3),
    adults: '1',
    curr: 'NZD',
  });
  return await _fetch(`/v2/nomad?${params}`);
}

module.exports = { isConfigured, searchOneway, nomadSearch };
