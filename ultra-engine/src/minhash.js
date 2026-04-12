// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — MinHash + LSH dedup (P1 Fase 2)          ║
// ║                                                            ║
// ║  Implementación pura JS, sin deps. Inspired by datasketch ║
// ║  (Python). MinHash de tokens para estimar Jaccard rápido. ║
// ║  LSH bucketing para queries O(1) en grandes datasets.     ║
// ║                                                            ║
// ║  Defaults: numHashes=128, bands=32, rows=4 (32*4=128).    ║
// ║  Bands × rows determinan el threshold:                    ║
// ║   threshold ≈ (1/bands) ^ (1/rows) = (1/32)^(1/4) ≈ 0.42  ║
// ║  Para threshold ~0.7: bands=16, rows=8.                   ║
// ║  Para threshold ~0.8: bands=8, rows=16.                   ║
// ║                                                            ║
// ║  Aplicación: deduplicación articles_normalized + opps +   ║
// ║  emp_listings con threshold Jaccard >= 0.7.               ║
// ╚══════════════════════════════════════════════════════════╝

// FNV-1a 32-bit hash family — barato y bien distribuido
function fnv1a(str, seed = 0x811c9dc5) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

const MAX_UINT32 = 0xffffffff;

class MinHash {
  /**
   * @param {number} numHashes - número de funciones hash (default 128)
   * @param {number[]} seeds - opcional, semillas custom
   */
  constructor(numHashes = 128, seeds = null) {
    this.numHashes = numHashes;
    this.seeds = seeds || Array.from({ length: numHashes }, (_, i) => 0x12345 + i * 0x9E37);
    this.signature = new Uint32Array(numHashes).fill(MAX_UINT32);
  }

  // Minimum shingles required for a meaningful MinHash signature.
  // Below this, Jaccard estimates are unreliable and produce false positives.
  static MIN_SHINGLES = 4;

  /**
   * Tokeniza texto en shingles de k=3 palabras (o caracteres si short).
   * Unicode-aware: preserves CJK, Hangul, Arabic, Cyrillic, Devanagari, etc.
   */
  static shingle(text, k = 3) {
    if (!text) return new Set();
    // \p{L} = any Unicode letter, \p{N} = any Unicode digit
    const norm = String(text).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    const words = norm.split(' ').filter(w => w.length > 0);
    const shingles = new Set();
    if (words.length >= k) {
      for (let i = 0; i <= words.length - k; i++) {
        shingles.add(words.slice(i, i + k).join(' '));
      }
    }
    // Always add char-grams for CJK/short text (complementary to word shingles)
    if (shingles.size < MinHash.MIN_SHINGLES) {
      for (let i = 0; i <= norm.length - k; i++) {
        shingles.add(norm.slice(i, i + k));
      }
    }
    return shingles;
  }

  update(token) {
    for (let i = 0; i < this.numHashes; i++) {
      const h = fnv1a(token, this.seeds[i]);
      if (h < this.signature[i]) this.signature[i] = h;
    }
  }

  updateBatch(tokens) {
    for (const t of tokens) this.update(t);
    return this;
  }

  /**
   * Estima Jaccard similarity con otra MinHash.
   */
  jaccard(other) {
    if (other.numHashes !== this.numHashes) {
      throw new Error('numHashes mismatch');
    }
    let equal = 0;
    for (let i = 0; i < this.numHashes; i++) {
      if (this.signature[i] === other.signature[i]) equal++;
    }
    return equal / this.numHashes;
  }

  toBuffer() {
    return Buffer.from(this.signature.buffer);
  }

  static fromBuffer(buf, numHashes = 128) {
    const m = new MinHash(numHashes);
    m.signature = new Uint32Array(buf.buffer, buf.byteOffset, numHashes);
    return m;
  }
}

/**
 * LSH index: hash band-keys → array de docIds. In-memory only.
 * Para persistir, serializar el `buckets` Map y `signatures` Map.
 */
class MinHashLSH {
  /**
   * @param {object} opts
   * @param {number} opts.numHashes - debe coincidir con MinHashes insertados
   * @param {number} opts.bands - número de bands
   * @param {number} opts.rows - rows por band (numHashes = bands * rows)
   */
  constructor({ numHashes = 128, bands = 32, rows = 4 } = {}) {
    if (bands * rows !== numHashes) {
      throw new Error(`bands*rows must equal numHashes (${bands}*${rows} != ${numHashes})`);
    }
    this.numHashes = numHashes;
    this.bands = bands;
    this.rows = rows;
    this.buckets = new Map(); // band_key → Set<docId>
    this.signatures = new Map(); // docId → MinHash
  }

  _bandKey(band, signature) {
    const slice = signature.slice(band * this.rows, (band + 1) * this.rows);
    // Concat hex representation
    return `${band}:` + Array.from(slice).map(x => x.toString(16)).join(',');
  }

  insert(docId, minhash) {
    if (this.signatures.has(docId)) return false;
    this.signatures.set(docId, minhash);
    for (let b = 0; b < this.bands; b++) {
      const key = this._bandKey(b, minhash.signature);
      if (!this.buckets.has(key)) this.buckets.set(key, new Set());
      this.buckets.get(key).add(docId);
    }
    return true;
  }

  /**
   * Devuelve candidatos similar (por cualquier band match).
   */
  query(minhash) {
    const candidates = new Set();
    for (let b = 0; b < this.bands; b++) {
      const key = this._bandKey(b, minhash.signature);
      const bucket = this.buckets.get(key);
      if (bucket) for (const id of bucket) candidates.add(id);
    }
    return candidates;
  }

  /**
   * Query + filter por threshold real.
   */
  queryWithThreshold(minhash, threshold = 0.7) {
    const candidates = this.query(minhash);
    const matches = [];
    for (const id of candidates) {
      const sig = this.signatures.get(id);
      const sim = minhash.jaccard(sig);
      if (sim >= threshold) matches.push({ docId: id, similarity: sim });
    }
    matches.sort((a, b) => b.similarity - a.similarity);
    return matches;
  }

  size() { return this.signatures.size; }
}

/**
 * Helper: dedup un array de {id, text} → marca dups con duplicate_of.
 * Threshold default 0.7. Devuelve { unique, duplicates }.
 */
function dedupArray(items, { threshold = 0.7, numHashes = 128, bands = 32, rows = 4 } = {}) {
  const lsh = new MinHashLSH({ numHashes, bands, rows });
  const unique = [];
  const duplicates = [];

  for (const item of items) {
    const m = new MinHash(numHashes);
    m.updateBatch(MinHash.shingle(item.text));
    const matches = lsh.queryWithThreshold(m, threshold);
    if (matches.length > 0) {
      duplicates.push({
        id: item.id,
        duplicate_of: matches[0].docId,
        similarity: Number(matches[0].similarity.toFixed(3)),
      });
    } else {
      unique.push(item.id);
      lsh.insert(item.id, m);
    }
  }
  return { unique, duplicates, total: items.length };
}

module.exports = { MinHash, MinHashLSH, dedupArray, fnv1a };
