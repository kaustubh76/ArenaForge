// analyticsEngine.ts — Pure computation functions for match replay analytics
// No React dependencies. All data derived from MatchReplay round data.

import { GameType, type MatchReplay, type ReplayRound } from '@/types/arena';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WinProbPoint {
  round: number;
  p1Prob: number;
  p2Prob: number;
  p1Score: number;
  p2Score: number;
}

export interface MomentumPoint {
  round: number;
  delta: number;
  p1Gain: number;
  p2Gain: number;
  isTurningPoint: boolean;
}

export interface KeyMoment {
  round: number;
  type: 'lead_change' | 'big_swing' | 'streak';
  description: string;
  magnitude: number;
}

export interface StrategyBreakdown {
  gameType: GameType;
  // Strategy Arena
  p1CoopRate?: number;
  p2CoopRate?: number;
  p1MovePattern?: ('C' | 'D')[];
  p2MovePattern?: ('C' | 'D')[];
  mutualCoopCount?: number;
  mutualDefectCount?: number;
  // Auction Wars
  p1AvgBidAccuracy?: number;
  p2AvgBidAccuracy?: number;
  p1OverbidCount?: number;
  p2OverbidCount?: number;
  // Quiz Bowl
  p1CorrectRate?: number;
  p2CorrectRate?: number;
  p1ByDifficulty?: Record<string, number>;
  p2ByDifficulty?: Record<string, number>;
  // Oracle Duel
  p1PredictionAccuracy?: number;
  p2PredictionAccuracy?: number;
  p1LongestStreak?: number;
  p2LongestStreak?: number;
}

