// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Bank CSV Parsers (P3)                    ║
// ║                                                          ║
// ║  Perfiles para los 5 bancos NZ del usuario:              ║
// ║  ASB, ANZ, Westpac, BNZ, Kiwibank                        ║
// ║                                                          ║
// ║  Cada perfil:                                            ║
// ║   • detect()  → autodetecta el formato a partir del CSV  ║
// ║   • parse()   → devuelve filas normalizadas              ║
// ║                                                          ║
// ║  Salida normalizada:                                     ║
// ║   { date, amount, type, description, account,           ║
// ║     imported_id, fingerprint }                           ║
// ║                                                          ║
// ║  Las fechas se normalizan a YYYY-MM-DD.                  ║
// ║  Los amounts > 0 = income; < 0 = expense; abs en BBDD.   ║
// ╚══════════════════════════════════════════════════════════╝

const crypto = require('crypto');

// ─── helpers de fecha ──────────────────────────────────────
function toISO_DDMMYYYY(s, sep = '/') {
  // 27/03/2026 → 2026-03-27
  const [d, m, y] = s.split(sep).map(x => x.trim());
  if (!d || !m || !y) return null;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}
function toISO_YYYYMMDD(s, sep = '/') {
  // 2026/03/27 → 2026-03-27
  const [y, m, d] = s.split(sep).map(x => x.trim());
  if (!y || !m || !d) return null;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// ─── parser CSV minimalista (handles quoted fields with commas) ─
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function parseAmount(s) {
  if (!s) return 0;
  // Quita comas de miles, paréntesis de débito, símbolos
  const clean = s.replace(/,/g, '').replace(/[$\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

function fingerprint(account, date, amount, description) {
  const data = `${account}|${date}|${amount.toFixed(2)}|${(description || '').toLowerCase().substring(0, 80)}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
}

// ═══════════════════════════════════════════════════════════
//  PERFILES POR BANCO
// ═══════════════════════════════════════════════════════════

const PROFILES = {
  // ─── ASB ────────────────────────────────────────────────
  // Header típico: "Date","Unique Id","Tran Type","Cheque Number","Payee","Memo","Amount"
  // Date: YYYY/MM/DD
  asb: {
    name: 'ASB',
    detect: (header) => /Unique Id/i.test(header) && /Tran Type/i.test(header),
    parse: (lines) => {
      const out = [];
      // Skip metadata header lines (ASB pone 6-7 líneas de comentarios antes)
      let headerIdx = lines.findIndex(l => /^"?Date"?,/.test(l));
      if (headerIdx === -1) headerIdx = 0;
      const cols = parseCsvLine(lines[headerIdx]);
      const idxDate = cols.findIndex(c => /^date$/i.test(c));
      const idxId = cols.findIndex(c => /unique id/i.test(c));
      const idxPayee = cols.findIndex(c => /^payee$/i.test(c));
      const idxMemo = cols.findIndex(c => /^memo$/i.test(c));
      const idxAmount = cols.findIndex(c => /^amount$/i.test(c));
      for (let i = headerIdx + 1; i < lines.length; i++) {
        const row = parseCsvLine(lines[i]);
        if (row.length < 4 || !row[idxDate]) continue;
        const date = toISO_YYYYMMDD(row[idxDate]);
        if (!date) continue;
        const amount = parseAmount(row[idxAmount]);
        const description = [row[idxPayee], row[idxMemo]].filter(Boolean).join(' · ');
        out.push({
          date,
          amount: Math.abs(amount),
          type: amount >= 0 ? 'income' : 'expense',
          description,
          account: 'ASB',
          imported_id: row[idxId] || null,
          fingerprint: fingerprint('ASB', date, amount, description),
        });
      }
      return out;
    },
  },

  // ─── ANZ ────────────────────────────────────────────────
  // Header: "Type","Details","Particulars","Code","Reference","Amount","Date","ForeignCurrencyAmount","ConversionCharge"
  // Date: DD/MM/YYYY
  anz: {
    name: 'ANZ',
    detect: (header) => /^"?Type"?,/i.test(header) && /Particulars/i.test(header),
    parse: (lines) => {
      const out = [];
      const cols = parseCsvLine(lines[0]);
      const idx = (re) => cols.findIndex(c => re.test(c));
      const idxDate = idx(/^date$/i);
      const idxAmount = idx(/^amount$/i);
      const idxDetails = idx(/details/i);
      const idxParticulars = idx(/particulars/i);
      const idxRef = idx(/reference/i);
      for (let i = 1; i < lines.length; i++) {
        const row = parseCsvLine(lines[i]);
        if (row.length < 3 || !row[idxDate]) continue;
        const date = toISO_DDMMYYYY(row[idxDate]);
        if (!date) continue;
        const amount = parseAmount(row[idxAmount]);
        const description = [row[idxDetails], row[idxParticulars], row[idxRef]].filter(Boolean).join(' · ');
        out.push({
          date,
          amount: Math.abs(amount),
          type: amount >= 0 ? 'income' : 'expense',
          description,
          account: 'ANZ',
          imported_id: null,
          fingerprint: fingerprint('ANZ', date, amount, description),
        });
      }
      return out;
    },
  },

  // ─── Westpac ────────────────────────────────────────────
  // Header: "Date","Amount","Other Party","Description","Reference","Particulars","Analysis Code","Code","Transaction Type","Serial","Transaction Code"
  // Date: DD/MM/YYYY
  westpac: {
    name: 'Westpac',
    detect: (header) => /^"?Date"?,/i.test(header) && /Other Party/i.test(header),
    parse: (lines) => {
      const out = [];
      const cols = parseCsvLine(lines[0]);
      const idx = (re) => cols.findIndex(c => re.test(c));
      const idxDate = idx(/^date$/i);
      const idxAmount = idx(/^amount$/i);
      const idxParty = idx(/other party/i);
      const idxDesc = idx(/description/i);
      for (let i = 1; i < lines.length; i++) {
        const row = parseCsvLine(lines[i]);
        if (row.length < 3 || !row[idxDate]) continue;
        const date = toISO_DDMMYYYY(row[idxDate]);
        if (!date) continue;
        const amount = parseAmount(row[idxAmount]);
        const description = [row[idxParty], row[idxDesc]].filter(Boolean).join(' · ');
        out.push({
          date,
          amount: Math.abs(amount),
          type: amount >= 0 ? 'income' : 'expense',
          description,
          account: 'Westpac',
          imported_id: null,
          fingerprint: fingerprint('Westpac', date, amount, description),
        });
      }
      return out;
    },
  },

  // ─── BNZ ────────────────────────────────────────────────
  // Header: Date,Amount,Payee,Particulars,Code,Reference,Tran Type,This Party Account,Other Party Account
  // Date: DD/MM/YYYY (algunos exports YYYY-MM-DD)
  bnz: {
    name: 'BNZ',
    detect: (header) => /Tran Type/i.test(header) && /Payee/i.test(header) && !/Unique Id/i.test(header),
    parse: (lines) => {
      const out = [];
      const cols = parseCsvLine(lines[0]);
      const idx = (re) => cols.findIndex(c => re.test(c));
      const idxDate = idx(/^date$/i);
      const idxAmount = idx(/^amount$/i);
      const idxPayee = idx(/^payee$/i);
      const idxParts = idx(/particulars/i);
      const idxRef = idx(/reference/i);
      for (let i = 1; i < lines.length; i++) {
        const row = parseCsvLine(lines[i]);
        if (row.length < 3 || !row[idxDate]) continue;
        const raw = row[idxDate];
        const date = raw.includes('-')
          ? raw // already ISO
          : toISO_DDMMYYYY(raw);
        if (!date) continue;
        const amount = parseAmount(row[idxAmount]);
        const description = [row[idxPayee], row[idxParts], row[idxRef]].filter(Boolean).join(' · ');
        out.push({
          date,
          amount: Math.abs(amount),
          type: amount >= 0 ? 'income' : 'expense',
          description,
          account: 'BNZ',
          imported_id: null,
          fingerprint: fingerprint('BNZ', date, amount, description),
        });
      }
      return out;
    },
  },

  // ─── Kiwibank ───────────────────────────────────────────
  // Header: Account number,Date,Memo/Description,Source Code,TP ref,TP part,TP code,OP ref,OP part,OP code,OP name,OP Bank Account Number,Amount,Balance
  // Date: DD-MM-YYYY (con guiones, único entre los 5)
  kiwibank: {
    name: 'Kiwibank',
    detect: (header) => /Account number/i.test(header) && /Memo\/Description/i.test(header),
    parse: (lines) => {
      const out = [];
      const cols = parseCsvLine(lines[0]);
      const idx = (re) => cols.findIndex(c => re.test(c));
      const idxAcc = idx(/account number/i);
      const idxDate = idx(/^date$/i);
      const idxMemo = idx(/memo\/description/i);
      const idxAmount = idx(/^amount$/i);
      const idxOpName = idx(/op name/i);
      for (let i = 1; i < lines.length; i++) {
        const row = parseCsvLine(lines[i]);
        if (row.length < 4 || !row[idxDate]) continue;
        // Kiwibank usa DD-MM-YYYY
        const date = toISO_DDMMYYYY(row[idxDate], '-');
        if (!date) continue;
        const amount = parseAmount(row[idxAmount]);
        const description = [row[idxOpName], row[idxMemo]].filter(Boolean).join(' · ');
        const acct = `Kiwibank-${(row[idxAcc] || '').slice(-4)}`;
        out.push({
          date,
          amount: Math.abs(amount),
          type: amount >= 0 ? 'income' : 'expense',
          description,
          account: acct,
          imported_id: null,
          fingerprint: fingerprint(acct, date, amount, description),
        });
      }
      return out;
    },
  },
};

// ═══════════════════════════════════════════════════════════
//  AUTO-DETECT + PARSE
// ═══════════════════════════════════════════════════════════

/**
 * Autodetecta el banco a partir de las primeras líneas del CSV.
 * Retorna el id del perfil o null.
 */
function detectBank(csvText) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  // Buscar header en primeras 10 líneas (ASB tiene metadata antes)
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const line = lines[i];
    for (const [id, prof] of Object.entries(PROFILES)) {
      if (prof.detect(line)) return id;
    }
  }
  return null;
}

/**
 * Parsea CSV con perfil dado (o autodetectado) y retorna filas normalizadas.
 */
function parseCsv(csvText, profileId = null) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return { profile: null, rows: [] };

  if (!profileId) profileId = detectBank(csvText);
  if (!profileId || !PROFILES[profileId]) {
    return { profile: null, rows: [], error: 'No se pudo detectar el banco' };
  }

  // Strip metadata lines: para ASB, encuentra la línea que empieza con "Date" o "
  let dataLines = lines;
  if (profileId === 'asb') {
    const headerIdx = lines.findIndex(l => /^"?Date"?,/.test(l));
    if (headerIdx > 0) dataLines = lines.slice(headerIdx);
  }

  const rows = PROFILES[profileId].parse(dataLines);
  return { profile: profileId, name: PROFILES[profileId].name, rows };
}

module.exports = {
  parseCsv,
  detectBank,
  PROFILES: Object.fromEntries(
    Object.entries(PROFILES).map(([k, v]) => [k, { name: v.name }])
  ),
};
