import type {
  GameMode,
  GameParameters,
  PlayerAction,
  ActionResult,
  MatchState,
  MatchOutcome,
  OracleDuelData,
  TokenInfo,
} from "./game-mode.interface";
import { GameType } from "./game-mode.interface";
import { MonadContractClient } from "../monad/contract-client";
import { NadFunClient } from "../monad/nadfun-client";
import { keccak256, toBytes, encodePacked } from "viem";

interface DuelState {
  matchId: number;
  players: string[];
  params: GameParameters;
  tokenAddress: string;
  tokenSymbol: string;
  snapshotPrice: bigint;
  bullPlayer: string;
  bearPlayer: string;
  durationSeconds: number;
  startTime: number;
  resolved: boolean;
  resolvedPrice: bigint | null;
  winner: string | null;
}

export class OracleDuelEngine implements GameMode {
  readonly gameType = GameType.OracleDuel;
  private duels = new Map<number, DuelState>();
  private contractClient: MonadContractClient;
  private nadFunClient: NadFunClient;

  constructor(contractClient: MonadContractClient, nadFunClient: NadFunClient) {
    this.contractClient = contractClient;
    this.nadFunClient = nadFunClient;
  }

  async initMatch(
    matchId: number,
    players: string[],
    params: GameParameters
  ): Promise<void> {
    if (players.length !== 2) {
      throw new Error("Oracle Duel requires exactly 2 players");
    }

    // Select a token
    const token = await this.selectToken(params);
    if (!token) {
      throw new Error("No eligible token found for Oracle Duel");
    }

    // Assign positions
    const [bullPlayer, bearPlayer] = this.assignPositions(players, params);

    const duration = params.oracleDuelDuration ?? 300;

    // Get snapshot price
    const snapshotPrice = await this.nadFunClient.getTokenPrice(token.address);

    // Initialize on-chain
    await this.contractClient.initDuel(
      matchId,
      token.address,
      snapshotPrice,
      duration,
      bullPlayer,
      bearPlayer
    );

    const state: DuelState = {
      matchId,
      players,
      params,
      tokenAddress: token.address,
      tokenSymbol: token.symbol,
      snapshotPrice,
      bullPlayer,
      bearPlayer,
      durationSeconds: duration,
      startTime: Math.floor(Date.now() / 1000),
      resolved: false,
      resolvedPrice: null,
      winner: null,
    };

    this.duels.set(matchId, state);
  }

  async processAction(
    matchId: number,
    player: string,
    action: PlayerAction
  ): Promise<ActionResult> {
    // Oracle Duel has no player actions — outcome is determined by price movement
    return {
      accepted: false,
      error: "Oracle Duel does not accept player actions. Outcome is determined by price.",
    };
  }

  async isResolvable(matchId: number): Promise<boolean> {
    const state = this.duels.get(matchId);
    if (!state || state.resolved) return false;

    const now = Math.floor(Date.now() / 1000);
    return now >= state.startTime + state.durationSeconds;
  }

  async resolve(matchId: number): Promise<MatchOutcome> {
    const state = this.duels.get(matchId);
    if (!state) throw new Error(`Duel ${matchId} not found`);
    if (state.resolved) throw new Error(`Duel ${matchId} already resolved`);

    // Get current price
    const currentPrice = await this.nadFunClient.getTokenPrice(state.tokenAddress);

    // Resolve on-chain
    await this.contractClient.resolveDuel(matchId, currentPrice);

    // Determine winner
    let winner: string | null = null;
    if (currentPrice > state.snapshotPrice) {
      winner = state.bullPlayer; // Price went up, bull wins
    } else if (currentPrice < state.snapshotPrice) {
      winner = state.bearPlayer; // Price went down, bear wins
    }
    // null = draw (price unchanged)

    state.resolved = true;
    state.resolvedPrice = currentPrice;
    state.winner = winner;

    const scores = new Map<string, number>();
    scores.set(state.bullPlayer, winner === state.bullPlayer ? 1 : 0);
    scores.set(state.bearPlayer, winner === state.bearPlayer ? 1 : 0);

    const priceDelta = currentPrice - state.snapshotPrice;
    const resultData: Record<string, unknown> = {
      tokenAddress: state.tokenAddress,
      tokenSymbol: state.tokenSymbol,
      snapshotPrice: state.snapshotPrice.toString(),
      resolvedPrice: currentPrice.toString(),
      priceDelta: priceDelta.toString(),
      bullPlayer: state.bullPlayer,
      bearPlayer: state.bearPlayer,
    };

    const resultHash = keccak256(
      encodePacked(
        ["uint256", "address", "uint256", "uint256"],
        [
          BigInt(matchId),
          (winner || state.bullPlayer) as `0x${string}`,
          state.snapshotPrice,
          currentPrice,
        ]
      )
    );

    return {
      matchId,
      winner,
      scores,
      resultData,
      resultHash,
    };
  }

