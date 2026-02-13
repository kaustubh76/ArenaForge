import type {
  GameMode,
  GameParameters,
  PlayerAction,
  ActionResult,
  MatchState,
  MatchOutcome,
  MysteryBox,
  BoxHint,
  TokenInfo,
} from "./game-mode.interface";
import { GameType } from "./game-mode.interface";
import { NadFunClient } from "../monad/nadfun-client";
import { keccak256, toBytes, encodePacked } from "viem";

interface AuctionRound {
  roundNumber: number;
  box: MysteryBox;
  commitDeadline: number;
  revealDeadline: number;
  commits: Map<string, string>; // player -> commitHash
  bids: Map<string, bigint>; // player -> revealed bid
  resolved: boolean;
  winner: string | null;
  actualValue: bigint;
  scores: Map<string, number>; // score = actualValue - bid (closer is better)
}

interface AuctionState {
  matchId: number;
  players: string[];
  params: GameParameters;
  currentRound: number;
  totalRounds: number;
  rounds: AuctionRound[];
  totalScores: Map<string, number>;
  completed: boolean;
  winner: string | null;
}

export class AuctionWarsEngine implements GameMode {
  readonly gameType = GameType.AuctionWars;
  private matches = new Map<number, AuctionState>();
  private nadFunClient: NadFunClient;

  constructor(nadFunClient: NadFunClient) {
    this.nadFunClient = nadFunClient;
  }

  async initMatch(
    matchId: number,
    players: string[],
    params: GameParameters
  ): Promise<void> {
    if (players.length < 2 || players.length > 8) {
      throw new Error("Auction Wars requires 2-8 players");
    }

    const totalRounds = params.auctionBoxCount ?? 3;

    // Generate the first mystery box
    const box = await this.generateMysteryBox(params);

    const biddingDuration = params.auctionBiddingDuration ?? 60;
    const now = Math.floor(Date.now() / 1000);

    const firstRound: AuctionRound = {
      roundNumber: 1,
      box,
      commitDeadline: now + biddingDuration,
      revealDeadline: now + biddingDuration + 30,
      commits: new Map(),
      bids: new Map(),
      resolved: false,
      winner: null,
      actualValue: box.positionValue,
      scores: new Map(),
    };

    const totalScores = new Map<string, number>();
    for (const p of players) {
      totalScores.set(p, 0);
    }

    const state: AuctionState = {
      matchId,
      players,
      params,
      currentRound: 1,
      totalRounds,
      rounds: [firstRound],
      totalScores,
      completed: false,
      winner: null,
    };

    this.matches.set(matchId, state);
  }

  async processAction(
    matchId: number,
    player: string,
    action: PlayerAction
  ): Promise<ActionResult> {
    const state = this.matches.get(matchId);
    if (!state) return { accepted: false, error: "Match not found" };
    if (state.completed) return { accepted: false, error: "Match completed" };
    if (!state.players.includes(player)) return { accepted: false, error: "Not a participant" };

    const round = state.rounds[state.currentRound - 1];
    if (!round) return { accepted: false, error: "Invalid round" };

    const now = Math.floor(Date.now() / 1000);

    switch (action.type) {
      case "commit_bid": {
        if (now > round.commitDeadline) {
          return { accepted: false, error: "Commit deadline passed" };
        }
        if (round.commits.has(player)) {
          return { accepted: false, error: "Already committed" };
        }

        const commitHash = action.data.commitHash as string;
        if (!commitHash) return { accepted: false, error: "Missing commitHash" };

        round.commits.set(player, commitHash);
        return { accepted: true };
      }

      case "reveal_bid": {
        if (now > round.revealDeadline) {
          return { accepted: false, error: "Reveal deadline passed" };
        }
        if (!round.commits.has(player)) {
          return { accepted: false, error: "Must commit before revealing" };
        }
        if (round.bids.has(player)) {
          return { accepted: false, error: "Already revealed" };
        }

        const bidAmount = BigInt(String(action.data.bidAmount || "0"));
        const minBidPercent = state.params.auctionMinBidPercent ?? 10;
        const minBid = (round.box.positionValue * BigInt(minBidPercent)) / BigInt(100);

        if (bidAmount < minBid) {
          return { accepted: false, error: `Bid below minimum (${minBidPercent}% of estimated value)` };
        }

        round.bids.set(player, bidAmount);

        // If all committed players have revealed, resolve
        if (round.bids.size === round.commits.size) {
          this.resolveAuctionRound(state);
        }

        return { accepted: true };
      }

      default:
        return { accepted: false, error: `Unknown action: ${action.type}` };
    }
  }

