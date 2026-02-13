// Types mirroring agent/game-engine/game-mode.interface.ts
// Uses string instead of bigint for JSON compatibility

export enum GameType {
  OracleDuel = 0,
  StrategyArena = 1,
  AuctionWars = 2,
  QuizBowl = 3,
}

export enum TournamentFormat {
  SwissSystem = 0,
  SingleElimination = 1,
  DoubleElimination = 2,
  RoundRobin = 3,
  BestOfN = 4,
  RoyalRumble = 5,
  Pentathlon = 6,
}

export enum TournamentStatus {
  Open = 0,
  Active = 1,
  Completed = 2,
  Cancelled = 3,
  Paused = 4,
}

export enum MatchStatus {
  Scheduled = 0,
  InProgress = 1,
  Completed = 2,
  Disputed = 3,
}

export enum StrategyMove {
  None = 0,
  Cooperate = 1,
  Defect = 2,
}

export interface Tournament {
  id: number;
  name: string;
  gameType: GameType;
  format: TournamentFormat;
  status: TournamentStatus;
  entryStake: string;
  maxParticipants: number;
  currentParticipants: number;
  prizePool: string;
  startTime: number;
  roundCount: number;
  currentRound: number;
  parametersHash: string;
}

export interface AgentProfile {
  agentAddress: string;
  moltbookHandle: string;
  elo: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  registered: boolean;
}

export interface AgentProfileExtended extends AgentProfile {
  eloHistory: number[];
  recentMatches: Match[];
  winRate: number;
  streak: number;
  longestWinStreak?: number;
  avatarUrl?: string;
  peakElo?: number;
  tournamentsWon?: number;
}

export interface Match {
  id: number;
  tournamentId: number;
  round: number;
  player1: string;
  player2: string;
  winner: string | null;
  resultHash: string;
  timestamp: number;
  startTime?: number;
  duration?: number; // Match duration in seconds
  status: MatchStatus;
  gameType?: GameType; // For Pentathlon tournaments with multiple game types
}

export interface PlayerAction {
  type: string;
  data: Record<string, unknown>;
}

export interface MatchResult {
  matchId: number;
  tournamentId: number;
  round: number;
  winner: string | null;
  loser: string | null;
  isDraw: boolean;
  isUpset: boolean;
  gameType: GameType;
  tournamentStage: string;
  player1Actions: PlayerAction[];
  player2Actions: PlayerAction[];
  stats: Record<string, unknown>;
  duration: number;
}

export interface AgentStanding {
  address: string;
  handle: string;
  elo: number;
  tournamentPoints: number;
  eliminated: boolean;
}

export interface RoundData {
  round: number;
  pairings: [string, string][];
  results: MatchResult[];
  completed: boolean;
}

export interface GameParameters {
  oracleDuelDuration?: number;
  oracleMinVolatility?: number;
  oracleMaxVolatility?: number;
  oraclePositionMethod?: 'random' | 'alternating' | 'bid';
  strategyRoundCount?: number;
  strategyCooperateCooperate?: number;
  strategyDefectCooperate?: number;
  strategyCooperateDefect?: number;
  strategyDefectDefect?: number;
  strategyCommitTimeout?: number;
  strategyRevealTimeout?: number;
  auctionBiddingDuration?: number;
  auctionBoxCount?: number;
  auctionHintCount?: number;
  auctionMinBidPercent?: number;
  quizQuestionCount?: number;
  quizAnswerTime?: number;
  quizSpeedBonusMax?: number;
  quizDifficultyDistribution?: [number, number, number];
}

export interface Mutation {
  type: string;
  factor?: number;
  increment?: number;
  strategy?: string;
  reason: string;
}

export interface EvolutionMetrics {
  averageStakeBehavior: 'conservative' | 'moderate' | 'aggressive';
  dominantStrategy: string;
  strategyDistribution: Record<string, number>;
  averageMatchDuration: number;
  drawRate: number;
}

export interface EvolutionRecord {
  tournamentId: number;
  round: number;
  previousParamsHash: string;
  newParamsHash: string;
  mutations: Mutation[];
  metrics: EvolutionMetrics;
  timestamp: number;
}

export interface TournamentWithStandings extends Tournament {
  standings: AgentStanding[];
  rounds: RoundData[];
  matches: Match[];
  // Phase 3 format-specific data (optional)
  bracket?: Bracket;
  series?: SeriesData[];
  roundRobinStandings?: RoundRobinStanding[];
  pentathlonStandings?: PentathlonStanding[];
  rumbleParticipants?: RumbleParticipant[];
  currentEntrant?: number; // For Royal Rumble
  lastElimination?: {
    eliminated: string;
    eliminator: string;
    timestamp: number;
  };
  completedEvents?: GameType[]; // For Pentathlon
  currentEvent?: GameType; // For Pentathlon
}