  async getState(matchId: number): Promise<MatchState> {
    const state = this.duels.get(matchId);
    if (!state) throw new Error(`Duel ${matchId} not found`);

    const now = Math.floor(Date.now() / 1000);
    const elapsed = now - state.startTime;
    const remaining = Math.max(0, state.durationSeconds - elapsed);

    return {
      matchId,
      gameType: GameType.OracleDuel,
      status: state.resolved ? "completed" : remaining > 0 ? "in_progress" : "ready_to_resolve",
      data: {
        tokenAddress: state.tokenAddress,
        tokenSymbol: state.tokenSymbol,
        snapshotPrice: state.snapshotPrice.toString(),
        bullPlayer: state.bullPlayer,
        bearPlayer: state.bearPlayer,
        durationSeconds: state.durationSeconds,
        elapsed,
        remaining,
        resolved: state.resolved,
        resolvedPrice: state.resolvedPrice?.toString() ?? null,
        winner: state.winner,
      },
    };
  }

  validateParameters(params: GameParameters): boolean {
    const duration = params.oracleDuelDuration ?? 300;
    if (duration < 60 || duration > 3600) return false;

    const minVol = params.oracleMinVolatility ?? 0;
    const maxVol = params.oracleMaxVolatility ?? 200;
    if (minVol < 0 || maxVol > 200 || minVol > maxVol) return false;

    return true;
  }

  /**
   * Select a token for the duel based on parameters.
   */
  private async selectToken(params: GameParameters): Promise<TokenInfo | null> {
    const minVol = params.oracleMinVolatility ?? 5;
    const maxVol = params.oracleMaxVolatility ?? 100;

    // Get a random active token with decent liquidity
    const token = await this.nadFunClient.getRandomActiveToken(
      BigInt(10e18), // min 10 MON liquidity
      86400 // traded in last 24h
    );

    if (!token) return null;

    // Filter by volatility if available
    if (token.hourlyVolatility !== undefined) {
      if (token.hourlyVolatility < minVol || token.hourlyVolatility > maxVol) {
        // Try fetching by volume instead
        const byVolume = await this.nadFunClient.getTokensByVolume(20);
        const eligible = byVolume.filter(
          (t) =>
            t.hourlyVolatility !== undefined &&
            t.hourlyVolatility >= minVol &&
            t.hourlyVolatility <= maxVol
        );
        if (eligible.length > 0) {
          return eligible[Math.floor(Math.random() * eligible.length)];
        }
      }
    }

    return token;
  }

  /**
   * Assign bull/bear positions based on parameters.
   */
  private assignPositions(
    players: string[],
    params: GameParameters
  ): [string, string] {
    const method = params.oraclePositionMethod ?? "random";

    switch (method) {
      case "random": {
        const idx = Math.random() < 0.5 ? 0 : 1;
        return [players[idx], players[1 - idx]];
      }
      case "alternating":
        // Caller should track alternation state externally
        return [players[0], players[1]];
      case "bid":
        // Bid-based assignment would require additional action processing
        return [players[0], players[1]];
      default:
        return [players[0], players[1]];
    }
  }
}
