// Throttled fetch wrapper for outbound external API calls.
// Provides rate limiting, 429 detection, and exponential backoff retry.

import { TokenBucketRateLimiter } from "./rate-limiter";

export interface ThrottledFetchConfig {
  /** Rate limiter instance to use */
  rateLimiter: TokenBucketRateLimiter;
  /** Key for the rate limiter bucket. Default: "global" */
  rateLimiterKey?: string;
  /** Max retry attempts on failure/429. Default: 3 */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff. Default: 1000 */
  baseRetryDelayMs?: number;
  /** Request timeout in ms. Default: 15000 */
  timeoutMs?: number;
  /** Service name for log messages (e.g., "Moltbook", "NadFun") */
  serviceName?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch wrapper with rate limiting and retry logic for external API calls.
 * Waits if rate-limited (doesn't reject), retries on 429 with backoff.
 */
export async function throttledFetch(
  url: string,
  init: RequestInit | undefined,
  config: ThrottledFetchConfig
): Promise<Response> {
  const key = config.rateLimiterKey ?? "global";
  const maxRetries = config.maxRetries ?? 3;
  const baseDelay = config.baseRetryDelayMs ?? 1000;
  const serviceName = config.serviceName ?? "ExternalAPI";
  const timeoutMs = config.timeoutMs ?? 15000;

  // Pre-flight rate limit: wait until a token is available
  let waitAttempts = 0;
  while (!config.rateLimiter.consume(key)) {
    const waitMs = config.rateLimiter.retryAfterMs(key);
    const bounded = Math.min(waitMs, 5000);
    console.log(`[${serviceName}] Rate limited, waiting ${bounded}ms`);
    await sleep(bounded);
    waitAttempts++;
    if (waitAttempts > 10) {
      // Safety valve: don't wait forever
      break;
    }
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.status === 429) {
        if (attempt < maxRetries) {
          // Parse Retry-After header (seconds or HTTP date)
          const retryAfter = response.headers.get("Retry-After");
          let delayMs: number;

          if (retryAfter && !isNaN(Number(retryAfter))) {
            delayMs = Number(retryAfter) * 1000;
          } else if (retryAfter) {
            delayMs = Math.max(new Date(retryAfter).getTime() - Date.now(), 1000);
          } else {
            delayMs = baseDelay * Math.pow(2, attempt);
          }

          console.warn(
            `[${serviceName}] 429 received (attempt ${attempt + 1}/${maxRetries + 1}), ` +
              `retrying in ${delayMs}ms`
          );
          await sleep(delayMs);
          continue;
        }
        // Last attempt still 429 — return the response as-is
        console.error(`[${serviceName}] 429 persists after ${maxRetries + 1} attempts`);
      }

      return response;
    } catch (error) {
      lastError = error as Error;

      // Don't retry on abort (intentional cancellation)
      if ((error as Error).name === "AbortError" && attempt === 0) {
        // First attempt timeout — retry
        console.warn(
          `[${serviceName}] Request timed out (attempt ${attempt + 1}), retrying`
        );
      }

      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.warn(
          `[${serviceName}] Request failed (attempt ${attempt + 1}/${maxRetries + 1}), ` +
            `retrying in ${delay}ms: ${(error as Error).message}`
        );
        await sleep(delay);
      }
    }
  }

  throw (
    lastError ||
    new Error(`[${serviceName}] Request failed after ${maxRetries + 1} attempts`)
  );
}
