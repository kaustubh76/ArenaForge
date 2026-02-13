import type {
  GameParameters,
  MatchResult,
  Mutation,
  EvolutionMetrics,
  EvolutionRecord,
  GameType,
} from "./game-engine/game-mode.interface";
import { GameType as GT, StrategyMove } from "./game-engine/game-mode.interface";
import { keccak256, toBytes } from "viem";
import type { ClaudeAnalysisService } from "./claude";

export interface EvolutionEngineConfig {
  claudeService?: ClaudeAnalysisService;
}

// Bounds for evolved parameters
const BOUNDS: Record<string, { min: number; max: number }> = {
  oracleDuelDuration: { min: 60, max: 3600 },
  oracleMinVolatility: { min: 1, max: 50 },
  oracleMaxVolatility: { min: 10, max: 200 },
  strategyRoundCount: { min: 3, max: 20 },
  strategyCooperateCooperate: { min: 2000, max: 10000 },
  strategyDefectCooperate: { min: 5000, max: 15000 },
  strategyCooperateDefect: { min: 0, max: 3000 },
  strategyDefectDefect: { min: 500, max: 5000 },
  strategyCommitTimeout: { min: 30, max: 300 },
  strategyRevealTimeout: { min: 15, max: 120 },
  auctionBiddingDuration: { min: 30, max: 300 },
  auctionBoxCount: { min: 1, max: 5 },
  auctionHintCount: { min: 1, max: 4 },
  auctionMinBidPercent: { min: 5, max: 50 },
  quizQuestionCount: { min: 3, max: 20 },
  quizAnswerTime: { min: 10, max: 60 },
  quizSpeedBonusMax: { min: 0, max: 100 },
};

export class EvolutionEngine {
  private history: EvolutionRecord[] = [];
  private claudeService: ClaudeAnalysisService | null = null;

  constructor(config?: EvolutionEngineConfig) {
    if (config?.claudeService) {
      this.claudeService = config.claudeService;
    }
  }

  /**
   * Analyze a round of results and produce evolution metrics.
   */
  analyzeRound(results: MatchResult[], gameType: GameType): EvolutionMetrics {
    const strategyDistribution = new Map<string, number>();
    let totalDuration = 0;
    let drawCount = 0;

    for (const r of results) {
      totalDuration += r.duration;
      if (r.isDraw) drawCount++;

      // Classify strategies from player actions
      const strategies = this.classifyStrategies(r, gameType);
      for (const s of strategies) {
        strategyDistribution.set(s, (strategyDistribution.get(s) || 0) + 1);
      }
    }

    // Determine dominant strategy
    let dominantStrategy = "unknown";
    let maxCount = 0;
    for (const [strategy, count] of strategyDistribution) {
      if (count > maxCount) {
        maxCount = count;
        dominantStrategy = strategy;
      }
    }

    // Classify average stake behavior based on draw rate
    let averageStakeBehavior: "conservative" | "moderate" | "aggressive";
    const drawRate = results.length > 0 ? drawCount / results.length : 0;
    if (drawRate > 0.4) {
      averageStakeBehavior = "conservative";
    } else if (drawRate > 0.15) {
      averageStakeBehavior = "moderate";
    } else {
      averageStakeBehavior = "aggressive";
    }

    return {
      averageStakeBehavior,
      dominantStrategy,
      strategyDistribution,
      averageMatchDuration:
        results.length > 0 ? totalDuration / results.length : 0,
      drawRate,
    };
  }

