// Centralized GraphQL fetch utility with rate limit handling and retry logic.

import { getLogger } from "./logger";

const log = getLogger("API");

const DEFAULT_GRAPHQL_URL =
  (import.meta.env.VITE_GRAPHQL_URL as string | undefined) || "http://localhost:4000/graphql";

export interface GraphQLResponse<T = Record<string, unknown>> {
  data?: T;
  errors?: Array<{
    message: string;
    extensions?: { code?: string; retryAfterMs?: number };
  }>;
}

export interface FetchGraphQLOptions {
  /** Number of retries on 429 or network error. Default: 3 */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff. Default: 1000 */
  baseDelayMs?: number;
  /** AbortSignal for cancellation (e.g., from useEffect cleanup) */
  signal?: AbortSignal;
  /** Override the GraphQL URL (defaults to VITE_GRAPHQL_URL). Test seam. */
  url?: string;
  /** Override fetch (defaults to globalThis.fetch). Test seam. */
  fetchImpl?: typeof fetch;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Centralized GraphQL fetch with 429 handling and exponential backoff retry.
 * Returns { data, errors } — never throws for HTTP/rate-limit errors.
 *
 * Throws ONLY on AbortError (caller asked to cancel) so React effects'
 * cleanup propagation works without surprise log noise.
 */
export async function fetchGraphQL<T = Record<string, unknown>>(
  query: string,
  variables?: Record<string, unknown>,
  options?: FetchGraphQLOptions,
): Promise<GraphQLResponse<T>> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelay = options?.baseDelayMs ?? 1000;
  const url = options?.url ?? DEFAULT_GRAPHQL_URL;
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
        signal: options?.signal,
      });

      // Handle 429 — Too Many Requests
      if (res.status === 429) {
        if (attempt < maxRetries) {
          const retryAfter = res.headers.get("Retry-After");
          const delayMs = retryAfter
            ? Number(retryAfter) * 1000
            : baseDelay * Math.pow(2, attempt);

          log.warn("Rate limited (429); retrying", {
            attempt: attempt + 1,
            maxRetries,
            delayMs,
          });
          await sleep(delayMs);
          continue;
        }
        // Final attempt still 429
        return {
          errors: [
            {
              message: "Rate limited. Please try again later.",
              extensions: { code: "RATE_LIMITED" },
            },
          ],
        };
      }

      // Handle other HTTP errors
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const json = (await res.json()) as GraphQLResponse<T>;
      return json;
    } catch (error) {
      // Don't retry if explicitly aborted — let the caller's effect cleanup
      // observe the AbortError.
      if ((error as Error).name === "AbortError") throw error;

      lastError = error as Error;
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        log.warn("Request failed; retrying", {
          attempt: attempt + 1,
          maxRetries,
          delayMs: delay,
          error: (error as Error).message,
        });
        await sleep(delay);
      }
    }
  }

  // All retries exhausted
  return {
    errors: [{ message: lastError?.message || "Request failed after retries" }],
  };
}
