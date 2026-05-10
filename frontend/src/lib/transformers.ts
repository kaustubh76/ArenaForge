// Pure transformers from on-chain (bigint-heavy) struct shapes to the
// frontend types defined in `@/types/arena`.
//
// Extracted from lib/contracts.ts so they can be unit-tested in isolation
// without spinning up viem. The wei → ETH/MON formatting is done at the
// call site (using viem's `formatEther`) and the formatted string is
// passed in via the `formatted` parameter — this keeps every function
// here synchronous and dependency-free.

import { ZERO_ADDRESS } from './contract-constants';
import type {
  Tournament,
  AgentProfileExtended,
  Match,
  Season,
  SeasonalProfile,
  RankTier,
  MatchPool,
  Bet,
  BettorProfile,
} from '@/types/arena';

// -----------------------------------------------------------------------------
// Chain struct shapes (mirrors the viem-decoded tuple outputs from each ABI).
// -----------------------------------------------------------------------------

export interface ChainTournament {
  id: bigint;
  name: string;
  gameType: number;
  format: number;
  status: number;
  entryStake: bigint;
  maxParticipants: bigint;
  currentParticipants: bigint;
  prizePool: bigint;
  startTime: bigint;
  roundCount: bigint;
  currentRound: bigint;
  parametersHash: string;
}

export interface ChainAgent {
  agentAddress: string;
  moltbookHandle: string;
  avatarURI: string;
  elo: bigint;
  matchesPlayed: bigint;
  wins: bigint;
  losses: bigint;
  currentStreak: bigint;
  longestWinStreak: bigint;
  registered: boolean;
}

export interface ChainMatch {
  id: bigint;
  tournamentId: bigint;
  round: bigint;
  player1: string;
  player2: string;
  winner: string;
  resultHash: string;
  timestamp: bigint;
  startTime: bigint;
  duration: bigint;
  status: number;
}

export interface ChainSeason {
  id: bigint;
  startTime: bigint;
  endTime: bigint;
  active: boolean;
  rewardsDistributed: boolean;
  totalPrizePool: bigint;
}

export interface ChainSeasonalProfile {
  agent: string;
  seasonId: bigint;
  seasonalElo: bigint;
  peakElo: bigint;
  matchesPlayed: bigint;
  wins: bigint;
  losses: bigint;
  tier: number;
  placementComplete: boolean;
  placementMatches: bigint;
  rewardClaimed: boolean;
}

export interface ChainMatchPool {
  matchId: bigint;
  player1: string;
  player2: string;
  totalPlayer1Bets: bigint;
  totalPlayer2Bets: bigint;
  bettingOpen: boolean;
  settled: boolean;
  winner: string;
}

export interface ChainBet {
  id: bigint;
  matchId: bigint;
  bettor: string;
  predictedWinner: string;
  amount: bigint;
  odds: bigint;
  timestamp: bigint;
  status: number;
  payout: bigint;
}

export interface ChainBettorProfile {
  bettor: string;
  totalBets: bigint;
  wins: bigint;
  losses: bigint;
  totalWagered: bigint;
  totalWon: bigint;
  totalLost: bigint;
  currentStreak: bigint;
  longestWinStreak: bigint;
}

// Odds are stored on-chain as fixed-point with 1e18 precision.
const ODDS_PRECISION = 1e18;

// -----------------------------------------------------------------------------
// Transformers
// -----------------------------------------------------------------------------

/**
 * Convert a chain Tournament struct into the frontend Tournament type.
 * `formatted.entryStake` and `formatted.prizePool` must be the wei values
 * already converted to MON via `viem.formatEther`. We accept strings here
 * (instead of doing the conversion ourselves) so this module stays
 * synchronous and dependency-free.
 */
export function toTournament(
  raw: ChainTournament,
  formatted: { entryStake: string; prizePool: string },
): Tournament {
  return {
    id: Number(raw.id),
    name: raw.name,
    gameType: raw.gameType,
    format: raw.format,
    status: raw.status,
    entryStake: formatted.entryStake,
    maxParticipants: Number(raw.maxParticipants),
    currentParticipants: Number(raw.currentParticipants),
    prizePool: formatted.prizePool,
    startTime: Number(raw.startTime) * 1000,
    roundCount: Number(raw.roundCount),
    currentRound: Number(raw.currentRound),
    parametersHash: raw.parametersHash,
  };
}

/**
 * Convert a chain Agent struct. winRate is computed honestly: 0 when no
 * matches played (instead of NaN). eloHistory carries the *current* ELO
 * only — earlier slices fabricated a `[1200, currentElo]` series, which
 * the UI then rendered as a chart with a fake 1200 starting point. UIs
 * that need a multi-point series should hydrate it from match history.
 */
