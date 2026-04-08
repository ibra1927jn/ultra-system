// ════════════════════════════════════════════════════════════
//  sweep_signups.js — diagnostic sweep across all signup-gated
//  fetchers to verify which credentials in .env still work.
//  Run: docker compose exec -T engine node scripts/sweep_signups.js
// ════════════════════════════════════════════════════════════

const news = require('../src/news_apis');
const govJobs = require('../src/gov_jobs');
const scraper = require('../src/scraper');
const wise = require('../src/wise');
const akahu = require('../src/akahu');
const crypto_ = require('../src/crypto');
const logistics = require('../src/logistics_extras');
const bio = require('../src/bio_extras');

function summarize(label, r) {
  if (r == null) return `${label}: null`;
  if (r.error) return `${label}: ❌ ${String(r.error).slice(0, 140)}`;
  // skipped can be a count (number) or a reason (string). Only string = "not configured".
  const isSkipReason = typeof r.skipped === 'string';
  if (isSkipReason || r.configured === false) return `${label}: ⚪ ${r.skipped || r.reason || 'not configured'}`;
  // try to extract counts
  const ins = r.inserted ?? r.imported ?? r.count ?? null;
  const fet = r.fetched ?? (Array.isArray(r) ? r.length : null);
  const meta = [];
  if (fet != null) meta.push(`fetched=${fet}`);
  if (ins != null) meta.push(`inserted=${ins}`);
  if (r.skippedCount != null) meta.push(`skipped=${r.skippedCount}`);
  return `${label}: ✅ ${meta.join(' ') || 'ok'}`;
}

async function safe(label, fn) {
  const t0 = Date.now();
  try {
    const r = await fn();
    const ms = Date.now() - t0;
    return { label, ok: !r?.error, line: `${summarize(label, r)} (${ms}ms)`, raw: r };
  } catch (e) {
    const ms = Date.now() - t0;
    return { label, ok: false, line: `${label}: ❌ ${e.message?.slice(0, 140)} (${ms}ms)`, raw: { error: e.message } };
  }
}

(async () => {
  const out = [];

  console.log('═══ P1 NEWS / SOCIAL ═══');
  out.push(await safe('Currents',        () => news.fetchCurrents()));
  out.push(await safe('Newsdata',        () => news.fetchNewsdata()));
  out.push(await safe('Finlight',        () => news.fetchFinlight()));
  out.push(await safe('YouTube',         () => news.fetchYouTubeSearch()));
  out.push(await safe('Mastodon',        () => news.fetchMastodonSearch()));

  console.log('\n═══ P2 EMPLEO ═══');
  out.push(await safe('USAJobs',         () => govJobs.fetchUSAJobs({ keyword: 'engineer', limit: 10 })));
  out.push(await safe('Adzuna',          () => scraper.fetchAdzuna()));
  out.push(await safe('FranceTravail',   () => govJobs.fetchFranceTravail({ range: '0-9' })));
  out.push(await safe('Bundesagentur',   () => govJobs.fetchBundesagentur()));

  console.log('\n═══ P3 FINANZAS ═══');
  out.push(await safe('Wise:profiles',   () => wise.getProfiles()));
  out.push(await safe('Binance:balances',() => crypto_.fetchBinanceBalances()));
  out.push(await safe('Akahu',           async () => akahu.isConfigured?.() ? akahu.getAccounts() : { skipped: 'AKAHU_*  no configurado' }));

  console.log('\n═══ P6 LOGÍSTICA ═══');
  out.push(await safe('OpenChargeMap',   () => logistics.fetchOpenChargeMap({ country: 'NZ', maxresults: 50 })));

  console.log('\n═══ P7 BIO ═══');
  out.push(await safe('USDA',            () => bio.searchUSDAFood('chicken breast')));
  out.push(await safe('OpenUV',          () => bio.fetchOpenUV({ lat: -36.85, lon: 174.76 })));
  out.push(await safe('CalorieNinjas',   () => bio.parseNutrition('100g chicken breast')));

  console.log('\n═══════════════════════════════');
  console.log('REPORT');
  console.log('═══════════════════════════════');
  for (const r of out) console.log('  ' + r.line);
  const ok = out.filter(r => r.ok && !r.line.includes('⚪')).length;
  const ko = out.filter(r => !r.ok).length;
  const skip = out.filter(r => r.line.includes('⚪')).length;
  console.log(`\nTOTAL: ${ok} ok / ${ko} fallos / ${skip} no-configurado / ${out.length} total\n`);

  // Wise profile id extraction (siempre, para que el caller lo capture)
  try {
    const profiles = await wise.getProfiles();
    if (Array.isArray(profiles)) {
      const personal = profiles.find(p => p.type === 'PERSONAL') || profiles[0];
      if (personal?.id) console.log(`WISE_PROFILE_ID=${personal.id}`);
    }
  } catch (e) {
    console.log(`WISE_PROFILE_ID=ERROR ${e.message}`);
  }

  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
