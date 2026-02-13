import type {
  GameMode,
  GameParameters,
  PlayerAction,
  ActionResult,
  MatchState,
  MatchOutcome,
  StrategyRound,
} from "./game-mode.interface";
import { GameType, StrategyMove } from "./game-mode.interface";
import { keccak256, toBytes, encodePacked } from "viem";

interface StrategyState {
  matchId: number;
  players: [string, string];
  params: GameParameters;
  totalRounds: number;
  currentRound: number;
  rounds: StrategyRound[];
  player1TotalPayoff: number;
  player2TotalPayoff: number;
  commitDeadline: number;
  revealDeadline: number;
  completed: boolean;
  winner: string | null;
}

// Default payoff matrix (basis points)
const DEFAULT_PAYOFFS = {
  CC: 6000, // Both cooperate
  DC: 10000, // Defector's payoff
  CD: 0, // Cooperator's payoff (exploited)
  DD: 2000, // Both defect
};

export class StrategyArenaEngine implements GameMode {
  readonly gameType = GameType.StrategyArena;
  private matches = new Map<number, StrategyState>();

  async initMatch(
    matchId: number,
    players: string[],
    params: GameParameters
  ): Promise<void> {
    if (players.length !== 2) {
      throw new Error("Strategy Arena requires exactly 2 players");
    }

    const totalRounds = params.strategyRoundCount ?? 5;
    const commitTimeout = params.strategyCommitTimeout ?? 60;
    const now = Math.floor(Date.now() / 1000);

    const state: StrategyState = {
      matchId,
      players: [players[0], players[1]],
      params,
      totalRounds,
      currentRound: 1,
      rounds: [],
      player1TotalPayoff: 0,
      player2TotalPayoff: 0,
      commitDeadline: now + commitTimeout,
      revealDeadline: 0,
      completed: false,
      winner: null,
    };

    // Initialize first round
    state.rounds.push(this.createRound(1));
    this.matches.set(matchId, state);
  }

  async processAction(
    matchId: number,
    player: string,
    action: PlayerAction
  ): Promise<ActionResult> {
    const state = this.matches.get(matchId);
    if (!state) return { accepted: false, error: "Match not found" };
    if (state.completed) return { accepted: false, error: "Match already completed" };

    const playerIdx = state.players.indexOf(player);
    if (playerIdx === -1) return { accepted: false, error: "Player not in this match" };

    const round = state.rounds[state.currentRound - 1];
    if (!round) return { accepted: false, error: "Invalid round state" };

    const now = Math.floor(Date.now() / 1000);

    switch (action.type) {
      case "commit": {
        if (now > state.commitDeadline) {
          return { accepted: false, error: "Commit deadline passed" };
        }

        const commitHash = action.data.commitHash as string;
        if (!commitHash) {
          return { accepted: false, error: "Missing commitHash" };
        }

        if (playerIdx === 0) {
          if (round.player1Committed) return { accepted: false, error: "Already committed" };
          round.player1Committed = true;
        } else {
          if (round.player2Committed) return { accepted: false, error: "Already committed" };
          round.player2Committed = true;
        }

        // If both committed, set reveal deadline
        if (round.player1Committed && round.player2Committed) {
          const revealTimeout = state.params.strategyRevealTimeout ?? 30;
          state.revealDeadline = Math.floor(Date.now() / 1000) + revealTimeout;
        }

        return { accepted: true };
      }

      case "reveal": {
        if (!round.player1Committed || !round.player2Committed) {
          return { accepted: false, error: "Both players must commit before revealing" };
        }
        if (state.revealDeadline > 0 && now > state.revealDeadline) {
          return { accepted: false, error: "Reveal deadline passed" };
        }

        const move = action.data.move as number;
        if (move !== StrategyMove.Cooperate && move !== StrategyMove.Defect) {
          return { accepted: false, error: "Invalid move (must be Cooperate or Defect)" };
        }

        if (playerIdx === 0) {
          if (round.player1Revealed) return { accepted: false, error: "Already revealed" };
          round.player1Move = move;
          round.player1Revealed = true;
        } else {
          if (round.player2Revealed) return { accepted: false, error: "Already revealed" };
          round.player2Move = move;
          round.player2Revealed = true;
        }

        // If both revealed, resolve the round
        if (round.player1Revealed && round.player2Revealed) {
          this.resolveRound(state);
        }

        return { accepted: true };
      }

      default:
        return { accepted: false, error: `Unknown action type: ${action.type}` };
    }
  }

