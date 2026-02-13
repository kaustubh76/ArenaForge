// Pentathlon Tournament Format Implementation

import {
  TournamentFormat,
  GameType,
  type AgentStanding,
  type RoundData,
  type MatchResult,
  type PentathlonScores,
} from "../game-engine/game-mode.interface";
import type {
  TournamentFormatHandler,
  FormatConfig,
  FormatState,
  PairingResult,
} from "./format.interface";

/**
 * Pentathlon Format: Compete across all game types for cumulative ranking.
 *
 * Structure:
 * - 4 events: OracleDuel, StrategyArena, AuctionWars, QuizBowl
 * - Each event is a mini-tournament (round-robin for small groups)
 * - Points awarded: 1st=5pts, 2nd=3pts, 3rd=2pts, 4th=1pt
 * - Overall winner: highest total points
 */
export class PentathlonFormat implements TournamentFormatHandler {
  readonly formatType = TournamentFormat.Pentathlon;

  // Default event order
  private readonly defaultEventOrder = [
    GameType.OracleDuel,
    GameType.StrategyArena,
    GameType.AuctionWars,
    GameType.QuizBowl,
  ];

  // Points for each position
  private readonly positionPoints = [5, 3, 2, 1];

  initialize(participants: AgentStanding[], config?: FormatConfig): FormatState {
    const eventOrder = config?.gameTypeOrder?.map((n) => n as GameType) ?? this.defaultEventOrder;

    // Initialize scores for each participant
    const scores = new Map<string, PentathlonScores>();
    for (const p of participants) {
      scores.set(p.address, {
        eventScores: new Map(),
        eventRanks: new Map(),
        totalPoints: 0,
        eventsCompleted: 0,
      });
    }

    return {
      customData: {
        eventOrder,
        currentEventIndex: 0,
        scores,
        eventStandings: new Map<GameType, AgentStanding[]>(),
        eventMatchups: new Map<GameType, Set<string>>(), // Track completed matchups per event
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
    const customData = formatState.customData as {
      eventOrder: GameType[];
      currentEventIndex: number;
      eventMatchups: Map<GameType, Set<string>>;
    };

    const currentEvent = customData.eventOrder[customData.currentEventIndex];
    if (currentEvent === undefined) {
      return { pairings: [] }; // All events complete
    }

    // Get or create matchup tracking for this event
    if (!customData.eventMatchups.has(currentEvent)) {
      customData.eventMatchups.set(currentEvent, new Set());
    }
    const completedMatchups = customData.eventMatchups.get(currentEvent)!;

    // Generate round-robin pairings for current event
    const pairings: [string, string][] = [];
    const n = participants.length;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const p1 = participants[i].address;
        const p2 = participants[j].address;
        const matchupKey = [p1, p2].sort().join("-");

        if (!completedMatchups.has(matchupKey)) {
          pairings.push([p1, p2]);
          // Only add one pairing per round for manageable match counts
          if (pairings.length >= Math.floor(n / 2)) {
            break;
          }
        }
      }
      if (pairings.length >= Math.floor(n / 2)) {
        break;
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
    const customData = formatState.customData as {
      eventOrder: GameType[];
      currentEventIndex: number;
      scores: Map<string, PentathlonScores>;
      eventStandings: Map<GameType, AgentStanding[]>;
      eventMatchups: Map<GameType, Set<string>>;
    };

    const currentEvent = customData.eventOrder[customData.currentEventIndex];
    if (currentEvent === undefined) return updated;

    const completedMatchups = customData.eventMatchups.get(currentEvent)!;

    // Update event-specific standings
    for (const result of results) {
      if (!result.winner) continue;

      // Mark matchup as completed
      const matchupKey = [result.winner, result.loser!].sort().join("-");
      completedMatchups.add(matchupKey);

      // Update event-specific points (1 point per win in event)
      const winner = updated.find((s) => s.address === result.winner);
      if (winner) {
        // Store event wins temporarily in tournament points
        // We'll calculate final pentathlon points when event completes
        winner.tournamentPoints += 1;
      }
    }

    // Check if current event is complete (all matchups done)
    const n = standings.length;
    const totalMatchups = (n * (n - 1)) / 2; // Round-robin
    if (completedMatchups.size >= totalMatchups) {
      // Calculate event rankings
      const eventRankings = this.calculateEventRankings(updated, results);
      customData.eventStandings.set(currentEvent, eventRankings);

      // Award pentathlon points based on event ranking
      this.awardPentathlonPoints(eventRankings, customData.scores, currentEvent);

      // Reset tournament points for next event
      for (const p of updated) {
        p.tournamentPoints = 0;
      }

      // Move to next event
      customData.currentEventIndex++;
    }

    // Update overall tournament points from pentathlon scores
    for (const p of updated) {
      const scores = customData.scores.get(p.address);
      if (scores) {
        p.tournamentPoints = scores.totalPoints;
      }
    }

    return updated;
  }

  isComplete(
    standings: AgentStanding[],
    rounds: RoundData[],
    formatState: FormatState
  ): boolean {
    const customData = formatState.customData as {
      eventOrder: GameType[];
      currentEventIndex: number;
    };

    return customData.currentEventIndex >= customData.eventOrder.length;
  }

  getFinalRankings(
    standings: AgentStanding[],
    rounds: RoundData[],
    formatState: FormatState
  ): AgentStanding[] {
    const customData = formatState.customData as {
      scores: Map<string, PentathlonScores>;
    };

    return [...standings].sort((a, b) => {
      const aScores = customData.scores.get(a.address);
      const bScores = customData.scores.get(b.address);

      // By total points
      const aTotal = aScores?.totalPoints ?? 0;
      const bTotal = bScores?.totalPoints ?? 0;
      if (aTotal !== bTotal) {
        return bTotal - aTotal;
      }

      // By number of 1st place finishes
      const aFirsts = this.countPosition(aScores, 1);
      const bFirsts = this.countPosition(bScores, 1);
      if (aFirsts !== bFirsts) {
        return bFirsts - aFirsts;
      }

      // By ELO
      return b.elo - a.elo;
    });
  }

  calculateTotalRounds(participantCount: number, config?: FormatConfig): number {
    const eventCount = config?.gameTypeOrder?.length ?? this.defaultEventOrder.length;
    const roundRobinRounds = participantCount - 1;
    return eventCount * roundRobinRounds;
  }

  /**
   * Get the current event being played.
   */
  getCurrentEvent(formatState: FormatState): GameType | null {
    const customData = formatState.customData as {
      eventOrder: GameType[];
      currentEventIndex: number;
    };
    return customData.eventOrder[customData.currentEventIndex] ?? null;
  }

  /**
   * Calculate rankings for a completed event.
   */
  private calculateEventRankings(
    standings: AgentStanding[],
    results: MatchResult[]
  ): AgentStanding[] {
    // Sort by tournament points (event wins), then ELO
    return [...standings].sort(
      (a, b) => b.tournamentPoints - a.tournamentPoints || b.elo - a.elo
    );
  }

  /**
   * Award pentathlon points based on event ranking.
   */
  private awardPentathlonPoints(
    eventRankings: AgentStanding[],
    scores: Map<string, PentathlonScores>,
    event: GameType
  ): void {
    for (let i = 0; i < eventRankings.length; i++) {
      const player = eventRankings[i];
      const points = this.positionPoints[i] ?? 0;

      const playerScores = scores.get(player.address);
      if (playerScores) {
        playerScores.eventScores.set(event, points);
        playerScores.eventRanks.set(event, i + 1);
        playerScores.totalPoints += points;
        playerScores.eventsCompleted++;
      }
    }
  }

  /**
   * Count how many times a player finished in a specific position.
   */
  private countPosition(scores: PentathlonScores | undefined, position: number): number {
    if (!scores) return 0;
    let count = 0;
    for (const [_event, rank] of scores.eventRanks) {
      if (rank === position) count++;
    }
    return count;
  }
}
