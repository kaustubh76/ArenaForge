import { describe, it, expect, vi, beforeEach } from "vitest";
import { FaucetClient } from "../monad/faucet";
import { __setLogLevelForTests } from "../utils/logger";

beforeEach(() => {
  __setLogLevelForTests("silent");
});

const VALID_ADDR = "0x" + "ab".repeat(20);

function fakeFetchOk(body: object, status = 200) {
  return vi.fn(async () => ({
    status,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch;
}

function fakeFetchStatus(status: number, body: object | null = null) {
  return vi.fn(async () => ({
    status,
    text: async () => (body === null ? "" : JSON.stringify(body)),
  })) as unknown as typeof fetch;
}

describe("FaucetClient.claim — happy path", () => {
  it("returns ok=true and txHash when faucet replies 200", async () => {
    const fetchImpl = fakeFetchOk({ txHash: "0xdeadbeef", amount: "0.1" });
    const client = new FaucetClient({ fetchImpl });

    const result = await client.claim(VALID_ADDR);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.address).toBe(VALID_ADDR);
      expect(result.value.txHash).toBe("0xdeadbeef");
      expect(result.value.amount).toBe("0.1");
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("accepts `hash` field as alias for txHash", async () => {
    const fetchImpl = fakeFetchOk({ hash: "0xabc123" });
    const client = new FaucetClient({ fetchImpl });
    const result = await client.claim(VALID_ADDR);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.txHash).toBe("0xabc123");
  });
});

describe("FaucetClient.claim — failure modes", () => {
  it("returns reason='cooldown' on HTTP 429", async () => {
    const fetchImpl = fakeFetchStatus(429, { retryAfter: 3600 });
    const client = new FaucetClient({ fetchImpl });
    const result = await client.claim(VALID_ADDR);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe("cooldown");
  });

  it("treats body messages mentioning cooldown as cooldown even on 400", async () => {
    const fetchImpl = fakeFetchStatus(400, { error: "Address still in cooldown period" });
    const client = new FaucetClient({ fetchImpl });
    const result = await client.claim(VALID_ADDR);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe("cooldown");
  });

  it("returns reason='invalid_address' for malformed input", async () => {
    const fetchImpl = vi.fn();
    const client = new FaucetClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await client.claim("not-an-address");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe("invalid_address");
    // Must not have hit the network
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns reason='network' when fetch throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ENOTFOUND faucet.monad.xyz");
    }) as unknown as typeof fetch;
    const client = new FaucetClient({ fetchImpl });
    const result = await client.claim(VALID_ADDR);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe("network");
  });

  it("returns reason='http_error' on a generic non-2xx", async () => {
    const fetchImpl = fakeFetchStatus(500, { error: "Internal Server Error" });
    const client = new FaucetClient({ fetchImpl });
    const result = await client.claim(VALID_ADDR);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe("http_error");
  });

  it("returns reason='disabled' when client is constructed disabled", async () => {
    const fetchImpl = vi.fn();
    const client = new FaucetClient({
      enabled: false,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await client.claim(VALID_ADDR);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe("disabled");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("FaucetClient — endpoint config", () => {
  it("posts to the configured URL", async () => {
    const fetchImpl = fakeFetchOk({ txHash: "0x1" });
    const client = new FaucetClient({ url: "https://example.com/faucet", fetchImpl });
    await client.claim(VALID_ADDR);
    const calls = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0]).toBe("https://example.com/faucet");
  });

  it("posts the address in the JSON body", async () => {
    const fetchImpl = fakeFetchOk({ txHash: "0x1" });
    const client = new FaucetClient({ fetchImpl });
    await client.claim(VALID_ADDR);
    const calls = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls;
    const body = JSON.parse((calls[0][1] as { body: string }).body);
    expect(body.address).toBe(VALID_ADDR);
  });
});