  async isResolvable(matchId: number): Promise<boolean> {
    const state = this.matches.get(matchId);
    if (!state || state.completed) return false;

    const round = state.rounds[state.currentRound - 1];
    if (!round) return false;

    // Resolvable if both revealed
    if (round.player1Revealed && round.player2Revealed && !round.resolved) {
      return true;
    }

    // Resolvable if timeout expired (forfeit)
    const now = Math.floor(Date.now() / 1000);
    if (now > state.commitDeadline && (!round.player1Committed || !round.player2Committed)) {
      return true;
    }
    if (state.revealDeadline > 0 && now > state.revealDeadline) {
      return true;
    }

    return false;
  }

  async resolve(matchId: number): Promise<MatchOutcome> {
    const state = this.matches.get(matchId);
    if (!state) throw new Error(`Match ${matchId} not found`);

    // Handle timeout forfeit if needed
    const now = Math.floor(Date.now() / 1000);
    const round = state.rounds[state.currentRound - 1];

    if (round && !round.resolved) {
      // Check for commit timeout
      if (now > state.commitDeadline) {
        if (!round.player1Committed && round.player2Committed) {
          // Player 1 forfeits
          state.completed = true;
          state.winner = state.players[1];
        } else if (round.player1Committed && !round.player2Committed) {
          state.completed = true;
          state.winner = state.players[0];
        } else if (!round.player1Committed && !round.player2Committed) {
          // Both forfeit — draw
          state.completed = true;
          state.winner = null;
        }
      }

      // Check for reveal timeout
      if (state.revealDeadline > 0 && now > state.revealDeadline) {
        if (!round.player1Revealed && round.player2Revealed) {
          state.completed = true;
          state.winner = state.players[1];
        } else if (round.player1Revealed && !round.player2Revealed) {
          state.completed = true;
          state.winner = state.players[0];
        }
      }

      // Normal resolution
      if (round.player1Revealed && round.player2Revealed && !round.resolved) {
        this.resolveRound(state);
      }
    }

    // If all rounds completed, determine winner
    if (!state.completed && state.currentRound > state.totalRounds) {
      state.completed = true;
      if (state.player1TotalPayoff > state.player2TotalPayoff) {
        state.winner = state.players[0];
      } else if (state.player2TotalPayoff > state.player1TotalPayoff) {
        state.winner = state.players[1];
      } else {
        state.winner = null; // Draw
      }
    }

    const scores = new Map<string, number>();
    scores.set(state.players[0], state.player1TotalPayoff);
    scores.set(state.players[1], state.player2TotalPayoff);

    const resultHash = keccak256(
      encodePacked(
        ["uint256", "int256", "int256"],
        [BigInt(matchId), BigInt(state.player1TotalPayoff), BigInt(state.player2TotalPayoff)]
      )
    );

    return {
      matchId,
      winner: state.winner,
      scores,
      resultData: {
        rounds: state.rounds.map((r) => ({
          round: r.round,
          player1Move: r.player1Move,
          player2Move: r.player2Move,
          player1Payoff: r.player1Payoff,
          player2Payoff: r.player2Payoff,
        })),
        totalRounds: state.totalRounds,
        player1TotalPayoff: state.player1TotalPayoff,
        player2TotalPayoff: state.player2TotalPayoff,
      },
      resultHash,
    };
  }

  async getState(matchId: number): Promise<MatchState> {
    const state = this.matches.get(matchId);
    if (!state) throw new Error(`Match ${matchId} not found`);

    return {
      matchId,
      gameType: GameType.StrategyArena,
      status: state.completed ? "completed" : "in_progress",
      data: {
        currentRound: state.currentRound,
        totalRounds: state.totalRounds,
        player1TotalPayoff: state.player1TotalPayoff,
        player2TotalPayoff: state.player2TotalPayoff,
        commitDeadline: state.commitDeadline,
        revealDeadline: state.revealDeadline,
        rounds: state.rounds,
      },
    };
  }

