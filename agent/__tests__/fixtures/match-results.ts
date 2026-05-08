import type { MatchResult } from "../../game-engine/game-mode.interface";
import { GameType } from "../../game-engine/game-mode.interface";
import { agentAddresses } from "./agents";

interface MatchResultOverrides {
  matchId?: number;
  tournamentId?: number;
  round?: number;
  winner?: string | null;
  loser?: string | null;
  isDraw?: boolean;
  isUpset?: boolean;
  gameType?: GameType;
  duration?: number;
  stats?: Record<string, unknown>;
}

export function makeMatchResult(overrides: MatchResultOverrides = {}): MatchResult {
  return {
    matchId: overrides.matchId ?? 1,
    tournamentId: overrides.tournamentId ?? 1,
    round: overrides.round ?? 1,
    winner: overrides.winner ?? agentAddresses[0],
    loser: overrides.loser ?? agentAddresses[1],
    isDraw: overrides.isDraw ?? false,
    isUpset: overrides.isUpset ?? false,
    gameType: overrides.gameType ?? GameType.StrategyArena,
    tournamentStage: "round1",
    player1Actions: [],
    player2Actions: [],
    stats: overrides.stats ?? {},
    duration: overrides.duration ?? 60,
  };
}

// One-of-each-game-type fixtures used by match-store BigInt round-trip tests.
export const sampleOracleDuelResult: MatchResult = makeMatchResult({
  matchId: 100,
  gameType: GameType.OracleDuel,
  stats: { snapshotPrice: BigInt("1000000000000000000"), tokenSymbol: "TEST" },
});

export const sampleStrategyResult: MatchResult = makeMatchResult({
  matchId: 101,
  gameType: GameType.StrategyArena,
  stats: { totalRounds: 5, p1Score: 30000, p2Score: 14000 },
});

export const sampleAuctionResult: MatchResult = makeMatchResult({
  matchId: 102,
  gameType: GameType.AuctionWars,
  stats: { totalBudget: BigInt(1000), boxes: 5 },
});

export const sampleQuizResult: MatchResult = makeMatchResult({
  matchId: 103,
  gameType: GameType.QuizBowl,
  stats: { questionsAnswered: 10, p1Correct: 7, p2Correct: 5 },
});
