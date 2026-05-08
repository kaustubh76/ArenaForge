import { describe, it, expect } from "vitest";
import { RoundRobinFormat } from "../../tournament-formats/round-robin";
import type { RoundData } from "../../game-engine/game-mode.interface";
import { sampleStandings4 } from "../fixtures/standings";
import { agentAddresses } from "../fixtures/agents";
import { makeMatchResult } from "../fixtures/match-results";

const format = new RoundRobinFormat();

describe("RoundRobinFormat.calculateTotalRounds", () => {
  it("returns N-1 for even participant counts", () => {
    expect(format.calculateTotalRounds(4)).toBe(3);
    expect(format.calculateTotalRounds(8)).toBe(7);
  });

  it("returns N for odd participant counts (one bye per round)", () => {
    expect(format.calculateTotalRounds(5)).toBe(5);
  });
});

describe("RoundRobinFormat.generatePairings", () => {
  it("round 1 of a 4-player tournament produces 2 pairings (no byes)", () => {
    const state = format.initialize(sampleStandings4);
    const result = format.generatePairings(sampleStandings4, [], 1, state);
    expect(result.pairings).toHaveLength(2);
    expect(result.byes ?? []).toHaveLength(0);
  });

  it("circle method covers every distinct pairing across all rounds for 4 players", () => {
    const state = format.initialize(sampleStandings4);
    const seen = new Set<string>();
    const previousRounds: RoundData[] = [];

    for (let r = 1; r <= 3; r++) {
      const { pairings } = format.generatePairings(sampleStandings4, previousRounds, r, state);
      for (const [a, b] of pairings) {
        seen.add([a, b].sort().join("-"));
      }
      previousRounds.push({ round: r, pairings, results: [], completed: true });
    }

    // 4 players → 4*3/2 = 6 unique pairings.
    expect(seen.size).toBe(6);
  });
});

describe("RoundRobinFormat.updateStandings", () => {
  it("awards 3 points for a win, 1 each for a draw", () => {
    const state = format.initialize(sampleStandings4);
    const standings = sampleStandings4.map((s) => ({ ...s }));

    const win = makeMatchResult({
      winner: agentAddresses[0],
      loser: agentAddresses[1],
    });
    const draw = makeMatchResult({
      winner: agentAddresses[2], // either player can be `winner` field with isDraw=true
      loser: agentAddresses[3],
      isDraw: true,
    });

    const updated = format.updateStandings(standings, [win, draw], state);
    const byAddr = (addr: string) => updated.find((s) => s.address === addr)!;

    expect(byAddr(agentAddresses[0]).tournamentPoints).toBe(3);
    expect(byAddr(agentAddresses[1]).tournamentPoints).toBe(0);
    expect(byAddr(agentAddresses[2]).tournamentPoints).toBe(1);
    expect(byAddr(agentAddresses[3]).tournamentPoints).toBe(1);
  });
});

describe("RoundRobinFormat.isComplete", () => {
  it("false until N-1 rounds for an even bracket", () => {
    const state = format.initialize(sampleStandings4);
    const rounds: RoundData[] = [
      { round: 1, pairings: [], results: [], completed: true },
      { round: 2, pairings: [], results: [], completed: true },
    ];
    expect(format.isComplete(sampleStandings4, rounds, state)).toBe(false);

    rounds.push({ round: 3, pairings: [], results: [], completed: true });
    expect(format.isComplete(sampleStandings4, rounds, state)).toBe(true);
  });
});
