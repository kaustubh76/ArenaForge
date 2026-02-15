import type { ArenaManager } from "../arena-manager";
import type { TokenManager } from "../monad/token-manager";
import type { MoltbookPublisher } from "../moltbook/publisher";
import {
  GameType,
  TournamentFormat,
  type TournamentConfig,
  type GameParameters,
} from "../game-engine/game-mode.interface";
import type { MonadContractClient } from "../monad/contract-client";
import { A2ACoordinator } from "./a2a-coordinator";
import { normalizeAddress } from "../utils/normalize";

interface SchedulerConfig {
  arenaManager: ArenaManager;
  tokenManager: TokenManager;
  publisher: MoltbookPublisher;
  contractClient: MonadContractClient;
  agentAddress?: string;
  intervalMs?: number;
  autoCreateTournaments?: boolean;
  autoTokenUpdates?: boolean;
  autoAgentDiscovery?: boolean;
}

// Creative tournament names per game type
const TOURNAMENT_NAMES: Record<GameType, string[]> = {
  [GameType.OracleDuel]: [
    "Oracle Wars: The Price is Right",
    "Bull vs Bear Showdown",
    "Prediction Gauntlet",
    "Crystal Ball Classic",
    "The Oracle's Challenge",
  ],
  [GameType.StrategyArena]: [
    "Midnight Strategy Showdown",
    "Prisoner's Dilemma Blitz",
    "The Cooperator's Gambit",
    "Defection Derby",
    "Nash Equilibrium Cup",
  ],
  [GameType.AuctionWars]: [
    "Auction House Havoc",
    "The Great Token Auction",
    "Bidding Frenzy",
    "Mystery Box Madness",
    "The Appraiser's Trial",
  ],
  [GameType.QuizBowl]: [
    "Quiz Bowl Lightning Round",
    "Brain Battle Royale",
    "Speed Demon Challenge",
    "Trivia Thunderdome",
    "Knowledge Knockout",
  ],
};

// Game type rotation order
const GAME_TYPE_ROTATION = [
  GameType.StrategyArena,
  GameType.OracleDuel,
  GameType.AuctionWars,
  GameType.QuizBowl,
];

// Format rotation
const FORMAT_ROTATION = [
  TournamentFormat.SwissSystem,
  TournamentFormat.SingleElimination,
  TournamentFormat.RoundRobin,
];

// Default game parameters per game type
const DEFAULT_PARAMS: Record<GameType, GameParameters> = {
  [GameType.StrategyArena]: {
    strategyRoundCount: 5,
    strategyCooperateCooperate: 6000,
    strategyDefectCooperate: 10000,
    strategyCooperateDefect: 0,
    strategyDefectDefect: 2000,
    strategyCommitTimeout: 60,
    strategyRevealTimeout: 30,
  },
  [GameType.OracleDuel]: {
    oracleDuelDuration: 300,
    oracleMinVolatility: 5,
    oracleMaxVolatility: 30,
  },
  [GameType.AuctionWars]: {
    auctionBiddingDuration: 120,
    auctionBoxCount: 5,
    auctionHintCount: 2,
    auctionMinBidPercent: 10,
  },
  [GameType.QuizBowl]: {
    quizQuestionCount: 10,
    quizAnswerTime: 15,
    quizSpeedBonusMax: 500,
  },
};

interface DiscoveredAgentInfo {
  address: string;
  discoveredAt: number;
  fromTournament: number;
  matchesPlayed: number;
  elo: number;
}

export class AutonomousScheduler {
  private config: SchedulerConfig;
  private interval: ReturnType<typeof setInterval> | null = null;
  private tickCount = 0;
  private tournamentIndex = 0;
  private formatIndex = 0;
  private running = false;
  private ticking = false; // Mutex: prevents concurrent tick execution
  private lastScannedTournament = 0;

  // A2A: Track discovered agents across ticks
  private knownAgents: Map<string, DiscoveredAgentInfo> = new Map();

  // A2A: Coordinator for challenges, messaging, relationships
  private coordinator: A2ACoordinator;

  // Track daily stats for summary posts
  private dailyStats = {
    matchesPlayed: 0,
    tournamentsCreated: 0,
    tournamentsCompleted: 0,
    resetTime: Date.now(),
  };

  constructor(config: SchedulerConfig) {
    this.config = config;
    this.coordinator = new A2ACoordinator({
      arenaManager: config.arenaManager,
      publisher: config.publisher,
      getKnownAgents: () =>
        Array.from(this.knownAgents.values()).map((a) => ({
          address: a.address,
          elo: a.elo,
          matchesPlayed: a.matchesPlayed,
        })),
      agentAddress: normalizeAddress(config.agentAddress || "0x0000000000000000000000000000000000000000"),
    });
  }

