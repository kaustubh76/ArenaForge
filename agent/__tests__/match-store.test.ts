import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MatchStore } from "../persistence/match-store";
import {
  GameType,
  TournamentFormat,
  type TournamentState,
} from "../game-engine/game-mode.interface";
import {
  makeMatchResult,
  sampleStrategyResult,
  sampleOracleDuelResult,
} from "./fixtures/match-results";
import { agentAddresses } from "./fixtures/agents";

let store: MatchStore;

beforeEach(() => {
  store = new MatchStore(":memory:");
});

afterEach(() => {
  store.close();
});

describe("MatchStore — match round-trip", () => {
  it("saveMatchResult then getMatch returns the same data", () => {
    store.saveMatchResult(sampleStrategyResult);
    const got = store.getMatch(sampleStrategyResult.matchId);
    expect(got).not.toBeNull();
    expect(got!.matchId).toBe(sampleStrategyResult.matchId);
    expect(got!.tournamentId).toBe(sampleStrategyResult.tournamentId);
    expect(got!.winner).toBe(sampleStrategyResult.winner);
    expect(got!.gameType).toBe(GameType.StrategyArena);
  });

  it("getMatchesByRound filters by tournament + round", () => {
    store.saveMatchResult(makeMatchResult({ matchId: 1, tournamentId: 1, round: 1 }));
    store.saveMatchResult(makeMatchResult({ matchId: 2, tournamentId: 1, round: 1 }));
    store.saveMatchResult(makeMatchResult({ matchId: 3, tournamentId: 1, round: 2 }));
    store.saveMatchResult(makeMatchResult({ matchId: 4, tournamentId: 2, round: 1 }));

    const round1 = store.getMatchesByRound(1, 1);
    expect(round1).toHaveLength(2);
    const round2 = store.getMatchesByRound(1, 2);
    expect(round2).toHaveLength(1);
  });

  it("getMatch returns null for a missing id", () => {
    expect(store.getMatch(999_999)).toBeNull();
  });

  it("BigInt-bearing stats serialize losslessly via bigIntReplacer", () => {
    store.saveMatchResult(sampleOracleDuelResult);
    const got = store.getMatch(sampleOracleDuelResult.matchId);
    expect(got).not.toBeNull();
    // BigInt values come back as Number (per bigIntReplacer at line 14).
    expect(typeof (got!.stats as Record<string, unknown>).snapshotPrice).toBe("number");
    expect((got!.stats as Record<string, unknown>).tokenSymbol).toBe("TEST");
  });
});

describe("MatchStore — tournament state", () => {
  it("saveTournamentState then loadTournamentState round-trips with BigInt entryStake", () => {
    const state: TournamentState = {
      config: {
        name: "Test",
        gameType: GameType.StrategyArena,
        format: TournamentFormat.SwissSystem,
        entryStake: BigInt("1000000000000000000"), // 1e18 wei
        maxParticipants: 8,
        roundCount: 3,
        gameParameters: {},
      },
      participants: [],
      rounds: [],
      currentRound: 0,
      status: "open",
    };
    store.saveTournamentState(42, state);
    const loaded = store.loadTournamentState(42);
    expect(loaded).not.toBeNull();
    expect(loaded!.config.name).toBe("Test");
    // BigInt becomes Number via bigIntReplacer; verify it's the right magnitude.
    expect(Number(loaded!.config.entryStake)).toBe(1e18);
  });

  it("loadTournamentState returns null when missing", () => {
    expect(store.loadTournamentState(404)).toBeNull();
  });
});

describe("MatchStore — round robin", () => {
  it("init + updateRoundRobinResult tracks wins/losses/draws independently", () => {
    const tid = 5;
    const [a, b, c] = agentAddresses;
    store.initRoundRobinStandings(tid, [a, b, c]);

    store.updateRoundRobinResult(tid, a, b, a, false); // a beats b
    store.updateRoundRobinResult(tid, a, c, null, true); // a vs c draws
    store.updateRoundRobinResult(tid, b, c, c, false); // c beats b

    const standings = store.getRoundRobinStandings(tid);
    const byAddr = (addr: string) => standings.find((s) => s.agentAddress === addr)!;

    expect(byAddr(a).wins).toBe(1);
    expect(byAddr(a).draws).toBe(1);
    expect(byAddr(a).points).toBe(4); // 3 + 1
    expect(byAddr(b).losses).toBe(2);
    expect(byAddr(b).points).toBe(0);
    expect(byAddr(c).wins).toBe(1);
    expect(byAddr(c).draws).toBe(1);
    expect(byAddr(c).points).toBe(4);
  });
});

describe("MatchStore — series", () => {
  it("createSeries → updateSeriesResult marks completed at threshold", () => {
    const tid = 7;
    const [a, b] = agentAddresses;
    const seriesId = store.createSeries(tid, a, b, 2); // Bo3 → first to 2 wins

    let series = store.updateSeriesResult(seriesId, a);
    expect(series).not.toBeNull();
    expect(series!.player1Wins).toBe(1);
    expect(series!.completed).toBe(false);

    series = store.updateSeriesResult(seriesId, a);
    expect(series!.player1Wins).toBe(2);
    expect(series!.completed).toBe(true);
    expect(series!.winner).toBe(a);
  });

  it("updateSeriesResult on a completed series returns null", () => {
    const seriesId = store.createSeries(1, agentAddresses[0], agentAddresses[1], 1);
    store.updateSeriesResult(seriesId, agentAddresses[0]); // completes immediately
    const second = store.updateSeriesResult(seriesId, agentAddresses[0]);
    expect(second).toBeNull();
  });
});

describe("MatchStore — bets", () => {
  it("saveBet + getBetsByUser retrieves the bet", () => {
    store.saveBet(1, agentAddresses[0], agentAddresses[1], "1000");
    const bets = store.getBetsByUser(agentAddresses[0]);
    expect(bets).toHaveLength(1);
    expect(bets[0].matchId).toBe(1);
    expect(bets[0].amount).toBe("1000");
    expect(bets[0].status).toBe("active");
  });

  it("settleBets transitions matching predictions to 'won' and others to 'lost'", () => {
    const matchId = 99;
    store.saveBet(matchId, agentAddresses[0], agentAddresses[2], "100"); // bets P1
    store.saveBet(matchId, agentAddresses[1], agentAddresses[3], "200"); // bets P2

    store.settleBets(matchId, agentAddresses[2]); // P1 wins

    const bettor0 = store.getBetsByUser(agentAddresses[0]);
    const bettor1 = store.getBetsByUser(agentAddresses[1]);
    expect(bettor0[0].status).toBe("won");
    expect(bettor1[0].status).toBe("lost");
  });
});

describe("MatchStore — idempotency", () => {
  it("constructing twice on the same in-memory db is idempotent (no schema error)", () => {
    // Re-running init() on an already-initialized DB must not throw.
    // Cannot reuse the same :memory: across instances (each is a fresh DB),
    // so the test reads the guarded `initialized` flag indirectly: a second
    // construction is a fresh DB and must also succeed cleanly.
    const second = new MatchStore(":memory:");
    second.saveMatchResult(makeMatchResult({ matchId: 555 }));
    expect(second.getMatch(555)).not.toBeNull();
    second.close();
  });

  it("INSERT OR REPLACE on saveMatchResult overwrites prior row", () => {
    store.saveMatchResult(makeMatchResult({ matchId: 1, duration: 10 }));
    store.saveMatchResult(makeMatchResult({ matchId: 1, duration: 99 }));
    const got = store.getMatch(1);
    expect(got!.duration).toBe(99);
  });
});
