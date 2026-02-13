// Hook for live match subscriptions

import { useEffect, useState } from "react";
import { getWebSocketClient, type MatchStateChangedEvent, type MatchCompletedEvent } from "@/lib/websocket";
import { useRealtimeStore } from "@/stores/realtimeStore";

interface UseMatchLiveOptions {
  onStateChange?: (state: MatchStateChangedEvent) => void;
  onCompleted?: (result: MatchCompletedEvent) => void;
}

interface UseMatchLiveReturn {
  isSubscribed: boolean;
  latestState: MatchStateChangedEvent | null;
  isCompleted: boolean;
  result: MatchCompletedEvent | null;
}

export function useMatchLive(matchId: number | null, options: UseMatchLiveOptions = {}): UseMatchLiveReturn {
  const { onStateChange, onCompleted } = options;
  const subscribedMatches = useRealtimeStore((s) => s.subscribedMatches);

  const [latestState, setLatestState] = useState<MatchStateChangedEvent | null>(null);
  const [result, setResult] = useState<MatchCompletedEvent | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);

  const isSubscribed = matchId !== null && subscribedMatches.has(matchId);

  useEffect(() => {
    if (matchId === null) return;

    // Use getState() to avoid re-render loops from action references
    const { subscribeMatch, unsubscribeMatch } = useRealtimeStore.getState();

    // Subscribe to match room
    subscribeMatch(matchId);

    const client = getWebSocketClient();

    // Listen for state changes
    const unsubState = client.subscribe<MatchStateChangedEvent>("match:stateChanged", (data) => {
      if (data.matchId === matchId) {
        setLatestState(data);
        onStateChange?.(data);
      }
    });

    // Listen for completion
    const unsubComplete = client.subscribe<MatchCompletedEvent>("match:completed", (data) => {
      if (data.matchId === matchId) {
        setResult(data);
        setIsCompleted(true);
        onCompleted?.(data);
      }
    });

    // Cleanup
    return () => {
      unsubscribeMatch(matchId);
      unsubState();
      unsubComplete();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  return {
    isSubscribed,
    latestState,
    isCompleted,
    result,
  };
}

// Hook for multiple matches (e.g., tournament view)
export function useMatchesLive(matchIds: number[]): Map<number, MatchStateChangedEvent | null> {
  const [states, setStates] = useState<Map<number, MatchStateChangedEvent | null>>(new Map());

  useEffect(() => {
    if (matchIds.length === 0) return;

    const { subscribeMatch, unsubscribeMatch } = useRealtimeStore.getState();

    // Subscribe to all matches
    for (const matchId of matchIds) {
      subscribeMatch(matchId);
    }

    const client = getWebSocketClient();
    const matchIdSet = new Set(matchIds);

    // Listen for state changes
    const unsub = client.subscribe<MatchStateChangedEvent>("match:stateChanged", (data) => {
      if (matchIdSet.has(data.matchId)) {
        setStates((prev) => new Map(prev).set(data.matchId, data));
      }
    });

    // Cleanup
    return () => {
      for (const matchId of matchIds) {
        unsubscribeMatch(matchId);
      }
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchIds.join(",")]);

  return states;
}
