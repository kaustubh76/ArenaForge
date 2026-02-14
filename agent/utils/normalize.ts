// Centralized normalization utilities for consistent hashing and keying.
// All Map keys, cache keys, and identifiers should flow through these helpers
// to prevent key mismatches from case differences or format inconsistencies.

/** Normalize an Ethereum address to lowercase hex */
export function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

/** Normalize an IPv4/IPv6 address for consistent rate limiting keys */
export function normalizeIP(ip: string): string {
  // Strip IPv6-mapped IPv4 prefix (::ffff:127.0.0.1 → 127.0.0.1)
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  // Normalize IPv6 loopback variants to IPv4
  if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') return '127.0.0.1';
  return ip;
}

/** Create a deterministic cache key from an object (sorted keys) */
export function stableJsonKey(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}
