import { describe, it, expect } from "vitest";
import { StrategyArenaEngine } from "../../game-engine/strategy-arena";
import { StrategyMove } from "../../game-engine/game-mode.interface";
import type { GameParameters } from "../../game-engine/game-mode.interface";

// `calculatePayoffs` is `private` on the engine. The plan calls for testing the
// payoff math only (skipping side-effecting commit/reveal flow which requires
// viem/SubmoltManager), so we reach into the private method via a cast.
type PayoffFn = (
  m1: StrategyMove,
  m2: StrategyMove,
  params: GameParameters
) => [number, number];

const engine = new StrategyArenaEngine();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const calc: PayoffFn = (engine as any).calculatePayoffs.bind(engine);

describe("StrategyArenaEngine.calculatePayoffs (default basis-points matrix)", () => {
  const params: GameParameters = {};

  it("CC → both get 6000", () => {
    expect(calc(StrategyMove.Cooperate, StrategyMove.Cooperate, params)).toEqual([6000, 6000]);
  });

  it("DC → defector 10000, cooperator 0", () => {
    expect(calc(StrategyMove.Defect, StrategyMove.Cooperate, params)).toEqual([10000, 0]);
  });

  it("CD → cooperator 0, defector 10000", () => {
    expect(calc(StrategyMove.Cooperate, StrategyMove.Defect, params)).toEqual([0, 10000]);
  });

  it("DD → both get 2000", () => {
    expect(calc(StrategyMove.Defect, StrategyMove.Defect, params)).toEqual([2000, 2000]);
  });
});

describe("StrategyArenaEngine.calculatePayoffs (custom params override defaults)", () => {
  it("custom CC value is honored", () => {
    const params: GameParameters = { strategyCooperateCooperate: 5000 };
    expect(calc(StrategyMove.Cooperate, StrategyMove.Cooperate, params)).toEqual([5000, 5000]);
  });
});

describe("StrategyArenaEngine — multi-round payoff accumulation", () => {
  it("a 5-round mixed sequence sums to the expected totals", () => {
    // Sequence (player1Move, player2Move): CC, CD, DC, DD, CC
    // Player 1 cumulative: 6000 + 0 + 10000 + 2000 + 6000 = 24000
    // Player 2 cumulative: 6000 + 10000 + 0 + 2000 + 6000 = 24000
    const moves: [StrategyMove, StrategyMove][] = [
      [StrategyMove.Cooperate, StrategyMove.Cooperate],
      [StrategyMove.Cooperate, StrategyMove.Defect],
      [StrategyMove.Defect, StrategyMove.Cooperate],
      [StrategyMove.Defect, StrategyMove.Defect],
      [StrategyMove.Cooperate, StrategyMove.Cooperate],
    ];

    let p1Total = 0;
    let p2Total = 0;
    for (const [m1, m2] of moves) {
      const [a, b] = calc(m1, m2, {});
      p1Total += a;
      p2Total += b;
    }
    expect(p1Total).toBe(24000);
    expect(p2Total).toBe(24000);
  });
});

describe("StrategyArenaEngine — on-chain initialisation (slice fix)", () => {
  // Regression test for the bug where StrategyArena.initMatch was never
  // called on-chain. Asserts the engine threads through to contractClient
  // when one is provided, but still works without one (for unit tests).

  it("initMatch without contractClient does not throw", async () => {
    const e = new StrategyArenaEngine();
    await expect(
      e.initMatch(1, ["0x" + "1".repeat(40), "0x" + "2".repeat(40)], {})
    ).resolves.toBeUndefined();
  });

  it("initMatch with contractClient calls initStrategyMatch", async () => {
    const calls: Array<{ matchId: number; player1: string; player2: string }> = [];
    const stubClient = {
      initStrategyMatch: async (
        matchId: number,
        p1: string,
        p2: string,
        _totalRounds: number,
        _commitTimeout: number,
        _revealTimeout: number,
      ): Promise<void> => {
        calls.push({ matchId, player1: p1, player2: p2 });
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = new StrategyArenaEngine(stubClient as any);
    const p1 = "0x" + "1".repeat(40);
    const p2 = "0x" + "2".repeat(40);
    await e.initMatch(99, [p1, p2], {});
    expect(calls).toHaveLength(1);
    expect(calls[0].matchId).toBe(99);
    expect(calls[0].player1).toBe(p1);
    expect(calls[0].player2).toBe(p2);
  });

  it("initMatch swallows on-chain init errors so the in-memory engine still works", async () => {
    const stubClient = {
      initStrategyMatch: async (): Promise<void> => {
        throw new Error("Only arena agent");
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = new StrategyArenaEngine(stubClient as any);
    // The whole initMatch should still resolve — the engine logs but doesn't
    // propagate the error, so a tournament with a misconfigured wallet still
    // gets in-memory state initialised (matching auction-wars / quiz-bowl).
    await expect(
      e.initMatch(1, ["0x" + "1".repeat(40), "0x" + "2".repeat(40)], {})
    ).resolves.toBeUndefined();
  });
});
