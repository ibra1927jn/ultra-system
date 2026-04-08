// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — USNI Fleet Tracker scraper                ║
// ║                                                            ║
// ║  Weekly snapshot del US Navy fleet a partir de los         ║
// ║  artículos publicados en https://news.usni.org/category/    ║
// ║  fleet-tracker. USNI publica un report semanal con         ║
// ║  posiciones aproximadas de carrier strike groups y         ║
// ║  amphibious ready groups.                                  ║
// ║                                                            ║
// ║  Estrategia: puppeteer sidecar para JS-render (USNI       ║
// ║  bloquea fetch directo con 403). Parseo regex sobre el    ║
// ║  HTML renderizado: battle force summary table + secciones ║
// ║  por región (h2) + strike groups (h3) + vessel mentions   ║
// ║  con hull number en formato `<em>Name</em> (HULL-XX)`.    ║
// ║                                                            ║
// ║  WM original tenía un cliente gRPC para esto que es stub  ║
// ║  Phase 1 sin backend — por eso scrapeamos directo en vez  ║
// ║  de usarlo. Cuando el gRPC backend se implemente, esto    ║
// ║  se puede sustituir manteniendo el shape de la salida.    ║
// ╚══════════════════════════════════════════════════════════╝

const puppeteer = require('./puppeteer');

const USNI_INDEX_URL = 'https://news.usni.org/category/fleet-tracker';

// Hull number patterns we recognize. Each is the prefix of a US Navy hull
// number (e.g. CVN-73 = Nimitz-class carrier). The list comes directly from
// what USNI's weekly fleet tracker actually publishes — covers carriers,
// amphibs, cruisers, destroyers, frigates, subs, command ships, LCS.
const HULL_PREFIXES = [
  'CVN', 'CV',
  'LHD', 'LHA', 'LSD', 'LPD',
  'CG',
  'DDG', 'DD',
  'FFG', 'FF',
  'SSN', 'SSGN', 'SSBN',
  'LCS',
  'LCC',
  'PC',
  'MCM',
  'T-AKE', 'T-AO', 'T-AOE',
];

// Vessel mention pattern. USNI consistently formats vessel names as
//   USS <em>VesselName</em> (HULL-NUM)        ← typical
//   USS <em>VesselName</em>&nbsp;(HULL-NUM)   ← non-breaking space (HTML entity)
//   USS <em>VesselName&nbsp;</em>(HULL-NUM)   ← &nbsp; trapped INSIDE the em
//   <em>VesselName</em> (HULL-NUM)            ← occasional, no USS prefix
// We tolerate: regular whitespace, unicode \u00a0, AND the literal HTML
// entity "&nbsp;" between </em> and the opening paren. This was a real
// bug that dropped Nimitz from the report once (April 6 2026 USNI).
// The hull number itself is "<PREFIX><sep><digits>" where sep is space,
// hyphen, or non-breaking space. We accept all separators and normalize
// to "PREFIX-NUMBER" canonical form.
const SP_OR_NBSP = '(?:[\\s\\u00a0]|&nbsp;)';
const HULL_PATTERN_STR = `(${HULL_PREFIXES.join('|')})[\\s\\u00a0\\-]*?(\\d{1,4})`;
const VESSEL_PATTERN = new RegExp(
  `(?:USS\\s+)?<em>([^<]{2,80})</em>${SP_OR_NBSP}*\\(${HULL_PATTERN_STR}\\)`,
  'gi'
);

/**
 * Find the URL of the most recent USNI fleet tracker article.
 * USNI's category page lists articles in reverse chronological order.
 * We pull the first link that matches /YYYY/MM/DD/usni-news-fleet-and-...
 */
async function findLatestArticleUrl() {
  const r = await puppeteer.scrape({ url: USNI_INDEX_URL, extract: 'html' });
  if (!r.ok || !r.data) {
    throw new Error(`USNI index fetch failed: ${r.error || 'no data'}`);
  }
  const matches = r.data.match(/href="(https:\/\/news\.usni\.org\/\d{4}\/\d{2}\/\d{2}\/usni-news-fleet-and-marine-tracker[^"]*)"/g);
  if (!matches || matches.length === 0) {
    throw new Error('USNI index: no fleet tracker article links found');
  }
  // First href= captured, strip the wrapping
  const first = matches[0].match(/href="([^"]+)"/);
  return first[1];
}

/**
 * Extract a single integer from a USNI battle force cell.
 * Cells look like: "<b>291</b><b><br></b>...<b>(USS 233, USNS 58)</b>"
 * We grab the first number and the parenthesized breakdown.
 */
