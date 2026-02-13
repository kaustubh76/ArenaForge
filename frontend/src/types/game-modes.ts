import { StrategyMove } from './arena';

export interface OracleDuelData {
  tokenAddress: string;
  tokenSymbol: string;
  snapshotPrice: string;
  resolvedPrice: string | null;
  durationSeconds: number;
  bullPlayer: string;
  bearPlayer: string;
  resolved: boolean;
  elapsed?: number;
  remaining?: number;
}

export interface StrategyRound {
  round: number;
  player1Move: StrategyMove;
  player2Move: StrategyMove;
  player1Committed: boolean;
  player2Committed: boolean;
  player1Revealed: boolean;
  player2Revealed: boolean;
  player1Payoff: number;
  player2Payoff: number;
  resolved: boolean;
}

export interface MysteryBox {
  id: string;
  tokenAddress: string;
  positionValue: string;
  hints: BoxHint[];
  createdAt: number;
}

export interface BoxHint {
  type: 'category' | 'marketCapRange' | 'age' | 'tradeCount';
  value: string;
}

export interface QuizQuestion {
  index: number;
  question: string;
  options: string[];
  correctAnswer: number;
  difficulty: 'easy' | 'medium' | 'hard';
  category: string;
  sourceReference: string;
  questionHash: string;
}

export interface AuctionBid {
  player: string;
  boxId: string;
  amount: string;
  committed: boolean;
  revealed: boolean;
}

export interface QuizAnswer {
  player: string;
  questionIndex: number;
  selectedAnswer: number;
  correct: boolean;
  timeMs: number;
  speedBonus: number;
}
