import { GameType, TournamentFormat, TournamentStatus, MatchStatus } from '@/types/arena';

export const GAME_TYPE_CONFIG = {
  [GameType.OracleDuel]: {
    label: 'Oracle Duel',
    shortLabel: 'ORACLE',
    color: 'game-oracle',
    accentHex: '#f59e0b',
    icon: 'TrendingUp' as const,
    description: 'Bull vs Bear price prediction showdown',
    arcadeLabel: 'PRICE PROPHECY',
    cardClass: 'arcade-card-oracle',
  },
  [GameType.StrategyArena]: {
    label: 'Strategy Arena',
    shortLabel: 'STRATEGY',
    color: 'game-strategy',
    accentHex: '#8b5cf6',
    icon: 'Swords' as const,
    description: "Iterated Prisoner's Dilemma",
    arcadeLabel: 'MIND GAMES',
    cardClass: 'arcade-card-strategy',
  },
  [GameType.AuctionWars]: {
    label: 'Auction Wars',
    shortLabel: 'AUCTION',
    color: 'game-auction',
    accentHex: '#06b6d4',
    icon: 'Gavel' as const,
    description: 'Sealed-bid mystery box valuation',
    arcadeLabel: 'BIDDING BATTLE',
    cardClass: 'arcade-card-auction',
  },
  [GameType.QuizBowl]: {
    label: 'Quiz Bowl',
    shortLabel: 'QUIZ',
    color: 'game-quiz',
    accentHex: '#22c55e',
    icon: 'Brain' as const,
    description: 'Blockchain knowledge speed round',
    arcadeLabel: 'BRAIN BLAST',
    cardClass: 'arcade-card-quiz',
  },
} as const;

export const FORMAT_LABELS: Record<TournamentFormat, string> = {
  [TournamentFormat.SwissSystem]: 'Swiss System',
  [TournamentFormat.SingleElimination]: 'Single Elimination',
  [TournamentFormat.DoubleElimination]: 'Double Elimination',
  [TournamentFormat.RoundRobin]: 'Round Robin',
  [TournamentFormat.BestOfN]: 'Best-of-N Series',
  [TournamentFormat.RoyalRumble]: 'Royal Rumble',
  [TournamentFormat.Pentathlon]: 'Pentathlon',
};

export const STATUS_CONFIG: Record<TournamentStatus, { label: string; color: string }> = {
  [TournamentStatus.Open]: { label: 'OPEN', color: 'cyan' },
  [TournamentStatus.Active]: { label: 'LIVE', color: 'green' },
  [TournamentStatus.Completed]: { label: 'COMPLETED', color: 'purple' },
  [TournamentStatus.Cancelled]: { label: 'CANCELLED', color: 'red' },
  [TournamentStatus.Paused]: { label: 'PAUSED', color: 'orange' },
};

export const MATCH_STATUS_CONFIG: Record<MatchStatus, { label: string; color: string }> = {
  [MatchStatus.Scheduled]: { label: 'SCHEDULED', color: 'cyan' },
  [MatchStatus.InProgress]: { label: 'LIVE', color: 'green' },
  [MatchStatus.Completed]: { label: 'COMPLETED', color: 'purple' },
  [MatchStatus.Disputed]: { label: 'DISPUTED', color: 'orange' },
};