  async isResolvable(matchId: number): Promise<boolean> {
    const state = this.matches.get(matchId);
    if (!state || state.completed) return false;

    const round = state.rounds[state.currentRound - 1];
    if (!round || round.resolved) return false;

    // All bids revealed
    if (round.bids.size === round.commits.size && round.commits.size > 0) {
      return true;
    }

    // Reveal deadline passed
    const now = Math.floor(Date.now() / 1000);
    return now > round.revealDeadline && round.commits.size > 0;
  }

  async resolve(matchId: number): Promise<MatchOutcome> {
    const state = this.matches.get(matchId);
    if (!state) throw new Error(`Match ${matchId} not found`);

    // Resolve current round if not done
    const round = state.rounds[state.currentRound - 1];
    if (round && !round.resolved) {
      this.resolveAuctionRound(state);
    }

    // If all rounds done, determine overall winner
    if (!state.completed && state.currentRound > state.totalRounds) {
      state.completed = true;

      let bestPlayer: string | null = null;
      let bestScore = -Infinity;

      for (const [player, score] of state.totalScores) {
        if (score > bestScore) {
          bestScore = score;
          bestPlayer = player;
        }
      }

      state.winner = bestPlayer;
    }

    const scores = new Map<string, number>();
    for (const [p, s] of state.totalScores) {
      scores.set(p, s);
    }

    const resultHash = keccak256(
      toBytes(
        JSON.stringify({
          matchId,
          scores: Object.fromEntries(state.totalScores),
          winner: state.winner,
        })
      )
    );

    return {
      matchId,
      winner: state.winner,
      scores,
      resultData: {
        rounds: state.rounds.map((r) => ({
          roundNumber: r.roundNumber,
          boxId: r.box.id,
          actualValue: r.box.positionValue.toString(),
          bids: Object.fromEntries(
            Array.from(r.bids.entries()).map(([p, b]) => [p, b.toString()])
          ),
          winner: r.winner,
          scores: Object.fromEntries(r.scores),
        })),
      },
      resultHash,
    };
  }

  async getState(matchId: number): Promise<MatchState> {
    const state = this.matches.get(matchId);
    if (!state) throw new Error(`Match ${matchId} not found`);

    const round = state.rounds[state.currentRound - 1];

    return {
      matchId,
      gameType: GameType.AuctionWars,
      status: state.completed ? "completed" : "in_progress",
      data: {
        currentRound: state.currentRound,
        totalRounds: state.totalRounds,
        currentBox: round
          ? {
              id: round.box.id,
              hints: round.box.hints,
              commitDeadline: round.commitDeadline,
              revealDeadline: round.revealDeadline,
              committed: Array.from(round.commits.keys()),
              revealed: Array.from(round.bids.keys()),
            }
          : null,
        scores: Object.fromEntries(state.totalScores),
      },
    };
  }

  validateParameters(params: GameParameters): boolean {
    const boxCount = params.auctionBoxCount ?? 3;
    if (boxCount < 1 || boxCount > 5) return false;

    const biddingDuration = params.auctionBiddingDuration ?? 60;
    if (biddingDuration < 30 || biddingDuration > 300) return false;

    const hintCount = params.auctionHintCount ?? 2;
    if (hintCount < 1 || hintCount > 4) return false;

    const minBid = params.auctionMinBidPercent ?? 10;
    if (minBid < 5 || minBid > 50) return false;

    return true;
  }

  // --- Internal ---

