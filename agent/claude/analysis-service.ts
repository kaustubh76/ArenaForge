import { ClaudeClient, ThinkingResponse } from "./client";
import { stableJsonKey } from "../utils/normalize";
import {
  EVOLUTION_SYSTEM_PROMPT,
  COMMENTARY_SYSTEM_PROMPT,
  TOKEN_SELECTION_SYSTEM_PROMPT,
  buildEvolutionUserPrompt,
  buildCommentaryPrompt,
  buildTokenSelectionPrompt,
} from "./prompts";
import type {
  EvolutionMetrics,
  GameParameters,
  Mutation,
  MatchResult,
  GameType,
  TokenInfo,
} from "../game-engine/game-mode.interface";
import { GameType as GT } from "../game-engine/game-mode.interface";

// Thinking budgets for different analysis types
const THINKING_BUDGETS = {
  evolution: 8000,
  commentary: 3000,
  tokenSelection: 5000,
};

// Cache entry interface
interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttlMs: number;
}

// Analysis result interfaces
export interface EvolutionAnalysisResult {
  mutations: Mutation[];
  reasoning: string;
  confidence: number;
  fromCache: boolean;
  thinkingLog?: string;
  latencyMs?: number;
}

export interface CommentaryResult {
  text: string;
  fromCache: boolean;
  latencyMs?: number;
}

export interface TokenSelectionResult {
  symbol: string;
  reason: string;
  fromCache: boolean;
  latencyMs?: number;
}

// Circuit breaker state
interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

export class ClaudeAnalysisService {
  private client: ClaudeClient | null = null;
  private enabled: boolean;
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private circuitBreaker: CircuitBreakerState = {
    failures: 0,
    lastFailure: 0,
    isOpen: false,
  };

  private readonly CIRCUIT_THRESHOLD = 3;
  private readonly CIRCUIT_RESET_MS = 300000; // 5 minutes
  private readonly CACHE_TTL_MS = 300000; // 5 minutes

  private logThinking: boolean;
  private logTokenUsage: boolean;

  constructor(config?: { enabled?: boolean }) {
    this.enabled = config?.enabled ?? process.env.CLAUDE_ENABLED === "true";
    this.logThinking = process.env.CLAUDE_LOG_THINKING === "true";
    this.logTokenUsage = process.env.CLAUDE_LOG_TOKENS !== "false";

    if (this.enabled) {
      try {
        this.client = new ClaudeClient();
      } catch (error) {
        console.warn("[ClaudeAnalysis] Failed to initialize client:", error);
        this.enabled = false;
      }
    }
  }

  isEnabled(): boolean {
    return this.enabled && this.client !== null;
  }

  async analyzeEvolution(
    metrics: EvolutionMetrics,
    gameType: GameType,
    currentParams: GameParameters,
    recentHistory: MatchResult[],
    currentRound: number = 1
  ): Promise<EvolutionAnalysisResult | null> {
    if (!this.isEnabled() || this.isCircuitOpen()) {
      return null;
    }

    const cacheKey = this.computeEvolutionCacheKey(metrics, gameType);
    const cached = this.getFromCache<Mutation[]>(cacheKey);
    if (cached) {
      return {
        mutations: cached,
        reasoning: "cached result",
        confidence: 1,
        fromCache: true,
      };
    }

    try {
      const gameTypeName = this.gameTypeToString(gameType);
      const userPrompt = buildEvolutionUserPrompt(
        gameTypeName,
        currentRound,
        {
          drawRate: metrics.drawRate,
          dominantStrategy: metrics.dominantStrategy,
          averageMatchDuration: metrics.averageMatchDuration,
          averageStakeBehavior: metrics.averageStakeBehavior,
          strategyDistribution: metrics.strategyDistribution,
        },
        currentParams as Record<string, unknown>,
        recentHistory.slice(-10).map((r) => ({
          matchId: r.matchId,
          winner: r.winner,
          isDraw: r.isDraw,
        }))
      );

      const response = await this.client!.analyzeWithThinking(
        EVOLUTION_SYSTEM_PROMPT,
        userPrompt,
        THINKING_BUDGETS.evolution
      );

      this.logResponse("Evolution", response);

      const parsed = this.parseMutationsFromResponse(response.response, gameType);
      if (parsed.mutations.length > 0) {
        this.setCache(cacheKey, parsed.mutations);
      }

      this.onSuccess();

      return {
        mutations: parsed.mutations,
        reasoning: parsed.summary,
        confidence: parsed.confidence,
        fromCache: false,
        thinkingLog: this.logThinking ? response.thinking : undefined,
        latencyMs: response.latencyMs,
      };
    } catch (error) {
      this.onFailure(error);
      console.error("[ClaudeAnalysis] Evolution analysis failed:", error);
      return null;
    }
  }

