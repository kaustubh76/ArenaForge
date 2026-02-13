// Real-time state management for WebSocket connection

import { create } from "zustand";
import {
  getWebSocketClient,
  type ConnectionStatus,
  type MatchCompletedEvent,
  type MatchCreatedEvent,
  type TournamentParticipantJoinedEvent,
  type TournamentRoundAdvancedEvent,
  type TournamentStartedEvent,
  type TournamentCompletedEvent,
  type AgentEloUpdatedEvent,
} from "@/lib/websocket";

interface RealtimeState {
  // Connection status
  connectionStatus: ConnectionStatus;
  lastEventTimestamp: number | null;
  reconnectAttempts: number;

  // Subscribed rooms
  subscribedTournaments: Set<number>;
  subscribedMatches: Set<number>;
  subscribedAgents: Set<string>;

  // Recent events (for activity feed)
  recentEvents: RealtimeEvent[];
  maxRecentEvents: number;

  // Actions
  setConnectionStatus: (status: ConnectionStatus) => void;
  subscribeTournament: (tournamentId: number) => void;
  unsubscribeTournament: (tournamentId: number) => void;
  subscribeMatch: (matchId: number) => void;
  unsubscribeMatch: (matchId: number) => void;
  subscribeAgent: (agentAddress: string) => void;
  unsubscribeAgent: (agentAddress: string) => void;
  addEvent: (event: RealtimeEvent) => void;
  clearEvents: () => void;
}

export type RealtimeEventType =
  | "match:completed"
  | "match:created"
  | "tournament:participantJoined"
  | "tournament:roundAdvanced"
  | "tournament:started"
  | "tournament:completed"
  | "tournament:paused"
  | "tournament:resumed"
  | "agent:eloUpdated"
  | "a2a:challenge"
  | "a2a:message";

export interface RealtimeEvent {
  id: string;
  type: RealtimeEventType;
  data: unknown;
  timestamp: number;
}

export const useRealtimeStore = create<RealtimeState>((set) => ({
  connectionStatus: "disconnected",
  lastEventTimestamp: null,
  reconnectAttempts: 0,
  subscribedTournaments: new Set(),
  subscribedMatches: new Set(),
  subscribedAgents: new Set(),
  recentEvents: [],
  maxRecentEvents: 50,

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  subscribeTournament: (tournamentId) => {
    const client = getWebSocketClient();
    client.joinTournament(tournamentId);
    set((state) => ({
      subscribedTournaments: new Set([...state.subscribedTournaments, tournamentId]),
    }));
  },

  unsubscribeTournament: (tournamentId) => {
    const client = getWebSocketClient();
    client.leaveTournament(tournamentId);
    set((state) => {
      const updated = new Set(state.subscribedTournaments);
      updated.delete(tournamentId);
      return { subscribedTournaments: updated };
    });
  },

  subscribeMatch: (matchId) => {
    const client = getWebSocketClient();
    client.joinMatch(matchId);
    set((state) => ({
      subscribedMatches: new Set([...state.subscribedMatches, matchId]),
    }));
  },

  unsubscribeMatch: (matchId) => {
    const client = getWebSocketClient();
    client.leaveMatch(matchId);
    set((state) => {
      const updated = new Set(state.subscribedMatches);
      updated.delete(matchId);
      return { subscribedMatches: updated };
    });
  },

  subscribeAgent: (agentAddress) => {
    const client = getWebSocketClient();
    client.joinAgent(agentAddress);
    set((state) => ({
      subscribedAgents: new Set([...state.subscribedAgents, agentAddress.toLowerCase()]),
    }));
  },

  unsubscribeAgent: (agentAddress) => {
    const client = getWebSocketClient();
    client.leaveAgent(agentAddress);
    set((state) => {
      const updated = new Set(state.subscribedAgents);
      updated.delete(agentAddress.toLowerCase());
      return { subscribedAgents: updated };
    });
  },

  addEvent: (event) => {
    set((state) => {
      const events = [event, ...state.recentEvents].slice(0, state.maxRecentEvents);
      return {
        recentEvents: events,
        lastEventTimestamp: event.timestamp,
      };
    });
  },

  clearEvents: () => set({ recentEvents: [] }),
}));

// Initialize WebSocket event listeners
let initialized = false;

export function initializeRealtimeListeners(): void {
  if (initialized) return;
  initialized = true;

  const client = getWebSocketClient();
  const store = useRealtimeStore.getState();

  // Connection status listener
  client.onStatusChange((status) => {
    useRealtimeStore.setState({ connectionStatus: status });
  });

  // Event listeners
  client.subscribe<MatchCompletedEvent>("match:completed", (data) => {
    store.addEvent({
      id: `match-completed-${data.matchId}-${data.timestamp}`,
      type: "match:completed",
      data,
      timestamp: data.timestamp,
    });
  });

  client.subscribe<MatchCreatedEvent>("match:created", (data) => {
    store.addEvent({
      id: `match-created-${data.matchId}-${data.timestamp}`,
      type: "match:created",
      data,
      timestamp: data.timestamp,
    });
  });

  client.subscribe<TournamentParticipantJoinedEvent>("tournament:participantJoined", (data) => {
    store.addEvent({
      id: `participant-joined-${data.tournamentId}-${data.agent}-${data.timestamp}`,
      type: "tournament:participantJoined",
      data,
      timestamp: data.timestamp,
    });
  });

  client.subscribe<TournamentRoundAdvancedEvent>("tournament:roundAdvanced", (data) => {
    store.addEvent({
      id: `round-advanced-${data.tournamentId}-${data.currentRound}-${data.timestamp}`,
      type: "tournament:roundAdvanced",
      data,
      timestamp: data.timestamp,
    });
  });

  client.subscribe<TournamentStartedEvent>("tournament:started", (data) => {
    store.addEvent({
      id: `tournament-started-${data.tournamentId}-${data.timestamp}`,
      type: "tournament:started",
      data,
      timestamp: data.timestamp,
    });
  });

  client.subscribe<TournamentCompletedEvent>("tournament:completed", (data) => {
    store.addEvent({
      id: `tournament-completed-${data.tournamentId}-${data.timestamp}`,
      type: "tournament:completed",
      data,
      timestamp: data.timestamp,
    });
  });

  client.subscribe<AgentEloUpdatedEvent>("agent:eloUpdated", (data) => {
    store.addEvent({
      id: `elo-updated-${data.agent}-${data.matchId}-${data.timestamp}`,
      type: "agent:eloUpdated",
      data,
      timestamp: data.timestamp,
    });
  });

  // A2A events (broadcast to global room)
  client.subscribe<{ challengeId: number; challenger: string; challenged: string; status: string; timestamp: number }>(
    "a2a:challenge",
    (data) => {
      store.addEvent({
        id: `a2a-challenge-${data.challengeId}-${data.timestamp}`,
        type: "a2a:challenge",
        data,
        timestamp: data.timestamp * 1000,
      });
    }
  );

  client.subscribe<{ id: number; fromAgent: string; toAgent: string; messageType: string; timestamp: number }>(
    "a2a:message",
    (data) => {
      store.addEvent({
        id: `a2a-message-${data.id}-${data.timestamp}`,
        type: "a2a:message",
        data,
        timestamp: data.timestamp * 1000,
      });
    }
  );
}
