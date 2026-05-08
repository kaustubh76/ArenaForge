import { describe, it, expect } from "vitest";
import { BestOfNFormat } from "../../tournament-formats/best-of-n";
import type { SeriesConfig } from "../../game-engine/game-mode.interface";
import { sampleStandings4 } from "../fixtures/standings";
import { agentAddresses } from "../fixtures/agents";
import { makeMatchResult } from "../fixtures/match-results";

const format = new BestOfNFormat();

describe("BestOfNFormat.initialize", () => {
  it("opens series for each pair with the correct winsRequired (Bo3 → 2)", () => {
    const state = format.initialize(sampleStandings4, { seriesLength: 3 });
    expect(state.series).toBeDefined();
    expect(state.series!.size).toBe(2); // 4 players → 2 series

    for (const series of state.series!.values()) {
      expect(series.winsRequired).toBe(2);
      expect(series.completed).toBe(false);
    }
  });

  it("Bo5 → winsRequired = 3", () => {
    const state = format.initialize(sampleStandings4, { seriesLength: 5 });
    for (const series of state.series!.values()) {
      expect(series.winsRequired).toBe(3);
    }
  });
});

describe("BestOfNFormat.generatePairings", () => {
  it("returns one pairing per active series", () => {
    const state = format.initialize(sampleStandings4, { seriesLength: 3 });
    const { pairings } = format.generatePairings(sampleStandings4, [], 1, state);
    expect(pairings).toHaveLength(2);
  });
});

describe("BestOfNFormat.updateStandings", () => {
  it("records a single win in the series score and keeps it incomplete", () => {
    const state = format.initialize(sampleStandings4, { seriesLength: 3 });
    const standings = sampleStandings4.map((s) => ({ ...s }));
    const series = [...state.series!.values()][0];

    const result = makeMatchResult({
      winner: series.player1,
      loser: series.player2,
    });
    format.updateStandings(standings, [result], state);

    const updated: SeriesConfig = state.series!.get(series.seriesId)!;
    expect(updated.player1Wins).toBe(1);
    expect(updated.completed).toBe(false);
    expect(updated.winner).toBeNull();
  });

  it("completes the series and eliminates the loser at the win threshold", () => {
    const state = format.initialize(sampleStandings4, { seriesLength: 3 });
    const standings = sampleStandings4.map((s) => ({ ...s }));
    const series = [...state.series!.values()][0];

    const win = makeMatchResult({ winner: series.player1, loser: series.player2 });
    format.updateStandings(standings, [win, win], state);

    const updated = state.series!.get(series.seriesId)!;
    expect(updated.completed).toBe(true);
    expect(updated.winner).toBe(series.player1);

    const loser = standings.find((s) => s.address === series.player2)!;
    expect(loser.eliminated).toBe(true);
  });
});

describe("BestOfNFormat.isComplete", () => {
  it("false while multiple non-eliminated players remain", () => {
    const state = format.initialize(sampleStandings4, { seriesLength: 3 });
    expect(format.isComplete(sampleStandings4, [], state)).toBe(false);
  });

  it("true once only one non-eliminated player remains", () => {
    const state = format.initialize(sampleStandings4, { seriesLength: 3 });
    const standings = sampleStandings4.map((s, i) => ({
      ...s,
      eliminated: i > 0, // only player 0 left
    }));
    expect(format.isComplete(standings, [], state)).toBe(true);
  });
});