  async generateCommentary(
    context: "pre_match" | "post_match" | "evolution" | "tournament_complete",
    data: Record<string, unknown>
  ): Promise<CommentaryResult | null> {
    if (!this.isEnabled() || this.isCircuitOpen()) {
      return null;
    }

    const cacheKey = `commentary:${context}:${stableJsonKey(data as Record<string, unknown>)}`;
    const cached = this.getFromCache<string>(cacheKey);
    if (cached) {
      return { text: cached, fromCache: true };
    }

    try {
      const userPrompt = buildCommentaryPrompt(context, data);
      const response = await this.client!.analyzeWithThinking(
        COMMENTARY_SYSTEM_PROMPT,
        userPrompt,
        THINKING_BUDGETS.commentary
      );

      this.logResponse("Commentary", response);
      this.setCache(cacheKey, response.response);
      this.onSuccess();

      return {
        text: response.response,
        fromCache: false,
        latencyMs: response.latencyMs,
      };
    } catch (error) {
      this.onFailure(error);
      console.error("[ClaudeAnalysis] Commentary generation failed:", error);
      return null;
    }
  }

  async selectTokenForDuel(
    tokens: TokenInfo[],
    params: { oracleMinVolatility?: number; oracleMaxVolatility?: number; oracleDuelDuration?: number }
  ): Promise<TokenSelectionResult | null> {
    if (!this.isEnabled() || this.isCircuitOpen()) {
      return null;
    }

    try {
      const tokenData = tokens.map((t) => ({
        symbol: t.symbol,
        price: Number(t.price) / 1e18,
        volume24h: Number(t.volume24h) / 1e18,
        hourlyVolatility: t.hourlyVolatility || 5,
      }));

      const userPrompt = buildTokenSelectionPrompt(tokenData, {
        minVolatility: params.oracleMinVolatility || 1,
        maxVolatility: params.oracleMaxVolatility || 50,
        duration: params.oracleDuelDuration || 300,
      });

      const response = await this.client!.analyzeWithThinking(
        TOKEN_SELECTION_SYSTEM_PROMPT,
        userPrompt,
        THINKING_BUDGETS.tokenSelection
      );

      this.logResponse("TokenSelection", response);
      this.onSuccess();

      const parsed = this.parseTokenSelectionResponse(response.response);
      return {
        symbol: parsed.selectedSymbol,
        reason: parsed.reason,
        fromCache: false,
        latencyMs: response.latencyMs,
      };
    } catch (error) {
      this.onFailure(error);
      console.error("[ClaudeAnalysis] Token selection failed:", error);
      return null;
    }
  }

  // --- Private Helpers ---

  private gameTypeToString(gameType: GameType): string {
    switch (gameType) {
      case GT.OracleDuel:
        return "OracleDuel";
      case GT.StrategyArena:
        return "StrategyArena";
      case GT.AuctionWars:
        return "AuctionWars";
      case GT.QuizBowl:
        return "QuizBowl";
      default:
        return "Unknown";
    }
  }

