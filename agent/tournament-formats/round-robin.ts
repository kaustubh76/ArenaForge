// Round Robin Tournament Format Implementation

import {
  TournamentFormat,
  type AgentStanding,
  type RoundData,
  type MatchResult,
} from "../game-engine/game-mode.interface";
import type {
  TournamentFormatHandler,
  FormatConfig,
  FormatState,
  PairingResult,
} from "./format.interface";

/**
 * Round Robin Format: Every participant plays every other participant exactly once.
 *
 * Uses the "circle method" (Berger tables) for efficient pairing generation:
 * - For N participants (even): N-1 rounds, N/2 matches per round
 * - For N participants (odd): N rounds with one bye per round
 *
 * Points: 3 for win, 1 for draw, 0 for loss
 * Tiebreakers: head-to-head, then point differential
 */
export class RoundRobinFormat implements TournamentFormatHandler {
  readonly formatType = TournamentFormat.RoundRobin;

  initialize(participants: AgentStanding[], _config?: FormatConfig): FormatState {
    return {
      customData: {
        // Track all matchups that have occurred
        completedMatchups: new Set<string>(),
      },
    };
  }

  generatePairings(
    participants: AgentStanding[],
    previousRounds: RoundData[],
    currentRound: number,
    _formatState: FormatState,
    _config?: FormatConfig
  ): PairingResult {
    const n = participants.length;
    const isOdd = n % 2 !== 0;

    // Add a "BYE" placeholder if odd number of participants
    const players = [...participants.map((p) => p.address)];
    if (isOdd) {
      players.push("BYE");
    }

    const numPlayers = players.length;
    const pairings: [string, string][] = [];
    const byes: string[] = [];

    // Circle method: Fix one player, rotate the rest
    // Round 1: positions [0,1], [2,n-1], [3,n-2], etc.
    // Round 2: Rotate positions 1 through n-1

    // Create rotation array (exclude position 0)
    const rotation = players.slice(1);

    // Rotate for current round (0-indexed internally)
    const roundIndex = currentRound - 1;
    const rotated = this.rotateArray(rotation, roundIndex);

    // Reconstruct players array with fixed position 0
    const roundPlayers = [players[0], ...rotated];

    // Generate pairings: position i pairs with position (n-1-i)
    for (let i = 0; i < numPlayers / 2; i++) {
      const p1 = roundPlayers[i];
      const p2 = roundPlayers[numPlayers - 1 - i];

      if (p1 === "BYE") {
        byes.push(p2);
      } else if (p2 === "BYE") {
        byes.push(p1);
      } else {
        // Avoid duplicate pairings (shouldn't happen with correct rotation)
        const matchupKey = [p1, p2].sort().join("-");
        const completedMatchups = previousRounds.flatMap((r) =>
          r.pairings.map((pair) => [...pair].sort().join("-"))
        );

        if (!completedMatchups.includes(matchupKey)) {
          pairings.push([p1, p2]);
        }
      }
    }

    return { pairings, byes };
  }

  updateStandings(
    standings: AgentStanding[],
    results: MatchResult[],
    _formatState: FormatState
  ): AgentStanding[] {
    const updated = [...standings];

    for (const result of results) {
      if (result.isDraw) {
        // Both players get 1 point
        const p1 = updated.find((s) => s.address === result.winner || s.address === result.loser);
        const p2 = updated.find(
          (s) => s.address !== p1?.address && (s.address === result.winner || s.address === result.loser)
        );
        if (p1) p1.tournamentPoints += 1;
        if (p2) p2.tournamentPoints += 1;
      } else if (result.winner) {
        // Winner gets 3 points, loser gets 0
        const winner = updated.find((s) => s.address === result.winner);
        if (winner) {
          winner.tournamentPoints += 3;
        }
      }
    }

    // Sort by points, then ELO for tiebreaker
    updated.sort((a, b) => b.tournamentPoints - a.tournamentPoints || b.elo - a.elo);

    return updated;
  }

  isComplete(
    standings: AgentStanding[],
    rounds: RoundData[],
    _formatState: FormatState
  ): boolean {
    const totalRounds = this.calculateTotalRounds(standings.length);
    const completedRounds = rounds.filter((r) => r.completed).length;
    return completedRounds >= totalRounds;
  }

  getFinalRankings(
    standings: AgentStanding[],
    rounds: RoundData[],
    _formatState: FormatState
  ): AgentStanding[] {
    // Build head-to-head records for tiebreaking
    const h2h = new Map<string, Map<string, "win" | "loss" | "draw">>();

    for (const round of rounds) {
      for (const result of round.results) {
        if (!result.winner || !result.loser) continue;

        if (!h2h.has(result.winner)) h2h.set(result.winner, new Map());
        if (!h2h.has(result.loser)) h2h.set(result.loser, new Map());

        if (result.isDraw) {
          h2h.get(result.winner)!.set(result.loser, "draw");
          h2h.get(result.loser)!.set(result.winner, "draw");
        } else {
          h2h.get(result.winner)!.set(result.loser, "win");
          h2h.get(result.loser)!.set(result.winner, "loss");
        }
      }
    }

    // Sort with tiebreakers
    const sorted = [...standings].sort((a, b) => {
      // Primary: points
      if (b.tournamentPoints !== a.tournamentPoints) {
        return b.tournamentPoints - a.tournamentPoints;
      }

      // Secondary: head-to-head
      const aVsB = h2h.get(a.address)?.get(b.address);
      if (aVsB === "win") return -1;
      if (aVsB === "loss") return 1;

      // Tertiary: ELO
      return b.elo - a.elo;
    });

    return sorted;
  }

  calculateTotalRounds(participantCount: number, _config?: FormatConfig): number {
    // N-1 rounds for even, N rounds for odd
    return participantCount % 2 === 0 ? participantCount - 1 : participantCount;
  }

  /**
   * Rotate array elements by n positions.
   */
  private rotateArray<T>(arr: T[], n: number): T[] {
    if (arr.length === 0) return arr;
    const normalizedN = ((n % arr.length) + arr.length) % arr.length;
    return [...arr.slice(normalizedN), ...arr.slice(0, normalizedN)];
  }
}