  validateParameters(params: GameParameters): boolean {
    const rounds = params.strategyRoundCount ?? 5;
    if (rounds < 3 || rounds > 20) return false;

    const cc = params.strategyCooperateCooperate ?? DEFAULT_PAYOFFS.CC;
    const dc = params.strategyDefectCooperate ?? DEFAULT_PAYOFFS.DC;
    const cd = params.strategyCooperateDefect ?? DEFAULT_PAYOFFS.CD;
    const dd = params.strategyDefectDefect ?? DEFAULT_PAYOFFS.DD;

    // Prisoner's dilemma constraints: DC > CC > DD > CD
    if (!(dc > cc && cc > dd && dd >= cd)) return false;

    // Cooperation should yield more than alternating: 2*CC > DC + CD
    if (!(2 * cc > dc + cd)) return false;

    return true;
  }

  /**
   * Check and handle timeout forfeit for a match.
   */
  checkTimeout(matchId: number): { forfeiter: string | null; draw: boolean } {
    const state = this.matches.get(matchId);
    if (!state || state.completed) return { forfeiter: null, draw: false };

    const now = Math.floor(Date.now() / 1000);
    const round = state.rounds[state.currentRound - 1];
    if (!round) return { forfeiter: null, draw: false };

    if (now > state.commitDeadline) {
      if (!round.player1Committed && !round.player2Committed) {
        return { forfeiter: null, draw: true };
      }
      if (!round.player1Committed) return { forfeiter: state.players[0], draw: false };
      if (!round.player2Committed) return { forfeiter: state.players[1], draw: false };
    }

    if (state.revealDeadline > 0 && now > state.revealDeadline) {
      if (!round.player1Revealed) return { forfeiter: state.players[0], draw: false };
      if (!round.player2Revealed) return { forfeiter: state.players[1], draw: false };
    }

    return { forfeiter: null, draw: false };
  }

  // --- Internal ---

  private resolveRound(state: StrategyState): void {
    const round = state.rounds[state.currentRound - 1];
    if (!round || round.resolved) return;

    const payoffs = this.calculatePayoffs(
      round.player1Move,
      round.player2Move,
      state.params
    );

    round.player1Payoff = payoffs[0];
    round.player2Payoff = payoffs[1];
    round.resolved = true;

    state.player1TotalPayoff += payoffs[0];
    state.player2TotalPayoff += payoffs[1];

    // Advance to next round or complete
    if (state.currentRound < state.totalRounds) {
      state.currentRound++;
      state.rounds.push(this.createRound(state.currentRound));
      const commitTimeout = state.params.strategyCommitTimeout ?? 60;
      state.commitDeadline = Math.floor(Date.now() / 1000) + commitTimeout;
      state.revealDeadline = 0;
    } else {
      state.completed = true;
      if (state.player1TotalPayoff > state.player2TotalPayoff) {
        state.winner = state.players[0];
      } else if (state.player2TotalPayoff > state.player1TotalPayoff) {
        state.winner = state.players[1];
      }
    }
  }

  private calculatePayoffs(
    move1: StrategyMove,
    move2: StrategyMove,
    params: GameParameters
  ): [number, number] {
    const cc = params.strategyCooperateCooperate ?? DEFAULT_PAYOFFS.CC;
    const dc = params.strategyDefectCooperate ?? DEFAULT_PAYOFFS.DC;
    const cd = params.strategyCooperateDefect ?? DEFAULT_PAYOFFS.CD;
    const dd = params.strategyDefectDefect ?? DEFAULT_PAYOFFS.DD;

    if (move1 === StrategyMove.Cooperate && move2 === StrategyMove.Cooperate) {
      return [cc, cc];
    }
    if (move1 === StrategyMove.Defect && move2 === StrategyMove.Cooperate) {
      return [dc, cd];
    }
    if (move1 === StrategyMove.Cooperate && move2 === StrategyMove.Defect) {
      return [cd, dc];
    }
    // Both defect
    return [dd, dd];
  }

  private createRound(roundNum: number): StrategyRound {
    return {
      round: roundNum,
      player1Move: StrategyMove.None,
      player2Move: StrategyMove.None,
      player1Committed: false,
      player2Committed: false,
      player1Revealed: false,
      player2Revealed: false,
      player1Payoff: 0,
      player2Payoff: 0,
      resolved: false,
    };
  }
}
