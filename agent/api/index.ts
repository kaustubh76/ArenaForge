// API server entry point - WebSocket and GraphQL

import { getWebSocketServer, stopWebSocketServer } from "./websocket";
import { getGraphQLServer, stopGraphQLServer } from "./graphql";
import type { MonadContractClient } from "../monad/contract-client";
import type { MatchStore } from "../persistence/match-store";
import type { ArenaManager } from "../arena-manager";
import type { AutonomousScheduler } from "../autonomous/scheduler";
import { buildCorsOrigin } from "../utils/cors";

export interface ApiServerConfig {
  wsPort?: number;
  graphqlPort?: number;
  corsOrigin?: (string | RegExp)[] | string | string[];
  contractClient?: MonadContractClient;
  matchStore?: MatchStore | null;
  arenaManager?: ArenaManager;
  scheduler?: AutonomousScheduler;
}

const DEFAULT_CONFIG = {
  wsPort: 3001,
  graphqlPort: 4000,
  corsOrigin: buildCorsOrigin(),
};

/**
 * Start all API servers (WebSocket and GraphQL).
 *
 * When PORT env var is set (e.g. on Render), both GraphQL and Socket.IO
 * share a single HTTP server on that port (single-port mode).
 * Otherwise, they run on separate ports (development mode).
 */
export async function startApiServers(config: ApiServerConfig = {}): Promise<void> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const singlePort = process.env.PORT ? Number(process.env.PORT) : null;

  if (singlePort && mergedConfig.contractClient) {
    // --- Single-port mode (production / Render) ---
    // Start GraphQL server first (it owns the HTTP server)
    const graphqlServer = getGraphQLServer({
      port: singlePort,
      corsOrigin: mergedConfig.corsOrigin,
      contractClient: mergedConfig.contractClient,
      matchStore: mergedConfig.matchStore ?? null,
      arenaManager: mergedConfig.arenaManager,
      scheduler: mergedConfig.scheduler,
    });
    await graphqlServer.start();

    // Attach Socket.IO to the same HTTP server
    const sharedHttpServer = graphqlServer.getHttpServer();
    if (sharedHttpServer) {
      const wsServer = getWebSocketServer({
        corsOrigin: mergedConfig.corsOrigin,
        httpServer: sharedHttpServer,
      });
      await wsServer.start(); // no-op, just logs
    }

    console.log(`[API] All servers started on single port ${singlePort}`);
  } else {
    // --- Dual-port mode (development) ---
    const wsServer = getWebSocketServer({
      port: mergedConfig.wsPort,
      corsOrigin: mergedConfig.corsOrigin,
    });
    await wsServer.start();

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
