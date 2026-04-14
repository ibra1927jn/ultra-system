// ╔══════════════════════════════════════════════════════════╗
// ║  URL safety — SSRF protection for outbound HTTP calls    ║
// ║                                                          ║
// ║  Blocks requests to:                                     ║
// ║   - private IPv4 ranges (10/8, 172.16/12, 192.168/16)    ║
// ║   - loopback (127/8, ::1)                                ║
// ║   - link-local (169.254/16, fe80::/10)                   ║
// ║   - cloud metadata endpoints (AWS, GCP, Azure)           ║
// ║   - non-HTTP(S) schemes (file://, gopher://, data:)      ║
// ║   - localhost, internal docker-compose service names     ║
// ╚══════════════════════════════════════════════════════════╝

const net = require('net');

// Docker-compose service names we run internally — block external from
// tricking us into calling them.
const INTERNAL_HOSTNAMES = new Set([
  'localhost', 'ultra_engine', 'ultra_db', 'ultra_nlp', 'ultra_spacy',
  'ultra_extract', 'ultra_traccar', 'ultra_telethon', 'ultra_paperless',
  'ultra_paperless_redis', 'ultra_changedetection', 'ultra_fasten',
  'ultra_wger', 'ultra_mealie', 'ultra_grocy', 'ultra_jobspy',
  'ultra_rss_bridge', 'ultra_osrm',
]);

const METADATA_HOSTS = new Set([
  '169.254.169.254',         // AWS, GCP, Azure IMDS
  'metadata.google.internal',
  'metadata',
]);

/** Return true if an IPv4 address is in a private/reserved range. */
function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 10) return true;                          // 10.0.0.0/8
  if (a === 127) return true;                          // loopback
  if (a === 169 && b === 254) return true;             // link-local (incl. IMDS)
  if (a === 172 && b >= 16 && b <= 31) return true;    // 172.16/12
  if (a === 192 && b === 168) return true;             // 192.168/16
  if (a === 0) return true;                            // 0.0.0.0/8
  if (a >= 224) return true;                           // multicast + reserved
  return false;
}

/** Return true if IPv6 is loopback, link-local, or ULA. */
function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe80:') || lower.startsWith('fec0:')) return true;  // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;         // ULA
  return false;
}

/**
 * Validate a URL string for outbound fetch. Returns { ok: true } if safe
 * or { ok: false, reason: "..." } on reject.
 */
function validateOutboundUrl(urlStr) {
  if (typeof urlStr !== 'string' || !urlStr) return { ok: false, reason: 'empty url' };
  let u;
  try { u = new URL(urlStr); } catch { return { ok: false, reason: 'malformed url' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, reason: `scheme not allowed: ${u.protocol}` };
  }
  // URL preserves [...] brackets around IPv6. Strip for range checks.
  const hostname = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname) return { ok: false, reason: 'no hostname' };
  if (INTERNAL_HOSTNAMES.has(hostname)) return { ok: false, reason: `internal hostname: ${hostname}` };
  if (METADATA_HOSTS.has(hostname)) return { ok: false, reason: `metadata endpoint: ${hostname}` };

  // If hostname is a literal IP, check ranges directly.
  if (net.isIPv4(hostname) && isPrivateIPv4(hostname)) return { ok: false, reason: `private ipv4: ${hostname}` };
  if (net.isIPv6(hostname) && isPrivateIPv6(hostname)) return { ok: false, reason: `private ipv6: ${hostname}` };

  // Block unusual ports commonly used for internal services (22, 3306, 5432, 6379, 27017, etc.)
  // Allow only 80, 443, 8080, 8443 and no-port (default).
  const port = u.port ? parseInt(u.port, 10) : null;
  const allowedPorts = new Set([80, 443, 8080, 8443]);
  if (port && !allowedPorts.has(port)) {
    return { ok: false, reason: `port not allowed: ${port}` };
  }

  return { ok: true };
}

module.exports = { validateOutboundUrl };
