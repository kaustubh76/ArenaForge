// Event type definitions for real-time broadcasting

import type {
  MatchResult,
  MatchState,
  AgentStanding,
  Mutation,
  GameType,
  TournamentFormat,
} from "../game-engine/game-mode.interface";
import { normalizeAddress } from "../utils/normalize";

// --- Event Payloads ---

export interface MatchStateChangedEvent {
  matchId: number;
  tournamentId: number;
  state: MatchState;
  timestamp: number;
}

export interface MatchActionSubmittedEvent {
  matchId: number;
  tournamentId: number;
  player: string;
  actionType: string;
  timestamp: number;
}

export interface MatchCompletedEvent {
  matchId: number;
  tournamentId: number;
  winner: string | null;
  result: MatchResult;
  timestamp: number;
}

export interface TournamentParticipantJoinedEvent {
  tournamentId: number;
  agent: string;
  handle: string;
  elo: number;
  currentParticipants: number;
  maxParticipants: number;
  timestamp: number;
}

export interface TournamentRoundAdvancedEvent {
  tournamentId: number;
  previousRound: number;
  currentRound: number;
  totalRounds: number;
  standings: AgentStanding[];
  timestamp: number;
}

export interface TournamentStartedEvent {
  tournamentId: number;
  name: string;
  gameType: GameType;
  format: TournamentFormat;
  participants: AgentStanding[];
  timestamp: number;
}

export interface TournamentCompletedEvent {
  tournamentId: number;
  name: string;
  winner: string;
  winnerHandle: string;
  prizePool: string;
  finalStandings: AgentStanding[];
  timestamp: number;
}

export interface AgentEloUpdatedEvent {
  agent: string;
  handle: string;
  previousElo: number;
  newElo: number;
  change: number;
  matchId: number;
  timestamp: number;
}

export interface EvolutionParametersChangedEvent {
  tournamentId: number;
  round: number;
  mutations: Mutation[];
  previousParamsHash: string;
  newParamsHash: string;
  timestamp: number;
}

export interface MatchCreatedEvent {
  matchId: number;
  tournamentId: number;
  round: number;
  player1: string;
  player2: string;
  player1Handle: string;
  player2Handle: string;
  player1Elo: number;
  player2Elo: number;
  gameType: GameType;
  timestamp: number;
}

export interface TournamentPausedEvent {
  tournamentId: number;
  name: string;
  currentRound: number;
  timestamp: number;
}

export interface TournamentResumedEvent {
  tournamentId: number;
  name: string;
  currentRound: number;
  timestamp: number;
}

// --- A2A Event Payloads ---

export interface A2AChallengeEvent {
  challengeId: number;
  challenger: string;
  challenged: string;
  gameType: GameType;
  stake: string;
  status: string;
  timestamp: number;
}

export interface A2AMessageEvent {
  id: number;
  fromAgent: string;
  toAgent: string;
  messageType: string;
  timestamp: number;
}

// --- Event Type Map ---

export interface BroadcastEvents {
  "match:stateChanged": MatchStateChangedEvent;
  "match:actionSubmitted": MatchActionSubmittedEvent;
  "match:completed": MatchCompletedEvent;
  "match:created": MatchCreatedEvent;
  "tournament:participantJoined": TournamentParticipantJoinedEvent;
  "tournament:roundAdvanced": TournamentRoundAdvancedEvent;
  "tournament:started": TournamentStartedEvent;
  "tournament:completed": TournamentCompletedEvent;
  "tournament:paused": TournamentPausedEvent;
  "tournament:resumed": TournamentResumedEvent;
  "agent:eloUpdated": AgentEloUpdatedEvent;
  "evolution:parametersChanged": EvolutionParametersChangedEvent;
  "a2a:challenge": A2AChallengeEvent;
  "a2a:message": A2AMessageEvent;
}

export type BroadcastEventName = keyof BroadcastEvents;
export type BroadcastEventPayload<T extends BroadcastEventName> = BroadcastEvents[T];

// --- Room Types ---

export type RoomType = "global" | "tournament" | "match" | "agent";

export interface Room {
  type: RoomType;
  id?: number | string;
}

export function getRoomName(room: Room): string {
  switch (room.type) {
    case "global":
      return "global";
    case "tournament":
      return `tournament:${room.id}`;
    case "match":
      return `match:${room.id}`;
    case "agent":
      return `agent:${room.id}`;
  }
}

// --- Event Routing ---

export function getEventRooms<T extends BroadcastEventName>(
  event: T,
  payload: BroadcastEvents[T]
): Room[] {
  const rooms: Room[] = [{ type: "global" }];

  switch (event) {
    case "match:stateChanged":
    case "match:actionSubmitted":
    case "match:completed":
    case "match:created": {
      const matchPayload = payload as MatchStateChangedEvent | MatchActionSubmittedEvent | MatchCompletedEvent | MatchCreatedEvent;
      rooms.push({ type: "match", id: matchPayload.matchId });
      rooms.push({ type: "tournament", id: matchPayload.tournamentId });
      break;
    }
    case "tournament:participantJoined":
    case "tournament:roundAdvanced":
    case "tournament:started":
    case "tournament:completed":
    case "tournament:paused":
    case "tournament:resumed":
    case "evolution:parametersChanged": {
      const tournamentPayload = payload as { tournamentId: number };
      rooms.push({ type: "tournament", id: tournamentPayload.tournamentId });
      break;
    }
    case "agent:eloUpdated": {
      const agentPayload = payload as AgentEloUpdatedEvent;
      rooms.push({ type: "agent", id: normalizeAddress(agentPayload.agent) });
      break;
    }
    case "a2a:challenge":
    case "a2a:message": {
      // A2A events broadcast to global room only
      break;
    }
  }

  return rooms;
}
