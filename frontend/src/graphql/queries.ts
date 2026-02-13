// GraphQL Query definitions

import { gql } from "@apollo/client";

// Tournament fragments
export const TOURNAMENT_FIELDS = gql`
  fragment TournamentFields on Tournament {
    id
    name
    gameType
    format
    status
    entryStake
    maxParticipants
    currentParticipants
    prizePool
    startTime
    roundCount
    currentRound
    parametersHash
  }
`;

export const STANDING_FIELDS = gql`
  fragment StandingFields on Standing {
    address
    handle
    elo
    tournamentPoints
    eliminated
    rank
  }
`;

export const MATCH_FIELDS = gql`
  fragment MatchFields on Match {
    id
    tournamentId
    round
    player1
    player2
    winner
    resultHash
    timestamp
    status
    gameType
    stats {
      duration
      isUpset
      isDraw
      player1Score
      player2Score
    }
  }
`;

export const AGENT_FIELDS = gql`
  fragment AgentFields on Agent {
    address
    moltbookHandle
    elo
    peakElo
    matchesPlayed
    wins
    losses
    winRate
    registered
  }
`;

// Queries
export const GET_TOURNAMENTS = gql`
  ${TOURNAMENT_FIELDS}
  query GetTournaments(
    $status: TournamentStatus
    $gameType: GameType
    $format: TournamentFormat
    $limit: Int
    $offset: Int
  ) {
    tournaments(
      status: $status
      gameType: $gameType
      format: $format
      limit: $limit
      offset: $offset
    ) {
      ...TournamentFields
    }
  }
`;

export const GET_TOURNAMENT = gql`
  ${TOURNAMENT_FIELDS}
  ${STANDING_FIELDS}
  ${MATCH_FIELDS}
  query GetTournament($id: Int!) {
    tournament(id: $id) {
      ...TournamentFields
      standings {
        ...StandingFields
      }
      matches {
        ...MatchFields
      }
    }
  }
`;

export const GET_TOURNAMENT_COUNT = gql`
  query GetTournamentCount {
    tournamentCount
  }
`;

export const GET_MATCHES = gql`
  ${MATCH_FIELDS}
  query GetMatches(
    $tournamentId: Int
    $status: MatchStatus
    $limit: Int
    $offset: Int
  ) {
    matches(
      tournamentId: $tournamentId
      status: $status
      limit: $limit
      offset: $offset
    ) {
      ...MatchFields
    }
  }
`;

export const GET_MATCH = gql`
  ${MATCH_FIELDS}
  ${AGENT_FIELDS}
  query GetMatch($id: Int!) {
    match(id: $id) {
      ...MatchFields
      player1Agent {
        ...AgentFields
      }
      player2Agent {
        ...AgentFields
      }
    }
  }
`;

export const GET_LIVE_MATCHES = gql`
  ${MATCH_FIELDS}
  query GetLiveMatches {
    liveMatches {
      ...MatchFields
    }
  }
`;

export const GET_RECENT_MATCHES = gql`
  ${MATCH_FIELDS}
  query GetRecentMatches($limit: Int) {
    recentMatches(limit: $limit) {
      ...MatchFields
    }
  }
`;

export const GET_AGENTS = gql`
  ${AGENT_FIELDS}
  query GetAgents($limit: Int, $offset: Int, $sortBy: AgentSortField) {
    agents(limit: $limit, offset: $offset, sortBy: $sortBy) {
      ...AgentFields
    }
  }
`;

export const GET_AGENT = gql`
  ${AGENT_FIELDS}
  ${MATCH_FIELDS}
  ${TOURNAMENT_FIELDS}
  query GetAgent($address: String!) {
    agent(address: $address) {
      ...AgentFields
      recentMatches(limit: 10) {
        ...MatchFields
      }
      tournaments(limit: 5) {
        ...TournamentFields
      }
    }
  }
`;

export const GET_LEADERBOARD = gql`
  ${AGENT_FIELDS}
  query GetLeaderboard($gameType: GameType, $limit: Int, $offset: Int) {
    leaderboard(gameType: $gameType, limit: $limit, offset: $offset) {
      entries {
        rank
        agent {
          ...AgentFields
        }
      }
      total
      hasMore
    }
  }
`;

export const GET_ARENA_STATS = gql`
  query GetArenaStats {
    arenaStats {
      totalTournaments
      activeTournaments
      totalMatches
      liveMatches
      totalAgents
      totalPrizeDistributed
    }
  }
`;

export const GET_EVOLUTION_HISTORY = gql`
  query GetEvolutionHistory($tournamentId: Int!) {
    evolutionHistory(tournamentId: $tournamentId) {
      tournamentId
      round
      previousParamsHash
      newParamsHash
      mutations {
        type
        factor
        increment
        strategy
        reason
      }
      timestamp
    }
  }
`;
