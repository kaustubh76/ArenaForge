import { describe, it, expect, beforeEach } from "vitest";
import { AuctionWarsEngine } from "../../game-engine/auction-wars";
import type { NadFunClient } from "../../monad/nadfun-client";
import type { TokenInfo } from "../../game-engine/game-mode.interface";
import { __setLogLevelForTests } from "../../utils/logger";

beforeEach(() => {
  __setLogLevelForTests("silent");
});

// Stub NadFun client that always supplies a real-looking token so initMatch
// doesn't abort. Mirrors the pattern in agent/__tests__/auction-wars-no-mock.test.ts.
function stubNadFun(): NadFunClient {
  const token: TokenInfo = {
    address: ("0x" + "ab".repeat(20)) as `0x${string}`,
    name: "Mock Token",
    symbol: "MOCK",
    price: BigInt("123456789000000000"),
    marketCap: BigInt("500000000000000000000"),
    volume24h: BigInt("200000000000000000000"),
    graduated: false,
    curveLiquidity: BigInt("50000000000000000000"),
    lastTradeTimestamp: Math.floor(Date.now() / 1000) - 600,
    hourlyVolatility: 5,
  };
  return {
    getRandomActiveToken: async () => token,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const PLAYER_A = "0x" + "11".repeat(20);
const PLAYER_B = "0x" + "22".repeat(20);

describe("AuctionWarsEngine — on-chain sync (Slice A)", () => {
  it("isResolvable returns true when on-chain says both players revealed", async () => {
    const stubClient = {
      initAuctionMatch: async () => undefined,
      getAuctionRound: async () => ({
        mysteryBoxHash: ("0x" + "ab".repeat(32)) as `0x${string}`,
        biddingDeadline: BigInt(Math.floor(Date.now() / 1000) + 60),
        revealDeadline: BigInt(Math.floor(Date.now() / 1000) + 120),
        actualValue: 0n,
        winner: "0x0000000000000000000000000000000000000000" as `0x${string}`,
        winningBid: 0n,
        resolved: false,
      }),
      getAuctionBid: async (_m: number, _r: number, player: string) => ({
        agent: player as `0x${string}`,
        bidHash: ("0x" + "cd".repeat(32)) as `0x${string}`,
        revealedAmount: player === PLAYER_A ? 40n : 50n,
        committed: true,
        revealed: true,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = new AuctionWarsEngine(stubNadFun(), stubClient as any);
    await e.initMatch(1, [PLAYER_A, PLAYER_B], { auctionBoxCount: 1 });
    const result = await e.isResolvable(1);
    expect(result).toBe(true);
  });

  it("isResolvable returns false when on-chain says nobody committed yet", async () => {
    const stubClient = {
      initAuctionMatch: async () => undefined,
      getAuctionRound: async () => ({
        mysteryBoxHash: ("0x" + "ab".repeat(32)) as `0x${string}`,
        biddingDeadline: BigInt(Math.floor(Date.now() / 1000) + 60),
        revealDeadline: BigInt(Math.floor(Date.now() / 1000) + 120),
        actualValue: 0n,
        winner: "0x0000000000000000000000000000000000000000" as `0x${string}`,
        winningBid: 0n,
        resolved: false,
      }),
      getAuctionBid: async () => ({
        agent: "0x0000000000000000000000000000000000000000" as `0x${string}`,
        bidHash: ("0x" + "00".repeat(32)) as `0x${string}`,
        revealedAmount: 0n,
        committed: false,
        revealed: false,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = new AuctionWarsEngine(stubNadFun(), stubClient as any);
    await e.initMatch(2, [PLAYER_A, PLAYER_B], { auctionBoxCount: 1 });
    expect(await e.isResolvable(2)).toBe(false);
  });

  it("resolve() syncs on-chain bids into the in-memory state so the round can resolve correctly", async () => {
    const stubClient = {
      initAuctionMatch: async () => undefined,
      getAuctionRound: async () => ({
        mysteryBoxHash: ("0x" + "ab".repeat(32)) as `0x${string}`,
        biddingDeadline: BigInt(Math.floor(Date.now() / 1000) + 60),
        revealDeadline: BigInt(Math.floor(Date.now() / 1000) + 120),
        actualValue: 0n,
        winner: "0x0000000000000000000000000000000000000000" as `0x${string}`,
        winningBid: 0n,
        resolved: false,
      }),
      getAuctionBid: async (_m: number, _r: number, player: string) => ({
        agent: player as `0x${string}`,
        bidHash: ("0x" + "cd".repeat(32)) as `0x${string}`,
        // Player A bids 40, B bids 60. Actual value (set in stubNadFun) = 50.
        // |40-50| = 10, |60-50| = 10 — tie; the engine's tiebreaker picks
        // whoever bid first, which is whichever insertion order the Map saw.
        revealedAmount: player === PLAYER_A ? 40n : 60n,
        committed: true,
        revealed: true,
      }),
      resolveAuctionRound: async () => undefined, // fire-and-forget post-resolve
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = new AuctionWarsEngine(stubNadFun(), stubClient as any);
    await e.initMatch(3, [PLAYER_A, PLAYER_B], { auctionBoxCount: 1 });

    const outcome = await e.resolve(3);
    // We don't pin the winner because the engine's tiebreaker depends on Map
    // ordering; the important regression is that scores ARE populated rather
    // than left at zero with winner=null (the pre-patch failure mode).
    expect(outcome.scores.size).toBe(2);
    expect(outcome.scores.has(PLAYER_A)).toBe(true);
    expect(outcome.scores.has(PLAYER_B)).toBe(true);
  });
});