  private computeEvolutionCacheKey(metrics: EvolutionMetrics, gameType: GameType): string {
    const key = {
      gameType,
      drawRateBucket: Math.floor(metrics.drawRate * 10),
      dominantStrategy: metrics.dominantStrategy,
      stakeBehavior: metrics.averageStakeBehavior,
    };
    return `evolution:${stableJsonKey(key as Record<string, unknown>)}`;
  }

  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  private setCache<T>(key: string, value: T, ttlMs?: number): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttlMs: ttlMs || this.CACHE_TTL_MS,
    });
  }

  private parseMutationsFromResponse(
    response: string,
    gameType: GameType
  ): { mutations: Mutation[]; confidence: number; summary: string } {
    try {
      // Extract JSON from response (may be wrapped in markdown code blocks)
      let jsonStr = response;
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonStr);
      const mutations: Mutation[] = [];

      if (Array.isArray(parsed.mutations)) {
        for (const m of parsed.mutations) {
          if (m.type && m.strategy && m.reason) {
            const mutation: Mutation = {
              type: m.type,
              strategy: m.strategy,
              reason: m.reason,
            };
            if (m.type === "scale" && typeof m.factor === "number") {
              mutation.factor = m.factor;
            }
            if (m.type === "increment" && typeof m.increment === "number") {
              mutation.increment = m.increment;
            }
            mutations.push(mutation);
          }
        }
      }

      return {
        mutations,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
        summary: typeof parsed.summary === "string" ? parsed.summary : "",
      };
    } catch (error) {
      console.warn("[ClaudeAnalysis] Failed to parse mutations response:", error);
      return { mutations: [], confidence: 0, summary: "" };
    }
  }

  private parseTokenSelectionResponse(response: string): { selectedSymbol: string; reason: string } {
    try {
      let jsonStr = response;
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonStr);
      return {
        selectedSymbol: parsed.selectedSymbol || "",
        reason: parsed.reason || "",
      };
    } catch (error) {
      console.warn("[ClaudeAnalysis] Failed to parse token selection response:", error);
      return { selectedSymbol: "", reason: "" };
    }
  }

  private logResponse(type: string, response: ThinkingResponse): void {
    if (this.logTokenUsage) {
      console.log(
        `[ClaudeAnalysis] ${type}: ${response.inputTokens} in, ${response.outputTokens} out, ${response.latencyMs}ms`
      );
    }
    if (this.logThinking && response.thinking) {
      console.log(`[ClaudeAnalysis] ${type} thinking:\n${response.thinking.slice(0, 500)}...`);
    }
  }

  // --- Circuit Breaker ---

  private isCircuitOpen(): boolean {
    if (!this.circuitBreaker.isOpen) return false;

    // Check if reset time has passed
    if (Date.now() - this.circuitBreaker.lastFailure > this.CIRCUIT_RESET_MS) {
      this.circuitBreaker.isOpen = false;
      this.circuitBreaker.failures = 0;
      console.log("[ClaudeAnalysis] Circuit breaker reset");
      return false;
    }

    return true;
  }

  private onSuccess(): void {
    this.circuitBreaker.failures = 0;
    this.circuitBreaker.isOpen = false;
  }

  private onFailure(error: unknown): void {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailure = Date.now();

    if (this.circuitBreaker.failures >= this.CIRCUIT_THRESHOLD) {
      this.circuitBreaker.isOpen = true;
      console.warn(
        `[ClaudeAnalysis] Circuit breaker opened after ${this.CIRCUIT_THRESHOLD} failures`
      );
    }
  }
}

// Singleton access for the ClaudeAnalysisService
let analysisServiceInstance: ClaudeAnalysisService | null = null;

export function setClaudeAnalysisService(svc: ClaudeAnalysisService): void {
  analysisServiceInstance = svc;
}

export function getClaudeAnalysisService(): ClaudeAnalysisService | null {
  return analysisServiceInstance;
}