function parseBattleForceCell(cellHtml) {
  const text = cellHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const total = parseInt((text.match(/^(\d+)/) || [])[1] || '0', 10) || null;
  return { total, text };
}

/**
 * Parse the battle force summary table at the top of every USNI article.
 * Returns { totalBattleForce, totalUss, totalUsns, deployed, deployedUss,
 *           deployedUsns, fdnf, rotational, underway, underwayDeployed,
 *           underwayLocal }
 */
function parseBattleForceSummary(html) {
  const out = {
    totalBattleForce: null, totalUss: null, totalUsns: null,
    deployed: null, deployedUss: null, deployedUsns: null,
    fdnf: null, rotational: null,
    underway: null, underwayDeployed: null, underwayLocal: null,
  };

  // The summary is the first <table> in the article. Grab its inner data row.
  const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/);
  if (!tableMatch) return out;

  // Find all data rows (<tr>...</tr>) and pick the row with numbers (skip header)
  const rows = Array.from(tableMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g));
  for (const row of rows) {
    const cells = Array.from(row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)).map(m => m[1]);
    if (cells.length < 3) continue;
    const c0 = parseBattleForceCell(cells[0]);
    if (!c0.total) continue;  // Header row has no number
    const c1 = parseBattleForceCell(cells[1]);
    const c2 = parseBattleForceCell(cells[2]);

    out.totalBattleForce = c0.total;
    const totMatch = c0.text.match(/USS\s+(\d+)[^,]*,\s*USNS\s+(\d+)/i);
    if (totMatch) {
      out.totalUss = parseInt(totMatch[1], 10);
      out.totalUsns = parseInt(totMatch[2], 10);
    }

    out.deployed = c1.total;
    const depMatch = c1.text.match(/USS\s+(\d+)[^,]*,\s*USNS\s+(\d+)/i);
    if (depMatch) {
      out.deployedUss = parseInt(depMatch[1], 10);
      out.deployedUsns = parseInt(depMatch[2], 10);
    }
    const fdnfMatch = c1.text.match(/(\d+)\s*FDNF[^0-9]*(\d+)\s*Rotational/i);
    if (fdnfMatch) {
      out.fdnf = parseInt(fdnfMatch[1], 10);
      out.rotational = parseInt(fdnfMatch[2], 10);
    }

    out.underway = c2.total;
    const undMatch = c2.text.match(/(\d+)\s*Deployed[^0-9]*(\d+)\s*Local/i);
    if (undMatch) {
      out.underwayDeployed = parseInt(undMatch[1], 10);
      out.underwayLocal = parseInt(undMatch[2], 10);
    }
    break;
  }

  return out;
}

/**
 * Parse the article body into ordered region sections.
 *
 * USNI structure:
 *   <h2>In Japan</h2>          ← region (strip "In " prefix)
 *   <p>USS <em>X</em> (CVN-73) is in port...</p>
 *   <h3>Carrier Strike Group 10</h3>     ← optional sub-group inside a region
 *   <p>...</p>
 *   <h2>In the Pacific</h2>     ← next region
 *
 * We split on every <h2> and walk the chunks. Within each chunk we look
 * for any <h3> markers to associate vessels with strike groups. Vessels
 * are extracted via VESSEL_PATTERN regex.
 */
