// Regression: AuctionWars used to fabricate a "synthetic-fallback" mystery
// box (sentinel address 0x...0001, deterministic timestamp-derived value,
// hint type "synthetic-fallback") when NadFun couldn't supply a real
// token. Slice #14 removed that mock — these tests pin the new behavior:
// no real token => no match. Match creation is then skipped by the
// arena-manager's existing withRetry + try/catch (we don't re-test that
// here; it has its own coverage).

import { describe, it, expect, beforeEach } from "vitest";
import { AuctionWarsEngine } from "../game-engine/auction-wars";
import type { NadFunClient } from "../monad/nadfun-client";
import type { TokenInfo } from "../game-engine/game-mode.interface";
import { __setLogLevelForTests } from "../utils/logger";

beforeEach(() => {
  __setLogLevelForTests("silent");
});

/** Stub that lets each test pick whether NadFun returns a token, null, or throws. */
function stubNadFun(opts: {
  responses: Array<TokenInfo | null | "throw">;
}): NadFunClient {
  let i = 0;
  return {
    getRandomActiveToken: async () => {
      const r = opts.responses[i] ?? null;
      i++;
      if (r === "throw") throw new Error("simulated network error");
      return r;
    },
    // Other NadFun methods aren't called by AuctionWars; cast suffices.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const realToken: TokenInfo = {
  address: "0x" + "ab".repeat(20),
  name: "Real Token",
  symbol: "RT",
  price: BigInt("123456789000000000"),
  marketCap: BigInt("500000000000000000000"),
  volume24h: BigInt("200000000000000000000"),
  graduated: false,
  curveLiquidity: BigInt("50000000000000000000"),
  lastTradeTimestamp: Math.floor(Date.now() / 1000) - 600,
  hourlyVolatility: 5,
};

describe("AuctionWars — no fabricated mystery box", () => {
  it("initMatch throws when NadFun returns no token (and retry also fails)", async () => {
    const engine = new AuctionWarsEngine(stubNadFun({ responses: [null, null] }));
    await expect(
      engine.initMatch(1, ["0x" + "11".repeat(20), "0x" + "22".repeat(20)], {})
    ).rejects.toThrow(/no real NadFun token available/);
  });

  it("initMatch throws when both attempts throw", async () => {
    const engine = new AuctionWarsEngine(stubNadFun({ responses: ["throw", "throw"] }));
    await expect(
      engine.initMatch(2, ["0x" + "11".repeat(20), "0x" + "22".repeat(20)], {})
    ).rejects.toThrow(/no real NadFun token available/);
  });

  it("initMatch succeeds when retry returns a real token (transient blip)", async () => {
    const engine = new AuctionWarsEngine(stubNadFun({ responses: [null, realToken] }));
    await expect(
      engine.initMatch(3, ["0x" + "11".repeat(20), "0x" + "22".repeat(20)], {})
    ).resolves.toBeUndefined();
    // Reach into the engine's private match map to inspect the real box.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internalMatches = (engine as any).matches as Map<number, { rounds: Array<{ box: { tokenAddress: string; hints: { type: string; value: string }[] } }> }>;
    const round0 = internalMatches.get(3)?.rounds[0];
    expect(round0).toBeDefined();
    expect(round0?.box.tokenAddress).toBe(realToken.address);
    expect(round0?.box.hints.every((h) => h.value !== "synthetic-fallback")).toBe(true);
  });

  it("regression: no hint with type/value 'synthetic-fallback' is ever produced", async () => {
    const engine = new AuctionWarsEngine(stubNadFun({ responses: [realToken] }));
    await engine.initMatch(4, ["0x" + "11".repeat(20), "0x" + "22".repeat(20)], {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internalMatches = (engine as any).matches as Map<number, { rounds: Array<{ box: { tokenAddress: string; hints: { type: string; value: string }[] } }> }>;
    const round0 = internalMatches.get(4)?.rounds[0];
    expect(round0).toBeDefined();
    expect(round0?.box.hints.every((h) => h.value !== "synthetic-fallback")).toBe(true);
    // Sentinel address from the old fallback never appears.
    expect(round0?.box.tokenAddress).not.toBe("0x0000000000000000000000000000000000000001");
  });
});
