// API server entry point - WebSocket and GraphQL

import { getWebSocketServer, stopWebSocketServer } from "./websocket";
import { getGraphQLServer, stopGraphQLServer } from "./graphql";
import type { MonadContractClient } from "../monad/contract-client";
import type { MatchStore } from "../persistence/match-store";
import type { ArenaManager } from "../arena-manager";
import type { AutonomousScheduler } from "../autonomous/scheduler";

export interface ApiServerConfig {
  wsPort?: number;
  graphqlPort?: number;
  corsOrigin?: string | string[];
  contractClient?: MonadContractClient;
  matchStore?: MatchStore | null;
  arenaManager?: ArenaManager;
  scheduler?: AutonomousScheduler;
}

const DEFAULT_CONFIG = {
  wsPort: 3001,
  graphqlPort: 4000,
  corsOrigin: ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"],
};

/**
 * Start all API servers (WebSocket and GraphQL).
 */
export async function startApiServers(config: ApiServerConfig = {}): Promise<void> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // Start WebSocket server
  const wsServer = getWebSocketServer({
    port: mergedConfig.wsPort,
    corsOrigin: mergedConfig.corsOrigin,
  });
  await wsServer.start();

  // Start GraphQL server (only if contractClient is provided)
  if (mergedConfig.contractClient) {
    const graphqlServer = getGraphQLServer({
      port: mergedConfig.graphqlPort,
      corsOrigin: mergedConfig.corsOrigin,
      contractClient: mergedConfig.contractClient,
      matchStore: mergedConfig.matchStore ?? null,
      arenaManager: mergedConfig.arenaManager,
      scheduler: mergedConfig.scheduler,
    });
    await graphqlServer.start();
  }

  console.log("[API] All servers started");
}

/**
 * Stop all API servers.
 */
export async function stopApiServers(): Promise<void> {
  await stopWebSocketServer();
  await stopGraphQLServer();

  console.log("[API] All servers stopped");
}

// Re-export submodules
export { getWebSocketServer, stopWebSocketServer } from "./websocket";
export { getGraphQLServer, stopGraphQLServer } from "./graphql";
export { getEventBroadcaster } from "../events";
