// Shared types, enums, and interfaces for the ArenaForge agent

// --- Enums ---

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

// --- Core Data Structures ---

export interface Tournament {
  id: number;
  name: string;
  gameType: GameType;
  format: TournamentFormat;
  status: TournamentStatus;
  entryStake: bigint;
  maxParticipants: number;
  currentParticipants: number;
  prizePool: bigint;
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

export interface Match {
  id: number;
  tournamentId: number;
  round: number;
  player1: string;
  player2: string;
  winner: string | null;
  resultHash: string;
  timestamp: number;
  status: MatchStatus;
}

// --- Game Mode Interface ---

export interface PlayerAction {
  type: string;
  data: Record<string, unknown>;
}

export interface ActionResult {
  accepted: boolean;
  error?: string;
}

export interface MatchState {
  matchId: number;
  gameType: GameType;
  status: string;
  data: Record<string, unknown>;
}

export interface MatchOutcome {
  matchId: number;
  winner: string | null;
  scores: Map<string, number>;
  resultData: Record<string, unknown>;
  resultHash: string;
}

export interface GameMode {
  readonly gameType: GameType;
  initMatch(matchId: number, players: string[], params: GameParameters): Promise<void>;
  processAction(matchId: number, player: string, action: PlayerAction): Promise<ActionResult>;
  isResolvable(matchId: number): Promise<boolean>;
  resolve(matchId: number): Promise<MatchOutcome>;
  getState(matchId: number): Promise<MatchState>;
  validateParameters(params: GameParameters): boolean;
}

// --- Game Parameters (Subject to Evolution) ---

export interface GameParameters {
  // Oracle Duel
  oracleDuelDuration?: number;
  oracleMinVolatility?: number;
  oracleMaxVolatility?: number;
  oraclePositionMethod?: "random" | "alternating" | "bid";

  // Strategy Arena
  strategyRoundCount?: number;
  strategyCooperateCooperate?: number;
  strategyDefectCooperate?: number;
  strategyCooperateDefect?: number;
  strategyDefectDefect?: number;
  strategyCommitTimeout?: number;
  strategyRevealTimeout?: number;

  // Auction Wars
  auctionBiddingDuration?: number;
  auctionBoxCount?: number;
  auctionHintCount?: number;
  auctionMinBidPercent?: number;

  // Quiz Bowl
  quizQuestionCount?: number;
  quizAnswerTime?: number;
  quizSpeedBonusMax?: number;
  quizDifficultyDistribution?: [number, number, number];
}

// --- Evolution Types ---

export interface Mutation {
  type: string;
  factor?: number;
  increment?: number;
  strategy?: string;
  reason: string;
}

export interface EvolutionMetrics {
  averageStakeBehavior: "conservative" | "moderate" | "aggressive";
  dominantStrategy: string;
  strategyDistribution: Map<string, number>;
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

// --- Match Result ---

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

// --- Game-Specific Types ---

export interface OracleDuelData {
  tokenAddress: string;
  tokenSymbol: string;
  snapshotPrice: bigint;
  resolvedPrice: bigint | null;
  durationSeconds: number;
  bullPlayer: string;
  bearPlayer: string;
  resolved: boolean;
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
  positionValue: bigint;
  hints: BoxHint[];
  createdAt: number;
}

export interface BoxHint {
  type: "category" | "marketCapRange" | "age" | "tradeCount";
  value: string;
}

export interface QuizQuestion {
  index: number;
  question: string;
  options: string[];
  correctAnswer: number;
  difficulty: "easy" | "medium" | "hard";
  category: string;
  sourceReference: string;
  questionHash: string;
}

// --- Token Info (Nad.fun) ---

export interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  price: bigint;
  marketCap: bigint;
  volume24h: bigint;
  graduated: boolean;
  curveLiquidity: bigint;
  lastTradeTimestamp: number;
  hourlyVolatility?: number;
}

// --- Tournament State (Agent-side) ---

export interface TournamentState {
  config: TournamentConfig;
  participants: AgentStanding[];
  rounds: RoundData[];
  currentRound: number;
  status: "open" | "active" | "completing" | "completed" | "paused";
}

export interface TournamentConfig {
  name: string;
  gameType: GameType;
  format: TournamentFormat;
  entryStake: bigint;
  maxParticipants: number;
  roundCount: number;
  gameParameters: GameParameters;
}

export interface AgentStanding {
  address: string;
  handle: string;
  elo: number;
  tournamentPoints: number;
  eliminated: boolean;
  // Double elimination tracking
  bracketPosition?: "winners" | "losers" | "eliminated";
  lossesBracket?: number;
}

// --- Advanced Tournament Format Types ---

// Series configuration for Best-of-N
export interface SeriesConfig {
  seriesId: number;
  player1: string;
  player2: string;
  winsRequired: number; // 2 for Bo3, 3 for Bo5, 4 for Bo7
  player1Wins: number;
  player2Wins: number;
  matchIds: number[];
  completed: boolean;
  winner: string | null;
}

// Bracket structure for elimination formats
export interface Bracket {
  type: "single" | "double";
  rounds: BracketRound[];
  losersRounds?: BracketRound[]; // For double elimination
  grandFinalMatchId?: number;
  bracketResetMatchId?: number;
  currentPhase?: "winners" | "losers" | "grand_final" | "reset";
}

export interface BracketRound {
  roundNumber: number;
  bracketType: "winners" | "losers" | "grand_final";
  matches: BracketMatch[];
}

export interface BracketMatch {
  matchId: number | null; // null if not yet created
  player1Seed: number | null;
  player2Seed: number | null;
  player1Address: string | null;
  player2Address: string | null;
  winner: string | null;
  loser: string | null;
  nextMatchId?: number; // Where winner goes
  loserNextMatchId?: number; // Where loser goes (double elim)
}

// Round Robin specific
export interface RoundRobinStanding extends AgentStanding {
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  pointsFor: number;
  pointsAgainst: number;
  headToHead: Map<string, "win" | "loss" | "draw" | null>;
}

// Pentathlon specific
export interface PentathlonScores {
  eventScores: Map<GameType, number>; // Points per event
  eventRanks: Map<GameType, number>; // Rank per event
  totalPoints: number;
  eventsCompleted: number;
}

// Royal Rumble specific
export interface RumbleParticipant {
  address: string;
  entryOrder: number;
  entryTime: number;
  eliminationOrder: number | null;
  eliminatedBy: string | null;
  survivalTime: number;
  eliminations: number;
}

export interface RoundData {
  round: number;
  pairings: [string, string][];
  results: MatchResult[];
  completed: boolean;
}

// --- Moltbook Types ---

export interface QueuedPost {
  title: string;
  body: string;
  flair: string;
  priority: number;
}
