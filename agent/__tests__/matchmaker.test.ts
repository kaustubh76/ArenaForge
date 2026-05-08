import { describe, it, expect } from "vitest";
import { Matchmaker } from "../matchmaker";
import {
  TournamentFormat,
  type AgentStanding,
  type RoundData,
} from "../game-engine/game-mode.interface";
import { sampleStandings4, sampleStandings8, makeStanding } from "./fixtures/standings";
import { agentAddresses } from "./fixtures/agents";
import { makeMatchResult } from "./fixtures/match-results";

const mm = new Matchmaker();

describe("Matchmaker.calculateElo", () => {
  it("equal ratings: winner gains K/2, loser loses K/2", () => {
    const [a, b] = mm.calculateElo(1500, 1500, "win");
    expect(a).toBe(1516);
    expect(b).toBe(1484);
  });

  it("higher-rated favorite wins: small delta", () => {
    const [a, b] = mm.calculateElo(1600, 1400, "win");
    expect(a).toBe(1608);
    expect(b).toBe(1392);
  });

  it("upset (lower-rated wins): large positive swing for underdog", () => {
    const [a, b] = mm.calculateElo(1400, 1600, "win");
    expect(a).toBe(1424);
    expect(b).toBe(1576);
  });

  it("draw between equals: no rating change", () => {
    const [a, b] = mm.calculateElo(1500, 1500, "draw");
    expect(a).toBe(1500);
    expect(b).toBe(1500);
  });

  it("draw with higher-rated player: lower-rated player gains", () => {
    const [a, b] = mm.calculateElo(1600, 1400, "draw");
    expect(a).toBe(1592);
    expect(b).toBe(1408);
  });
});

describe("Matchmaker.isUpset", () => {
  it("returns true at exactly the default threshold (100)", () => {
    expect(mm.isUpset(1400, 1500)).toBe(true);
  });

  it("returns false below the default threshold", () => {
    expect(mm.isUpset(1450, 1500)).toBe(false);
  });

  it("respects custom threshold", () => {
    expect(mm.isUpset(1450, 1500, 50)).toBe(true);
    expect(mm.isUpset(1450, 1500, 75)).toBe(false);
  });
});

describe("Matchmaker.generatePairings — elimination", () => {
  it("round 1 seeds 1-vs-N, 2-vs-(N-1)", () => {
    const pairings = mm.generatePairings(
      TournamentFormat.SingleElimination,
      sampleStandings8,
      [],
      1
    );

    // Sorted by ELO desc — sampleStandings8 already is.
    // Top seed (1700) vs bottom seed (1300), then 1600 vs 1350, etc.
    expect(pairings).toHaveLength(4);
    expect(pairings[0]).toEqual([agentAddresses[0], agentAddresses[7]]);
    expect(pairings[1]).toEqual([agentAddresses[1], agentAddresses[6]]);
    expect(pairings[2]).toEqual([agentAddresses[2], agentAddresses[5]]);
    expect(pairings[3]).toEqual([agentAddresses[3], agentAddresses[4]]);
  });

  it("excludes eliminated players from pairings", () => {
    const standings: AgentStanding[] = sampleStandings4.map((s, i) => ({
      ...s,
      eliminated: i >= 2, // last two are out
    }));
    const pairings = mm.generatePairings(
      TournamentFormat.SingleElimination,
      standings,
      [],
      1
    );
    expect(pairings).toHaveLength(1);
    expect(pairings[0]).toEqual([agentAddresses[0], agentAddresses[1]]);
  });
});

describe("Matchmaker.generatePairings — Swiss", () => {
  it("avoids rematches when an alternative exists", () => {
    const previousRounds: RoundData[] = [
      {
        round: 1,
        pairings: [
          [agentAddresses[0], agentAddresses[1]],
          [agentAddresses[2], agentAddresses[3]],
        ],
        results: [],
        completed: true,
      },
    ];

    // All four players tied on points → adjacent sort would re-pair 0-vs-1,
    // but the algo should pivot to a non-rematch.
    const standings: AgentStanding[] = sampleStandings4.map((s) => ({
      ...s,
      tournamentPoints: 1,
    }));

    const pairings = mm.generatePairings(
      TournamentFormat.SwissSystem,
      standings,
      previousRounds,
      2
    );

    // At least one of the round-1 pairs must NOT be reproduced.
    const wasRematch = pairings.some(
      ([a, b]) =>
        (a === agentAddresses[0] && b === agentAddresses[1]) ||
        (a === agentAddresses[1] && b === agentAddresses[0]) ||
        (a === agentAddresses[2] && b === agentAddresses[3]) ||
        (a === agentAddresses[3] && b === agentAddresses[2])
    );
    expect(wasRematch).toBe(false);
  });

  it("odd participant count leaves one player unpaired (bye)", () => {
    const odd: AgentStanding[] = [
      makeStanding(0, 1500),
      makeStanding(1, 1500),
      makeStanding(2, 1500),
    ];
    const pairings = mm.generatePairings(TournamentFormat.SwissSystem, odd, [], 1);
    expect(pairings).toHaveLength(1);
  });
});

describe("Matchmaker.updateStandings", () => {
  it("flags single-elim loser as eliminated", () => {
    const standings: AgentStanding[] = [
      makeStanding(0, 1500),
      makeStanding(1, 1500),
    ];
    const result = makeMatchResult({
      winner: agentAddresses[0],
      loser: agentAddresses[1],
    });
    const updated = mm.updateStandings(standings, [result], TournamentFormat.SingleElimination);
    expect(updated[0].eliminated).toBe(false);
    expect(updated[1].eliminated).toBe(true);
  });

  it("draw does not increment tournamentPoints", () => {
    const standings: AgentStanding[] = [
      makeStanding(0, 1500),
      makeStanding(1, 1500),
    ];
    const draw = makeMatchResult({
      winner: null,
      loser: null,
      isDraw: true,
    });
    const updated = mm.updateStandings(standings, [draw], TournamentFormat.SwissSystem);
    expect(updated[0].tournamentPoints).toBe(0);
    expect(updated[1].tournamentPoints).toBe(0);
  });

  it("Swiss winner gets +1 tournament point, loser stays in (not eliminated)", () => {
    const standings: AgentStanding[] = [
      makeStanding(0, 1500),
      makeStanding(1, 1500),
    ];
    const result = makeMatchResult({
      winner: agentAddresses[0],
      loser: agentAddresses[1],
    });
    const updated = mm.updateStandings(standings, [result], TournamentFormat.SwissSystem);
    const winner = updated.find((s) => s.address === agentAddresses[0])!;
    const loser = updated.find((s) => s.address === agentAddresses[1])!;
    expect(winner.tournamentPoints).toBe(1);
    expect(loser.tournamentPoints).toBe(0);
    expect(loser.eliminated).toBe(false);
  });
});
