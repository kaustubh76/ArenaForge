// RNG abstraction. One module owns all randomness in the runtime hot path
// so tests can inject a seeded RNG and shuffles can be guaranteed uniform
// (Fisher-Yates instead of the biased `sort(() => Math.random() - 0.5)`
// pattern that was scattered across the game engines).
//
// Production callers pass nothing → `defaultRng` (Math.random).
// Tests pass `seededRng(seed)` for reproducibility.

/** Returns a float in [0, 1). Matches the Math.random contract. */
export type Rng = () => number;

/** Production default — wraps the platform RNG. */
export const defaultRng: Rng = () => Math.random();

/**
 * mulberry32: small, fast, well-distributed seeded PRNG.
 * Produces the same sequence for the same seed across runs / platforms.
 * Adequate for game RNG and tests; NOT cryptographic.
 */
export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle. In-place would be more efficient but most callers
 * spread the input first, so we accept either an array or a readonly array
 * and always return a new array — matches the previous `[...arr].sort(...)`
 * call signature.
 *
 * Replaces the biased `sort(() => rng() - 0.5)` pattern that was sprinkled
 * across the codebase. That pattern can produce skewed distributions
 * because `sort` calls the comparator multiple times per element with no
 * uniformity guarantee.
 */
export function shuffle<T>(input: readonly T[], rng: Rng = defaultRng): T[] {
  const out = [...input];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/**
 * Pick one element uniformly at random. Returns `undefined` for an empty
 * input rather than throwing — caller decides what "no choice" means.
 */
export function pickOne<T>(arr: readonly T[], rng: Rng = defaultRng): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Random integer in [min, max] (inclusive on both ends). Useful for
 * "random suffix" use cases that previously did
 * `Math.floor(Math.random() * 1000)`.
 */
export function randomInt(min: number, max: number, rng: Rng = defaultRng): number {
  if (max < min) [min, max] = [max, min];
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * Generate a short opaque ID. Used in places that previously did
 * `Math.random().toString(36).slice(2, 8)` for box / instance ids.
 */
export function randomId(prefix = "", rng: Rng = defaultRng): string {
  // Two 32-bit chunks → ~12 base36 chars. Good enough for short-lived ids.
  const a = Math.floor(rng() * 0xffffffff).toString(36);
  const b = Math.floor(rng() * 0xffffffff).toString(36);
  return prefix ? `${prefix}-${a}${b}` : `${a}${b}`;
}
