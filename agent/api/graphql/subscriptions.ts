// GraphQL Subscriptions

import { PubSub } from "graphql-subscriptions";
import type { EventBroadcaster, BroadcastEventName } from "../../events";

// PubSub instance for GraphQL subscriptions
export const pubsub = new PubSub();

// Subscription topics
export const TOPICS = {
  MATCH_STATE_CHANGED: "MATCH_STATE_CHANGED",
  TOURNAMENT_UPDATED: "TOURNAMENT_UPDATED",
  GLOBAL_ACTIVITY: "GLOBAL_ACTIVITY",
} as const;

/**
 * Bridge EventBroadcaster events to GraphQL subscriptions.
 */
export function bridgeBroadcasterToSubscriptions(broadcaster: EventBroadcaster): void {
  // Match events
  broadcaster.on("match:stateChanged", (payload) => {
    pubsub.publish(`${TOPICS.MATCH_STATE_CHANGED}_${payload.matchId}`, {
      matchStateChanged: {
        matchId: payload.matchId,
        gameType: payload.state.gameType,
        status: payload.state.status,
        data: JSON.stringify(payload.state.data),
        timestamp: payload.timestamp,
      },
    });

    // Also publish to global activity
    pubsub.publish(TOPICS.GLOBAL_ACTIVITY, {
      globalActivity: {
        type: "match:stateChanged",
        data: JSON.stringify(payload),
        timestamp: payload.timestamp,
      },
    });
  });

  broadcaster.on("match:completed", (payload) => {
    pubsub.publish(`${TOPICS.MATCH_STATE_CHANGED}_${payload.matchId}`, {
      matchStateChanged: {
        matchId: payload.matchId,
        gameType: 0,
        status: "completed",
        data: JSON.stringify(payload.result),
        timestamp: payload.timestamp,
      },
    });

    // Tournament update
    pubsub.publish(`${TOPICS.TOURNAMENT_UPDATED}_${payload.tournamentId}`, {
      tournamentUpdated: {
        tournamentId: payload.tournamentId,
        type: "match:completed",
        data: JSON.stringify(payload),
        timestamp: payload.timestamp,
      },
    });

    // Global activity
    pubsub.publish(TOPICS.GLOBAL_ACTIVITY, {
      globalActivity: {
        type: "match:completed",
        data: JSON.stringify(payload),
        timestamp: payload.timestamp,
      },
    });
  });

  broadcaster.on("match:created", (payload) => {
    pubsub.publish(`${TOPICS.TOURNAMENT_UPDATED}_${payload.tournamentId}`, {
      tournamentUpdated: {
        tournamentId: payload.tournamentId,
        type: "match:created",
        data: JSON.stringify(payload),
        timestamp: payload.timestamp,
      },
    });

    pubsub.publish(TOPICS.GLOBAL_ACTIVITY, {
      globalActivity: {
        type: "match:created",
        data: JSON.stringify(payload),
        timestamp: payload.timestamp,
      },
    });
  });

  // Tournament events
  broadcaster.on("tournament:participantJoined", (payload) => {
    pubsub.publish(`${TOPICS.TOURNAMENT_UPDATED}_${payload.tournamentId}`, {
      tournamentUpdated: {
        tournamentId: payload.tournamentId,
        type: "participantJoined",
        data: JSON.stringify(payload),
        timestamp: payload.timestamp,
      },
    });

    pubsub.publish(TOPICS.GLOBAL_ACTIVITY, {
      globalActivity: {
        type: "tournament:participantJoined",
        data: JSON.stringify(payload),
        timestamp: payload.timestamp,
      },
    });
  });

  broadcaster.on("tournament:roundAdvanced", (payload) => {
    pubsub.publish(`${TOPICS.TOURNAMENT_UPDATED}_${payload.tournamentId}`, {
      tournamentUpdated: {
        tournamentId: payload.tournamentId,
        type: "roundAdvanced",
        data: JSON.stringify(payload),
        timestamp: payload.timestamp,
      },
    });

    pubsub.publish(TOPICS.GLOBAL_ACTIVITY, {
      globalActivity: {
        type: "tournament:roundAdvanced",
        data: JSON.stringify(payload),
        timestamp: payload.timestamp,
      },
    });
  });

  broadcaster.on("tournament:started", (payload) => {
    pubsub.publish(`${TOPICS.TOURNAMENT_UPDATED}_${payload.tournamentId}`, {
      tournamentUpdated: {
        tournamentId: payload.tournamentId,
        type: "started",
        data: JSON.stringify(payload),
        timestamp: payload.timestamp,
      },
    });

    pubsub.publish(TOPICS.GLOBAL_ACTIVITY, {
      globalActivity: {
        type: "tournament:started",
        data: JSON.stringify(payload),
        timestamp: payload.timestamp,
      },
    });
  });

  broadcaster.on("tournament:completed", (payload) => {
    pubsub.publish(`${TOPICS.TOURNAMENT_UPDATED}_${payload.tournamentId}`, {
      tournamentUpdated: {
        tournamentId: payload.tournamentId,
        type: "completed",
        data: JSON.stringify(payload),
        timestamp: payload.timestamp,
      },
    });

    pubsub.publish(TOPICS.GLOBAL_ACTIVITY, {
      globalActivity: {
        type: "tournament:completed",
        data: JSON.stringify(payload),
        timestamp: payload.timestamp,
      },
    });
  });

  // Agent events
  broadcaster.on("agent:eloUpdated", (payload) => {
    pubsub.publish(TOPICS.GLOBAL_ACTIVITY, {
      globalActivity: {
        type: "agent:eloUpdated",
        data: JSON.stringify(payload),
        timestamp: payload.timestamp,
      },
    });
  });

  // Evolution events
  broadcaster.on("evolution:parametersChanged", (payload) => {
    pubsub.publish(`${TOPICS.TOURNAMENT_UPDATED}_${payload.tournamentId}`, {
      tournamentUpdated: {
        tournamentId: payload.tournamentId,
        type: "evolution",
        data: JSON.stringify(payload),
        timestamp: payload.timestamp,
      },
    });

    pubsub.publish(TOPICS.GLOBAL_ACTIVITY, {
      globalActivity: {
        type: "evolution:parametersChanged",
        data: JSON.stringify(payload),
        timestamp: payload.timestamp,
      },
    });
  });

  // A2A events
  broadcaster.on("a2a:challenge", (payload) => {
    pubsub.publish(TOPICS.GLOBAL_ACTIVITY, {
      globalActivity: {
        type: "a2a:challenge",
        data: JSON.stringify(payload),
        timestamp: payload.timestamp ? payload.timestamp * 1000 : Date.now(),
      },
    });
  });

  broadcaster.on("a2a:message", (payload) => {
    pubsub.publish(TOPICS.GLOBAL_ACTIVITY, {
      globalActivity: {
        type: "a2a:message",
        data: JSON.stringify(payload),
        timestamp: payload.timestamp ? payload.timestamp * 1000 : Date.now(),
      },
    });
  });

  console.log("[GraphQL] Subscriptions bridged to EventBroadcaster");
}

// Subscription resolvers
export const subscriptionResolvers = {
  Subscription: {
    matchStateChanged: {
      subscribe: (_: unknown, args: { matchId: number }) => {
        return pubsub.asyncIterator(`${TOPICS.MATCH_STATE_CHANGED}_${args.matchId}`);
      },
    },
    tournamentUpdated: {
      subscribe: (_: unknown, args: { tournamentId: number }) => {
        return pubsub.asyncIterator(`${TOPICS.TOURNAMENT_UPDATED}_${args.tournamentId}`);
      },
    },
    globalActivity: {
      subscribe: () => {
        return pubsub.asyncIterator(TOPICS.GLOBAL_ACTIVITY);
      },
    },
  },
};
