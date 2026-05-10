import { describe, it, expect } from "vitest";
import {
  toTournament,
  toAgent,
  toMatch,
  toSeason,
  toSeasonalProfile,
  toMatchPool,
  toBet,
  toBettorProfile,
  type ChainTournament,
  type ChainAgent,
  type ChainMatch,
  type ChainSeason,
  type ChainSeasonalProfile,
  type ChainMatchPool,
  type ChainBet,
  type ChainBettorProfile,
} from "@/lib/transformers";
import { ZERO_ADDRESS } from "@/lib/contract-constants";
import { GameType, TournamentFormat, TournamentStatus, MatchStatus } from "@/types/arena";

const ADDR_A = ("0x" + "ab".repeat(20)) as string;
const ADDR_B = ("0x" + "cd".repeat(20)) as string;

// -----------------------------------------------------------------------------
// toTournament
// -----------------------------------------------------------------------------

describe("toTournament", () => {
  const raw: ChainTournament = {
    id: 7n,
    name: "Genesis Cup",
    gameType: GameType.StrategyArena,
    format: TournamentFormat.SwissSystem,
    status: TournamentStatus.Active,
    entryStake: 1_000_000_000_000_000_000n,
    maxParticipants: 8n,
    currentParticipants: 4n,
    prizePool: 4_000_000_000_000_000_000n,
    startTime: 1700000000n,
    roundCount: 3n,
    currentRound: 2n,
    parametersHash: "0x" + "0".repeat(64),
  };

  it("uses pre-formatted ether strings as-is", () => {
    const out = toTournament(raw, { entryStake: "1.0", prizePool: "4.0" });
    expect(out.entryStake).toBe("1.0");
    expect(out.prizePool).toBe("4.0");
  });

  it("converts startTime from seconds to milliseconds", () => {
    const out = toTournament(raw, { entryStake: "1.0", prizePool: "4.0" });
    expect(out.startTime).toBe(1700000000 * 1000);
  });

  it("coerces all bigint fields to numbers", () => {
    const out = toTournament(raw, { entryStake: "1.0", prizePool: "4.0" });
    expect(out.id).toBe(7);
    expect(out.maxParticipants).toBe(8);
    expect(out.currentParticipants).toBe(4);
    expect(out.roundCount).toBe(3);
    expect(out.currentRound).toBe(2);
    expect(typeof out.id).toBe("number");
    expect(typeof out.maxParticipants).toBe("number");
  });

  it("preserves name and parametersHash verbatim", () => {
    const out = toTournament(raw, { entryStake: "1.0", prizePool: "4.0" });
    expect(out.name).toBe("Genesis Cup");
    expect(out.parametersHash).toBe(raw.parametersHash);
  });
});

// -----------------------------------------------------------------------------
// toAgent — focused on the eloHistory mock removal + winRate edge case
// -----------------------------------------------------------------------------