  /**
   * Determine mutations based on analysis metrics.
   * First attempts Claude-powered analysis with extended thinking.
   * Falls back to rule-based logic if Claude is unavailable.
   */
  async determineMutations(
    metrics: EvolutionMetrics,
    gameType: GameType,
    currentParams: GameParameters,
    recentResults?: MatchResult[],
    currentRound?: number
  ): Promise<Mutation[]> {
    // Try Claude analysis first
    if (this.claudeService) {
      try {
        const analysis = await this.claudeService.analyzeEvolution(
          metrics,
          gameType,
          currentParams,
          recentResults || [],
          currentRound || 1
        );

        if (analysis && analysis.mutations.length > 0) {
          console.log(
            `[Evolution] Claude analysis (confidence: ${analysis.confidence.toFixed(2)}): ${analysis.reasoning}`
          );
          if (analysis.thinkingLog) {
            console.log(`[Evolution] Thinking preview: ${analysis.thinkingLog.slice(0, 200)}...`);
          }
          return analysis.mutations;
        }
      } catch (error) {
        console.warn("[Evolution] Claude analysis failed, falling back to rules:", error);
      }
    }

    // Fallback to rule-based logic
    return this.determineMutationsRuleBased(metrics, gameType, currentParams);
  }

  /**
   * Rule-based mutation determination.
   * Implements 5 rules:
   * 1. High draw rate → increase asymmetry
   * 2. Dominant strategy → counter by adjusting payoffs
   * 3. Short matches → increase complexity
   * 4. Conservative behavior → reduce timeouts
   * 5. Aggressive behavior → increase safety margins
   */
  private determineMutationsRuleBased(
    metrics: EvolutionMetrics,
    gameType: GameType,
    currentParams: GameParameters
  ): Mutation[] {
    const mutations: Mutation[] = [];

    // Rule 1: High draw rate — increase asymmetry
    if (metrics.drawRate > 0.3) {
      if (gameType === GT.StrategyArena) {
        mutations.push({
          type: "scale",
          factor: 1.15,
          strategy: "strategyDefectCooperate",
          reason: `High draw rate (${(metrics.drawRate * 100).toFixed(0)}%) — increasing defect payoff to break equilibrium`,
        });
      }
      if (gameType === GT.OracleDuel) {
        mutations.push({
          type: "scale",
          factor: 1.2,
          strategy: "oracleDuelDuration",
          reason: `High draw rate — increasing duel duration to reduce ties`,
        });
      }
    }

    // Rule 2: Dominant strategy — counter it
    if (metrics.dominantStrategy === "always_defect" && gameType === GT.StrategyArena) {
      mutations.push({
        type: "scale",
        factor: 1.25,
        strategy: "strategyCooperateCooperate",
        reason: "Defection dominant — boosting cooperation payoff",
      });
      mutations.push({
        type: "scale",
        factor: 0.8,
        strategy: "strategyDefectDefect",
        reason: "Defection dominant — reducing mutual defection payoff",
      });
    }
    if (metrics.dominantStrategy === "always_cooperate" && gameType === GT.StrategyArena) {
      mutations.push({
        type: "scale",
        factor: 1.2,
        strategy: "strategyDefectCooperate",
        reason: "Cooperation dominant — increasing temptation to defect",
      });
    }

    // Rule 3: Short matches — increase complexity
    if (metrics.averageMatchDuration < 30) {
      if (gameType === GT.StrategyArena) {
        mutations.push({
          type: "increment",
          increment: 2,
          strategy: "strategyRoundCount",
          reason: "Matches too short — adding more rounds",
        });
      }
      if (gameType === GT.QuizBowl) {
        mutations.push({
          type: "increment",
          increment: 2,
          strategy: "quizQuestionCount",
          reason: "Matches too short — adding more questions",
        });
      }
    }

    // Rule 4: Conservative behavior — reduce timeouts
    if (metrics.averageStakeBehavior === "conservative") {
      if (gameType === GT.StrategyArena) {
        mutations.push({
          type: "scale",
          factor: 0.85,
          strategy: "strategyCommitTimeout",
          reason: "Conservative play — tightening commit timeouts",
        });
      }
      if (gameType === GT.AuctionWars) {
        mutations.push({
          type: "scale",
          factor: 0.85,
          strategy: "auctionBiddingDuration",
          reason: "Conservative play — shortening bidding windows",
        });
      }
    }

    // Rule 5: Aggressive behavior — increase safety margins
    if (metrics.averageStakeBehavior === "aggressive") {
      if (gameType === GT.StrategyArena) {
        mutations.push({
          type: "scale",
          factor: 1.15,
          strategy: "strategyRevealTimeout",
          reason: "Aggressive play — extending reveal timeout for safety",
        });
      }
      if (gameType === GT.AuctionWars) {
        mutations.push({
          type: "increment",
          increment: 5,
          strategy: "auctionMinBidPercent",
          reason: "Aggressive play — increasing minimum bid floor",
        });
      }
    }

    return mutations;
  }