// =========================================================================
// Phase 2: Seasonal Rankings Types
// =========================================================================

export enum RankTier {
  Iron = 0,
  Bronze = 1,
  Silver = 2,
  Gold = 3,
  Platinum = 4,
  Diamond = 5,
}

export interface Season {
  id: number;
  startTime: number;
  endTime: number;
  active: boolean;
  rewardsDistributed: boolean;
  totalPrizePool: string;
}

export interface SeasonalProfile {
  address: string;
  seasonalElo: number;
  peakElo: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  tier: RankTier;
  placementMatches: number;
  placementComplete: boolean;
  rewardClaimed: boolean;
}

export interface TierReward {
  tier: RankTier;
  tokenAmount: string;
  badgeURI: string;
}

// =========================================================================
// Phase 2: Spectator Betting Types
// =========================================================================

export enum BetStatus {
  Active = 0,
  Won = 1,
  Lost = 2,
  Refunded = 3,
}

export interface Bet {
  id: number;
  matchId: number;
  bettor: string;
  predictedWinner: string;
  amount: string;
  odds: string;
  status: BetStatus;
  payout: string;
  timestamp: number;
}

export interface MatchPool {
  matchId: number;
  player1: string;
  player2: string;
  totalPlayer1Bets: string;
  totalPlayer2Bets: string;
  bettingOpen: boolean;
  settled: boolean;
}

export interface BettorProfile {
  address: string;
  totalBets: number;
  wins: number;
  losses: number;
  totalWagered: string;
  totalWon: string;
  netProfit: string;
  currentStreak: number;
  longestWinStreak: number;
  winRate: number;
}

// =========================================================================
// Phase 2: Match Replay Types
// =========================================================================

export interface ReplayMetadata {
  matchId: number;
  roundStateHashes: string[];
  roundCount: number;
  available: boolean;
}

export interface ReplayRound {
  roundNumber: number;
  player1Action: unknown;
  player2Action: unknown;
  player1Score: number;
  player2Score: number;
  timestamp: number;
  stateHash: string;
}

export interface MatchReplay {
  matchId: number;
  gameType: GameType;
  player1: string;
  player2: string;
  winner: string | null;
  rounds: ReplayRound[];
  totalDuration: number;
  metadata: ReplayMetadata;
}

// =========================================================================
// Phase 3: Advanced Tournament Format Types
// =========================================================================

export interface SeriesData {
  seriesId: number;
  tournamentId: number;
  player1: string;
  player2: string;
  winsRequired: number;
  player1Wins: number;
  player2Wins: number;
  completed: boolean;
  winner: string | null;
}

export interface BracketMatch {
  matchId: number | null;
  player1: string | null;
  player2: string | null;
  winner: string | null;
  completed: boolean;
  sourceMatch1?: number;
  sourceMatch2?: number;
}

export interface BracketRound {
  roundNumber: number;
  matches: BracketMatch[];
}

export interface Bracket {
  winnersBracket: BracketRound[];
  losersBracket?: BracketRound[];
  currentPhase: 'winners' | 'losers' | 'finals';
}

export interface RoundRobinStanding {
  agentAddress: string;
  handle?: string;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  gamesPlayed: number;
}

export interface PentathlonScore {
  agentAddress: string;
  handle?: string;
  gameType: GameType;
  eventRank: number;
  pointsEarned: number;
}

export interface PentathlonStanding {
  agentAddress: string;
  handle?: string;
  totalPoints: number;
  eventScores: Record<GameType, { rank: number; points: number }>;
}

export interface RumbleParticipant {
  address: string;
  handle?: string;
  entryOrder: number;
  eliminatedAt?: number;
  eliminator?: string;
  isActive: boolean;
}

// =========================================================================
// Agent Profiles & Achievements
// =========================================================================

export enum AchievementId {
  FirstBlood = 1,
  StreakStarter = 2,
  StreakMaster = 3,
  Champion = 4,
  GrandChampion = 5,
  EloElite = 6,
  Legendary = 7,
  Veteran = 8,
  Legend = 9,
  Perfectionist = 10,
  Gambler = 11,
  BettingKing = 12,
  SeasonWarrior = 13,
  Diplomat = 14,
  Nemesis = 15,
  AllianceMaster = 16,
}

export type AchievementRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface Achievement {
  id: AchievementId;
  name: string;
  description: string;
  icon: string;
  rarity: AchievementRarity;
  requirement: string;
  unlockedAt?: number;
}

export interface AgentMatchHistory {
  matchId: number;
  opponent: string;
  opponentHandle?: string;
  result: 'win' | 'loss' | 'draw';
  gameType: GameType;
  eloChange: number;
  timestamp: number;
}

export interface HeadToHead {
  agent1: string;
  agent2: string;
  agent1Wins: number;
  agent2Wins: number;
  draws: number;
  matches: AgentMatchHistory[];
}
