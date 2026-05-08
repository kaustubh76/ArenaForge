import { describe, it, expect } from "vitest";

// Prize-distribution math from agent/arena-manager.ts:730-770. The math is
// currently inline (not exported), so this test duplicates it. TODO(slice-2):
// extract into a pure helper module so this test can call the real function.

const ARENA_FEE_BPS = 500; // 5%
const BPS_DENOMINATOR = 10_000;
const ELIM_PRIZE_SHARES = [6000, 2500, 1500] as const; // 60% / 25% / 15%

function netPool(grossPool: bigint): bigint {
  const fee = (grossPool * BigInt(ARENA_FEE_BPS)) / BigInt(BPS_DENOMINATOR);
  return grossPool - fee;
}

function distributeElim(grossPool: bigint, ranked: { address: string }[]): { address: string; amount: bigint }[] {
  const distributable = netPool(grossPool);
  const out: { address: string; amount: bigint }[] = [];
  for (let i = 0; i < Math.min(3, ranked.length); i++) {
    const share = BigInt(ELIM_PRIZE_SHARES[i]);
    out.push({
      address: ranked[i].address,
      amount: (distributable * share) / BigInt(BPS_DENOMINATOR),
    });
  }
  return out;
}

function distributeSwiss(
  grossPool: bigint,
  ranked: { address: string; tournamentPoints: number }[]
): { address: string; amount: bigint }[] {
  const distributable = netPool(grossPool);
  const totalPoints = ranked.reduce((sum, p) => sum + p.tournamentPoints, 0);
  if (totalPoints === 0) return [];
  return ranked
    .filter((p) => p.tournamentPoints > 0)
    .map((p) => ({
      address: p.address,
      amount: (distributable * BigInt(p.tournamentPoints)) / BigInt(totalPoints),
    }));
}

describe("prize distribution — protocol fee", () => {
  it("carves the 5% fee from the gross pool", () => {
    const gross = BigInt(10_000);
    const net = netPool(gross);
    expect(net).toBe(BigInt(9_500));
  });

  it("zero-pool tournament keeps fee at zero", () => {
    expect(netPool(BigInt(0))).toBe(BigInt(0));
  });
});

describe("prize distribution — single elimination top-3 shares", () => {
  it("4-player elim distributes 60/25/15 of the net pool", () => {
    // Gross 10_000; net 9_500; shares: 5_700 / 2_375 / 1_425 (sum 9_500)
    const ranked = [{ address: "0xA" }, { address: "0xB" }, { address: "0xC" }, { address: "0xD" }];
    const payouts = distributeElim(BigInt(10_000), ranked);
    expect(payouts).toHaveLength(3);
    expect(payouts[0]).toEqual({ address: "0xA", amount: BigInt(5_700) });
    expect(payouts[1]).toEqual({ address: "0xB", amount: BigInt(2_375) });
    expect(payouts[2]).toEqual({ address: "0xC", amount: BigInt(1_425) });
    const sum = payouts.reduce((s, p) => s + p.amount, BigInt(0));
    expect(sum).toBe(BigInt(9_500));
  });

  it("only 2 ranked players → only top-2 receive prizes", () => {
    const payouts = distributeElim(BigInt(10_000), [{ address: "0xA" }, { address: "0xB" }]);
    expect(payouts).toHaveLength(2);
    expect(payouts[0].amount).toBe(BigInt(5_700));
    expect(payouts[1].amount).toBe(BigInt(2_375));
  });
});

describe("prize distribution — Swiss proportional", () => {
  it("distributes net pool by tournament-point ratio", () => {
    // Gross 10_000 → net 9_500. Points: A=5, B=3, C=2 → total 10.
    // A = 9500 * 5/10 = 4750, B = 2850, C = 1900.
    const ranked = [
      { address: "0xA", tournamentPoints: 5 },
      { address: "0xB", tournamentPoints: 3 },
      { address: "0xC", tournamentPoints: 2 },
    ];
    const payouts = distributeSwiss(BigInt(10_000), ranked);
    expect(payouts).toEqual([
      { address: "0xA", amount: BigInt(4_750) },
      { address: "0xB", amount: BigInt(2_850) },
      { address: "0xC", amount: BigInt(1_900) },
    ]);
  });

  it("excludes zero-point players from the payout list", () => {
    const ranked = [
      { address: "0xA", tournamentPoints: 5 },
      { address: "0xB", tournamentPoints: 0 },
    ];
    const payouts = distributeSwiss(BigInt(10_000), ranked);
    expect(payouts).toHaveLength(1);
    expect(payouts[0].address).toBe("0xA");
  });

  it("returns an empty list when no one has points (no division by zero)", () => {
    const ranked = [
      { address: "0xA", tournamentPoints: 0 },
      { address: "0xB", tournamentPoints: 0 },
    ];
    expect(distributeSwiss(BigInt(10_000), ranked)).toEqual([]);
  });
});