describe("toAgent", () => {
  const baseRaw: ChainAgent = {
    agentAddress: ADDR_A,
    moltbookHandle: "alpha",
    avatarURI: "ipfs://QmFoo",
    elo: 1500n,
    matchesPlayed: 24n,
    wins: 14n,
    losses: 10n,
    currentStreak: 3n,
    longestWinStreak: 7n,
    registered: true,
  };

  it("computes winRate as wins/matchesPlayed * 100", () => {
    const out = toAgent(baseRaw);
    expect(out.winRate).toBeCloseTo((14 / 24) * 100, 5);
  });

  it("returns winRate=0 when matchesPlayed=0 (no NaN regression)", () => {
    const out = toAgent({ ...baseRaw, matchesPlayed: 0n, wins: 0n, losses: 0n });
    expect(out.winRate).toBe(0);
    expect(Number.isFinite(out.winRate)).toBe(true);
  });

  it("eloHistory is a single real-data point — no fabricated 1200 starting value", () => {
    // Regression: previous version returned [1200, currentElo] which the UI
    // would render as a 1200→currentElo line chart. Now we return only the
    // real ELO; multi-point history must come from match history elsewhere.
    const out = toAgent({ ...baseRaw, elo: 1750n });
    expect(out.eloHistory).toEqual([1750]);
    expect(out.eloHistory).not.toContain(1200);
  });

  it("maps avatarURI to avatarUrl (renaming convention)", () => {
    const out = toAgent(baseRaw);
    expect(out.avatarUrl).toBe("ipfs://QmFoo");
  });

  it("avatarUrl is undefined when avatarURI is empty", () => {
    const out = toAgent({ ...baseRaw, avatarURI: "" });
    expect(out.avatarUrl).toBeUndefined();
  });

  it("recentMatches starts empty (caller hydrates separately)", () => {
    expect(toAgent(baseRaw).recentMatches).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// toMatch
// -----------------------------------------------------------------------------

describe("toMatch", () => {
  const baseRaw: ChainMatch = {
    id: 100n,
    tournamentId: 7n,
    round: 2n,
    player1: ADDR_A,
    player2: ADDR_B,
    winner: ADDR_A,
    resultHash: "0x" + "12".repeat(32),
    timestamp: 1700000123n,
    startTime: 1700000000n,
    duration: 60n,
    status: MatchStatus.Completed,
  };

  it("converts timestamp + startTime from seconds to milliseconds", () => {
    const out = toMatch(baseRaw);
    expect(out.timestamp).toBe(1700000123 * 1000);
    expect(out.startTime).toBe(1700000000 * 1000);
  });

  it("normalizes the zero-address winner to null (case-insensitive)", () => {
    const lc = ZERO_ADDRESS.toLowerCase();
    const uc = ZERO_ADDRESS.toUpperCase().replace("0X", "0x");
    expect(toMatch({ ...baseRaw, winner: lc }).winner).toBeNull();
    expect(toMatch({ ...baseRaw, winner: uc }).winner).toBeNull();
  });

  it("preserves a real winner address verbatim (not normalized)", () => {
    const out = toMatch(baseRaw);
    expect(out.winner).toBe(ADDR_A);
  });

  it("coerces id / tournamentId / round / duration to numbers", () => {
    const out = toMatch(baseRaw);
    expect(out.id).toBe(100);
    expect(out.tournamentId).toBe(7);
    expect(out.round).toBe(2);
    expect(out.duration).toBe(60);
  });
});

// -----------------------------------------------------------------------------
// toSeason
// -----------------------------------------------------------------------------

describe("toSeason", () => {
  it("uses pre-formatted totalPrizePool as-is and converts times to ms", () => {
    const raw: ChainSeason = {
      id: 3n,
      startTime: 1700000000n,
      endTime: 1702000000n,
      active: true,
      rewardsDistributed: false,
      totalPrizePool: 999n,
    };
    const out = toSeason(raw, { totalPrizePool: "5.0" });
    expect(out.totalPrizePool).toBe("5.0");
    expect(out.startTime).toBe(1700000000 * 1000);
    expect(out.endTime).toBe(1702000000 * 1000);
    expect(out.active).toBe(true);
    expect(out.rewardsDistributed).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// toSeasonalProfile
// -----------------------------------------------------------------------------

describe("toSeasonalProfile", () => {
  it("maps `agent` to `address` and coerces all bigint fields", () => {
    const raw: ChainSeasonalProfile = {
      agent: ADDR_A,
      seasonId: 3n,
      seasonalElo: 1850n,
      peakElo: 1920n,
      matchesPlayed: 50n,
      wins: 30n,
      losses: 20n,
      tier: 4,
      placementComplete: true,
      placementMatches: 5n,
      rewardClaimed: false,
    };
    const out = toSeasonalProfile(raw);
    expect(out.address).toBe(ADDR_A);
    expect(out.seasonalElo).toBe(1850);
    expect(out.peakElo).toBe(1920);
    expect(out.placementMatches).toBe(5);
    expect(out.tier).toBe(4);
  });
});

// -----------------------------------------------------------------------------
// toMatchPool
// -----------------------------------------------------------------------------

describe("toMatchPool", () => {
  it("uses pre-formatted bet totals as-is", () => {
    const raw: ChainMatchPool = {
      matchId: 42n,
      player1: ADDR_A,
      player2: ADDR_B,
      totalPlayer1Bets: 999n,
      totalPlayer2Bets: 555n,
      bettingOpen: true,
      settled: false,
      winner: ZERO_ADDRESS,
    };
    const out = toMatchPool(raw, {
      totalPlayer1Bets: "0.999",
      totalPlayer2Bets: "0.555",
    });
    expect(out.matchId).toBe(42);
    expect(out.totalPlayer1Bets).toBe("0.999");
    expect(out.totalPlayer2Bets).toBe("0.555");
    expect(out.bettingOpen).toBe(true);
    expect(out.settled).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// toBet
// -----------------------------------------------------------------------------

describe("toBet", () => {
  const baseRaw: ChainBet = {
    id: 5n,
    matchId: 100n,
    bettor: ADDR_A,
    predictedWinner: ADDR_B,
    amount: 1_000_000_000_000_000_000n,
    odds: 1_500_000_000_000_000_000n, // 1.5x
    timestamp: 1700000000n,
    status: 0,
    payout: 0n,
  };

  it("formats odds to 4 decimals using fixed-point precision (1e18)", () => {
    const out = toBet(baseRaw, { amount: "1.0", payout: "0" });
    expect(out.odds).toBe("1.5000");
  });

  it("returns 0.0000 when odds=0 (no NaN/Infinity)", () => {
    const out = toBet({ ...baseRaw, odds: 0n }, { amount: "1.0", payout: "0" });
    expect(out.odds).toBe("0.0000");
  });

  it("uses pre-formatted amount and payout as-is", () => {
    const out = toBet(baseRaw, { amount: "1.0", payout: "2.5" });
    expect(out.amount).toBe("1.0");
    expect(out.payout).toBe("2.5");
  });

  it("converts timestamp from seconds to ms", () => {
    const out = toBet(baseRaw, { amount: "1.0", payout: "0" });
    expect(out.timestamp).toBe(1700000000 * 1000);
  });
});

// -----------------------------------------------------------------------------
// toBettorProfile
// -----------------------------------------------------------------------------

describe("toBettorProfile", () => {
  const baseRaw: ChainBettorProfile = {
    bettor: ADDR_A,
    totalBets: 10n,
    wins: 6n,
    losses: 4n,
    totalWagered: 0n, // pre-formatted
    totalWon: 0n,
    totalLost: 0n,
    currentStreak: 2n,
    longestWinStreak: 4n,
  };

  it("computes winRate as wins/totalBets * 100", () => {
    const out = toBettorProfile(baseRaw, { totalWagered: "10.0", totalWon: "12.0", totalLost: "8.0" });
    expect(out.winRate).toBe(60);
  });

  it("returns winRate=0 when totalBets=0 (no NaN regression)", () => {
    const out = toBettorProfile(
      { ...baseRaw, totalBets: 0n, wins: 0n, losses: 0n },
      { totalWagered: "0", totalWon: "0", totalLost: "0" },
    );
    expect(out.winRate).toBe(0);
    expect(Number.isFinite(out.winRate)).toBe(true);
  });

  it("computes netProfit as totalWon - totalLost (formatted to 6 decimals)", () => {
    const out = toBettorProfile(baseRaw, {
      totalWagered: "10.0",
      totalWon: "12.5",
      totalLost: "8.25",
    });
    expect(out.netProfit).toBe("4.250000");
  });

  it("netProfit handles negative results (totalLost > totalWon)", () => {
    const out = toBettorProfile(baseRaw, {
      totalWagered: "10.0",
      totalWon: "3.0",
      totalLost: "8.0",
    });
    expect(out.netProfit).toBe("-5.000000");
  });

  it("maps `bettor` to `address` and preserves streak fields", () => {
    const out = toBettorProfile(baseRaw, { totalWagered: "0", totalWon: "0", totalLost: "0" });
    expect(out.address).toBe(ADDR_A);
    expect(out.currentStreak).toBe(2);
    expect(out.longestWinStreak).toBe(4);
  });
});
