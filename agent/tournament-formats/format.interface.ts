// Tournament Format Interface

import type {
  AgentStanding,
  RoundData,
  MatchResult,
  TournamentFormat,
  Bracket,
  SeriesConfig,
} from "../game-engine/game-mode.interface";

export interface FormatConfig {
  // Best-of-N config
  seriesLength?: number; // 3, 5, or 7 for Bo3, Bo5, Bo7

  // Royal Rumble config
  entryIntervalSeconds?: number;
  startingParticipants?: number;

  // Pentathlon config
  gameTypeOrder?: number[];
}

export interface PairingResult {
  pairings: [string, string][];
  byes?: string[]; // Players who get a bye this round
}

export interface FormatState {
  bracket?: Bracket;
  series?: Map<number, SeriesConfig>;
  customData?: Record<string, unknown>;
}

export interface TournamentFormatHandler {
  readonly formatType: TournamentFormat;

  /**
   * Initialize the format state for a new tournament.
   */
  initialize(participants: AgentStanding[], config?: FormatConfig): FormatState;

  /**
   * Generate pairings for the next round/phase.
   */
  generatePairings(
    participants: AgentStanding[],
    previousRounds: RoundData[],
    currentRound: number,
    formatState: FormatState,
    config?: FormatConfig
  ): PairingResult;

  /**
   * Update standings after a round completes.
   */
  updateStandings(
    standings: AgentStanding[],
    results: MatchResult[],
    formatState: FormatState
  ): AgentStanding[];

  /**
   * Check if the tournament is complete.
   */
  isComplete(
    standings: AgentStanding[],
    rounds: RoundData[],
    formatState: FormatState
  ): boolean;

  /**
   * Get the final rankings.
   */
  getFinalRankings(
    standings: AgentStanding[],
    rounds: RoundData[],
    formatState: FormatState
  ): AgentStanding[];

  /**
   * Calculate the total number of rounds for this format.
   */
  calculateTotalRounds(participantCount: number, config?: FormatConfig): number;
}
