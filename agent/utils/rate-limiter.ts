// Token Bucket Rate Limiter
// Allows burst traffic up to bucket capacity, then enforces steady refill rate.
// Uses lazy refill — tokens are calculated on each consume() call, no background timer.

export interface RateLimiterConfig {
  /** Maximum tokens in the bucket (burst capacity) */
  maxTokens: number;
  /** Tokens added per second */
  refillRate: number;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
  lastAccess: number;
}

const CLEANUP_INTERVAL_MS = 60_000; // Clean stale entries every 60s
const STALE_THRESHOLD_MS = 300_000; // Remove entries unused for 5 minutes

export class TokenBucketRateLimiter {
  private buckets = new Map<string, Bucket>();
  private config: RateLimiterConfig;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: RateLimiterConfig) {
    this.config = config;

    // Periodic cleanup of stale entries to prevent memory leaks
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, bucket] of this.buckets) {
        if (now - bucket.lastAccess > STALE_THRESHOLD_MS) {
          this.buckets.delete(key);
        }
      }
    }, CLEANUP_INTERVAL_MS);

    // Allow Node to exit even if timer is running
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Try to consume tokens from the bucket for the given key.
   * Returns true if the request is allowed, false if rate-limited.
   */
  consume(key: string, tokens: number = 1): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      // First request for this key — start with full bucket
      bucket = {
        tokens: this.config.maxTokens,
        lastRefill: now,
        lastAccess: now,
      };
      this.buckets.set(key, bucket);
    }

    // Lazy refill: add tokens based on elapsed time
    const elapsed = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(
      this.config.maxTokens,
      bucket.tokens + elapsed * this.config.refillRate
    );
    bucket.lastRefill = now;
    bucket.lastAccess = now;

    // Check if enough tokens are available
    if (bucket.tokens < tokens) {
      return false;
    }

    bucket.tokens -= tokens;
    return true;
  }

  /** Returns remaining tokens for a key */
  remaining(key: string): number {
    const bucket = this.buckets.get(key);
    if (!bucket) return this.config.maxTokens;

    const now = Date.now();
    const elapsed = (now - bucket.lastRefill) / 1000;
    return Math.min(
      this.config.maxTokens,
      bucket.tokens + elapsed * this.config.refillRate
    );
  }

  /** Returns milliseconds until at least 1 token is available */
  retryAfterMs(key: string): number {
    const bucket = this.buckets.get(key);
    if (!bucket) return 0;

    const now = Date.now();
    const elapsed = (now - bucket.lastRefill) / 1000;
    const currentTokens = Math.min(
      this.config.maxTokens,
      bucket.tokens + elapsed * this.config.refillRate
    );

    if (currentTokens >= 1) return 0;

    const tokensNeeded = 1 - currentTokens;
    return Math.ceil((tokensNeeded / this.config.refillRate) * 1000);
  }

  /** Reset a specific key (e.g., on socket disconnect) */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /** Stop the cleanup timer */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.buckets.clear();
  }
}

/** Create a rate limiter with a named preset configuration */
export function createRateLimiter(
  preset: "graphql-api" | "external-api" | "websocket-events"
): TokenBucketRateLimiter {
  const configs: Record<string, RateLimiterConfig> = {
    "graphql-api": { maxTokens: 30, refillRate: 10 },
    "external-api": { maxTokens: 5, refillRate: 0.5 },
    "websocket-events": { maxTokens: 10, refillRate: 2 },
  };

  return new TokenBucketRateLimiter(configs[preset]);
}
