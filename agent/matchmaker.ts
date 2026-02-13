import type {
  AgentStanding,
  RoundData,
  TournamentFormat,
  MatchResult,
} from "./game-engine/game-mode.interface";
import { TournamentFormat as TF } from "./game-engine/game-mode.interface";

// ELO constants
const K_FACTOR = 32;
const DEFAULT_ELO = 1200;

export class Matchmaker {
  /**
   * Generate pairings for the next round based on tournament format.
   */
  generatePairings(
    format: TournamentFormat,
    standings: AgentStanding[],
    previousRounds: RoundData[],
    currentRound: number
  ): [string, string][] {
    const active = standings.filter((s) => !s.eliminated);

    if (format === TF.SwissSystem) {
      return this.swissPairing(active, previousRounds);
    }
    return this.eliminationPairing(active, currentRound);
  }

  /**
   * Swiss-system pairing: sort by points, pair adjacent players,
   * avoiding rematches when possible.
   */
  private swissPairing(
    players: AgentStanding[],
    previousRounds: RoundData[]
  ): [string, string][] {
    const sorted = [...players].sort(
      (a, b) => b.tournamentPoints - a.tournamentPoints || b.elo - a.elo
    );

    const pastOpponents = this.buildOpponentMap(previousRounds);
    const paired = new Set<string>();
    const pairings: [string, string][] = [];

    for (let i = 0; i < sorted.length; i++) {
      const p1 = sorted[i];
      if (paired.has(p1.address)) continue;

      // Find best available opponent (prefer no rematch)
      let bestIdx = -1;
      let bestHadRematch = true;

      for (let j = i + 1; j < sorted.length; j++) {
        const p2 = sorted[j];
        if (paired.has(p2.address)) continue;

        const isRematch = pastOpponents
          .get(p1.address)
          ?.has(p2.address) ?? false;

        if (!isRematch) {
          bestIdx = j;
          bestHadRematch = false;
          break;
        }
        if (bestIdx === -1) {
          bestIdx = j;
        }
      }

      if (bestIdx !== -1) {
        const p2 = sorted[bestIdx];
        pairings.push([p1.address, p2.address]);
        paired.add(p1.address);
        paired.add(p2.address);
      }
      // Odd player out gets a bye (handled by caller)
    }

    return pairings;
  }

  /**
   * Single-elimination bracket pairing.
   * Round 1: seed by ELO (1 vs N, 2 vs N-1, ...).
   * Later rounds: pair winners in order.
   */
  private eliminationPairing(
    players: AgentStanding[],
    currentRound: number
  ): [string, string][] {
    const sorted = [...players].sort((a, b) => b.elo - a.elo);
    const pairings: [string, string][] = [];

    if (currentRound === 1) {
      // Seeded bracket
      const n = sorted.length;
      for (let i = 0; i < Math.floor(n / 2); i++) {
        pairings.push([sorted[i].address, sorted[n - 1 - i].address]);
      }
    } else {
      // Pair sequentially (winners from previous round)
      for (let i = 0; i + 1 < sorted.length; i += 2) {
        pairings.push([sorted[i].address, sorted[i + 1].address]);
      }
    }

    return pairings;
  }

  /**
   * Build a map of who has played whom across all rounds.
   */
  private buildOpponentMap(
    rounds: RoundData[]
  ): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();

    for (const round of rounds) {
      for (const [a, b] of round.pairings) {
        if (!map.has(a)) map.set(a, new Set());
        if (!map.has(b)) map.set(b, new Set());
        map.get(a)!.add(b);
        map.get(b)!.add(a);
      }
    }

    return map;
  }

  /**
   * Update standings after a round completes.
   */
  updateStandings(
    standings: AgentStanding[],
    results: MatchResult[],
    format: TournamentFormat
  ): AgentStanding[] {
    const updated = [...standings];

    for (const result of results) {
      if (result.isDraw) {
        // Both get half a point in Swiss
        const p1 = updated.find(
          (s) => s.address === result.winner || s.address === result.loser
        );
        // Find both players from result stats
        for (const s of updated) {
          if (
            result.player1Actions.length > 0 ||
            result.player2Actions.length > 0
          ) {
            // Points handled below by winner/loser
          }
        }
        continue;
      }

      if (result.winner) {
        const winner = updated.find((s) => s.address === result.winner);
        const loser = updated.find((s) => s.address === result.loser);

        if (winner) {
          winner.tournamentPoints += 1;
        }
        if (loser && format === TF.SingleElimination) {
          loser.eliminated = true;
        }
      }
    }

    return updated;
  }

  /**
   * Calculate new ELO ratings after a match.
   * Returns [newRatingA, newRatingB].
   */
  calculateElo(
    ratingA: number,
    ratingB: number,
    outcome: "win" | "loss" | "draw"
  ): [number, number] {
    const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
    const expectedB = 1 - expectedA;

    let scoreA: number;
    let scoreB: number;

    switch (outcome) {
      case "win":
        scoreA = 1;
        scoreB = 0;
        break;
      case "loss":
        scoreA = 0;
        scoreB = 1;
        break;
      case "draw":
        scoreA = 0.5;
        scoreB = 0.5;
        break;
    }

    const newA = Math.round(ratingA + K_FACTOR * (scoreA - expectedA));
    const newB = Math.round(ratingB + K_FACTOR * (scoreB - expectedB));

    return [newA, newB];
  }

  /**
   * Determine if a result is an upset (lower-rated player wins).
   */
  isUpset(
    winnerElo: number,
    loserElo: number,
    threshold: number = 100
  ): boolean {
    return loserElo - winnerElo >= threshold;
  }
}
