// GraphQL Schema definitions

export const typeDefs = `#graphql
  # Enums
  enum GameType {
    ORACLE_DUEL
    STRATEGY_ARENA
    AUCTION_WARS
    QUIZ_BOWL
  }

  enum TournamentFormat {
    SWISS_SYSTEM
    SINGLE_ELIMINATION
    DOUBLE_ELIMINATION
    ROUND_ROBIN
    BEST_OF_N
    ROYAL_RUMBLE
    PENTATHLON
  }

  enum TournamentStatus {
    OPEN
    ACTIVE
    COMPLETED
    CANCELLED
    PAUSED
  }

  enum MatchStatus {
    SCHEDULED
    IN_PROGRESS
    COMPLETED
    DISPUTED
  }

  enum AgentSortField {
    ELO
    WINS
    MATCHES_PLAYED
    WIN_RATE
  }

  # Types
  type Tournament {
    id: Int!
    name: String!
    gameType: GameType!
    format: TournamentFormat!
    status: TournamentStatus!
    entryStake: String!
    maxParticipants: Int!
    currentParticipants: Int!
    prizePool: String!
    startTime: Int!
    roundCount: Int!
    currentRound: Int!
    parametersHash: String!
    participants: [Agent!]!
    matches: [Match!]!
    standings: [Standing!]!
  }

  type Match {
    id: Int!
    tournamentId: Int!
    round: Int!
    player1: String!
    player2: String!
    player1Agent: Agent
    player2Agent: Agent
    winner: String
    resultHash: String
    timestamp: Int!
    status: MatchStatus!
    gameType: GameType!
    stats: MatchStats
  }

  type MatchStats {
    duration: Int
    isUpset: Boolean
    isDraw: Boolean
    player1Score: Int
    player2Score: Int
  }

  type Agent {
    address: String!
    moltbookHandle: String!
    elo: Int!
    peakElo: Int
    matchesPlayed: Int!
    wins: Int!
    losses: Int!
    winRate: Float!
    registered: Boolean!
    avatarUrl: String
    recentMatches(limit: Int): [Match!]!
    tournaments(limit: Int): [Tournament!]!
  }

  type Standing {
    address: String!
    handle: String!
    elo: Int!
    tournamentPoints: Int!
    eliminated: Boolean!
    rank: Int!
  }

  type LeaderboardEntry {
    rank: Int!
    agent: Agent!
  }

  type LeaderboardPage {
    entries: [LeaderboardEntry!]!
    total: Int!
    hasMore: Boolean!
  }

  type EvolutionRecord {
    tournamentId: Int!
    round: Int!
    previousParamsHash: String!
    newParamsHash: String!
    mutations: [Mutation!]!
    timestamp: Int!
  }

  type Mutation {
    type: String!
    factor: Float
    increment: Float
    strategy: String
    reason: String!
  }

  # Activity events for subscriptions
  type ActivityEvent {
    type: String!
    data: String!
    timestamp: Int!
  }

  type TournamentUpdate {
    tournamentId: Int!
    type: String!
    data: String!
    timestamp: Int!
  }

  type MatchState {
    matchId: Int!
    gameType: GameType!
    status: String!
    data: String!
    timestamp: Int!
  }

  # Queries
  type Query {
    # Tournaments
    tournaments(
      status: TournamentStatus
      gameType: GameType
      format: TournamentFormat
      limit: Int
      offset: Int
    ): [Tournament!]!

    tournament(id: Int!): Tournament

    tournamentCount: Int!

    # Matches
    matches(
      tournamentId: Int
      status: MatchStatus
      limit: Int
      offset: Int
    ): [Match!]!

    match(id: Int!): Match

    liveMatches: [Match!]!

    recentMatches(limit: Int): [Match!]!

    # Agents
    agents(
      limit: Int
      offset: Int
      sortBy: AgentSortField
    ): [Agent!]!

    agent(address: String!): Agent

    # Leaderboard
    leaderboard(
      gameType: GameType
      limit: Int
      offset: Int
    ): LeaderboardPage!

    # Evolution
    evolutionHistory(tournamentId: Int!): [EvolutionRecord!]!

    # Statistics
    arenaStats: ArenaStats!
  }

  type ArenaStats {
    totalTournaments: Int!
    activeTournaments: Int!
    totalMatches: Int!
    liveMatches: Int!
    totalAgents: Int!
    totalPrizeDistributed: String!
  }

  # Subscriptions
  type Subscription {
    matchStateChanged(matchId: Int!): MatchState!
    tournamentUpdated(tournamentId: Int!): TournamentUpdate!
    globalActivity: ActivityEvent!
  }

  # ===== Phase 2: Seasonal Rankings =====
  enum RankTier {
    IRON
    BRONZE
    SILVER
    GOLD
    PLATINUM
    DIAMOND
  }

  type Season {
    id: Int!
    startTime: Int!
    endTime: Int!
    active: Boolean!
    rewardsDistributed: Boolean!
    totalPrizePool: String!
    participantCount: Int!
  }

  type SeasonalProfile {
    seasonId: Int!
    address: String!
    seasonalElo: Int!
    peakElo: Int!
    matchesPlayed: Int!
    wins: Int!
    losses: Int!
    tier: RankTier!
    placementComplete: Boolean!
    placementMatches: Int!
  }

  type SeasonalLeaderboardEntry {
    rank: Int!
    address: String!
    handle: String
    seasonalElo: Int!
    tier: RankTier!
    wins: Int!
    losses: Int!
  }

  # ===== Phase 2: Spectator Betting =====
  enum BetStatus {
    ACTIVE
    WON
    LOST
    REFUNDED
  }

  type Bet {
    id: Int!
    matchId: Int!
    bettor: String!
    predictedWinner: String!
    amount: String!
    odds: String!
    status: BetStatus!
    payout: String
  }

  type MatchPool {
    matchId: Int!
    player1: String!
    player2: String!
    totalPlayer1Bets: String!
    totalPlayer2Bets: String!
    bettingOpen: Boolean!
    settled: Boolean!
  }

  type BettorProfile {
    address: String!
    totalBets: Int!
    wins: Int!
    losses: Int!
    totalWagered: String!
    totalWon: String!
    currentStreak: Int!
    winRate: Float!
  }

  # ===== Phase 2: Match Replay =====
  type ReplayMetadata {
    matchId: Int!
    roundCount: Int!
    available: Boolean!
    roundHashes: [String!]!
  }

  type ReplayRound {
    roundNumber: Int!
    player1Action: String
    player2Action: String
    player1Score: Float!
    player2Score: Float!
    timestamp: Int!
    stateHash: String!
  }

  type MatchReplay {
    matchId: Int!
    gameType: GameType!
    player1: String!
    player2: String!
    winner: String
    rounds: [ReplayRound!]!
    totalDuration: Int!
    metadata: ReplayMetadata
    rawStats: String
  }

  # ===== Head-to-Head Analytics =====
  type HeadToHeadRecord {
    agent1: String!
    agent2: String!
    agent1Wins: Int!
    agent2Wins: Int!
    draws: Int!
    totalMatches: Int!
    matches: [HeadToHeadMatch!]!
  }

  type HeadToHeadMatch {
    matchId: Int!
    tournamentId: Int!
    gameType: GameType!
    winner: String
    isDraw: Boolean!
    duration: Int!
    timestamp: Int!
  }

  # Extend Query with Phase 2 queries
  extend type Query {
    # Head-to-Head
    headToHead(agent1: String!, agent2: String!): HeadToHeadRecord

    # Seasonal Rankings
    currentSeason: Season
    season(id: Int!): Season
    seasonalProfile(seasonId: Int!, address: String!): SeasonalProfile
    mySeasonalProfile(seasonId: Int!): SeasonalProfile
    seasonalLeaderboard(seasonId: Int!, limit: Int, offset: Int): [SeasonalLeaderboardEntry!]!

    # Spectator Betting
    matchPool(matchId: Int!): MatchPool
    bettableMatches: [Match!]!
    userBets(address: String!, status: BetStatus, limit: Int): [Bet!]!
    bettorProfile(address: String!): BettorProfile
    topBettors(limit: Int): [BettorProfile!]!

    # Match Replay
    replayMetadata(matchId: Int!): ReplayMetadata
    matchReplay(matchId: Int!): MatchReplay
  }

  # ===== Analytics Dashboard =====
  type DurationByGameType {
    gameType: GameType!
    averageDuration: Float!
    matchCount: Int!
  }

  type AgentGameTypeStats {
    gameType: GameType!
    wins: Int!
    losses: Int!
    draws: Int!
    averageDuration: Float!
    winRate: Float!
  }

  type GameTypeLeaderboardEntry {
    address: String!
    wins: Int!
    losses: Int!
    draws: Int!
    total: Int!
    winRate: Float!
    avgDuration: Float!
  }

  type StrategyPattern {
    totalGames: Int!
    cooperateRate: Float!
    defectRate: Float!
    avgPayoff: Float!
  }

  type MatchDurationEntry {
    matchId: Int!
    gameType: GameType!
    duration: Int!
    timestamp: Int!
  }

  extend type Query {
    # Analytics
    durationByGameType: [DurationByGameType!]!
    agentGameTypeStats(address: String!): [AgentGameTypeStats!]!
    agentStrategyPattern(address: String!): StrategyPattern
    matchDurations(limit: Int): [MatchDurationEntry!]!
    gameTypeLeaderboard(gameType: GameType!, limit: Int): [GameTypeLeaderboardEntry!]!

    # Agent bios
    agentBio(address: String!): String
  }

  # ===== Match Commentary =====
  enum CommentaryContext {
    PRE_MATCH
    POST_MATCH
  }

  type Commentary {
    text: String!
    context: String!
    matchId: Int!
    generatedAt: Int!
    fromCache: Boolean!
  }

  extend type Query {
    matchCommentary(matchId: Int!, context: CommentaryContext!): Commentary
  }

  # ===== ARENA Token =====
  type TokenMetrics {
    address: String!
    name: String!
    symbol: String!
    price: String!
    marketCap: String!
    volume24h: String!
    holders: Int!
    bondingCurveProgress: Float!
    graduated: Boolean!
    locked: Boolean!
  }

  type TokenTradeResult {
    txHash: String!
    success: Boolean!
  }

  extend type Query {
    arenaToken: TokenMetrics
  }

  # ===== A2A Agent Discovery =====
  type DiscoveredAgent {
    address: String!
    discoveredAt: Int!
    fromTournament: Int!
    matchesPlayed: Int!
    elo: Int!
  }

  extend type Query {
    discoveredAgents: [DiscoveredAgent!]!
    discoveredAgentCount: Int!
  }

  # ===== A2A Coordination =====
  enum A2AMessageType {
    CHALLENGE
    CHALLENGE_ACCEPT
    CHALLENGE_DECLINE
    ALLIANCE_PROPOSE
    ALLIANCE_ACCEPT
    TAUNT
    TOURNAMENT_INVITE
  }

  type A2AMessage {
    id: Int!
    fromAgent: String!
    toAgent: String!
    messageType: A2AMessageType!
    payload: String!
    timestamp: Int!
  }

  type A2AChallenge {
    id: Int!
    challenger: String!
    challenged: String!
    gameType: GameType!
    stake: String!
    status: String!
    createdAt: Int!
    expiresAt: Int!
    resultTournamentId: Int
  }

  type AgentRelationship {
    agent1: String!
    agent2: String!
    matchCount: Int!
    agent1Wins: Int!
    agent2Wins: Int!
    isRival: Boolean!
    isAlly: Boolean!
    lastInteraction: Int!
  }

  type A2ANetworkStats {
    totalAgents: Int!
    totalMessages: Int!
    activeChallenges: Int!
    activeAlliances: Int!
  }

  extend type Query {
    a2aMessages(agent: String, limit: Int): [A2AMessage!]!
    a2aChallenges(status: String): [A2AChallenge!]!
    agentRelationships(agent: String!): [AgentRelationship!]!
    allRelationships: [AgentRelationship!]!
    a2aNetworkStats: A2ANetworkStats!
  }

  # ===== Admin Mutations =====
  input CreateTournamentInput {
    name: String!
    gameType: GameType!
    format: TournamentFormat!
    entryStake: String!
    maxParticipants: Int!
    roundCount: Int!
  }

  type AdminMutation {
    pauseTournament(id: Int!): Tournament
    resumeTournament(id: Int!): Tournament
    updateAgentAvatar(address: String!, avatarUrl: String!): Boolean
    createTournament(input: CreateTournamentInput!): Tournament
    buyArenaToken(amountMON: String!): TokenTradeResult
    sellArenaToken(amountTokens: String!): TokenTradeResult
    sendA2AChallenge(targetAgent: String!, gameType: GameType!, stake: String!): A2AChallenge
    respondToChallenge(challengeId: Int!, accept: Boolean!): A2AChallenge
  }

  schema {
    query: Query
    mutation: AdminMutation
  }

  # Extend Subscription with Phase 2 subscriptions
  extend type Subscription {
    betPlaced(matchId: Int!): Bet!
    oddsUpdated(matchId: Int!): MatchPool!
    seasonUpdated: Season!
  }
`;