export interface MatchAnalytics {
  winProbability: WinProbPoint[];
  momentum: MomentumPoint[];
  keyMoments: KeyMoment[];
  strategy: StrategyBreakdown;
  summary: {
    p1FinalScore: number;
    p2FinalScore: number;
    totalRounds: number;
    leadChanges: number;
    biggestSwing: number;
    longestStreak: { player: 1 | 2; length: number };
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseAction(action: unknown): Record<string, any> | null {
  if (!action) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof action === 'object') return action as Record<string, any>;
  if (typeof action === 'string') {
    try { return JSON.parse(action); }
    catch { return null; }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Win Probability
// ---------------------------------------------------------------------------

function computeWinProbability(rounds: ReplayRound[]): WinProbPoint[] {
  const total = rounds.length;
  if (total === 0) return [];

  const finalP1 = rounds[total - 1].player1Score;
  const finalP2 = rounds[total - 1].player2Score;
  const avgPointsPerRound = Math.max((finalP1 + finalP2) / total, 1);

  return rounds.map((r, i) => {
    const remaining = total - (i + 1);
    const diff = r.player1Score - r.player2Score;

    let p1Prob: number;
    if (remaining === 0) {
      p1Prob = diff > 0 ? 100 : diff < 0 ? 0 : 50;
    } else {
      const comebackPotential = remaining * avgPointsPerRound;
      const normalized = diff / comebackPotential;
      const sigmoid = normalized / (1 + Math.abs(normalized));
      p1Prob = Math.round(50 + 50 * sigmoid);
      p1Prob = Math.max(2, Math.min(98, p1Prob));
    }

    return {
      round: i + 1,
      p1Prob,
      p2Prob: 100 - p1Prob,
      p1Score: r.player1Score,
      p2Score: r.player2Score,
    };
  });
}

// ---------------------------------------------------------------------------
// Score Momentum
// ---------------------------------------------------------------------------

function computeMomentum(rounds: ReplayRound[]): MomentumPoint[] {
  let prevDelta = 0;
  return rounds.map((r, i) => {
    const p1Gain = r.player1Score - (i > 0 ? rounds[i - 1].player1Score : 0);
    const p2Gain = r.player2Score - (i > 0 ? rounds[i - 1].player2Score : 0);
    const delta = p1Gain - p2Gain;
    const isTurningPoint = i > 0 && Math.sign(delta) !== 0 && Math.sign(delta) !== Math.sign(prevDelta) && Math.sign(prevDelta) !== 0;
    prevDelta = delta;
    return { round: i + 1, delta, p1Gain, p2Gain, isTurningPoint };
  });
}

// ---------------------------------------------------------------------------
// Key Moments Detection
// ---------------------------------------------------------------------------

function detectKeyMoments(rounds: ReplayRound[]): KeyMoment[] {
  const moments: KeyMoment[] = [];
  if (rounds.length < 2) return moments;

  let prevLeader: 1 | 2 | 0 = 0;
  let streakPlayer: 1 | 2 | 0 = 0;
  let streakLen = 0;
  let streakStart = 0;

  const deltas: number[] = [];

  for (let i = 0; i < rounds.length; i++) {
    const r = rounds[i];
    const p1Gain = r.player1Score - (i > 0 ? rounds[i - 1].player1Score : 0);
    const p2Gain = r.player2Score - (i > 0 ? rounds[i - 1].player2Score : 0);
    const delta = p1Gain - p2Gain;
    deltas.push(Math.abs(delta));

    // Lead changes
    const leader: 1 | 2 | 0 = r.player1Score > r.player2Score ? 1 : r.player2Score > r.player1Score ? 2 : 0;
    if (prevLeader !== 0 && leader !== 0 && leader !== prevLeader) {
      moments.push({
        round: i + 1,
        type: 'lead_change',
        description: `Player ${leader} takes the lead`,
        magnitude: Math.abs(r.player1Score - r.player2Score),
      });
    }
    prevLeader = leader;

    // Streaks
    const roundWinner: 1 | 2 | 0 = delta > 0 ? 1 : delta < 0 ? 2 : 0;
    if (roundWinner !== 0 && roundWinner === streakPlayer) {
      streakLen++;
    } else {
      if (streakLen >= 3) {
        moments.push({
          round: streakStart + 1,
          type: 'streak',
          description: `Player ${streakPlayer} wins ${streakLen} rounds in a row`,
          magnitude: streakLen,
        });
      }
      streakPlayer = roundWinner;
      streakLen = roundWinner !== 0 ? 1 : 0;
      streakStart = i;
    }
  }

  // Check final streak
  if (streakLen >= 3) {
    moments.push({
      round: streakStart + 1,
      type: 'streak',
      description: `Player ${streakPlayer} wins ${streakLen} rounds in a row`,
      magnitude: streakLen,
    });
  }

  // Big swings (top 20% by delta magnitude)
  if (deltas.length > 2) {
    const sorted = [...deltas].sort((a, b) => b - a);
    const threshold = sorted[Math.max(0, Math.floor(sorted.length * 0.2) - 1)];
    for (let i = 0; i < rounds.length; i++) {
      if (deltas[i] >= threshold && deltas[i] > 0) {
        const alreadyLogged = moments.some(m => m.round === i + 1);
        if (!alreadyLogged) {
          const r = rounds[i];
          const p1Gain = r.player1Score - (i > 0 ? rounds[i - 1].player1Score : 0);
          const p2Gain = r.player2Score - (i > 0 ? rounds[i - 1].player2Score : 0);
          const winner = p1Gain > p2Gain ? 1 : 2;
          moments.push({
            round: i + 1,
            type: 'big_swing',
            description: `Player ${winner} gains big advantage`,
            magnitude: deltas[i],
          });
        }
      }
    }
  }

  // Sort by round, cap at 8
  moments.sort((a, b) => a.round - b.round);
  return moments.slice(0, 8);
}

// ---------------------------------------------------------------------------
// Game-Specific Strategy Extraction
// ---------------------------------------------------------------------------

function extractStrategy(rounds: ReplayRound[], gameType: GameType): StrategyBreakdown {
  const base: StrategyBreakdown = { gameType };

  switch (gameType) {
    case GameType.StrategyArena:
      return extractStrategyArena(rounds, base);
    case GameType.AuctionWars:
      return extractAuctionWars(rounds, base);
    case GameType.QuizBowl:
      return extractQuizBowl(rounds, base);
    case GameType.OracleDuel:
      return extractOracleDuel(rounds, base);
    default:
      return base;
  }
}

function extractStrategyArena(rounds: ReplayRound[], base: StrategyBreakdown): StrategyBreakdown {
  const p1Pattern: ('C' | 'D')[] = [];
  const p2Pattern: ('C' | 'D')[] = [];
  let p1Coop = 0, p2Coop = 0;
  let mutualCoop = 0, mutualDefect = 0;

  for (const r of rounds) {
    const p1Move = typeof r.player1Action === 'string' ? r.player1Action : null;
    const p2Move = typeof r.player2Action === 'string' ? r.player2Action : null;

    const p1C = p1Move === 'Cooperate';
    const p2C = p2Move === 'Cooperate';

    p1Pattern.push(p1C ? 'C' : 'D');
    p2Pattern.push(p2C ? 'C' : 'D');

    if (p1C) p1Coop++;
    if (p2C) p2Coop++;
    if (p1C && p2C) mutualCoop++;
    if (!p1C && !p2C) mutualDefect++;
  }

  return {
    ...base,
    p1CoopRate: rounds.length > 0 ? p1Coop / rounds.length : 0,
    p2CoopRate: rounds.length > 0 ? p2Coop / rounds.length : 0,
    p1MovePattern: p1Pattern,
    p2MovePattern: p2Pattern,
    mutualCoopCount: mutualCoop,
    mutualDefectCount: mutualDefect,
  };
}

function extractAuctionWars(rounds: ReplayRound[], base: StrategyBreakdown): StrategyBreakdown {
  let p1AccuracySum = 0, p2AccuracySum = 0;
  let p1Overbid = 0, p2Overbid = 0;
  let validRounds = 0;

  for (const r of rounds) {
    const p1Data = parseAction(r.player1Action);
    const p2Data = parseAction(r.player2Action);
    const value = Number(p1Data?.value ?? p2Data?.value ?? 0);
    if (value <= 0) continue;

    validRounds++;
    const p1Bid = Number(p1Data?.bid ?? 0);
    const p2Bid = Number(p2Data?.bid ?? 0);

    p1AccuracySum += 1 - Math.abs(p1Bid - value) / value;
    p2AccuracySum += 1 - Math.abs(p2Bid - value) / value;

    if (p1Bid > value) p1Overbid++;
    if (p2Bid > value) p2Overbid++;
  }

  return {
    ...base,
    p1AvgBidAccuracy: validRounds > 0 ? Math.max(0, p1AccuracySum / validRounds) : undefined,
    p2AvgBidAccuracy: validRounds > 0 ? Math.max(0, p2AccuracySum / validRounds) : undefined,
    p1OverbidCount: p1Overbid,
    p2OverbidCount: p2Overbid,
  };
}

function extractQuizBowl(rounds: ReplayRound[], base: StrategyBreakdown): StrategyBreakdown {
  let p1Correct = 0, p2Correct = 0;
  const p1ByDiff: Record<string, { correct: number; total: number }> = {};
  const p2ByDiff: Record<string, { correct: number; total: number }> = {};

  for (const r of rounds) {
    const p1Data = parseAction(r.player1Action);
    const p2Data = parseAction(r.player2Action);
    const correctAnswer = p1Data?.correct ?? p2Data?.correct;
    const difficulty = String(p1Data?.difficulty ?? p2Data?.difficulty ?? 'unknown');

    if (!p1ByDiff[difficulty]) p1ByDiff[difficulty] = { correct: 0, total: 0 };
    if (!p2ByDiff[difficulty]) p2ByDiff[difficulty] = { correct: 0, total: 0 };

    p1ByDiff[difficulty].total++;
    p2ByDiff[difficulty].total++;

    if (p1Data?.answer != null && correctAnswer != null && Number(p1Data.answer) === Number(correctAnswer)) {
      p1Correct++;
      p1ByDiff[difficulty].correct++;
    }
    if (p2Data?.answer != null && correctAnswer != null && Number(p2Data.answer) === Number(correctAnswer)) {
      p2Correct++;
      p2ByDiff[difficulty].correct++;
    }
  }

  const toPct = (rec: Record<string, { correct: number; total: number }>) => {
    const result: Record<string, number> = {};
    for (const [k, v] of Object.entries(rec)) {
      result[k] = v.total > 0 ? v.correct / v.total : 0;
    }
    return result;
  };

  return {
    ...base,
    p1CorrectRate: rounds.length > 0 ? p1Correct / rounds.length : 0,
    p2CorrectRate: rounds.length > 0 ? p2Correct / rounds.length : 0,
    p1ByDifficulty: toPct(p1ByDiff),
    p2ByDifficulty: toPct(p2ByDiff),
  };
}

function extractOracleDuel(rounds: ReplayRound[], base: StrategyBreakdown): StrategyBreakdown {
  let p1Correct = 0, p2Correct = 0;
  let p1Streak = 0, p2Streak = 0;
  let p1MaxStreak = 0, p2MaxStreak = 0;

  for (let i = 0; i < rounds.length; i++) {
    const r = rounds[i];
    const prevScore1 = i > 0 ? rounds[i - 1].player1Score : 0;
    const prevScore2 = i > 0 ? rounds[i - 1].player2Score : 0;
    const p1Gained = r.player1Score > prevScore1;
    const p2Gained = r.player2Score > prevScore2;

    if (p1Gained) {
      p1Correct++;
      p1Streak++;
      p1MaxStreak = Math.max(p1MaxStreak, p1Streak);
    } else {
      p1Streak = 0;
    }

    if (p2Gained) {
      p2Correct++;
      p2Streak++;
      p2MaxStreak = Math.max(p2MaxStreak, p2Streak);
    } else {
      p2Streak = 0;
    }
  }

  return {
    ...base,
    p1PredictionAccuracy: rounds.length > 0 ? p1Correct / rounds.length : 0,
    p2PredictionAccuracy: rounds.length > 0 ? p2Correct / rounds.length : 0,
    p1LongestStreak: p1MaxStreak,
    p2LongestStreak: p2MaxStreak,
  };
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function computeSummary(rounds: ReplayRound[]): MatchAnalytics['summary'] {
  if (rounds.length === 0) {
    return { p1FinalScore: 0, p2FinalScore: 0, totalRounds: 0, leadChanges: 0, biggestSwing: 0, longestStreak: { player: 1, length: 0 } };
  }

  const last = rounds[rounds.length - 1];
  let leadChanges = 0;
  let prevLeader: 1 | 2 | 0 = 0;
  let biggestSwing = 0;

  let streakPlayer: 1 | 2 | 0 = 0;
  let streakLen = 0;
  let bestStreak = { player: 1 as 1 | 2, length: 0 };

  for (let i = 0; i < rounds.length; i++) {
    const r = rounds[i];
    const leader: 1 | 2 | 0 = r.player1Score > r.player2Score ? 1 : r.player2Score > r.player1Score ? 2 : 0;
    if (prevLeader !== 0 && leader !== 0 && leader !== prevLeader) leadChanges++;
    prevLeader = leader;

    const p1Gain = r.player1Score - (i > 0 ? rounds[i - 1].player1Score : 0);
    const p2Gain = r.player2Score - (i > 0 ? rounds[i - 1].player2Score : 0);
    const swing = Math.abs(p1Gain - p2Gain);
    if (swing > biggestSwing) biggestSwing = swing;

    const roundWinner: 1 | 2 | 0 = p1Gain > p2Gain ? 1 : p2Gain > p1Gain ? 2 : 0;
    if (roundWinner !== 0 && roundWinner === streakPlayer) {
      streakLen++;
    } else {
      if (streakLen > bestStreak.length && streakPlayer !== 0) {
        bestStreak = { player: streakPlayer as 1 | 2, length: streakLen };
      }
      streakPlayer = roundWinner;
      streakLen = roundWinner !== 0 ? 1 : 0;
    }
  }
  if (streakLen > bestStreak.length && streakPlayer !== 0) {
    bestStreak = { player: streakPlayer as 1 | 2, length: streakLen };
  }

  return {
    p1FinalScore: last.player1Score,
    p2FinalScore: last.player2Score,
    totalRounds: rounds.length,
    leadChanges,
    biggestSwing,
    longestStreak: bestStreak,
  };
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

export function computeMatchAnalytics(replay: MatchReplay): MatchAnalytics {
  const { rounds, gameType } = replay;
  return {
    winProbability: computeWinProbability(rounds),
    momentum: computeMomentum(rounds),
    keyMoments: detectKeyMoments(rounds),
    strategy: extractStrategy(rounds, gameType),
    summary: computeSummary(rounds),
  };
}
