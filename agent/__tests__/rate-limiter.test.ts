import { describe, it, expect, afterEach } from "vitest";
import {
  TokenBucketRateLimiter,
  createRateLimiter,
  destroyAllRateLimiters,
  __rateLimiterRegistrySize,
} from "../utils/rate-limiter";

afterEach(() => {
  // Make sure no test leaks limiters into the next test's registry assertions.
  destroyAllRateLimiters();
});

describe("TokenBucketRateLimiter", () => {
  it("permits up to maxTokens before rejecting", () => {
    const lim = new TokenBucketRateLimiter({ maxTokens: 3, refillRate: 0 });
    expect(lim.consume("k")).toBe(true);
    expect(lim.consume("k")).toBe(true);
    expect(lim.consume("k")).toBe(true);
    expect(lim.consume("k")).toBe(false);
    lim.destroy();
  });

  it("isolates buckets per key", () => {
    const lim = new TokenBucketRateLimiter({ maxTokens: 1, refillRate: 0 });
    expect(lim.consume("a")).toBe(true);
    expect(lim.consume("a")).toBe(false);
    expect(lim.consume("b")).toBe(true); // different key has its own bucket
    lim.destroy();
  });

  it("refills lazily based on elapsed time", async () => {
    const lim = new TokenBucketRateLimiter({ maxTokens: 1, refillRate: 100 }); // 100/sec
    expect(lim.consume("k")).toBe(true);
    expect(lim.consume("k")).toBe(false);
    // Wait long enough to earn at least 1 full token (>= 10ms at 100/s).
    await new Promise((res) => setTimeout(res, 25));
    expect(lim.consume("k")).toBe(true);
    lim.destroy();
  });

  it("retryAfterMs returns a sensible non-negative value when empty", () => {
    const lim = new TokenBucketRateLimiter({ maxTokens: 1, refillRate: 1 });
    lim.consume("k");
    const ms = lim.retryAfterMs("k");
    expect(ms).toBeGreaterThanOrEqual(0);
    expect(ms).toBeLessThanOrEqual(1100);
    lim.destroy();
  });
});

describe("registry / destroyAllRateLimiters", () => {
  it("registers each new limiter", () => {
    const before = __rateLimiterRegistrySize();
    const a = new TokenBucketRateLimiter({ maxTokens: 1, refillRate: 1 });
    const b = createRateLimiter("graphql-api");
    expect(__rateLimiterRegistrySize()).toBe(before + 2);
    a.destroy();
    b.destroy();
  });

  it("destroy() removes the limiter from the registry", () => {
    const lim = new TokenBucketRateLimiter({ maxTokens: 1, refillRate: 1 });
    const sizeWith = __rateLimiterRegistrySize();
    lim.destroy();
    expect(__rateLimiterRegistrySize()).toBe(sizeWith - 1);
  });

  it("destroyAllRateLimiters clears the registry", () => {
    new TokenBucketRateLimiter({ maxTokens: 1, refillRate: 1 });
    new TokenBucketRateLimiter({ maxTokens: 1, refillRate: 1 });
    new TokenBucketRateLimiter({ maxTokens: 1, refillRate: 1 });
    expect(__rateLimiterRegistrySize()).toBeGreaterThanOrEqual(3);
    destroyAllRateLimiters();
    expect(__rateLimiterRegistrySize()).toBe(0);
  });

  it("destroy on an already-destroyed limiter is a no-op", () => {
    const lim = new TokenBucketRateLimiter({ maxTokens: 1, refillRate: 1 });
    lim.destroy();
    expect(() => lim.destroy()).not.toThrow();
  });
});
