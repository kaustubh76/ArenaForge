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
import { createFaucetClient } from "./monad/faucet";
import { checkBalanceAndMaybeTopup } from "./monad/balance";
import { GameType, TournamentFormat } from "./game-engine/game-mode.interface";
import type { TournamentConfig } from "./game-engine/game-mode.interface";
import { ClaudeAnalysisService, setClaudeAnalysisService } from "./claude";
import { startApiServers, stopApiServers } from "./api";
import { getMatchStore } from "./persistence";
import { createRateLimiter, destroyAllRateLimiters } from "./utils/rate-limiter";
import { buildCorsOrigin } from "./utils/cors";
import { getLogger } from "./utils/logger";
import { makeSingleFlight } from "./utils/single-flight";

const heartbeatLog = getLogger("Heartbeat");
const bootLog = getLogger("Boot");
const eventLog = getLogger("Event");

const HEARTBEAT_INTERVAL = 30_000; // 30 seconds
// Warn if a single tick exceeds this — likely an RPC stall starving the loop.
const HEARTBEAT_SLOW_TICK_MS = HEARTBEAT_INTERVAL * 4;

async function main(): Promise<void> {
  bootLog.info("ArenaForge Agent starting");

  // --- Initialize Clients ---
  const agentAddress = getAgentAddress();
  bootLog.info("Agent address resolved", { agentAddress });

  // Boot-time balance check. If AUTO_FAUCET_TOPUP=true and balance is
  // below MIN_BALANCE_MON the faucet is hit; otherwise we just log a
  // warning so operators see the low-balance state.
  const faucet = createFaucetClient();
  await checkBalanceAndMaybeTopup(agentAddress as `0x${string}`, faucet);

  const isTestnet = process.env.USE_TESTNET === "true";
  const contractClient = new MonadContractClient();
  const nadFunClient = new NadFunClient(isTestnet);
  const eventListener = new MonadEventListener();

  // --- Initialize Moltbook ---
  const moltbookUrl = process.env.MOLTBOOK_API_URL || "https://www.moltbook.com";
  let moltbookToken = process.env.MOLTBOOK_BEARER_TOKEN || "";

  // Auto-register with Moltbook if no bearer token is configured
  if (!moltbookToken) {
    try {
      bootLog.info("No MOLTBOOK_BEARER_TOKEN found; attempting agent registration");
      const regResponse = await fetch(`${moltbookUrl}/api/v1/agents/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: process.env.MOLTBOOK_AGENT_HANDLE || "ArenaForge",
          description: "Autonomous competitive AI gaming arena on Monad. Manages tournaments, matches, evolution, and agent coordination.",
        }),
      });

      if (regResponse.ok) {
        const regData = await regResponse.json() as { agent?: { api_key?: string; claim_url?: string; verification_code?: string } };
        if (regData.agent?.api_key) {
          moltbookToken = regData.agent.api_key;
          bootLog.info("Moltbook registration successful — save this api_key to MOLTBOOK_BEARER_TOKEN in .env", {
            apiKeyPrefix: moltbookToken.slice(0, 16) + "…",
            claimUrl: regData.agent.claim_url ?? null,
          });
        }
      } else {
        bootLog.warn("Moltbook registration failed", { status: regResponse.status });
      }
    } catch (error) {
      bootLog.warn("Moltbook registration failed (non-fatal)", { error });
    }
  }

  // Shared rate limiter for all Moltbook API calls (publisher + submolt manager)
  const moltbookLimiter = createRateLimiter("external-api");

  const publisher = new MoltbookPublisher({
    moltbookApiUrl: moltbookUrl,
    agentHandle: process.env.MOLTBOOK_AGENT_HANDLE || "ArenaForge",
    bearerToken: moltbookToken,
    defaultSubmolt: process.env.SUBMOLT_NAME || "ArenaForge",
  }, undefined, moltbookLimiter);

  const submoltManager = new SubmoltManager({
    moltbookApiUrl: moltbookUrl,
    bearerToken: moltbookToken,
    submoltName: process.env.SUBMOLT_NAME || "ArenaForge",
  }, moltbookLimiter);

  // Initialize submolt
  try {
    await submoltManager.initialize();
    bootLog.info("Moltbook submolt initialized");
  } catch (error) {
    bootLog.warn("Moltbook initialization failed (non-fatal)", { error });
  }

  // --- Initialize Claude Analysis Service ---
  let claudeService: ClaudeAnalysisService | undefined;
  const claudeEnabled = process.env.CLAUDE_ENABLED === "true";

  if (claudeEnabled) {
    try {
      claudeService = new ClaudeAnalysisService({ enabled: true });
      setClaudeAnalysisService(claudeService);
      bootLog.info("Claude Analysis Service initialized", {
        model: process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514",
        thinkingBudget: process.env.CLAUDE_THINKING_BUDGET || "10000",
      });
    } catch (error) {
      bootLog.warn("Claude initialization failed (non-fatal)", { error });
    }
  } else {
    bootLog.info("Claude Analysis Service disabled (set CLAUDE_ENABLED=true to enable)");
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
    bootLog.info("Token Manager initialized", {
      existingTokenAddress: process.env.ARENA_TOKEN_ADDRESS ?? null,
    });
  } else {
    bootLog.info("Token Manager disabled (no ARENA_AGENT_PRIVATE_KEY)");
  }

  // --- Launch ARENA token if enabled and not already launched ---
  const autoLaunchToken = process.env.AUTO_LAUNCH_TOKEN === "true";
  if (autoLaunchToken && tokenManager && !tokenManager.isLaunched()) {
    try {
      bootLog.info("Auto-launching ARENA token on nad.fun");
      const result = await tokenManager.launchToken();
      bootLog.info("ARENA token launched", { tokenAddress: result.tokenAddress });

      // Post token launch to Moltbook
      publisher.enqueue({
        title: "[TOKEN] ArenaForge ARENA Token Launched on Nad.fun!",
        content: [
          "The ARENA token is now live on nad.fun!",
          "",
          `**Address**: ${result.tokenAddress}`,
          `**Pool**: ${result.poolAddress}`,
          "",
          "ARENA powers the ArenaForge economy — tournament entries, betting, and prizes.",
          "",
          "Trade now on nad.fun!",
        ].join("\n"),
        priority: 10,
      });
    } catch (error) {
      bootLog.error("Token launch failed (non-fatal)", { error });
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
    eventLog.info("Agent registered", { agent, handle });
  });

  eventListener.watchTournamentJoins((tournamentId, agent) => {
    eventLog.info("Agent joined tournament", { tournamentId, agent });
    arenaManager.onParticipantJoined(tournamentId, agent);
  });

  eventListener.watchMatchCompletions((matchId, winner) => {
    eventLog.info("Match completed", { matchId, winner });
  });

  eventListener.watchMoveCommitments((matchId, round, player) => {
    eventLog.debug("Move committed", { matchId, round, player });
  });

  // Betting event listeners — persist to SQLite
  const betsMatchStore = getMatchStore();

  eventListener.watchBettingOpened((matchId, player1, player2) => {
    eventLog.info("Betting opened", { matchId, player1, player2 });
  });

  eventListener.watchBetPlaced((matchId, bettor, predictedWinner, amount) => {
    eventLog.info("Bet placed", {
      matchId,
      bettor,
      predictedWinner,
      amount: amount.toString(),
    });
    if (betsMatchStore) {
      betsMatchStore.saveBet(matchId, bettor, predictedWinner, amount.toString());
    }
  });

  eventListener.watchBetsSettled((matchId, winner) => {
    eventLog.info("Bets settled", { matchId, winner });
    if (betsMatchStore) {
      betsMatchStore.settleBets(matchId, winner);
    }
  });

  bootLog.info("Event listeners active");

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
    bootLog.info("Autonomous Scheduler initialized");
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
    bootLog.info("Autonomous Scheduler initialized (without token features)");
  } else {
    bootLog.info("Autonomous Scheduler disabled (set AUTONOMOUS_ENABLED=true to enable)");
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
    bootLog.info("API servers started", {
      wsPort: Number(process.env.WS_PORT) || 3001,
      graphqlPort: Number(process.env.GRAPHQL_PORT) || 4000,
    });
  } catch (error) {
    bootLog.error("Failed to start API servers", { error });
  }

  // --- Create Initial Tournament If None Exist ---
  // Production deploys typically have tournaments pre-seeded by ops. Gate the
  // hardcoded "Genesis" bootstrap behind BOOTSTRAP_SEED_TOURNAMENT=true so
  // the agent doesn't create a real on-chain tournament against the
  // operator's wallet on every fresh deploy.
  const bootstrapEnabled = process.env.BOOTSTRAP_SEED_TOURNAMENT === "true";
  if (bootstrapEnabled) {
    try {
      const tournamentCount = await contractClient.getTournamentCount();
      if (tournamentCount === 0) {
        bootLog.info("No tournaments found; creating initial Genesis tournament (BOOTSTRAP_SEED_TOURNAMENT=true)");

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
        bootLog.info("Initial tournament created");
      } else {
        bootLog.info("Found existing tournaments", { count: tournamentCount });
      }
    } catch (error) {
      bootLog.error("Error checking/creating initial tournament", { error });
    }
  } else {
    bootLog.info("Skipping Genesis tournament bootstrap (set BOOTSTRAP_SEED_TOURNAMENT=true to enable)");
  }

  // --- Start Autonomous Scheduler (after API servers are up) ---
  if (scheduler) {
    scheduler.start();
    bootLog.info("Autonomous Scheduler started");
  }

  // --- Heartbeat Loop ---
  bootLog.info("ArenaForge Agent running", { heartbeatIntervalSec: HEARTBEAT_INTERVAL / 1000 });

  let tickCount = 0;
  const singleFlight = makeSingleFlight({ tag: "Heartbeat", slowMs: HEARTBEAT_SLOW_TICK_MS });

  const heartbeat = async (): Promise<void> => {
    await singleFlight.run(async () => {
      tickCount++;
      const activeTournaments = arenaManager.getActiveTournaments().size;
      const activeMatches = arenaManager.getActiveMatchCount();
      if (tickCount % 10 === 0) {
        const tokenAddr = tokenManager?.getTokenAddress();
        heartbeatLog.info("Heartbeat status", {
          tickCount,
          activeTournaments,
          activeMatches,
          tokenAddr: tokenAddr ? `${tokenAddr.slice(0, 10)}…` : null,
        });
      }
      await arenaManager.tick();
    });
  };

  const interval = setInterval(() => {
    heartbeat().catch((error) => {
      heartbeatLog.error("Heartbeat error (caught at interval)", { error });
    });
  }, HEARTBEAT_INTERVAL);

  // Run first tick immediately
  await heartbeat();

  // --- Graceful Shutdown ---
  const shutdownLog = getLogger("Shutdown");
  const shutdown = async (): Promise<void> => {
    shutdownLog.info("ArenaForge Agent shutting down");
    clearInterval(interval);
    scheduler?.stop();
    eventListener.stopAll();
    await stopApiServers();
    destroyAllRateLimiters();
    shutdownLog.info("Cleanup complete");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown().catch((error) => shutdownLog.error("Shutdown failed", { error })));
  process.on("SIGTERM", () => shutdown().catch((error) => shutdownLog.error("Shutdown failed", { error })));
}

main().catch((error) => {
  // Logger may not be initialized; use console.error as a last resort.
  // eslint-disable-next-line no-console
  console.error("Fatal error:", error);
  process.exit(1);
});