function parseRegionsAndVessels(html) {
  const regions = [];
  const vessels = [];
  const seenVessels = new Set();  // dedupe by hull-number within report

  // Strip everything before the first <h2> (header/figure/battle table)
  // and everything after the article footer markers ("Get USNI News
  // updates" or "Related Topics" close out the body).
  let body = html;
  const firstH2 = body.indexOf('<h2');
  if (firstH2 > 0) body = body.substring(firstH2);
  // Cut at the first marker that signals end-of-article. Order matters:
  // we want the EARLIEST cut, not the latest, so we find them all and
  // truncate at the smallest index. The "author bio" footer has its own
  // <h3>U.S. Naval Institute Staff</h3> that would otherwise contaminate
  // the last region with a fake strike group.
  const cutMarkers = [
    'class="author',
    'class="post-tags"',
    'class="related-articles"',
    'Get USNI News updates delivered',
    '<h3>Related Topics</h3>',
    '<h2>Search</h2>',
  ];
  let earliestCut = body.length;
  for (const marker of cutMarkers) {
    const i = body.indexOf(marker);
    if (i > 0 && i < earliestCut) earliestCut = i;
  }
  body = body.substring(0, earliestCut);

  // Split into chunks at every <h2>
  const chunks = body.split(/<h2[^>]*>/);
  // chunks[0] is whatever was before the first <h2> (should be empty after our trim above)
  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    const closeIdx = chunk.indexOf('</h2>');
    if (closeIdx < 0) continue;

    const regionRaw = chunk.substring(0, closeIdx).replace(/<[^>]+>/g, '').trim();
    const region = regionRaw.replace(/^In\s+the\s+/i, '').replace(/^In\s+/i, '').trim();
    if (!region || /^Search$/i.test(region)) continue;

    const after = chunk.substring(closeIdx + 5);

    // Find any <h3> sub-headings in this region for strike group context
    const subSections = [];
    const h3Splits = after.split(/<h3[^>]*>/);
    let currentGroup = null;
    let currentBody = h3Splits[0];
    if (currentBody) subSections.push({ group: null, body: currentBody });
    for (let j = 1; j < h3Splits.length; j++) {
      const sub = h3Splits[j];
      const sCloseIdx = sub.indexOf('</h3>');
      if (sCloseIdx < 0) continue;
      currentGroup = sub.substring(0, sCloseIdx).replace(/<[^>]+>/g, '').trim();
      currentBody = sub.substring(sCloseIdx + 5);
      subSections.push({ group: currentGroup, body: currentBody });
    }

    let regionVesselCount = 0;
    for (const sub of subSections) {
      // Iterate vessel mentions in sub.body
      let m;
      VESSEL_PATTERN.lastIndex = 0;
      while ((m = VESSEL_PATTERN.exec(sub.body)) !== null) {
        const name = m[1].replace(/&nbsp;/g, ' ').trim();
        const prefix = m[2].toUpperCase();
        const num = m[3];
        const hull = `${prefix}-${num}`;
        const dedupeKey = `${hull}|${region}`;
        if (seenVessels.has(dedupeKey)) continue;
        seenVessels.add(dedupeKey);
        vessels.push({
          name,
          hull,
          hullPrefix: prefix,
          hullNumber: num,
          region,
          strikeGroup: sub.group || null,
        });
        regionVesselCount++;
      }
    }

    regions.push({ name: region, vesselCount: regionVesselCount, strikeGroups: subSections.filter(s => s.group).map(s => s.group) });
  }

  return { regions, vessels };
}

/**
 * Extract article title and date from the rendered HTML.
 */
function parseArticleMeta(html) {
  const titleMatch = html.match(/<h1[^>]*class="post-title[^"]*"[^>]*>([^<]+)<\/h1>/);
  const title = titleMatch ? titleMatch[1].trim() : 'Unknown';

  // The date appears in a div like "<div>April 6, 2026 4:00 PM - Updated:..."
  // We look for "Month DD, YYYY" near the post header. Critical: parse as
  // UTC explicitly (Date.UTC) — the engine container TZ is Pacific/Auckland
  // (UTC+12/+13 with DST), so `new Date('April 6, 2026')` would be
  // 2026-04-06 00:00 NZ time = 2026-04-05 12:00 UTC, and slice(0,10) would
  // give the wrong day. Building the date in UTC sidesteps that entirely.
  const dateMatch = html.match(/>((?:January|February|March|April|May|June|July|August|September|October|November|December))\s+(\d{1,2}),\s+(\d{4})/);
  let articleDate = null;
  if (dateMatch) {
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const monthIdx = monthNames.indexOf(dateMatch[1]);
    if (monthIdx >= 0) {
      const utc = Date.UTC(parseInt(dateMatch[3], 10), monthIdx, parseInt(dateMatch[2], 10));
      articleDate = new Date(utc).toISOString().slice(0, 10);
    }
  }

  return { title, articleDate };
}

/**
 * Top-level: scrape the latest USNI fleet tracker report and return a
 * structured snapshot ready to persist.
 */
async function scrapeLatestFleetReport() {
  const url = await findLatestArticleUrl();

  const r = await puppeteer.scrape({ url, extract: 'html' });
  if (!r.ok || !r.data) {
    throw new Error(`USNI article fetch failed: ${r.error || 'no data'} (${url})`);
  }
  const html = r.data;

  const meta = parseArticleMeta(html);
  const battleForce = parseBattleForceSummary(html);
  const { regions, vessels } = parseRegionsAndVessels(html);

  return {
    articleUrl: url,
    articleTitle: meta.title,
    articleDate: meta.articleDate,
    battleForce,
    regions,
    vessels,
  };
}

module.exports = {
  scrapeLatestFleetReport,
  // Exposed for unit testing only
  parseBattleForceSummary,
  parseRegionsAndVessels,
  parseArticleMeta,
  findLatestArticleUrl,
  VESSEL_PATTERN,
};
