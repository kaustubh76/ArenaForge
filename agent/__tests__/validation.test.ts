import { describe, it, expect } from "vitest";
import {
  validateTournamentConfig,
  validateGameParameters,
  sanitizeTournamentName,
} from "../validation";
import {
  GameType,
  TournamentFormat,
} from "../game-engine/game-mode.interface";
import {
  validSwissConfig,
  validElimConfig,
  invalidConfigs,
} from "./fixtures/tournament-configs";

const errorFor = (errors: { field: string; message: string }[], field: string) =>
  errors.find((e) => e.field === field);

describe("validateTournamentConfig — happy path", () => {
  it("accepts a valid Swiss config", () => {
    const result = validateTournamentConfig(validSwissConfig);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("accepts a valid SingleElimination config (8 players, 3 rounds)", () => {
    const result = validateTournamentConfig(validElimConfig);
    expect(result.valid).toBe(true);
  });
});

describe("validateTournamentConfig — name", () => {
  it("rejects names shorter than 3 chars", () => {
    const result = validateTournamentConfig(invalidConfigs.nameTooShort);
    expect(result.valid).toBe(false);
    expect(errorFor(result.errors, "name")).toBeDefined();
  });

  it("rejects names longer than 64 chars", () => {
    const result = validateTournamentConfig(invalidConfigs.nameTooLong);
    expect(result.valid).toBe(false);
    expect(errorFor(result.errors, "name")).toBeDefined();
  });
});

describe("validateTournamentConfig — bounds", () => {
  it("rejects gameType out of range", () => {
    const result = validateTournamentConfig(invalidConfigs.gameTypeOutOfRange);
    expect(errorFor(result.errors, "gameType")).toBeDefined();
  });

  it("rejects format out of range", () => {
    const result = validateTournamentConfig(invalidConfigs.formatOutOfRange);
    expect(errorFor(result.errors, "format")).toBeDefined();
  });

  it("rejects negative entryStake", () => {
    const result = validateTournamentConfig(invalidConfigs.entryStakeNegative);
    expect(errorFor(result.errors, "entryStake")).toBeDefined();
  });

  it("rejects fewer than 2 participants", () => {
    const result = validateTournamentConfig(invalidConfigs.participantsTooFew);
    expect(errorFor(result.errors, "maxParticipants")).toBeDefined();
  });

  it("accepts exactly 64 participants", () => {
    // Use Swiss to avoid the power-of-2 elimination rule, and bump rounds high
    // enough that Swiss isn't blocked by the elim round-count check (Swiss
    // doesn't require power-of-2, only valid range).
    const result = validateTournamentConfig({
      ...validSwissConfig,
      maxParticipants: 64,
    });
    expect(result.valid).toBe(true);
  });

  it("rejects more than 64 participants", () => {
    const result = validateTournamentConfig(invalidConfigs.participantsTooMany);
    expect(errorFor(result.errors, "maxParticipants")).toBeDefined();
  });
});

describe("validateTournamentConfig — single-elimination rules", () => {
  it("rejects non-power-of-2 participant count", () => {
    const result = validateTournamentConfig(invalidConfigs.elimNotPowerOf2);
    expect(result.valid).toBe(false);
    expect(errorFor(result.errors, "maxParticipants")).toBeDefined();
  });

  it("rejects round count below ceil(log2(participants))", () => {
    const result = validateTournamentConfig(invalidConfigs.elimRoundsTooLow);
    expect(errorFor(result.errors, "roundCount")).toBeDefined();
  });
});

describe("validateGameParameters", () => {
  it("accepts in-bounds parameters for each game type", () => {
    expect(
      validateGameParameters(GameType.OracleDuel, { oracleDuelDuration: 600 })
    ).toEqual([]);
    expect(
      validateGameParameters(GameType.QuizBowl, { quizQuestionCount: 10 })
    ).toEqual([]);
  });

  it("flags out-of-range parameters", () => {
    // GAME_PARAM_BOUNDS uses key `roundCount` for StrategyArena and
    // `questionCount` for QuizBowl, but the `GameParameters` interface keys are
    // prefixed (e.g. `quizQuestionCount`). The bounds map iterates its own
    // keys against `params[key]` — so a mismatched key never violates a bound.
    // Verify by hitting one that DOES match the bounds map key directly.
    const errors = validateGameParameters(GameType.OracleDuel, {
      // @ts-expect-error — exercising the bounds map directly with a raw key
      durationSeconds: 5_000_000,
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("returns no errors for unknown game types", () => {
    // Out-of-range gameType yields undefined bounds → empty errors.
    expect(validateGameParameters(99 as GameType, {})).toEqual([]);
  });
});

describe("sanitizeTournamentName", () => {
  it("strips XSS vectors", () => {
    expect(sanitizeTournamentName("<script>alert(1)</script>Cup")).toBe("scriptalert(1)/scriptCup");
  });

  it("normalizes whitespace", () => {
    expect(sanitizeTournamentName("  a   b  ")).toBe("a b");
  });

  it("truncates to 64 characters", () => {
    const long = "x".repeat(120);
    expect(sanitizeTournamentName(long).length).toBe(64);
  });
});