  private resolveAuctionRound(state: AuctionState): void {
    const round = state.rounds[state.currentRound - 1];
    if (!round || round.resolved) return;

    const actualValue = round.actualValue;

    // Score each bidder: closer to actual value is better
    // Score = -(abs(bid - actualValue)) so higher is better
    let bestPlayer: string | null = null;
    let bestDiff = BigInt(Number.MAX_SAFE_INTEGER);

    for (const [player, bid] of round.bids) {
      const diff = bid > actualValue ? bid - actualValue : actualValue - bid;
      const score = -Number(diff / BigInt(1e14)); // Scale down for readability
      round.scores.set(player, score);

      const prev = state.totalScores.get(player) || 0;
      state.totalScores.set(player, prev + score);

      if (diff < bestDiff) {
        bestDiff = diff;
        bestPlayer = player;
      }
    }

    // Players who committed but didn't reveal get a penalty
    for (const [player] of round.commits) {
      if (!round.bids.has(player)) {
        const penalty = -1000;
        round.scores.set(player, penalty);
        const prev = state.totalScores.get(player) || 0;
        state.totalScores.set(player, prev + penalty);
      }
    }

    round.winner = bestPlayer;
    round.resolved = true;

    // Advance to next round
    if (state.currentRound < state.totalRounds) {
      state.currentRound++;
      this.startNextRound(state);
    } else {
      state.currentRound++;
    }
  }

  private async startNextRound(state: AuctionState): Promise<void> {
    const box = await this.generateMysteryBox(state.params);
    const biddingDuration = state.params.auctionBiddingDuration ?? 60;
    const now = Math.floor(Date.now() / 1000);

    state.rounds.push({
      roundNumber: state.currentRound,
      box,
      commitDeadline: now + biddingDuration,
      revealDeadline: now + biddingDuration + 30,
      commits: new Map(),
      bids: new Map(),
      resolved: false,
      winner: null,
      actualValue: box.positionValue,
      scores: new Map(),
    });
  }

  private async generateMysteryBox(params: GameParameters): Promise<MysteryBox> {
    const hintCount = params.auctionHintCount ?? 2;

    // Try to get a real token for the box
    let token: TokenInfo | null = null;
    try {
      token = await this.nadFunClient.getRandomActiveToken();
    } catch {
      // Fallback to synthetic box
    }

    const hints: BoxHint[] = [];
    if (token) {
      // Generate hints from real token data
      const possibleHints: BoxHint[] = [
        { type: "category", value: token.graduated ? "graduated" : "bonding_curve" },
        {
          type: "marketCapRange",
          value: categorizeMarketCap(token.marketCap),
        },
        {
          type: "tradeCount",
          value: token.volume24h > BigInt(100e18) ? "high_volume" : "low_volume",
        },
        {
          type: "age",
          value: categorizeAge(token.lastTradeTimestamp),
        },
      ];

      // Select random hints up to hintCount
      const shuffled = possibleHints.sort(() => Math.random() - 0.5);
      for (let i = 0; i < Math.min(hintCount, shuffled.length); i++) {
        hints.push(shuffled[i]);
      }

      return {
        id: `box-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        tokenAddress: token.address,
        positionValue: token.price,
        hints,
        createdAt: Math.floor(Date.now() / 1000),
      };
    }

    // Fallback: synthetic mystery box
    const syntheticValue = BigInt(Math.floor(Math.random() * 100)) * BigInt(1e18);
    hints.push({ type: "category", value: "synthetic" });
    hints.push({ type: "marketCapRange", value: "unknown" });

    return {
      id: `box-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tokenAddress: "0x0000000000000000000000000000000000000000",
      positionValue: syntheticValue,
      hints,
      createdAt: Math.floor(Date.now() / 1000),
    };
  }
}

function categorizeMarketCap(cap: bigint): string {
  const eth = cap / BigInt(1e18);
  if (eth < BigInt(100)) return "micro";
  if (eth < BigInt(1000)) return "small";
  if (eth < BigInt(10000)) return "medium";
  return "large";
}

function categorizeAge(lastTrade: number): string {
  const age = Math.floor(Date.now() / 1000) - lastTrade;
  if (age < 3600) return "very_recent";
  if (age < 86400) return "recent";
  if (age < 604800) return "established";
  return "mature";
}