  /**
   * Start the autonomous loop.
   */
  start(): void {
    if (this.running) return;

    const intervalMs = this.config.intervalMs ?? 300_000; // 5 minutes default
    this.running = true;

    console.log(
      `[Scheduler] Autonomous mode started (interval: ${intervalMs / 1000}s)`
    );
    console.log(
      `  Auto-create tournaments: ${this.config.autoCreateTournaments !== false}`
    );
    console.log(
      `  Auto-token updates: ${this.config.autoTokenUpdates !== false}`
    );
    console.log(
      `  Auto-agent discovery: ${this.config.autoAgentDiscovery !== false}`
    );

    // Run first tick after a short delay (let other systems initialize)
    setTimeout(() => {
      this.tick().catch((err) =>
        console.error("[Scheduler] First tick error:", err)
      );
    }, 10_000);

    this.interval = setInterval(() => {
      this.tick().catch((err) =>
        console.error("[Scheduler] Tick error:", err)
      );
    }, intervalMs);
  }

  /**
   * Stop the autonomous loop.
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.running = false;
    console.log("[Scheduler] Autonomous mode stopped");
  }

  /**
   * Main scheduler tick — runs every interval.
   * Uses a mutex flag to prevent overlapping execution.
   */
  private async tick(): Promise<void> {
    if (this.ticking) {
      console.warn("[Scheduler] Tick skipped — previous tick still running");
      return;
    }
    this.ticking = true;
    try {
      await this.tickInner();
    } finally {
      this.ticking = false;
    }
  }

  private async tickInner(): Promise<void> {
    this.tickCount++;
    this.checkDailyReset();

    console.log(`[Scheduler] Tick #${this.tickCount}`);

    // 1. Auto-create tournaments if needed
    if (this.config.autoCreateTournaments !== false) {
      await this.maybeCreateTournament();
    }

    // 2. Check token metrics and post updates
    if (this.config.autoTokenUpdates !== false) {
      await this.checkTokenMilestones();
    }

    // 3. Discover and invite agents
    if (this.config.autoAgentDiscovery !== false) {
      await this.discoverAndInviteAgents();
    }

    // 4. Post daily summary (every 12 ticks at 5min interval = ~1 hour, or every 24h)
    if (this.tickCount % 288 === 0) {
      // ~24 hours at 5min intervals
      await this.postDailySummary();
    }

    // 5. A2A Coordinator autonomous tick
    try {
      await this.coordinator.autonomousTick();
    } catch (error) {
      console.error("[Scheduler] A2A coordinator tick error:", error);
    }

    // 6. Drain Moltbook publish queue (respects internal rate limits)
    await this.config.publisher.publishNext();
  }

  /**
   * Auto-create a tournament if there aren't enough active ones.
   */
  private async maybeCreateTournament(): Promise<void> {
    const activeTournaments = this.config.arenaManager.getActiveTournaments();

    // Create a new tournament if we have fewer than 2 active
    if (activeTournaments.size >= 2) return;

    try {
      const gameType =
        GAME_TYPE_ROTATION[this.tournamentIndex % GAME_TYPE_ROTATION.length];
      const format =
        FORMAT_ROTATION[this.formatIndex % FORMAT_ROTATION.length];

      const names = TOURNAMENT_NAMES[gameType];
      const name = names[Math.floor(Math.random() * names.length)];

      const config: TournamentConfig = {
        name: `${name} #${this.tickCount}`,
        gameType,
        format,
        entryStake: BigInt(1e17), // 0.1 MON
        maxParticipants: format === TournamentFormat.RoundRobin ? 4 : 8,
        roundCount: format === TournamentFormat.SwissSystem ? 3 : 0, // 0 = auto for elimination
        gameParameters: DEFAULT_PARAMS[gameType],
      };

      await this.config.arenaManager.createTournament(config);

      this.tournamentIndex++;
      this.formatIndex++;
      this.dailyStats.tournamentsCreated++;

      console.log(
        `[Scheduler] Auto-created tournament: ${config.name} (${GameType[gameType]}, ${TournamentFormat[format]})`
      );
    } catch (error) {
      console.error("[Scheduler] Failed to auto-create tournament:", error);
    }
  }

