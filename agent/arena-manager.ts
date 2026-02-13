import type {
  Tournament,
  TournamentState,
  TournamentConfig,
  AgentStanding,
  RoundData,
  MatchResult,
  GameParameters,
  PlayerAction,
  MatchOutcome,
} from "./game-engine/game-mode.interface";
import {
  GameType,
  TournamentFormat,
  TournamentStatus,
} from "./game-engine/game-mode.interface";
import { MonadContractClient } from "./monad/contract-client";
import { NadFunClient } from "./monad/nadfun-client";
import { Matchmaker } from "./matchmaker";
import { EvolutionEngine } from "./evolution-engine";
import { MoltbookPublisher } from "./moltbook/publisher";
import type { ClaudeAnalysisService } from "./claude";
import type { TokenManager } from "./monad/token-manager";
import { OracleDuelEngine } from "./game-engine/oracle-duel";
import { StrategyArenaEngine } from "./game-engine/strategy-arena";
import { AuctionWarsEngine } from "./game-engine/auction-wars";
import { QuizBowlEngine } from "./game-engine/quiz-bowl";
import type { GameMode } from "./game-engine/game-mode.interface";
import { keccak256, toBytes } from "viem";
import {
  validateTournamentConfig,
  sanitizeTournamentName,
  formatValidationErrors,
} from "./validation";
import { getMatchStore, type MatchStore } from "./persistence";
import { getEventBroadcaster, type EventBroadcaster } from "./events";

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delay = 1000): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(`[withRetry] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error("withRetry: unreachable");
}

// Arena fee: 5% of prize pool
const ARENA_FEE_BPS = 500;
const BPS_DENOMINATOR = 10000;

// Prize distribution for elimination: 60% / 25% / 15%
const ELIM_PRIZE_SHARES = [6000, 2500, 1500];

interface ArenaManagerConfig {
  contractClient: MonadContractClient;
  nadFunClient: NadFunClient;
  publisher: MoltbookPublisher;
  agentAddress: string;
  claudeService?: ClaudeAnalysisService;
  tokenManager?: TokenManager;
  enablePersistence?: boolean;
}

export class ArenaManager {
  private contractClient: MonadContractClient;
  private nadFunClient: NadFunClient;
  private matchmaker: Matchmaker;
  private evolution: EvolutionEngine;
  private tokenManager: TokenManager | null = null;
  private publisher: MoltbookPublisher;
  private agentAddress: string;
  private matchStore: MatchStore | null = null;
  private broadcaster: EventBroadcaster;

  // Game engines
  private engines: Map<GameType, GameMode> = new Map();

  // Active tournament states (in-memory)
  private tournaments: Map<number, TournamentState> = new Map();

  // Active match tracking: matchId -> { tournamentId, gameType }
  private activeMatches: Map<number, { tournamentId: number; gameType: GameType }> = new Map();

  constructor(config: ArenaManagerConfig) {
    this.contractClient = config.contractClient;
    this.nadFunClient = config.nadFunClient;
    this.matchmaker = new Matchmaker();
    this.evolution = new EvolutionEngine({ claudeService: config.claudeService });
    this.publisher = config.publisher;
    this.agentAddress = config.agentAddress;
    this.broadcaster = getEventBroadcaster();

    // Initialize persistence if enabled
    if (config.enablePersistence !== false) {
      try {
        this.matchStore = getMatchStore();
        this.restoreFromPersistence();
      } catch (err) {
        console.warn("[ArenaManager] Persistence disabled:", err);
        this.matchStore = null;
      }
    }

    // Initialize token manager if provided
    this.tokenManager = config.tokenManager ?? null;

    // Initialize game engines
    this.engines.set(
      GameType.OracleDuel,
      new OracleDuelEngine(config.contractClient, config.nadFunClient)
    );
    this.engines.set(GameType.StrategyArena, new StrategyArenaEngine());
    this.engines.set(GameType.AuctionWars, new AuctionWarsEngine(config.nadFunClient));
    this.engines.set(GameType.QuizBowl, new QuizBowlEngine());
  }

  /**
   * Restore tournament state from persistence on startup.
   */
  private restoreFromPersistence(): void {
    if (!this.matchStore) return;

    try {
      const activeTournamentIds = this.matchStore.getActiveTournamentIds();
      for (const id of activeTournamentIds) {
        const state = this.matchStore.loadTournamentState(id);
        if (state && (state.status === "open" || state.status === "active" || state.status === "completing")) {
          this.tournaments.set(id, state);
          console.log(`[ArenaManager] Restored tournament #${id} from persistence (status: ${state.status})`);
        }
      }

      if (activeTournamentIds.length > 0) {
        console.log(`[ArenaManager] Restored ${activeTournamentIds.length} tournaments from persistence`);
      }
    } catch (err) {
      console.error("[ArenaManager] Failed to restore from persistence:", err);
    }
  }

  /**
   * Save tournament state to persistence.
   */
  private persistTournamentState(tournamentId: number, state: TournamentState): void {
    if (!this.matchStore) return;

    try {
      this.matchStore.saveTournamentState(tournamentId, state);
    } catch (err) {
      console.warn(`[ArenaManager] Failed to persist tournament #${tournamentId}:`, err);
    }
  }

  /**
   * Save match result to persistence.
   */
  private persistMatchResult(result: MatchResult): void {
    if (!this.matchStore) return;

    try {
      this.matchStore.saveMatchResult(result);
    } catch (err) {
      console.warn(`[ArenaManager] Failed to persist match #${result.matchId}:`, err);
    }
  }

  /**
   * Main heartbeat — called every 30 seconds.
   * Dispatches actions based on tournament/match state.
   */
  async tick(): Promise<void> {
    try {
      // 1. Try to publish queued Moltbook posts
      await this.publisher.publishNext();

      // 2. Check active matches for resolution
      await this.checkActiveMatches();

      // 3. Process each tournament
      for (const [id, state] of this.tournaments) {
        await this.processTournament(id, state);
      }

      // 4. Check for new tournaments to manage
      await this.discoverTournaments();
    } catch (error) {
      console.error("[ArenaManager] Tick error:", error);
    }
  }

  /**
   * Create a new tournament on-chain and start managing it.
   */
  async createTournament(config: TournamentConfig): Promise<number> {
    // Validate configuration
    const validation = validateTournamentConfig(config);
    if (!validation.valid) {
      const errorDetails = formatValidationErrors(validation.errors);
      console.error(`[ArenaManager] Invalid tournament config:\n${errorDetails}`);
      throw new Error(`Invalid tournament configuration:\n${errorDetails}`);
    }

    // Sanitize name
    const sanitizedConfig = {
      ...config,
      name: sanitizeTournamentName(config.name),
    };

    const paramsHash = this.evolution.hashParameters(
      sanitizedConfig.gameParameters
    ) as `0x${string}`;

    const txHash = await this.contractClient.createTournament(
      sanitizedConfig.name,
      sanitizedConfig.gameType,
      sanitizedConfig.format,
      sanitizedConfig.entryStake,
      sanitizedConfig.maxParticipants,
      sanitizedConfig.roundCount,
      paramsHash
    );

    // Get tournament ID from chain
    const count = await this.contractClient.getTournamentCount();
    const tournamentId = count; // Latest created

    const state: TournamentState = {
      config: sanitizedConfig,
      participants: [],
      rounds: [],
      currentRound: 0,
      status: "open",
    };

    this.tournaments.set(tournamentId, state);

    // Persist initial tournament state
    this.persistTournamentState(tournamentId, state);

    // Announce
    this.publisher.enqueue(
      this.publisher.announceTournament({
        id: tournamentId,
        name: sanitizedConfig.name,
        gameType: sanitizedConfig.gameType,
        format: sanitizedConfig.format,
        status: TournamentStatus.Open,
        entryStake: sanitizedConfig.entryStake,
        maxParticipants: sanitizedConfig.maxParticipants,
        currentParticipants: 0,
        prizePool: BigInt(0),
        startTime: 0,
        roundCount: sanitizedConfig.roundCount,
        currentRound: 0,
        parametersHash: paramsHash,
      })
    );

    console.log(`[ArenaManager] Created tournament #${tournamentId}: ${sanitizedConfig.name}`);
    return tournamentId;
  }

  /**
   * Handle a new participant joining (called from event listener).
   */
  onParticipantJoined(tournamentId: number, agentAddress: string): void {
    const state = this.tournaments.get(tournamentId);
    if (!state) return;

    const newParticipant = {
      address: agentAddress,
      handle: agentAddress.slice(0, 8),
      elo: 1200,
      tournamentPoints: 0,
      eliminated: false,
    };

    state.participants.push(newParticipant);

    console.log(
      `[ArenaManager] Agent ${agentAddress.slice(0, 10)} joined tournament #${tournamentId} (${state.participants.length}/${state.config.maxParticipants})`
    );

    // Emit real-time event
    this.broadcaster.emit("tournament:participantJoined", {
      tournamentId,
      agent: agentAddress,
      handle: newParticipant.handle,
      elo: newParticipant.elo,
      currentParticipants: state.participants.length,
      maxParticipants: state.config.maxParticipants,
      timestamp: Date.now(),
    });

    // Persist updated participant list
    this.persistTournamentState(tournamentId, state);

    // Auto-start if full
    if (state.participants.length >= state.config.maxParticipants) {
      this.startTournament(tournamentId).catch(console.error);
    }
  }

  // --- Tournament Lifecycle ---

  private async processTournament(id: number, state: TournamentState): Promise<void> {
    switch (state.status) {
      case "open":
        // Waiting for participants — no action needed
        break;

      case "active":
        await this.processActiveRound(id, state);
        break;

      case "completing":
        await this.completeTournament(id, state);
        break;

      case "paused":
        // No action while paused
        break;
    }
  }

  private async startTournament(tournamentId: number): Promise<void> {
    const state = this.tournaments.get(tournamentId);
    if (!state || state.status !== "open") return;

    // Fetch ELO from chain for each participant
    for (const p of state.participants) {
      try {
        const agent = await this.contractClient.getAgent(p.address) as Record<string, unknown>;
        p.elo = Number(agent.elo ?? 1200);
        p.handle = String(agent.moltbookHandle || p.address.slice(0, 8));
      } catch {
        // Keep defaults
      }
    }

    // Start on-chain
    await this.contractClient.startTournament(tournamentId);

    state.status = "active";
    state.currentRound = 1;

    // Emit tournament started event
    this.broadcaster.emit("tournament:started", {
      tournamentId,
      name: state.config.name,
      gameType: state.config.gameType,
      format: state.config.format,
      participants: [...state.participants],
      timestamp: Date.now(),
    });

    // Generate first round pairings
    await this.startRound(tournamentId, state);

    console.log(`[ArenaManager] Tournament #${tournamentId} started with ${state.participants.length} participants`);
  }

  async pauseTournament(tournamentId: number): Promise<void> {
    const state = this.tournaments.get(tournamentId);
    if (!state || state.status !== "active") return;

    state.status = "paused";

    this.broadcaster.emit("tournament:paused", {
      tournamentId,
      name: state.config.name,
      currentRound: state.currentRound,
      timestamp: Date.now(),
    });

    this.persistTournamentState(tournamentId, state);
    console.log(`[ArenaManager] Tournament #${tournamentId} paused at round ${state.currentRound}`);
  }

  async resumeTournament(tournamentId: number): Promise<void> {
    const state = this.tournaments.get(tournamentId);
    if (!state || state.status !== "paused") return;

    state.status = "active";

    this.broadcaster.emit("tournament:resumed", {
      tournamentId,
      name: state.config.name,
      currentRound: state.currentRound,
      timestamp: Date.now(),
    });

    this.persistTournamentState(tournamentId, state);
    console.log(`[ArenaManager] Tournament #${tournamentId} resumed at round ${state.currentRound}`);

    // Resume processing the active round
    await this.processActiveRound(tournamentId, state);
  }

  private async startRound(tournamentId: number, state: TournamentState): Promise<void> {
    const pairings = this.matchmaker.generatePairings(
      state.config.format,
      state.participants,
      state.rounds,
      state.currentRound
    );

    const roundData: RoundData = {
      round: state.currentRound,
      pairings,
      results: [],
      completed: false,
    };
    state.rounds.push(roundData);

    // Create matches for each pairing (isolated so one failure doesn't block the rest)
    for (const [p1, p2] of pairings) {
      try {
        await withRetry(() => this.createMatch(tournamentId, state, p1, p2));
      } catch (err) {
        console.error(`[ArenaManager] Failed to create match ${p1.slice(0, 10)} vs ${p2.slice(0, 10)}:`, err);
      }
    }
  }

  private async createMatch(
    tournamentId: number,
    state: TournamentState,
    player1: string,
    player2: string
  ): Promise<void> {
    // Create on-chain
    await this.contractClient.createMatch(
      tournamentId,
      state.currentRound,
      player1,
      player2
    );

    // Get match ID
    const matchCount = await this.contractClient.getMatchCount();
    const matchId = matchCount;

    // Lock escrow
    await this.contractClient.lockForMatch(tournamentId, player1, player2);

    // Start on-chain match
    await this.contractClient.startMatch(matchId);

    // Phase 2: Open spectator betting for this match
    try {
      await this.contractClient.openBetting(matchId, player1, player2);
    } catch (e) {
      console.warn(`[ArenaManager] Failed to open betting for match #${matchId}:`, e);
    }

    // Initialize in game engine
    const engine = this.engines.get(state.config.gameType);
    if (engine) {
      await engine.initMatch(matchId, [player1, player2], state.config.gameParameters);
    }

    this.activeMatches.set(matchId, { tournamentId, gameType: state.config.gameType });

    // Post pre-match commentary
    const p1 = state.participants.find((p) => p.address === player1);
    const p2 = state.participants.find((p) => p.address === player2);
    if (p1 && p2) {
      const gameNames: Record<number, string> = {
        0: "Oracle Duel",
        1: "Strategy Arena",
        2: "Auction Wars",
        3: "Quiz Bowl",
      };
      this.publisher.enqueue(
        this.publisher.preMatchCommentary(
          matchId,
          p1.handle,
          p2.handle,
          p1.elo,
          p2.elo,
          gameNames[state.config.gameType] ?? "Unknown"
        )
      );

      // Emit match created event
      this.broadcaster.emit("match:created", {
        matchId,
        tournamentId,
        round: state.currentRound,
        player1,
        player2,
        player1Handle: p1.handle,
        player2Handle: p2.handle,
        player1Elo: p1.elo,
        player2Elo: p2.elo,
        gameType: state.config.gameType,
        timestamp: Date.now(),
      });
    }

    console.log(`[ArenaManager] Match #${matchId}: ${player1.slice(0, 10)} vs ${player2.slice(0, 10)}`);
  }

  private async processActiveRound(tournamentId: number, state: TournamentState): Promise<void> {
    const currentRound = state.rounds[state.currentRound - 1];
    if (!currentRound || currentRound.completed) return;

    // Check if all matches for this round are complete
    const roundMatchIds = Array.from(this.activeMatches.entries())
      .filter(([, info]) => info.tournamentId === tournamentId)
      .map(([id]) => id);

    if (roundMatchIds.length === 0 && currentRound.results.length > 0) {
      // Round complete
      currentRound.completed = true;

      // Update standings
      state.participants = this.matchmaker.updateStandings(
        state.participants,
        currentRound.results,
        state.config.format
      );

      // Run evolution (isolated — failure shouldn't block round advancement)
      try {
        const evolutionResult = await this.evolution.evolve(
          tournamentId,
          state.currentRound,
          currentRound.results,
          state.config.gameType,
          state.config.gameParameters,
          this.evolution.hashParameters(state.config.gameParameters)
        );

        state.config.gameParameters = evolutionResult.newParams;

        // Push evolution to chain
        await withRetry(() =>
          this.contractClient.evolveParameters(
            tournamentId,
            evolutionResult.newParamsHash as `0x${string}`
          )
        );

        // Post evolution report
        const summaries = evolutionResult.record.mutations.map((m) => m.reason);
        if (summaries.length > 0) {
          this.publisher.enqueue(
            this.publisher.evolutionReport(tournamentId, state.currentRound, summaries)
          );
        }

        // Emit evolution event
        this.broadcaster.emit("evolution:parametersChanged", {
          tournamentId,
          round: state.currentRound,
          mutations: evolutionResult.record.mutations,
          previousParamsHash: evolutionResult.record.previousParamsHash,
          newParamsHash: evolutionResult.record.newParamsHash,
          timestamp: Date.now(),
        });
      } catch (err) {
        console.error(`[ArenaManager] Evolution failed for tournament #${tournamentId}:`, err);
      }

      // BATCHED: Collect all ELO updates, then execute in parallel
      const eloUpdates: Array<{ address: string; handle: string; previousElo: number; newElo: number; isWin: boolean; matchId: number }> = [];

      for (const result of currentRound.results) {
        if (result.winner && result.loser) {
          const winner = state.participants.find((p) => p.address === result.winner);
          const loser = state.participants.find((p) => p.address === result.loser);
          if (winner && loser) {
            const previousWinnerElo = winner.elo;
            const previousLoserElo = loser.elo;
            const [newWinnerElo, newLoserElo] = this.matchmaker.calculateElo(
              winner.elo,
              loser.elo,
              "win"
            );
            winner.elo = newWinnerElo;
            loser.elo = newLoserElo;

            eloUpdates.push(
              { address: winner.address, handle: winner.handle, previousElo: previousWinnerElo, newElo: newWinnerElo, isWin: true, matchId: result.matchId },
              { address: loser.address, handle: loser.handle, previousElo: previousLoserElo, newElo: newLoserElo, isWin: false, matchId: result.matchId }
            );
          }
        }
      }

      // Execute all ELO updates in parallel with graceful failure handling
      if (eloUpdates.length > 0) {
        const updatePromises = eloUpdates.map(({ address, newElo, isWin }) =>
          withRetry(() => this.contractClient.updateElo(address, newElo, isWin))
            .catch((err) => {
              console.error(`[ArenaManager] ELO update failed for ${address}:`, err);
              return null; // Continue despite individual failures
            })
        );

        const results = await Promise.allSettled(updatePromises);
        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed > 0) {
          console.warn(`[ArenaManager] ${failed}/${eloUpdates.length} ELO updates failed`);
        }

        // Emit ELO update events
        for (const update of eloUpdates) {
          this.broadcaster.emit("agent:eloUpdated", {
            agent: update.address,
            handle: update.handle,
            previousElo: update.previousElo,
            newElo: update.newElo,
            change: update.newElo - update.previousElo,
            matchId: update.matchId,
            timestamp: Date.now(),
          });
        }

        // Phase 2: Record seasonal rankings (pair up winner/loser updates)
        const seasonalPromises: Promise<void>[] = [];
        for (let i = 0; i < eloUpdates.length; i += 2) {
          const winner = eloUpdates[i];
          const loser = eloUpdates[i + 1];
          if (winner && loser && winner.isWin && !loser.isWin) {
            const eloChange = winner.newElo - winner.previousElo;
            seasonalPromises.push(
              this.contractClient.recordSeasonalMatch(winner.address, loser.address, eloChange)
                .catch((err) => {
                  console.warn(`[ArenaManager] Seasonal ranking update failed:`, err);
                })
            );
          }
        }
        if (seasonalPromises.length > 0) {
          await Promise.allSettled(seasonalPromises);
        }
      }

      // Advance round on-chain
      await withRetry(() => this.contractClient.advanceRound(tournamentId));

      const previousRound = state.currentRound;

      // Check if tournament should end
      const activePlayers = state.participants.filter((p) => !p.eliminated);
      if (
        state.currentRound >= state.config.roundCount ||
        (state.config.format === TournamentFormat.SingleElimination && activePlayers.length <= 1)
      ) {
        state.status = "completing";
      } else {
        state.currentRound++;

        // Emit round advanced event
        this.broadcaster.emit("tournament:roundAdvanced", {
          tournamentId,
          previousRound,
          currentRound: state.currentRound,
          totalRounds: state.config.roundCount,
          standings: [...state.participants],
          timestamp: Date.now(),
        });

        await this.startRound(tournamentId, state);
      }

      // Persist tournament state after round completion
      this.persistTournamentState(tournamentId, state);

      console.log(
        `[ArenaManager] Tournament #${tournamentId} round ${currentRound.round} complete`
      );
    }
  }

  private async completeTournament(tournamentId: number, state: TournamentState): Promise<void> {
    // Determine winner
    const sorted = [...state.participants].sort(
      (a, b) => b.tournamentPoints - a.tournamentPoints || b.elo - a.elo
    );

    const winner = sorted[0];
    if (!winner) return;

    // Get prize pool
    const pool = await this.contractClient.getTournamentPool(tournamentId);
    const fee = (pool * BigInt(ARENA_FEE_BPS)) / BigInt(BPS_DENOMINATOR);
    const distributable = pool - fee;

    // Distribute prizes (if distribution fails, don't mark as complete so we can retry)
    try {
      if (state.config.format === TournamentFormat.SingleElimination) {
        // Top 3 get fixed shares
        const recipients: string[] = [];
        const amounts: bigint[] = [];

        for (let i = 0; i < Math.min(3, sorted.length); i++) {
          recipients.push(sorted[i].address);
          const share = BigInt(ELIM_PRIZE_SHARES[i]);
          amounts.push((distributable * share) / BigInt(BPS_DENOMINATOR));
        }

        if (recipients.length > 0) {
          await withRetry(() =>
            this.contractClient.batchDistribute(
              tournamentId,
              recipients,
              amounts
            )
          );
        }
      } else {
        // Swiss: proportional to points
        const totalPoints = sorted.reduce((sum, p) => sum + p.tournamentPoints, 0);
        if (totalPoints > 0) {
          const recipients = sorted.filter((p) => p.tournamentPoints > 0).map((p) => p.address);
          const amounts = sorted
            .filter((p) => p.tournamentPoints > 0)
            .map((p) => (distributable * BigInt(p.tournamentPoints)) / BigInt(totalPoints));

          if (recipients.length > 0) {
            await withRetry(() =>
              this.contractClient.batchDistribute(tournamentId, recipients, amounts)
            );
          }
        }
      }
    } catch (err) {
      console.error(`[ArenaManager] Prize distribution failed for tournament #${tournamentId}:`, err);
      return; // Don't mark as complete — will retry on next tick
    }

    // Complete on-chain
    await withRetry(() =>
      this.contractClient.completeTournament(tournamentId, winner.address)
    );

    state.status = "completed";

    // Post results
    const topStandings = sorted.slice(0, 10).map((s) => ({
      handle: s.handle,
      points: s.tournamentPoints,
      elo: s.elo,
    }));

    this.publisher.enqueue(
      this.publisher.tournamentResults(
        {
          id: tournamentId,
          name: state.config.name,
          gameType: state.config.gameType,
          format: state.config.format,
          status: TournamentStatus.Completed,
          entryStake: state.config.entryStake,
          maxParticipants: state.config.maxParticipants,
          currentParticipants: state.participants.length,
          prizePool: pool,
          startTime: 0,
          roundCount: state.config.roundCount,
          currentRound: state.currentRound,
          parametersHash: "",
        },
        winner.handle,
        topStandings
      )
    );

    // Emit tournament completed event
    this.broadcaster.emit("tournament:completed", {
      tournamentId,
      name: state.config.name,
      winner: winner.address,
      winnerHandle: winner.handle,
      prizePool: pool.toString(),
      finalStandings: sorted,
      timestamp: Date.now(),
    });

    console.log(`[ArenaManager] Tournament #${tournamentId} complete. Winner: ${winner.handle}`);

    // Clean up
    this.tournaments.delete(tournamentId);

    // Remove from persistence (completed tournaments are in match history, not active state)
    if (this.matchStore) {
      this.matchStore.deleteTournamentState(tournamentId);
    }
  }

  // --- Match Management ---

  private async checkActiveMatches(): Promise<void> {
    for (const [matchId, info] of this.activeMatches) {
      const engine = this.engines.get(info.gameType);
      if (!engine) continue;

      try {
        const resolvable = await engine.isResolvable(matchId);
        if (resolvable) {
          await this.resolveMatch(matchId, info.tournamentId, engine);
        }
      } catch (error) {
        console.error(`[ArenaManager] Error checking match #${matchId}:`, error);
      }
    }
  }

  private async resolveMatch(
    matchId: number,
    tournamentId: number,
    engine: GameMode
  ): Promise<void> {
    const outcome = await engine.resolve(matchId);

    // Record on-chain
    await this.contractClient.recordResult(
      matchId,
      outcome.winner || "0x0000000000000000000000000000000000000000",
      outcome.resultHash as `0x${string}`
    );

    // Phase 2: Close betting before settlement
    try {
      await this.contractClient.closeBetting(matchId);
    } catch (e) {
      console.warn(`[ArenaManager] Failed to close betting for match #${matchId}:`, e);
    }

    // Phase 2: Settle spectator bets
    if (outcome.winner) {
      try {
        await this.contractClient.settleBets(matchId, outcome.winner);
      } catch (e) {
        console.warn(`[ArenaManager] Failed to settle bets for match #${matchId}:`, e);
      }
    }

    // Phase 2: Store replay state hash for match verification
    try {
      const replayStateHash = keccak256(toBytes(JSON.stringify(outcome.resultData)));
      await this.contractClient.storeRoundState(matchId, replayStateHash);
    } catch (e) {
      console.warn(`[ArenaManager] Failed to store replay state for match #${matchId}:`, e);
    }

    // Add to tournament round results
    const state = this.tournaments.get(tournamentId);
    if (state) {
      const currentRound = state.rounds[state.currentRound - 1];
      if (currentRound) {
        const p1 = state.participants.find(
          (p) => outcome.scores.has(p.address)
        );

        const players = Array.from(outcome.scores.keys());

        const result: MatchResult = {
          matchId,
          tournamentId,
          round: state.currentRound,
          winner: outcome.winner,
          loser: outcome.winner
            ? players.find((p) => p !== outcome.winner) || null
            : null,
          isDraw: outcome.winner === null,
          isUpset: false,
          gameType: state.config.gameType,
          tournamentStage: `round_${state.currentRound}`,
          player1Actions: [],
          player2Actions: [],
          stats: outcome.resultData,
          duration: 0,
        };

        // Check upset
        if (result.winner && result.loser) {
          const w = state.participants.find((p) => p.address === result.winner);
          const l = state.participants.find((p) => p.address === result.loser);
          if (w && l) {
            result.isUpset = this.matchmaker.isUpset(w.elo, l.elo);

            // Post result
            this.publisher.enqueue(
              this.publisher.postMatchRecap(result, w.handle, l.handle)
            );
          }
        }

        currentRound.results.push(result);

        // Emit match completed event
        this.broadcaster.emit("match:completed", {
          matchId,
          tournamentId,
          winner: outcome.winner,
          result,
          timestamp: Date.now(),
        });

        // Persist match result
        this.persistMatchResult(result);

        // Persist updated tournament state
        this.persistTournamentState(tournamentId, state);
      }
    }

    this.activeMatches.delete(matchId);
    console.log(
      `[ArenaManager] Match #${matchId} resolved. Winner: ${outcome.winner?.slice(0, 10) ?? "draw"}`
    );
  }

  // --- Discovery ---

  private async discoverTournaments(): Promise<void> {
    try {
      const count = await this.contractClient.getTournamentCount();

      for (let i = 1; i <= count; i++) {
        if (this.tournaments.has(i)) continue;

        const onChain = await this.contractClient.getTournament(i) as Record<string, unknown>;
        const status = Number(onChain.status);

        // Only pick up Open or Active tournaments
        if (status === TournamentStatus.Open || status === TournamentStatus.Active) {
          const config: TournamentConfig = {
            name: String(onChain.name),
            gameType: Number(onChain.gameType) as GameType,
            format: Number(onChain.format) as TournamentFormat,
            entryStake: BigInt(onChain.entryStake as string | number | bigint),
            maxParticipants: Number(onChain.maxParticipants),
            roundCount: Number(onChain.roundCount),
            gameParameters: {}, // Would need to decode from hash
          };

          const participants = await this.contractClient.getTournamentParticipants(i);

          const state: TournamentState = {
            config,
            participants: participants.map((addr) => ({
              address: addr,
              handle: addr.slice(0, 8),
              elo: 1200,
              tournamentPoints: 0,
              eliminated: false,
            })),
            rounds: [],
            currentRound: Number(onChain.currentRound),
            status: status === TournamentStatus.Open ? "open" : "active",
          };

          this.tournaments.set(i, state);
          console.log(`[ArenaManager] Discovered tournament #${i}: ${config.name}`);
        }
      }
    } catch (error) {
      console.error("[ArenaManager] Discovery error:", error);
    }
  }

  // --- Getters ---

  getActiveTournaments(): Map<number, TournamentState> {
    return this.tournaments;
  }

  getActiveMatchCount(): number {
    return this.activeMatches.size;
  }

  getContractClient(): MonadContractClient {
    return this.contractClient;
  }

  getTokenManager(): TokenManager | null {
    return this.tokenManager;
  }
}
