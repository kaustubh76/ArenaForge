import type { TournamentConfig } from "../../game-engine/game-mode.interface";
import { GameType, TournamentFormat } from "../../game-engine/game-mode.interface";

export const validSwissConfig: TournamentConfig = {
  name: "Swiss Cup",
  gameType: GameType.StrategyArena,
  format: TournamentFormat.SwissSystem,
  entryStake: BigInt(0),
  maxParticipants: 8,
  roundCount: 3,
  gameParameters: { strategyRoundCount: 5 },
};

export const validElimConfig: TournamentConfig = {
  name: "Elimination Cup",
  gameType: GameType.QuizBowl,
  format: TournamentFormat.SingleElimination,
  entryStake: BigInt(0),
  maxParticipants: 8,
  roundCount: 3,
  gameParameters: { quizQuestionCount: 10 },
};

// validation.ts only knows formats 0 (Swiss) and 1 (SingleElimination) — checks
// `config.format > 1`. Round-robin configs are still valid for format-handler
// tests, just not for `validateTournamentConfig`.
export const validRoundRobinConfig: TournamentConfig = {
  name: "Round Robin Cup",
  gameType: GameType.StrategyArena,
  format: TournamentFormat.RoundRobin,
  entryStake: BigInt(0),
  maxParticipants: 4,
  roundCount: 3,
  gameParameters: {},
};

// Known-bad shapes for table tests.
export const invalidConfigs = {
  nameTooShort: { ...validSwissConfig, name: "ab" },
  nameTooLong: { ...validSwissConfig, name: "x".repeat(80) },
  gameTypeOutOfRange: { ...validSwissConfig, gameType: 99 as GameType },
  formatOutOfRange: { ...validSwissConfig, format: 99 as TournamentFormat },
  entryStakeNegative: { ...validSwissConfig, entryStake: BigInt(-1) },
  participantsTooFew: { ...validSwissConfig, maxParticipants: 1 },
  participantsTooMany: { ...validSwissConfig, maxParticipants: 65 },
  elimNotPowerOf2: { ...validElimConfig, maxParticipants: 6, roundCount: 3 },
  elimRoundsTooLow: { ...validElimConfig, maxParticipants: 8, roundCount: 1 },
} as const;