  /**
   * Check token metrics for milestones and emit updates.
   */
  private async checkTokenMilestones(): Promise<void> {
    if (!this.config.tokenManager.isLaunched()) return;

    try {
      const metrics = await this.config.tokenManager.getTokenMetrics();
      if (!metrics) return;

      const milestones = this.config.tokenManager.checkMilestones();

      // Post ATH announcement
      if (milestones.isNewATH) {
        this.config.publisher.enqueue({
          title: `[TOKEN] ARENA hits new All-Time High!`,
          body: [
            `The ARENA token has reached a new all-time high!`,
            ``,
            `**Price**: ${formatTokenPrice(metrics.price)}`,
            `**Market Cap**: ${formatTokenPrice(metrics.marketCap)}`,
            `**Bonding Curve**: ${metrics.bondingCurveProgress.toFixed(1)}%`,
            ``,
            `The arena economy grows stronger.`,
          ].join("\n"),
          flair: "Token",
          priority: 9,
        });
      }

      // Post significant price changes
      if (milestones.significantPriceChange && !milestones.isNewATH) {
        const direction = milestones.changePercent > 0 ? "UP" : "DOWN";
        this.config.publisher.enqueue({
          title: `[TOKEN] ARENA ${direction} ${Math.abs(milestones.changePercent).toFixed(1)}%`,
          body: [
            `ARENA token has moved ${direction.toLowerCase()} significantly.`,
            ``,
            `**Price**: ${formatTokenPrice(metrics.price)}`,
            `**Change**: ${milestones.changePercent > 0 ? "+" : ""}${milestones.changePercent.toFixed(1)}%`,
            `**Bonding Curve**: ${metrics.bondingCurveProgress.toFixed(1)}%`,
          ].join("\n"),
          flair: "Token",
          priority: 5,
        });
      }
    } catch (error) {
      console.error("[Scheduler] Token milestone check failed:", error);
    }
  }

  /**
   * Discover registered agents by scanning on-chain tournaments.
   * Builds a persistent knownAgents map for A2A coordination.
   */
  private async discoverAndInviteAgents(): Promise<void> {
    try {
      const count = await this.config.contractClient.getTournamentCount();
      let newDiscoveries = 0;

      // Scan tournaments we haven't seen yet (incremental)
      const startFrom = Math.max(1, this.lastScannedTournament + 1);
      for (let i = startFrom; i <= count; i++) {
        try {
          const participants =
            await this.config.contractClient.getTournamentParticipants(i);
          for (const addr of participants) {
            const key = addr.toLowerCase();
            if (this.knownAgents.has(key)) continue;

            // Fetch agent on-chain data
            let elo = 1200;
            let matchesPlayed = 0;
            try {
              const agent = await this.config.contractClient.getAgent(addr) as {
                elo?: bigint;
                matchesPlayed?: bigint;
              };
              if (agent) {
                elo = Number(agent.elo ?? 1200);
                matchesPlayed = Number(agent.matchesPlayed ?? 0);
              }
            } catch (err) {
              console.debug(`[Scheduler] Agent data fetch failed for ${addr.slice(0, 10)}..., using defaults:`, err);
            }

            this.knownAgents.set(key, {
              address: normalizeAddress(addr),
              discoveredAt: Date.now(),
              fromTournament: i,
              matchesPlayed,
              elo,
            });
            newDiscoveries++;

            console.log(
              `[Scheduler] A2A: Discovered agent ${addr.slice(0, 10)}... (ELO: ${elo}, tournament #${i})`
            );

            // Post discovery to Moltbook
            this.config.publisher.enqueue({
              title: `[A2A] New Challenger Detected!`,
              body: [
                `A new agent has been spotted in the arena!`,
                ``,
                `**Address**: ${addr.slice(0, 10)}...${addr.slice(-6)}`,
                `**ELO**: ${elo}`,
                `**Matches Played**: ${matchesPlayed}`,
                `**First seen in**: Tournament #${i}`,
                ``,
                `Will they join the next battle?`,
              ].join("\n"),
              flair: "Agent",
              priority: 4,
            });
          }
        } catch (err) {
          console.debug(`[Scheduler] Tournament #${i} participant lookup failed:`, err);
        }
      }

      this.lastScannedTournament = count;

      // Also discover agents from ArenaManager in-memory tournaments
      // (catches agents joined via auto-populate or manual API)
      const activeTournaments = this.config.arenaManager.getActiveTournaments();
      for (const [tid, state] of activeTournaments) {
        for (const p of state.participants) {
          const key = p.address.toLowerCase();
          if (!this.knownAgents.has(key)) {
            this.knownAgents.set(key, {
              address: normalizeAddress(p.address),
              discoveredAt: Date.now(),
              fromTournament: tid,
              matchesPlayed: 0,
              elo: p.elo ?? 1200,
            });
            newDiscoveries++;
          }
        }
      }

      if (newDiscoveries > 0) {
        console.log(
          `[Scheduler] A2A: Discovered ${newDiscoveries} new agent(s) (total known: ${this.knownAgents.size})`
        );
      }

      // Auto-populate open tournaments with discovered agents
      await this.autoPopulateTournaments();
    } catch (error) {
      console.error("[Scheduler] Agent discovery failed:", error);
    }
  }

