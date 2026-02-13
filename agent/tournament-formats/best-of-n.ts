// Best-of-N Series Tournament Format Implementation

import {
  TournamentFormat,
  type AgentStanding,
  type RoundData,
  type MatchResult,
  type SeriesConfig,
} from "../game-engine/game-mode.interface";
import type {
  TournamentFormatHandler,
  FormatConfig,
  FormatState,
  PairingResult,
} from "./format.interface";

/**
 * Best-of-N Format: Multi-game series where first to win (N+1)/2 games wins.
 *
 * Typically used as a sub-format within elimination brackets.
 * Configurations:
 * - Bo3: First to 2 wins
 * - Bo5: First to 3 wins
 * - Bo7: First to 4 wins
 */
export class BestOfNFormat implements TournamentFormatHandler {
  readonly formatType = TournamentFormat.BestOfN;

  private defaultSeriesLength = 3; // Bo3 by default

  initialize(participants: AgentStanding[], config?: FormatConfig): FormatState {
    const seriesLength = config?.seriesLength ?? this.defaultSeriesLength;
    const series = new Map<number, SeriesConfig>();

    // Create initial series matchups (single elimination bracket with series)
    const sorted = [...participants].sort((a, b) => b.elo - a.elo);
    let seriesId = 1;

    for (let i = 0; i < Math.floor(sorted.length / 2); i++) {
      const p1 = sorted[i];
      const p2 = sorted[sorted.length - 1 - i];

      series.set(seriesId, {
        seriesId,
        player1: p1.address,
        player2: p2.address,
        winsRequired: Math.ceil(seriesLength / 2),
        player1Wins: 0,
        player2Wins: 0,
        matchIds: [],
        completed: false,
        winner: null,
      });
      seriesId++;
    }

    return {
      series,
      customData: {
        seriesLength,
        currentSeriesRound: 1,
      },
    };
  }

  generatePairings(
    participants: AgentStanding[],
    previousRounds: RoundData[],
    currentRound: number,
    formatState: FormatState,
    config?: FormatConfig
  ): PairingResult {
    const series = formatState.series!;
    const pairings: [string, string][] = [];

    // Find active (non-completed) series
    for (const [_id, s] of series) {
      if (!s.completed) {
        pairings.push([s.player1, s.player2]);
      }
    }

    // If all current series are completed, create next round of series
    if (pairings.length === 0) {
      const winners = this.getSeriesWinners(series);
      if (winners.length > 1) {
        const newPairings = this.createNextRoundSeries(winners, series, config);
        pairings.push(...newPairings);
      }
    }

    return { pairings };
  }

  updateStandings(
    standings: AgentStanding[],
    results: MatchResult[],
    formatState: FormatState
  ): AgentStanding[] {
    const updated = [...standings];
    const series = formatState.series!;

    for (const result of results) {
      if (!result.winner) continue;

      // Find the series this match belongs to
      for (const [_id, s] of series) {
        if (
          (s.player1 === result.winner || s.player1 === result.loser) &&
          (s.player2 === result.winner || s.player2 === result.loser) &&
          !s.completed
        ) {
          // Record match in series
          s.matchIds.push(result.matchId);

          // Update series score
          if (result.winner === s.player1) {
            s.player1Wins++;
          } else {
            s.player2Wins++;
          }

          // Check if series is complete
          if (s.player1Wins >= s.winsRequired) {
            s.completed = true;
            s.winner = s.player1;
            this.markSeriesLoser(updated, s.player2);
          } else if (s.player2Wins >= s.winsRequired) {
            s.completed = true;
            s.winner = s.player2;
            this.markSeriesLoser(updated, s.player1);
          }

          // Update tournament points for match winner
          const winner = updated.find((p) => p.address === result.winner);
          if (winner) {
            winner.tournamentPoints += 1;
          }

          break;
        }
      }
    }

    return updated;
  }

  isComplete(
    standings: AgentStanding[],
    rounds: RoundData[],
    formatState: FormatState
  ): boolean {
    const series = formatState.series!;

    // Get all series winners
    const winners = this.getSeriesWinners(series);

    // Tournament is complete when only one player remains
    const nonEliminated = standings.filter((s) => !s.eliminated);
    return nonEliminated.length === 1;
  }

  getFinalRankings(
    standings: AgentStanding[],
    rounds: RoundData[],
    formatState: FormatState
  ): AgentStanding[] {
    // Sort by: not eliminated, then points, then ELO
    return [...standings].sort((a, b) => {
      if (a.eliminated !== b.eliminated) {
        return a.eliminated ? 1 : -1;
      }
      if (b.tournamentPoints !== a.tournamentPoints) {
        return b.tournamentPoints - a.tournamentPoints;
      }
      return b.elo - a.elo;
    });
  }

  calculateTotalRounds(participantCount: number, config?: FormatConfig): number {
    const seriesLength = config?.seriesLength ?? this.defaultSeriesLength;
    const bracketRounds = Math.ceil(Math.log2(participantCount));

    // Each bracket round can have up to seriesLength games
    return bracketRounds * seriesLength;
  }

  /**
   * Get all series winners.
   */
  private getSeriesWinners(series: Map<number, SeriesConfig>): string[] {
    const winners: string[] = [];
    for (const [_id, s] of series) {
      if (s.completed && s.winner) {
        winners.push(s.winner);
      }
    }
    return winners;
  }

  /**
   * Create next round of series from previous winners.
   */
  private createNextRoundSeries(
    winners: string[],
    existingSeries: Map<number, SeriesConfig>,
    config?: FormatConfig
  ): [string, string][] {
    const seriesLength = config?.seriesLength ?? this.defaultSeriesLength;
    const pairings: [string, string][] = [];

    // Find max existing series ID
    let maxId = 0;
    for (const [id] of existingSeries) {
      if (id > maxId) maxId = id;
    }

    // Pair winners sequentially
    for (let i = 0; i + 1 < winners.length; i += 2) {
      const p1 = winners[i];
      const p2 = winners[i + 1];

      maxId++;
      existingSeries.set(maxId, {
        seriesId: maxId,
        player1: p1,
        player2: p2,
        winsRequired: Math.ceil(seriesLength / 2),
        player1Wins: 0,
        player2Wins: 0,
        matchIds: [],
        completed: false,
        winner: null,
      });

      pairings.push([p1, p2]);
    }

    return pairings;
  }

  /**
   * Mark a player as eliminated from a series loss.
   */
  private markSeriesLoser(standings: AgentStanding[], loserAddress: string): void {
    const loser = standings.find((s) => s.address === loserAddress);
    if (loser) {
      loser.eliminated = true;
    }
  }

  /**
   * Get current series status for a player.
   */
  getPlayerSeriesStatus(
    playerAddress: string,
    formatState: FormatState
  ): SeriesConfig | null {
    const series = formatState.series;
    if (!series) return null;

    for (const [_id, s] of series) {
      if ((s.player1 === playerAddress || s.player2 === playerAddress) && !s.completed) {
        return s;
      }
    }
    return null;
  }
}