export function toAgent(raw: ChainAgent): AgentProfileExtended {
  const wins = Number(raw.wins);
  const matchesPlayed = Number(raw.matchesPlayed);
  const elo = Number(raw.elo);
  return {
    agentAddress: raw.agentAddress,
    moltbookHandle: raw.moltbookHandle,
    avatarUrl: raw.avatarURI || undefined,
    elo,
    matchesPlayed,
    wins,
    losses: Number(raw.losses),
    registered: raw.registered,
    winRate: matchesPlayed > 0 ? (wins / matchesPlayed) * 100 : 0,
    eloHistory: [elo],
    recentMatches: [],
    streak: Number(raw.currentStreak),
    longestWinStreak: Number(raw.longestWinStreak),
  };
}

/**
 * Convert a chain Match. A `0x00…00` winner is normalized to `null`
 * (case-insensitive). Timestamps are converted from seconds → ms so they
 * match the JS Date convention everywhere else in the frontend.
 */
export function toMatch(raw: ChainMatch): Match {
  return {
    id: Number(raw.id),
    tournamentId: Number(raw.tournamentId),
    round: Number(raw.round),
    player1: raw.player1,
    player2: raw.player2,
    winner: raw.winner.toLowerCase() === ZERO_ADDRESS.toLowerCase() ? null : raw.winner,
    resultHash: raw.resultHash,
    timestamp: Number(raw.timestamp) * 1000,
    startTime: Number(raw.startTime) * 1000,
    duration: Number(raw.duration),
    status: raw.status,
  };
}

/** Convert a chain Season. `formatted.totalPrizePool` is the formatted MON value. */
export function toSeason(
  raw: ChainSeason,
  formatted: { totalPrizePool: string },
): Season {
  return {
    id: Number(raw.id),
    startTime: Number(raw.startTime) * 1000,
    endTime: Number(raw.endTime) * 1000,
    active: raw.active,
    rewardsDistributed: raw.rewardsDistributed,
    totalPrizePool: formatted.totalPrizePool,
  };
}

/** Convert a chain SeasonalProfile. */
export function toSeasonalProfile(raw: ChainSeasonalProfile): SeasonalProfile {
  return {
    address: raw.agent,
    seasonalElo: Number(raw.seasonalElo),
    peakElo: Number(raw.peakElo),
    matchesPlayed: Number(raw.matchesPlayed),
    wins: Number(raw.wins),
    losses: Number(raw.losses),
    tier: raw.tier as RankTier,
    placementMatches: Number(raw.placementMatches),
    placementComplete: raw.placementComplete,
    rewardClaimed: raw.rewardClaimed,
  };
}

/**
 * Convert a chain MatchPool. `formatted.{totalPlayer1Bets, totalPlayer2Bets}`
 * are the wei totals converted to MON via `formatEther`.
 */
export function toMatchPool(
  raw: ChainMatchPool,
  formatted: { totalPlayer1Bets: string; totalPlayer2Bets: string },
): MatchPool {
  return {
    matchId: Number(raw.matchId),
    player1: raw.player1,
    player2: raw.player2,
    totalPlayer1Bets: formatted.totalPlayer1Bets,
    totalPlayer2Bets: formatted.totalPlayer2Bets,
    bettingOpen: raw.bettingOpen,
    settled: raw.settled,
  };
}

/** Convert a chain Bet. `formatted.amount` and `formatted.payout` are in MON. */
export function toBet(
  raw: ChainBet,
  formatted: { amount: string; payout: string },
): Bet {
  return {
    id: Number(raw.id),
    matchId: Number(raw.matchId),
    bettor: raw.bettor,
    predictedWinner: raw.predictedWinner,
    amount: formatted.amount,
    odds: (Number(raw.odds) / ODDS_PRECISION).toFixed(4),
    status: raw.status,
    payout: formatted.payout,
    timestamp: Number(raw.timestamp) * 1000,
  };
}

/**
 * Convert a chain BettorProfile. `formatted.{totalWagered, totalWon, totalLost}`
 * are the MON-formatted strings; netProfit is computed from totalWon - totalLost.
 */
export function toBettorProfile(
  raw: ChainBettorProfile,
  formatted: { totalWagered: string; totalWon: string; totalLost: string },
): BettorProfile {
  const wins = Number(raw.wins);
  const totalBets = Number(raw.totalBets);

  return {
    address: raw.bettor,
    totalBets,
    wins,
    losses: Number(raw.losses),
    totalWagered: formatted.totalWagered,
    totalWon: formatted.totalWon,
    netProfit: (parseFloat(formatted.totalWon) - parseFloat(formatted.totalLost)).toFixed(6),
    currentStreak: Number(raw.currentStreak),
    longestWinStreak: Number(raw.longestWinStreak),
    winRate: totalBets > 0 ? (wins / totalBets) * 100 : 0,
  };
}