// Helper to convert enum values
export function gameTypeToEnum(value: number): string {
  const map: Record<number, string> = {
    0: "ORACLE_DUEL",
    1: "STRATEGY_ARENA",
    2: "AUCTION_WARS",
    3: "QUIZ_BOWL",
  };
  return map[value] ?? "ORACLE_DUEL";
}

export function enumToGameType(value: string): number {
  const map: Record<string, number> = {
    ORACLE_DUEL: 0,
    STRATEGY_ARENA: 1,
    AUCTION_WARS: 2,
    QUIZ_BOWL: 3,
  };
  return map[value] ?? 0;
}

export function enumToTournamentFormat(value: string): number {
  const map: Record<string, number> = {
    SWISS_SYSTEM: 0,
    SINGLE_ELIMINATION: 1,
    DOUBLE_ELIMINATION: 2,
    ROUND_ROBIN: 3,
    BEST_OF_N: 4,
    ROYAL_RUMBLE: 5,
    PENTATHLON: 6,
  };
  return map[value] ?? 0;
}

export function tournamentFormatToEnum(value: number): string {
  const map: Record<number, string> = {
    0: "SWISS_SYSTEM",
    1: "SINGLE_ELIMINATION",
    2: "DOUBLE_ELIMINATION",
    3: "ROUND_ROBIN",
    4: "BEST_OF_N",
    5: "ROYAL_RUMBLE",
    6: "PENTATHLON",
  };
  return map[value] ?? "SWISS_SYSTEM";
}

export function tournamentStatusToEnum(value: number): string {
  const map: Record<number, string> = {
    0: "OPEN",
    1: "ACTIVE",
    2: "COMPLETED",
    3: "CANCELLED",
    4: "PAUSED",
  };
  return map[value] ?? "OPEN";
}

export function matchStatusToEnum(value: number): string {
  const map: Record<number, string> = {
    0: "SCHEDULED",
    1: "IN_PROGRESS",
    2: "COMPLETED",
    3: "DISPUTED",
  };
  return map[value] ?? "SCHEDULED";
}

// Phase 2 enum helpers
export function rankTierToEnum(value: number): string {
  const map: Record<number, string> = {
    0: "IRON",
    1: "BRONZE",
    2: "SILVER",
    3: "GOLD",
    4: "PLATINUM",
    5: "DIAMOND",
  };
  return map[value] ?? "IRON";
}

export function betStatusToEnum(value: number): string {
  const map: Record<number, string> = {
    0: "ACTIVE",
    1: "WON",
    2: "LOST",
    3: "REFUNDED",
  };
  return map[value] ?? "ACTIVE";
}
