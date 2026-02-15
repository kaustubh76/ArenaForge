// Input validation utilities for GraphQL resolvers and API boundaries

/** Maximum allowed limit for paginated queries */
const MAX_LIMIT = 100;
/** Maximum allowed offset for paginated queries */
const MAX_OFFSET = 10000;

/** Clamp a pagination limit to safe bounds */
export function clampLimit(limit: number | undefined | null, defaultVal = 50): number {
  if (limit == null) return defaultVal;
  if (!Number.isFinite(limit) || limit < 1) return defaultVal;
  return Math.min(limit, MAX_LIMIT);
}

/** Clamp a pagination offset to safe bounds */
export function clampOffset(offset: number | undefined | null): number {
  if (offset == null) return 0;
  if (!Number.isFinite(offset) || offset < 0) return 0;
  return Math.min(offset, MAX_OFFSET);
}

/** Validate a positive integer ID (tournament, match, season) */
export function validateId(id: number, label = "ID"): void {
  if (!Number.isInteger(id) || id < 1) {
    throw new Error(`Invalid ${label}: must be a positive integer`);
  }
}

/** Validate an Ethereum address (basic hex check) */
export function validateAddress(address: string, label = "address"): void {
  if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error(`Invalid ${label}: must be a 42-character hex string starting with 0x`);
  }
}