  /**
   * Apply mutations to current parameters, respecting bounds.
   */
  applyMutations(
    currentParams: GameParameters,
    mutations: Mutation[]
  ): GameParameters {
    const updated = { ...currentParams };

    for (const m of mutations) {
      if (!m.strategy) continue;
      const key = m.strategy as keyof GameParameters;
      const currentValue = (updated[key] as number) ?? 0;
      const bounds = BOUNDS[m.strategy];

      let newValue: number;

      if (m.type === "scale" && m.factor !== undefined) {
        newValue = Math.round(currentValue * m.factor);
      } else if (m.type === "increment" && m.increment !== undefined) {
        newValue = currentValue + m.increment;
      } else {
        continue;
      }

      // Clamp to bounds
      if (bounds) {
        newValue = Math.max(bounds.min, Math.min(bounds.max, newValue));
      }

      (updated as Record<string, unknown>)[key] = newValue;
    }

    return updated;
  }

  /**
   * Full evolution step: analyze → mutate → apply → record.
   */
  async evolve(
    tournamentId: number,
    round: number,
    results: MatchResult[],
    gameType: GameType,
    currentParams: GameParameters,
    previousParamsHash: string
  ): Promise<{ newParams: GameParameters; newParamsHash: string; record: EvolutionRecord }> {
    const metrics = this.analyzeRound(results, gameType);
    const mutations = await this.determineMutations(metrics, gameType, currentParams, results, round);
    const newParams = this.applyMutations(currentParams, mutations);

    const newParamsHash = this.hashParameters(newParams);

    const record: EvolutionRecord = {
      tournamentId,
      round,
      previousParamsHash,
      newParamsHash,
      mutations,
      metrics,
      timestamp: Math.floor(Date.now() / 1000),
    };

    this.history.push(record);

    return { newParams, newParamsHash, record };
  }

  /**
   * Hash game parameters for on-chain storage.
   */
  hashParameters(params: GameParameters): string {
    const serialized = JSON.stringify(params, (_, v) =>
      typeof v === "bigint" ? v.toString() : v
    );
    return keccak256(toBytes(serialized));
  }

  /**
   * Get evolution history for a tournament.
   */
  getHistory(tournamentId: number): EvolutionRecord[] {
    return this.history.filter((r) => r.tournamentId === tournamentId);
  }

  /**
   * Classify strategies observed in a match result.
   */
  private classifyStrategies(result: MatchResult, gameType: GameType): string[] {
    const strategies: string[] = [];

    if (gameType === GT.StrategyArena) {
      for (const actions of [result.player1Actions, result.player2Actions]) {
        const moves = actions
          .filter((a) => a.type === "reveal")
          .map((a) => a.data.move as number);

        if (moves.length === 0) {
          strategies.push("timeout");
          continue;
        }

        const defectCount = moves.filter((m) => m === StrategyMove.Defect).length;
        const ratio = defectCount / moves.length;

        if (ratio >= 0.9) strategies.push("always_defect");
        else if (ratio <= 0.1) strategies.push("always_cooperate");
        else if (ratio >= 0.4 && ratio <= 0.6) strategies.push("tit_for_tat");
        else strategies.push("mixed");
      }
    } else if (gameType === GT.OracleDuel) {
      strategies.push(result.isUpset ? "contrarian" : "consensus");
    } else if (gameType === GT.AuctionWars) {
      // Classify by bid aggressiveness
      strategies.push(result.isDraw ? "conservative_bid" : "aggressive_bid");
    } else if (gameType === GT.QuizBowl) {
      strategies.push("quiz_standard");
    }

    return strategies;
  }
}
