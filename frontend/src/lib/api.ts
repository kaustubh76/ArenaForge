// Centralized GraphQL fetch utility with rate limit handling and retry logic.

const GRAPHQL_URL = import.meta.env.VITE_GRAPHQL_URL || "http://localhost:4000/graphql";

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
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Centralized GraphQL fetch with 429 handling and exponential backoff retry.
 * Returns { data, errors } — never throws for HTTP/rate-limit errors.
 */
export async function fetchGraphQL<T = Record<string, unknown>>(
  query: string,
  variables?: Record<string, unknown>,
  options?: FetchGraphQLOptions
): Promise<GraphQLResponse<T>> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelay = options?.baseDelayMs ?? 1000;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(GRAPHQL_URL, {
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

          console.warn(
            `[API] Rate limited (429), retry ${attempt + 1}/${maxRetries} in ${delayMs}ms`
          );
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
      // Don't retry if explicitly aborted
      if ((error as Error).name === "AbortError") throw error;

      lastError = error as Error;
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.warn(
          `[API] Request failed, retry ${attempt + 1}/${maxRetries} in ${delay}ms`
        );
        await sleep(delay);
      }
    }
  }

  // All retries exhausted
  return {
    errors: [{ message: lastError?.message || "Request failed after retries" }],
  };
}
