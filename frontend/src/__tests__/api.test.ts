import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchGraphQL } from "@/lib/api";
import { __setLogLevelForTests } from "@/lib/logger";

beforeEach(() => {
  __setLogLevelForTests("silent");
});

/** Minimal Response stub matching what fetchGraphQL reads. */
function fakeResponse(opts: {
  status?: number;
  ok?: boolean;
  body?: unknown;
  retryAfterHeader?: string | null;
  statusText?: string;
}): Response {
  const status = opts.status ?? 200;
  const ok = opts.ok ?? (status >= 200 && status < 300);
  return {
    status,
    ok,
    statusText: opts.statusText ?? "",
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "retry-after" ? opts.retryAfterHeader ?? null : null,
    },
    json: async () => opts.body,
  } as unknown as Response;
}

const QUERY = "{ ping }";

describe("fetchGraphQL — happy path", () => {
  it("returns parsed { data } on a 200 with valid JSON", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeResponse({ status: 200, body: { data: { ping: "pong" } } }),
    ) as unknown as typeof fetch;

    const result = await fetchGraphQL<{ ping: string }>(
      QUERY,
      undefined,
      { fetchImpl, url: "http://test/graphql", baseDelayMs: 1 },
    );

    expect(result).toEqual({ data: { ping: "pong" } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("posts to the configured URL with JSON body", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeResponse({ status: 200, body: { data: {} } }),
    ) as unknown as typeof fetch;

    await fetchGraphQL(
      QUERY,
      { x: 1 },
      { fetchImpl, url: "http://example.com/g", baseDelayMs: 1 },
    );

    const calls = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0]).toBe("http://example.com/g");
    const init = calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.query).toBe(QUERY);
    expect(body.variables).toEqual({ x: 1 });
  });

  it("passes through GraphQL errors from a 200 response", async () => {
    const errors = [{ message: "unauthorized" }];
    const fetchImpl = vi.fn(async () =>
      fakeResponse({ status: 200, body: { errors } }),
    ) as unknown as typeof fetch;

    const result = await fetchGraphQL(QUERY, undefined, {
      fetchImpl,
      baseDelayMs: 1,
    });
    expect(result.errors).toEqual(errors);
    expect(result.data).toBeUndefined();
  });
});

describe("fetchGraphQL — 429 rate limit handling", () => {
  it("retries on 429 then succeeds when the next attempt returns 200", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call++;
      if (call === 1) {
        return fakeResponse({ status: 429, retryAfterHeader: null });
      }
      return fakeResponse({ status: 200, body: { data: { ok: true } } });
    }) as unknown as typeof fetch;

    const result = await fetchGraphQL(QUERY, undefined, {
      fetchImpl,
      baseDelayMs: 1, // keep retry waits short for tests
      maxRetries: 3,
    });

    expect(call).toBe(2);
    expect(result).toEqual({ data: { ok: true } });
  });

  it("respects the Retry-After header (numeric seconds)", async () => {
    let call = 0;
    const start = Date.now();
    const fetchImpl = vi.fn(async () => {
      call++;
      if (call === 1) {
        return fakeResponse({ status: 429, retryAfterHeader: "0" }); // 0 sec → fast
      }
      return fakeResponse({ status: 200, body: { data: {} } });
    }) as unknown as typeof fetch;

    const result = await fetchGraphQL(QUERY, undefined, {
      fetchImpl,
      baseDelayMs: 1,
      maxRetries: 1,
    });
    const elapsed = Date.now() - start;
    expect(result.data).toEqual({});
    // With Retry-After: 0 the delay should be tiny, not the exponential default.
    expect(elapsed).toBeLessThan(500);
  });

  it("returns RATE_LIMITED error when 429 persists past maxRetries", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeResponse({ status: 429, retryAfterHeader: null }),
    ) as unknown as typeof fetch;

    const result = await fetchGraphQL(QUERY, undefined, {
      fetchImpl,
      baseDelayMs: 1,
      maxRetries: 2,
    });

    expect(result.errors?.[0].extensions?.code).toBe("RATE_LIMITED");
    // 1 initial + 2 retries = 3 attempts total
    expect((fetchImpl as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3);
  });
});

describe("fetchGraphQL — failure modes", () => {
  it("retries on network error and surfaces last error after max retries", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ENOTFOUND");
    }) as unknown as typeof fetch;

    const result = await fetchGraphQL(QUERY, undefined, {
      fetchImpl,
      baseDelayMs: 1,
      maxRetries: 2,
    });
    expect(result.errors?.[0].message).toContain("ENOTFOUND");
    expect((fetchImpl as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3);
  });

  it("treats non-429 HTTP errors as retryable network-shape errors", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeResponse({ status: 500, ok: false, statusText: "Internal Server Error" }),
    ) as unknown as typeof fetch;

    const result = await fetchGraphQL(QUERY, undefined, {
      fetchImpl,
      baseDelayMs: 1,
      maxRetries: 1,
    });
    expect(result.errors?.[0].message).toContain("HTTP 500");
    expect((fetchImpl as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it("re-throws AbortError without retrying", async () => {
    const fetchImpl = vi.fn(async () => {
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    }) as unknown as typeof fetch;

    await expect(
      fetchGraphQL(QUERY, undefined, { fetchImpl, baseDelayMs: 1, maxRetries: 5 }),
    ).rejects.toThrow("aborted");
    // Only one attempt because AbortError short-circuits the retry loop.
    expect((fetchImpl as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });
});

describe("fetchGraphQL — config injection", () => {
  it("uses some non-empty URL when none supplied (env or localhost fallback)", async () => {
    // The actual default depends on VITE_GRAPHQL_URL (which may be set in a
    // local `.env`). We don't pin the value — only that a real URL is used.
    const fetchImpl = vi.fn(async () =>
      fakeResponse({ status: 200, body: { data: {} } }),
    ) as unknown as typeof fetch;

    await fetchGraphQL(QUERY, undefined, { fetchImpl, baseDelayMs: 1 });

    const calls = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls;
    expect(typeof calls[0][0]).toBe("string");
    expect((calls[0][0] as string).startsWith("http")).toBe(true);
  });

  it("explicit `url` option overrides env-default URL", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeResponse({ status: 200, body: { data: {} } }),
    ) as unknown as typeof fetch;

    await fetchGraphQL(QUERY, undefined, {
      fetchImpl,
      baseDelayMs: 1,
      url: "https://my-explicit-url.test/g",
    });

    const calls = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0]).toBe("https://my-explicit-url.test/g");
  });
});
