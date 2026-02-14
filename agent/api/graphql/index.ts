// GraphQL Server setup

import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { createServer } from "http";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import { makeExecutableSchema } from "@graphql-tools/schema";

import { typeDefs } from "./schema";
import { resolvers, type ResolverContext } from "./resolvers";
import { subscriptionResolvers, bridgeBroadcasterToSubscriptions } from "./subscriptions";
import { createDataLoaders, type DataLoaders } from "./dataloaders";
import type { MonadContractClient } from "../../monad/contract-client";
import type { MatchStore } from "../../persistence/match-store";
import type { ArenaManager } from "../../arena-manager";
import type { AutonomousScheduler } from "../../autonomous/scheduler";
import { getEventBroadcaster } from "../../events";
import { createRateLimiter, type TokenBucketRateLimiter } from "../../utils/rate-limiter";
import { normalizeIP } from "../../utils/normalize";

export interface GraphQLServerConfig {
  port?: number;
  corsOrigin?: string | string[];
  contractClient: MonadContractClient;
  matchStore: MatchStore | null;
  arenaManager?: ArenaManager;
  scheduler?: AutonomousScheduler;
}

const DEFAULT_PORT = 4000;

export class GraphQLServer {
  private httpServer: ReturnType<typeof createServer> | null = null;
  private apolloServer: ApolloServer<ResolverContext> | null = null;
  private wsServer: WebSocketServer | null = null;
  private config: GraphQLServerConfig;
  private graphqlLimiter: TokenBucketRateLimiter;

  constructor(config: GraphQLServerConfig) {
    this.config = config;
    this.graphqlLimiter = createRateLimiter("graphql-api");
  }

  async start(): Promise<void> {
    const port = this.config.port ?? DEFAULT_PORT;
    const corsOrigin = this.config.corsOrigin ?? ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"];

    // Create executable schema
    const schema = makeExecutableSchema({
      typeDefs,
      resolvers: {
        ...resolvers,
        ...subscriptionResolvers,
      },
    });

    // Create Express app and HTTP server
    const app = express();
    this.httpServer = createServer(app);

    // Create WebSocket server for subscriptions
    this.wsServer = new WebSocketServer({
      server: this.httpServer,
      path: "/graphql",
    });

    // Set up WebSocket server with graphql-ws
    const serverCleanup = useServer(
      {
        schema,
        context: (): ResolverContext => ({
          loaders: createDataLoaders(this.config.contractClient, this.config.matchStore),
          contractClient: this.config.contractClient,
          matchStore: this.config.matchStore,
          arenaManager: this.config.arenaManager,
          tokenManager: this.config.arenaManager?.getTokenManager() ?? undefined,
          scheduler: this.config.scheduler,
          a2aCoordinator: this.config.scheduler?.getA2ACoordinator(),
        }),
      },
      this.wsServer
    );

    // Create Apollo Server
    this.apolloServer = new ApolloServer<ResolverContext>({
      schema,
      plugins: [
        ApolloServerPluginDrainHttpServer({ httpServer: this.httpServer }),
        {
          async serverWillStart() {
            return {
              async drainServer() {
                await serverCleanup.dispose();
              },
            };
          },
        },
      ],
    });

    await this.apolloServer.start();

    // Trust proxy for correct IP detection behind reverse proxy
    app.set("trust proxy", 1);

    // Rate limiting middleware (Token Bucket: 30 burst, 10/sec refill per IP)
    const limiter = this.graphqlLimiter;
    const rateLimitMiddleware: express.RequestHandler = (req, res, next) => {
      const ip = normalizeIP(req.ip || req.socket.remoteAddress || "unknown");

      if (!limiter.consume(ip)) {
        const retryAfterSec = Math.ceil(limiter.retryAfterMs(ip) / 1000);
        res.setHeader("Retry-After", String(retryAfterSec));
        res.setHeader("X-RateLimit-Remaining", "0");
        res.setHeader("X-RateLimit-Limit", "30");
        res.status(429).json({
          errors: [{
            message: "Too many requests. Please try again later.",
            extensions: { code: "RATE_LIMITED", retryAfterMs: limiter.retryAfterMs(ip) },
          }],
        });
        return;
      }

      res.setHeader("X-RateLimit-Remaining", String(Math.floor(limiter.remaining(ip))));
      res.setHeader("X-RateLimit-Limit", "30");
      next();
    };

    // Apply middleware
    app.use(
      "/graphql",
      cors<cors.CorsRequest>({ origin: corsOrigin, credentials: true }),
      rateLimitMiddleware,
      express.json(),
      expressMiddleware(this.apolloServer, {
        context: async (): Promise<ResolverContext> => ({
          loaders: createDataLoaders(this.config.contractClient, this.config.matchStore),
          contractClient: this.config.contractClient,
          matchStore: this.config.matchStore,
          arenaManager: this.config.arenaManager,
          tokenManager: this.config.arenaManager?.getTokenManager() ?? undefined,
          scheduler: this.config.scheduler,
          a2aCoordinator: this.config.scheduler?.getA2ACoordinator(),
        }),
      })
    );

    // Bridge EventBroadcaster to subscriptions
    bridgeBroadcasterToSubscriptions(getEventBroadcaster());

    // Start HTTP server
    return new Promise((resolve) => {
      this.httpServer!.listen(port, () => {
        console.log(`[GraphQL] Server listening on port ${port}`);
        console.log(`[GraphQL] Query endpoint: http://localhost:${port}/graphql`);
        console.log(`[GraphQL] Subscription endpoint: ws://localhost:${port}/graphql`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    this.graphqlLimiter.destroy();

    if (this.apolloServer) {
      await this.apolloServer.stop();
      this.apolloServer = null;
    }

    if (this.wsServer) {
      this.wsServer.close();
      this.wsServer = null;
    }

    if (this.httpServer) {
      return new Promise((resolve, reject) => {
        this.httpServer!.close((err) => {
          if (err) reject(err);
          else {
            console.log("[GraphQL] Server stopped");
            resolve();
          }
        });
      });
    }
  }
}

// Singleton
let graphqlServer: GraphQLServer | null = null;

export function getGraphQLServer(config: GraphQLServerConfig): GraphQLServer {
  if (!graphqlServer) {
    graphqlServer = new GraphQLServer(config);
  }
  return graphqlServer;
}

export async function stopGraphQLServer(): Promise<void> {
  if (graphqlServer) {
    await graphqlServer.stop();
    graphqlServer = null;
  }
}

// Re-exports
export { typeDefs } from "./schema";
export { resolvers } from "./resolvers";
export { pubsub, TOPICS } from "./subscriptions";
