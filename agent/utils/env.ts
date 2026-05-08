// Boot-time environment-variable validators.
//
// Used by agent/monad/rpc.ts and agent/monad/contract-client.ts to fail
// FAST on a misconfigured deploy rather than silently running with bad
// values and erroring opaquely on the first contract call.
//
// All functions throw an Error with a clear, single-line message naming
// the offending env var. Callers should let the error propagate up to
// `main()` so the process exits with a non-zero code.

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/**
 * Read `process.env[name]`, trim, require it to be a non-empty string.
 * Returns the trimmed value. Throws if missing or whitespace-only.
 */
export function requireEnv(name: string): string {
  const raw = process.env[name];
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (trimmed.length === 0) {
    throw new Error(
      `Missing required environment variable ${name}. Set it in .env or your deploy config.`
    );
  }
  return trimmed;
}

/**
 * Read `process.env[name]`, validate as a 0x-prefixed 40-char hex address.
 * Returns the value typed as `0x${string}`. Throws if missing or malformed.
 */
export function requireAddress(name: string): `0x${string}` {
  const value = requireEnv(name);
  if (!ADDRESS_RE.test(value)) {
    throw new Error(
      `Environment variable ${name} is not a valid 0x address (got ${
        value.length > 12 ? value.slice(0, 12) + "…" : value
      }). Expected 0x + 40 hex chars.`
    );
  }
  return value as `0x${string}`;
}

/**
 * Optional address: returns the validated address if set, otherwise null.
 * A *malformed* value still throws — we only allow "unset" as the soft
 * failure mode. This catches a common testnet bug where Phase-2 addresses
 * are present but typoed.
 */
export function optionalAddress(name: string): `0x${string}` | null {
  const raw = process.env[name];
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (trimmed.length === 0) return null;
  if (!ADDRESS_RE.test(trimmed)) {
    throw new Error(
      `Environment variable ${name} is set but malformed (got ${
        trimmed.length > 12 ? trimmed.slice(0, 12) + "…" : trimmed
      }). Either unset it or fix it to be a valid 0x address.`
    );
  }
  return trimmed as `0x${string}`;
}

/**
 * Read a boolean env var. "true"/"1"/"yes" => true; everything else => false.
 * `undefined` returns the supplied default. Trim before compare.
 */
export function envFlag(name: string, defaultValue = false): boolean {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  const v = raw.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}
