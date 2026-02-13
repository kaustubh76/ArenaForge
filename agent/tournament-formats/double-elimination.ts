// Double Elimination Tournament Format Implementation

import {
  TournamentFormat,
  type AgentStanding,
  type RoundData,
  type MatchResult,
  type Bracket,
  type BracketRound,
  type BracketMatch,
} from "../game-engine/game-mode.interface";
import type {
  TournamentFormatHandler,
  FormatConfig,
  FormatState,
  PairingResult,
} from "./format.interface";

/**
 * Double Elimination Format: Players must lose twice to be eliminated.
 *
 * Structure:
 * - Winners Bracket: Standard single elimination for undefeated players
 * - Losers Bracket: Second chance bracket for players with one loss
 * - Grand Final: Winners bracket champion vs Losers bracket champion
 * - Bracket Reset: If losers champion wins grand final, play again
 */
export class DoubleEliminationFormat implements TournamentFormatHandler {
  readonly formatType = TournamentFormat.DoubleElimination;

  initialize(participants: AgentStanding[], _config?: FormatConfig): FormatState {
    const bracket = this.createBracket(participants);
    return { bracket };
  }

  generatePairings(
    participants: AgentStanding[],
    previousRounds: RoundData[],
    currentRound: number,
    formatState: FormatState,
    _config?: FormatConfig
  ): PairingResult {
    const bracket = formatState.bracket!;
    const pairings: [string, string][] = [];

    // Determine current phase
    const winnersRemaining = participants.filter(
      (p) => p.bracketPosition === "winners" || !p.bracketPosition
    );
    const losersRemaining = participants.filter((p) => p.bracketPosition === "losers");

    // Check if we're in grand final
    if (winnersRemaining.length === 1 && losersRemaining.length === 1) {
      bracket.currentPhase = "grand_final";
      pairings.push([winnersRemaining[0].address, losersRemaining[0].address]);
      return { pairings };
    }

    // Generate winners bracket pairings
    if (winnersRemaining.length > 1) {
      const winnersPairings = this.generateBracketPairings(winnersRemaining, "winners");
      pairings.push(...winnersPairings);
    }

    // Generate losers bracket pairings
    if (losersRemaining.length > 1) {
      const losersPairings = this.generateBracketPairings(losersRemaining, "losers");
      pairings.push(...losersPairings);
    }

    return { pairings };
  }

  updateStandings(
    standings: AgentStanding[],
    results: MatchResult[],
    formatState: FormatState
  ): AgentStanding[] {
    const updated = [...standings];
    const bracket = formatState.bracket!;

    for (const result of results) {
      if (!result.winner || !result.loser) continue;

      const winner = updated.find((s) => s.address === result.winner);
      const loser = updated.find((s) => s.address === result.loser);

      if (!winner || !loser) continue;

      // Award tournament point to winner
      winner.tournamentPoints += 1;

      // Handle loser based on current bracket position
      if (loser.bracketPosition === "winners" || !loser.bracketPosition) {
        // First loss - move to losers bracket
        loser.bracketPosition = "losers";
        loser.lossesBracket = 1;
      } else if (loser.bracketPosition === "losers") {
        // Second loss - eliminated
        loser.bracketPosition = "eliminated";
        loser.eliminated = true;
        loser.lossesBracket = 2;
      }

      // Handle grand final
      if (bracket.currentPhase === "grand_final") {
        if (winner.bracketPosition === "losers") {
          // Losers bracket champion won - need bracket reset
          bracket.currentPhase = "reset";
          // Both players now at "1 loss" equivalent
          winner.bracketPosition = "winners"; // Reset for final match
        }
      } else if (bracket.currentPhase === "reset") {
        // True final - loser is eliminated
        loser.eliminated = true;
      }
    }

    return updated;
  }

  isComplete(
    standings: AgentStanding[],
    rounds: RoundData[],
    formatState: FormatState
  ): boolean {
    const bracket = formatState.bracket!;
    const nonEliminated = standings.filter((s) => !s.eliminated);

    // Complete when only one player remains
    if (nonEliminated.length === 1) return true;

    // Or if grand final/reset is done
    if (bracket.currentPhase === "reset") {
      const lastRound = rounds[rounds.length - 1];
      return lastRound?.completed ?? false;
    }

    return false;
  }

  getFinalRankings(
    standings: AgentStanding[],
    rounds: RoundData[],
    _formatState: FormatState
  ): AgentStanding[] {
    // Sort by: elimination order (later = better), then points, then ELO
    const sorted = [...standings].sort((a, b) => {
      // Non-eliminated first
      if (a.eliminated !== b.eliminated) {
        return a.eliminated ? 1 : -1;
      }

      // By losses (fewer = better)
      const aLosses = a.lossesBracket ?? 0;
      const bLosses = b.lossesBracket ?? 0;
      if (aLosses !== bLosses) {
        return aLosses - bLosses;
      }

      // By points
      if (b.tournamentPoints !== a.tournamentPoints) {
        return b.tournamentPoints - a.tournamentPoints;
      }

      // By ELO
      return b.elo - a.elo;
    });

    return sorted;
  }

  calculateTotalRounds(participantCount: number, _config?: FormatConfig): number {
    // Winners bracket: log2(n)
    // Losers bracket: 2 * log2(n) - 1
    // Grand final: 1-2 (potentially with reset)
    const winnersRounds = Math.ceil(Math.log2(participantCount));
    const losersRounds = 2 * winnersRounds - 1;
    return winnersRounds + losersRounds + 2; // +2 for grand final + potential reset
  }

  /**
   * Create initial bracket structure.
   */
  private createBracket(participants: AgentStanding[]): Bracket {
    const n = participants.length;
    const rounds: BracketRound[] = [];
    const losersRounds: BracketRound[] = [];

    // Sort by ELO for seeding
    const seeded = [...participants].sort((a, b) => b.elo - a.elo);

    // Create winners bracket first round
    const firstRoundMatches: BracketMatch[] = [];
    for (let i = 0; i < Math.floor(n / 2); i++) {
      firstRoundMatches.push({
        matchId: null,
        player1Seed: i + 1,
        player2Seed: n - i,
        player1Address: seeded[i]?.address ?? null,
        player2Address: seeded[n - 1 - i]?.address ?? null,
        winner: null,
        loser: null,
      });
    }

    rounds.push({
      roundNumber: 1,
      bracketType: "winners",
      matches: firstRoundMatches,
    });

    // Initialize participant bracket positions
    for (const p of participants) {
      p.bracketPosition = "winners";
      p.lossesBracket = 0;
    }

    return {
      type: "double",
      rounds,
      losersRounds,
      currentPhase: "winners",
    };
  }

  /**
   * Generate pairings for a bracket phase.
   */
  private generateBracketPairings(
    players: AgentStanding[],
    bracketType: "winners" | "losers"
  ): [string, string][] {
    const pairings: [string, string][] = [];

    // Sort by points (as a proxy for advancement), then ELO
    const sorted = [...players].sort(
      (a, b) => b.tournamentPoints - a.tournamentPoints || b.elo - a.elo
    );

    // Pair adjacent players
    for (let i = 0; i + 1 < sorted.length; i += 2) {
      pairings.push([sorted[i].address, sorted[i + 1].address]);
    }

    return pairings;
  }
}
