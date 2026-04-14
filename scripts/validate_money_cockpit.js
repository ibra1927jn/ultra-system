// Browser validation of /money.html via puppeteer.
// Run inside ultra_puppeteer container which has puppeteer + chromium installed:
//   docker cp scripts/validate_money_cockpit.js ultra_puppeteer:/tmp/v.js
//   docker exec ultra_puppeteer node /tmp/v.js
//
// What it checks:
//   - login flow works
//   - /money.html renders
//   - key panels visible (no JS crash on init)
//   - no uncaught console errors / page errors
//   - all fetch /api/finances/* responses are 2xx

const puppeteer = require('puppeteer');

const ENGINE = process.env.ENGINE_URL || 'http://engine:3000';
const EMAIL = 'admin@ibrahim.ops';
const PASSWORD = 'nIJAudyZs2dSWr0';

const PANELS = [
  '#kpi-nw', '#kpi-runway', '#kpi-month', '#kpi-savings',
  '#nw-spark', '#nw-breakdown',
  '#by-account-table tbody',
  '#tx-feed-list',
  '#providers-list',
  '#fx-list',
  '#budget-bars',
  '#recurring-list',
  '#by-category-bars',
  '#tx-form',
  '#invest-table tbody',
  '#crypto-table tbody',
  '#goals-list',
  '#tax-residency-es',
  '#tax-modelo-100',
  '#tax-modelo-720',
  '#tax-modelo-721',
  '#tax-fif-nz',
  '#dz-csv',
  '#dz-receipt',
];

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => pageErrors.push(err.message));
  page.on('requestfailed', req => failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`));
  page.on('response', resp => {
    const u = resp.url();
    if (u.includes('/api/finances') && !resp.ok()) {
      failedRequests.push(`HTTP ${resp.status()} ${resp.request().method()} ${u}`);
    }
  });

  try {
    // ── login
    console.log('→ login');
    await page.goto(`${ENGINE}/login.html`, { waitUntil: 'networkidle2', timeout: 15000 });
    await page.evaluate(async (email, password) => {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      if (!r.ok) throw new Error('login http ' + r.status);
    }, EMAIL, PASSWORD);

    // ── navigate to money cockpit
    console.log('→ /money.html');
    await page.goto(`${ENGINE}/money.html`, { waitUntil: 'networkidle2', timeout: 20000 });

    // ── give panels 3s to load all data
    await new Promise(r => setTimeout(r, 3000));

    // ── inspect panels
    const results = [];
    for (const sel of PANELS) {
      const exists = await page.$(sel);
      const text = exists ? (await page.$eval(sel, el => (el.innerText || el.textContent || '').slice(0, 80))) : null;
      results.push({ sel, exists: !!exists, text: text?.replace(/\s+/g, ' ').trim() });
    }

    // ── grab title + workspace selector value
    const title = await page.title();
    const workspace = await page.$eval('#workspace-select', el => el.value);
    const alertsHidden = await page.$eval('#alerts-strip', el => el.classList.contains('hidden'));

    // ── click test: open invest detail (📈)
    let investClickOk = false;
    try {
      const btn = await page.$('#invest-table button[data-perf]');
      if (btn) {
        await btn.click();
        await new Promise(r => setTimeout(r, 1500));
        const detailVisible = await page.$eval('#invest-detail', el => !el.classList.contains('hidden'));
        investClickOk = detailVisible;
      }
    } catch (e) { /* ignore */ }

    // ── click test: tile-toggle (Modelo 720 items)
    let tileToggleOk = false;
    try {
      const btn = await page.$('#tax-modelo-720 .tile-toggle');
      if (btn) {
        await btn.click();
        await new Promise(r => setTimeout(r, 200));
        const detailVisible = await page.$eval('#tax-modelo-720 .tile-detail', el => !el.classList.contains('hidden'));
        tileToggleOk = detailVisible;
      }
    } catch (e) { /* ignore */ }

    // ── click test: budget add modal opens
    let modalOpenOk = false;
    try {
      await page.click('#budget-add-btn');
      await new Promise(r => setTimeout(r, 200));
      modalOpenOk = await page.$eval('#modal', el => !el.classList.contains('hidden'));
      if (modalOpenOk) await page.click('#modal-close');
    } catch (e) { /* ignore */ }

    // ── report
    console.log('\n══════════════════════════════════════════');
    console.log('Money Cockpit browser validation');
    console.log('══════════════════════════════════════════');
    console.log('title:', title);
    console.log('workspace:', workspace);
    console.log('alerts hidden:', alertsHidden);
    console.log('invest click→detail:', investClickOk ? 'OK' : 'FAIL');
    console.log('tile-toggle (720 items):', tileToggleOk ? 'OK' : 'FAIL');
    console.log('modal open (budget add):', modalOpenOk ? 'OK' : 'FAIL');
    console.log('\nPanel presence:');
    results.forEach(r => console.log(`  ${r.exists ? '✓' : '✗'} ${r.sel.padEnd(30)} ${r.text || '(empty)'}`));
    console.log('\nConsole errors:', consoleErrors.length);
    consoleErrors.forEach(e => console.log('  ✗', e));
    console.log('\nPage errors:', pageErrors.length);
    pageErrors.forEach(e => console.log('  ✗', e));
    console.log('\nFailed network:', failedRequests.length);
    failedRequests.forEach(e => console.log('  ✗', e));

    const fail = pageErrors.length || failedRequests.length;
    process.exit(fail ? 1 : 0);
  } catch (e) {
    console.error('VALIDATION ERROR:', e.message);
    process.exit(2);
  } finally {
    await browser.close();
  }
})();
