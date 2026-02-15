import * as dotenv from "dotenv";
dotenv.config();

import { MonadContractClient } from "./monad/contract-client";
import { MonadEventListener } from "./monad/event-listener";
import { NadFunClient } from "./monad/nadfun-client";
import { TokenManager } from "./monad/token-manager";
import { MoltbookPublisher } from "./moltbook/publisher";
import { SubmoltManager } from "./moltbook/submolt-manager";
import { ArenaManager } from "./arena-manager";
import { AutonomousScheduler } from "./autonomous/scheduler";
import { getAgentAddress } from "./monad/rpc";
import { GameType, TournamentFormat } from "./game-engine/game-mode.interface";
import type { TournamentConfig } from "./game-engine/game-mode.interface";
import { ClaudeAnalysisService, setClaudeAnalysisService } from "./claude";
import { startApiServers, stopApiServers } from "./api";
import { getMatchStore } from "./persistence";
import { createRateLimiter } from "./utils/rate-limiter";
import { buildCorsOrigin } from "./utils/cors";

const HEARTBEAT_INTERVAL = 30_000; // 30 seconds

async function main(): Promise<void> {
  console.log("=== ArenaForge Agent Starting ===");

  // --- Initialize Clients ---
  const agentAddress = getAgentAddress();
  console.log(`Agent address: ${agentAddress}`);

  const isTestnet = process.env.USE_TESTNET === "true";
  const contractClient = new MonadContractClient();
  const nadFunClient = new NadFunClient(isTestnet);
  const eventListener = new MonadEventListener();

  // --- Initialize Moltbook ---
  const moltbookUrl = process.env.MOLTBOOK_API_URL || "https://moltbook.com";
  const moltbookToken = process.env.MOLTBOOK_BEARER_TOKEN || "";

  // Shared rate limiter for all Moltbook API calls (publisher + submolt manager)
  const moltbookLimiter = createRateLimiter("external-api");

  const publisher = new MoltbookPublisher({
    moltbookApiUrl: moltbookUrl,
    agentHandle: process.env.MOLTBOOK_AGENT_HANDLE || "ArenaForge",
    bearerToken: moltbookToken,
  }, undefined, moltbookLimiter);

  const submoltManager = new SubmoltManager({
    moltbookApiUrl: moltbookUrl,
    bearerToken: moltbookToken,
    submoltName: process.env.SUBMOLT_NAME || "ArenaForge",
  }, moltbookLimiter);

  // Initialize submolt
  try {
    await submoltManager.initialize();
    console.log("Moltbook submolt initialized");
  } catch (error) {
    console.warn("Moltbook initialization failed (non-fatal):", error);
  }

  // --- Initialize Claude Analysis Service ---
  let claudeService: ClaudeAnalysisService | undefined;
  const claudeEnabled = process.env.CLAUDE_ENABLED === "true";

  if (claudeEnabled) {
    try {
      claudeService = new ClaudeAnalysisService({ enabled: true });
      setClaudeAnalysisService(claudeService);
      console.log("Claude Analysis Service initialized");
      console.log(`  Model: ${process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514"}`);
      console.log(`  Thinking Budget: ${process.env.CLAUDE_THINKING_BUDGET || "10000"}`);
      console.log(`  Extended Thinking: Enabled`);
    } catch (error) {
      console.warn("Claude initialization failed (non-fatal):", error);
    }
  } else {
    console.log("Claude Analysis Service: Disabled (set CLAUDE_ENABLED=true to enable)");
  }

  // --- Initialize Token Manager ---
  let tokenManager: TokenManager | undefined;
  const privateKey = process.env.ARENA_AGENT_PRIVATE_KEY as `0x${string}` | undefined;
  const rpcUrl = isTestnet
    ? (process.env.MONAD_TESTNET_RPC_URL || "https://testnet-rpc.monad.xyz")
    : (process.env.MONAD_RPC_URL || "https://rpc.monad.xyz");

  if (privateKey) {
    tokenManager = new TokenManager({
      rpcUrl,
      privateKey,
      network: isTestnet ? "testnet" : "mainnet",
      existingTokenAddress: process.env.ARENA_TOKEN_ADDRESS || undefined,
    });
    console.log("Token Manager initialized");

    if (process.env.ARENA_TOKEN_ADDRESS) {
      console.log(`  Existing token: ${process.env.ARENA_TOKEN_ADDRESS}`);
    }
  } else {
    console.log("Token Manager: Disabled (no ARENA_AGENT_PRIVATE_KEY)");
  }

  // --- Launch ARENA token if enabled and not already launched ---
  const autoLaunchToken = process.env.AUTO_LAUNCH_TOKEN === "true";
  if (autoLaunchToken && tokenManager && !tokenManager.isLaunched()) {
    try {
      console.log("Auto-launching ARENA token on nad.fun...");
      const result = await tokenManager.launchToken();
      console.log(`ARENA token launched at: ${result.tokenAddress}`);

      // Post token launch to Moltbook
      publisher.enqueue({
        title: "[TOKEN] ArenaForge ARENA Token Launched on Nad.fun!",
        body: [
          "The ARENA token is now live on nad.fun!",
          "",
          `**Address**: ${result.tokenAddress}`,
          `**Pool**: ${result.poolAddress}`,
          "",
          "ARENA powers the ArenaForge economy — tournament entries, betting, and prizes.",
          "",
          "Trade now on nad.fun!",
        ].join("\n"),
        flair: "Token",
        priority: 10,
      });
    } catch (error) {
      console.error("Token launch failed (non-fatal):", error);
    }
  }

  // --- Initialize Arena Manager ---
  const arenaManager = new ArenaManager({
    contractClient,
    nadFunClient,
    publisher,
    agentAddress,
    claudeService,
    tokenManager,
  });

  // --- Set Up Event Listeners ---
  eventListener.watchRegistrations((agent, handle) => {
    console.log(`[Event] Agent registered: ${handle} (${agent.slice(0, 10)})`);
  });

  eventListener.watchTournamentJoins((tournamentId, agent) => {
    console.log(`[Event] Agent joined tournament #${tournamentId}: ${agent.slice(0, 10)}`);
    arenaManager.onParticipantJoined(tournamentId, agent);
  });

  eventListener.watchMatchCompletions((matchId, winner) => {
    console.log(`[Event] Match #${matchId} completed. Winner: ${winner.slice(0, 10)}`);
  });

  eventListener.watchMoveCommitments((matchId, round, player) => {
    console.log(`[Event] Move committed: Match #${matchId} R${round} by ${player.slice(0, 10)}`);
  });

  console.log("Event listeners active");

  // --- Initialize Autonomous Scheduler (created before API so it's available in GraphQL context) ---
  let scheduler: AutonomousScheduler | undefined;
  const autonomousEnabled = process.env.AUTONOMOUS_ENABLED === "true";
  const schedulerMatchStore = getMatchStore();

  if (autonomousEnabled && tokenManager) {
    scheduler = new AutonomousScheduler({
      arenaManager,
      tokenManager,
      publisher,
      contractClient,
      matchStore: schedulerMatchStore,
      agentAddress,
      intervalMs: Number(process.env.AUTONOMOUS_INTERVAL_MS) || 300_000,
      autoCreateTournaments: process.env.AUTO_CREATE_TOURNAMENTS !== "false",
      autoTokenUpdates: process.env.AUTO_TOKEN_UPDATES !== "false",
      autoAgentDiscovery: process.env.AUTO_AGENT_DISCOVERY !== "false",
    });
    console.log("Autonomous Scheduler initialized");
  } else if (autonomousEnabled && !tokenManager) {
    scheduler = new AutonomousScheduler({
      arenaManager,
      tokenManager: new TokenManager({
        rpcUrl,
        privateKey: privateKey || "0x0" as `0x${string}`,
        network: isTestnet ? "testnet" : "mainnet",
      }),
      publisher,
      contractClient,
      matchStore: schedulerMatchStore,
      agentAddress,
      intervalMs: Number(process.env.AUTONOMOUS_INTERVAL_MS) || 300_000,
      autoCreateTournaments: process.env.AUTO_CREATE_TOURNAMENTS !== "false",
      autoTokenUpdates: false,
      autoAgentDiscovery: process.env.AUTO_AGENT_DISCOVERY !== "false",
    });
    console.log("Autonomous Scheduler initialized (without token features)");
  } else {
    console.log("Autonomous Scheduler: Disabled (set AUTONOMOUS_ENABLED=true to enable)");
  }

  // --- Start API Servers (WebSocket + GraphQL) ---
  try {
    const matchStore = getMatchStore();
    await startApiServers({
      wsPort: Number(process.env.WS_PORT) || 3001,
      graphqlPort: Number(process.env.GRAPHQL_PORT) || 4000,
      corsOrigin: buildCorsOrigin(),
      contractClient,
      matchStore,
      arenaManager,
      scheduler,
    });
    console.log("API servers started (WebSocket: 3001, GraphQL: 4000)");
  } catch (error) {
    console.error("Failed to start API servers:", error);
  }

  // --- Create Initial Tournament If None Exist ---
  try {
    const tournamentCount = await contractClient.getTournamentCount();
    if (tournamentCount === 0) {
      console.log("No tournaments found. Creating initial tournament...");

      const initialConfig: TournamentConfig = {
        name: "ArenaForge Genesis Tournament",
        gameType: GameType.StrategyArena,
        format: TournamentFormat.SwissSystem,
        entryStake: BigInt(1e17), // 0.1 MON
        maxParticipants: 8,
        roundCount: 3,
        gameParameters: {
          strategyRoundCount: 5,
          strategyCooperateCooperate: 6000,
          strategyDefectCooperate: 10000,
          strategyCooperateDefect: 0,
          strategyDefectDefect: 2000,
          strategyCommitTimeout: 60,
          strategyRevealTimeout: 30,
        },
      };

      await arenaManager.createTournament(initialConfig);
      console.log("Initial tournament created");
    } else {
      console.log(`Found ${tournamentCount} existing tournament(s)`);
    }
  } catch (error) {
    console.error("Error checking/creating initial tournament:", error);
  }

  // --- Start Autonomous Scheduler (after API servers are up) ---
  if (scheduler) {
    scheduler.start();
    console.log("Autonomous Scheduler started");
  }

  // --- Heartbeat Loop ---
  console.log(`Heartbeat interval: ${HEARTBEAT_INTERVAL / 1000}s`);
  console.log("=== ArenaForge Agent Running ===\n");

  let tickCount = 0;

  const heartbeat = async (): Promise<void> => {
    tickCount++;
    const activeTournaments = arenaManager.getActiveTournaments().size;
    const activeMatches = arenaManager.getActiveMatchCount();

    if (tickCount % 10 === 0) {
      const tokenAddr = tokenManager?.getTokenAddress();
      console.log(
        `[Heartbeat #${tickCount}] Tournaments: ${activeTournaments} | Matches: ${activeMatches}${tokenAddr ? ` | Token: ${tokenAddr.slice(0, 10)}...` : ""}`
      );
    }

    await arenaManager.tick();
  };

  const interval = setInterval(() => {
    heartbeat().catch((error) => {
      console.error("[Heartbeat] Error:", error);
    });
  }, HEARTBEAT_INTERVAL);

  // Run first tick immediately
  await heartbeat();

  // --- Graceful Shutdown ---
  const shutdown = async (): Promise<void> => {
    console.log("\n=== ArenaForge Agent Shutting Down ===");
    clearInterval(interval);
    scheduler?.stop();
    eventListener.stopAll();
    await stopApiServers();
    console.log("Cleanup complete. Goodbye.");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown().catch(console.error));
  process.on("SIGTERM", () => shutdown().catch(console.error));
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
