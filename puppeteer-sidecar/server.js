// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA Puppeteer sidecar (P5/P6 R5)                       ║
// ║                                                            ║
// ║  Desbloquea fuentes SPA que no devuelven RSS/JSON server-  ║
// ║  side. Llamado por ultra_engine via http://puppeteer:3000  ║
// ║                                                            ║
// ║  Endpoints:                                                ║
// ║   GET  /health             — liveness                      ║
// ║   POST /scrape             — generic selector-based extract║
// ║                                                            ║
// ║  Concurrency: 1 scrape a la vez. Cache 15min en memoria.  ║
// ║  Browser instance reusada (no relaunch por request).       ║
// ╚══════════════════════════════════════════════════════════╝

const express = require('express');
const puppeteer = require('puppeteer');

const PORT = 3000;
const CACHE_MS = 15 * 60 * 1000;
const NAV_TIMEOUT = 30000;

const app = express();
app.use(express.json({ limit: '256kb' }));

// ─── Browser singleton ────────────────────────────────────────
let browser = null;
let launching = null;

async function getBrowser() {
  if (browser && browser.process() && !browser.process().killed) return browser;
  if (launching) return launching;
  launching = puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--disable-blink-features=AutomationControlled',
    ],
  }).then(b => {
    browser = b;
    launching = null;
    b.on('disconnected', () => { browser = null; });
    return b;
  });
  return launching;
}

// ─── Mutex de 1 concurrencia ──────────────────────────────────
let queueTail = Promise.resolve();
function withMutex(fn) {
  const next = queueTail.then(fn, fn);
  queueTail = next.catch(() => {});
  return next;
}

// ─── In-memory cache ──────────────────────────────────────────
const cache = new Map();
function cacheGet(key) {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_MS) { cache.delete(key); return null; }
  return e.data;
}
function cachePut(key, data) {
  cache.set(key, { ts: Date.now(), data });
  // LRU-ish: cap at 50 entries
  if (cache.size > 50) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0][0];
    cache.delete(oldest);
  }
}

// ─── /health ──────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    browser_alive: !!(browser && browser.process() && !browser.process().killed),
    cache_size: cache.size,
    queue_pending: queueTail !== Promise.resolve(),
  });
});

// ─── /scrape ──────────────────────────────────────────────────
// Body: {
//   url: string (required),
//   waitFor: string|number (optional — selector to wait for, or ms),
//   selectors: { name: cssSelector, ...} (optional — extract text from each),
//   extract: 'html'|'text'|'links' (default 'html' if no selectors),
//   evaluate: string (optional — JS expression to eval in page context),
//   no_cache: boolean (default false)
// }
app.post('/scrape', async (req, res) => {
  const { url, waitFor, selectors, extract = 'html', evaluate, no_cache } = req.body || {};
  if (!url || !/^https?:\/\//.test(url)) {
    return res.status(400).json({ ok: false, error: 'url required (http/https)' });
  }

  const cacheKey = JSON.stringify({ url, waitFor, selectors, extract, evaluate });
  if (!no_cache) {
    const hit = cacheGet(cacheKey);
    if (hit) return res.json({ ...hit, cached: true });
  }

  try {
    const result = await withMutex(async () => {
      const b = await getBrowser();
      const page = await b.newPage();
      try {
        await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1280, height: 800 });
        await page.goto(url, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });

        if (typeof waitFor === 'number') {
          await new Promise(r => setTimeout(r, waitFor));
        } else if (typeof waitFor === 'string') {
          await page.waitForSelector(waitFor, { timeout: NAV_TIMEOUT }).catch(() => {});
        }

        let data;
        if (evaluate) {
          // eslint-disable-next-line no-new-func
          data = await page.evaluate(new Function(`return (${evaluate})`)());
        } else if (selectors && typeof selectors === 'object') {
          data = {};
          for (const [name, sel] of Object.entries(selectors)) {
            data[name] = await page.$$eval(sel, els => els.map(e => ({
              text: (e.innerText || e.textContent || '').trim(),
              href: e.href || null,
              html: e.outerHTML?.slice(0, 500) || null,
            })));
          }
        } else if (extract === 'text') {
          data = await page.evaluate(() => document.body.innerText);
        } else if (extract === 'links') {
          data = await page.$$eval('a[href]', as => as.map(a => ({ text: (a.innerText || '').trim(), href: a.href })).filter(l => l.href.startsWith('http')));
        } else {
          data = await page.content();
        }

        return { ok: true, url, data };
      } finally {
        await page.close().catch(() => {});
      }
    });

    if (!no_cache) cachePut(cacheKey, result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, url, error: err.message });
  }
});

// ─── Graceful shutdown ────────────────────────────────────────
process.on('SIGTERM', async () => {
  try { if (browser) await browser.close(); } catch {}
  process.exit(0);
});
process.on('SIGINT', async () => {
  try { if (browser) await browser.close(); } catch {}
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`🎭 Puppeteer sidecar listening on :${PORT}`);
});