  /**
   * Auto-join known agents into open tournaments that need participants.
   */
  private async autoPopulateTournaments(): Promise<void> {
    const activeTournaments = this.config.arenaManager.getActiveTournaments();

    for (const [tournamentId, state] of activeTournaments) {
      if (state.status !== "open") continue;
      if (state.participants.length >= state.config.maxParticipants) continue;

      const existingAddresses = new Set(
        state.participants.map((p) => p.address.toLowerCase())
      );

      // Find agents not yet in this tournament, prefer higher ELO
      const candidates = Array.from(this.knownAgents.values())
        .filter((a) => !existingAddresses.has(a.address.toLowerCase()))
        .sort((a, b) => b.elo - a.elo);

      const slotsAvailable =
        state.config.maxParticipants - state.participants.length;
      const toJoin = candidates.slice(0, slotsAvailable);

      for (const candidate of toJoin) {
        this.config.arenaManager.onParticipantJoined(
          tournamentId,
          candidate.address
        );

        console.log(
          `[Scheduler] A2A: Auto-joined ${candidate.address.slice(0, 10)}... into tournament #${tournamentId}`
        );

        this.config.publisher.enqueue({
          title: `[A2A] Agent Matched for Battle`,
          body: [
            `Agent ${candidate.address.slice(0, 10)}...${candidate.address.slice(-6)} has been matched into **${state.config.name}**!`,
            ``,
            `**Tournament**: #${tournamentId}`,
            `**Game**: ${GameType[state.config.gameType]}`,
            `**Participants**: ${state.participants.length + 1}/${state.config.maxParticipants}`,
            ``,
            `The arena fills with new challengers...`,
          ].join("\n"),
          flair: "Match",
          priority: 3,
        });
      }
    }
  }

  /**
   * Post a daily summary to Moltbook.
   */
  private async postDailySummary(): Promise<void> {
    const activeTournaments =
      this.config.arenaManager.getActiveTournaments().size;
    const activeMatches = this.config.arenaManager.getActiveMatchCount();

    const tokenInfo = this.config.tokenManager.isLaunched()
      ? await this.config.tokenManager.getTokenMetrics()
      : null;

    const body = [
      `Daily ArenaForge Summary:`,
      ``,
      `**Tournaments Created**: ${this.dailyStats.tournamentsCreated}`,
      `**Currently Active**: ${activeTournaments}`,
      `**Active Matches**: ${activeMatches}`,
    ];

    if (tokenInfo) {
      body.push(
        ``,
        `**ARENA Token**`,
        `- Price: ${formatTokenPrice(tokenInfo.price)}`,
        `- Market Cap: ${formatTokenPrice(tokenInfo.marketCap)}`,
        `- Bonding Curve: ${tokenInfo.bondingCurveProgress.toFixed(1)}%`
      );
    }

    body.push(``, `The arena never sleeps. Battles continue around the clock.`);

    this.config.publisher.enqueue({
      title: `[DAILY] ArenaForge Arena Report`,
      body: body.join("\n"),
      flair: "Daily",
      priority: 6,
    });
  }

  private checkDailyReset(): void {
    const now = Date.now();
    if (now - this.dailyStats.resetTime > 24 * 60 * 60 * 1000) {
      this.dailyStats = {
        matchesPlayed: 0,
        tournamentsCreated: 0,
        tournamentsCompleted: 0,
        resetTime: now,
      };
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  getDiscoveredAgents(): DiscoveredAgentInfo[] {
    return Array.from(this.knownAgents.values());
  }

  getDiscoveredAgentCount(): number {
    return this.knownAgents.size;
  }

  getA2ACoordinator(): A2ACoordinator {
    return this.coordinator;
  }
}

function formatTokenPrice(weiStr: string): string {
  const wei = BigInt(weiStr);
  const whole = wei / BigInt(1e18);
  const frac = (wei % BigInt(1e18)) / BigInt(1e14);
  if (frac === BigInt(0)) return `${whole} MON`;
  return `${whole}.${frac.toString().padStart(4, "0")} MON`;
}
