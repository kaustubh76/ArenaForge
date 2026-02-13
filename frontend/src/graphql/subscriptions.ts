// GraphQL Subscription definitions

import { gql } from "@apollo/client";

export const MATCH_STATE_SUBSCRIPTION = gql`
  subscription OnMatchStateChanged($matchId: Int!) {
    matchStateChanged(matchId: $matchId) {
      matchId
      gameType
      status
      data
      timestamp
    }
  }
`;

export const TOURNAMENT_UPDATE_SUBSCRIPTION = gql`
  subscription OnTournamentUpdated($tournamentId: Int!) {
    tournamentUpdated(tournamentId: $tournamentId) {
      tournamentId
      type
      data
      timestamp
    }
  }
`;

export const GLOBAL_ACTIVITY_SUBSCRIPTION = gql`
  subscription OnGlobalActivity {
    globalActivity {
      type
      data
      timestamp
    }
  }
`;
