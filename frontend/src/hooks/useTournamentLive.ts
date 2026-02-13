// Hook for live tournament subscriptions

import { useEffect, useState, useCallback } from "react";
import {
  getWebSocketClient,
  type TournamentParticipantJoinedEvent,
  type TournamentRoundAdvancedEvent,
  type TournamentStartedEvent,
  type TournamentCompletedEvent,
  type MatchCreatedEvent,
  type MatchCompletedEvent,
} from "@/lib/websocket";
import { useRealtimeStore } from "@/stores/realtimeStore";

interface UseTournamentLiveOptions {
  onParticipantJoined?: (event: TournamentParticipantJoinedEvent) => void;
  onRoundAdvanced?: (event: TournamentRoundAdvancedEvent) => void;
  onStarted?: (event: TournamentStartedEvent) => void;
  onCompleted?: (event: TournamentCompletedEvent) => void;
  onMatchCreated?: (event: MatchCreatedEvent) => void;
  onMatchCompleted?: (event: MatchCompletedEvent) => void;
}

interface UseTournamentLiveReturn {
  isSubscribed: boolean;
  participantCount: number | null;
  currentRound: number | null;
  isStarted: boolean;
  isCompleted: boolean;
  winner: string | null;
  recentMatches: MatchCreatedEvent[];
}

export function useTournamentLive(
  tournamentId: number | null,
  options: UseTournamentLiveOptions = {}
): UseTournamentLiveReturn {
  const {
    onParticipantJoined,
    onRoundAdvanced,
    onStarted,
    onCompleted,
    onMatchCreated,
    onMatchCompleted,
  } = options;

  const { subscribeTournament, unsubscribeTournament, subscribedTournaments } = useRealtimeStore();

  const [participantCount, setParticipantCount] = useState<number | null>(null);
  const [currentRound, setCurrentRound] = useState<number | null>(null);
  const [isStarted, setIsStarted] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [recentMatches, setRecentMatches] = useState<MatchCreatedEvent[]>([]);

  const isSubscribed = tournamentId !== null && subscribedTournaments.has(tournamentId);

  useEffect(() => {
    if (tournamentId === null) return;

    // Subscribe to tournament room
    subscribeTournament(tournamentId);

    const client = getWebSocketClient();

    // Listen for participant joins
    const unsubParticipant = client.subscribe<TournamentParticipantJoinedEvent>(
      "tournament:participantJoined",
      (data) => {
        if (data.tournamentId === tournamentId) {
          setParticipantCount(data.currentParticipants);
          onParticipantJoined?.(data);
        }
      }
    );

    // Listen for round advances
    const unsubRound = client.subscribe<TournamentRoundAdvancedEvent>(
      "tournament:roundAdvanced",
      (data) => {
        if (data.tournamentId === tournamentId) {
          setCurrentRound(data.currentRound);
          onRoundAdvanced?.(data);
        }
      }
    );

    // Listen for tournament start
    const unsubStarted = client.subscribe<TournamentStartedEvent>(
      "tournament:started",
      (data) => {
        if (data.tournamentId === tournamentId) {
          setIsStarted(true);
          setCurrentRound(1);
          onStarted?.(data);
        }
      }
    );

    // Listen for tournament completion
    const unsubCompleted = client.subscribe<TournamentCompletedEvent>(
      "tournament:completed",
      (data) => {
        if (data.tournamentId === tournamentId) {
          setIsCompleted(true);
          setWinner(data.winner);
          onCompleted?.(data);
        }
      }
    );

    // Listen for match creation
    const unsubMatchCreated = client.subscribe<MatchCreatedEvent>(
      "match:created",
      (data) => {
        if (data.tournamentId === tournamentId) {
          setRecentMatches((prev) => [data, ...prev].slice(0, 10));
          onMatchCreated?.(data);
        }
      }
    );

    // Listen for match completion
    const unsubMatchCompleted = client.subscribe<MatchCompletedEvent>(
      "match:completed",
      (data) => {
        if (data.tournamentId === tournamentId) {
          onMatchCompleted?.(data);
        }
      }
    );

    // Cleanup
    return () => {
      unsubscribeTournament(tournamentId);
      unsubParticipant();
      unsubRound();
      unsubStarted();
      unsubCompleted();
      unsubMatchCreated();
      unsubMatchCompleted();
    };
  }, [
    tournamentId,
    subscribeTournament,
    unsubscribeTournament,
    onParticipantJoined,
    onRoundAdvanced,
    onStarted,
    onCompleted,
    onMatchCreated,
    onMatchCompleted,
  ]);

  return {
    isSubscribed,
    participantCount,
    currentRound,
    isStarted,
    isCompleted,
    winner,
    recentMatches,
  };
}

// Hook for connection status
export function useConnectionStatus() {
  const connectionStatus = useRealtimeStore((state) => state.connectionStatus);
  const lastEventTimestamp = useRealtimeStore((state) => state.lastEventTimestamp);

  const [latency, setLatency] = useState<number | null>(null);

  const ping = useCallback(async () => {
    try {
      const client = getWebSocketClient();
      const ms = await client.ping();
      setLatency(ms);
      return ms;
    } catch {
      setLatency(null);
      return null;
    }
  }, []);

  return {
    status: connectionStatus,
    isConnected: connectionStatus === "connected",
    lastEventTimestamp,
    latency,
    ping,
  };
}

// Hook for recent activity feed
export function useActivityFeed() {
  const recentEvents = useRealtimeStore((state) => state.recentEvents);
  const clearEvents = useRealtimeStore((state) => state.clearEvents);

  return {
    events: recentEvents,
    clearEvents,
  };
}
