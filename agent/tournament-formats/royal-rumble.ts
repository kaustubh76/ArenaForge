// Royal Rumble Tournament Format Implementation

import {
  TournamentFormat,
  GameType,
  type AgentStanding,
  type RoundData,
  type MatchResult,
  type RumbleParticipant,
} from "../game-engine/game-mode.interface";
import type {
  TournamentFormatHandler,
  FormatConfig,
  FormatState,
  PairingResult,
} from "./format.interface";

/**
 * Royal Rumble Format: Free-for-all with staggered entry and continuous elimination.
 *
 * Rules:
 * - Match starts with 2-4 participants
 * - New participant enters every N seconds
 * - Last agent standing wins
 * - Eliminated agents ranked by survival time
 *
 * Implementation:
 * - Uses head-to-head matches to simulate elimination
 * - Players join progressively based on entry order
 * - Survival time determines final ranking
 */
export class RoyalRumbleFormat implements TournamentFormatHandler {
  readonly formatType = TournamentFormat.RoyalRumble;

  private defaultEntryInterval = 30; // seconds
  private defaultStartingParticipants = 2;

  initialize(participants: AgentStanding[], config?: FormatConfig): FormatState {
    const entryInterval = config?.entryIntervalSeconds ?? this.defaultEntryInterval;
    const startingCount = config?.startingParticipants ?? this.defaultStartingParticipants;

    // Randomize entry order
    const shuffled = [...participants].sort(() => Math.random() - 0.5);

    const rumbleParticipants: RumbleParticipant[] = shuffled.map((p, index) => ({
      address: p.address,
      entryOrder: index + 1,
      entryTime: index < startingCount ? 0 : (index - startingCount + 1) * entryInterval,
      eliminationOrder: null,
      eliminatedBy: null,
      survivalTime: 0,
      eliminations: 0,
    }));

    return {
      customData: {
        rumbleParticipants,
        entryInterval,
        startingCount,
        currentTime: 0,
        eliminationCount: 0,
        activeParticipants: new Set(
          rumbleParticipants.filter((p) => p.entryTime === 0).map((p) => p.address)
        ),
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
      rumbleParticipants: RumbleParticipant[];
      activeParticipants: Set<string>;
      currentTime: number;
      entryInterval: number;
    };

    const active = participants.filter(
      (p) => !p.eliminated && customData.activeParticipants.has(p.address)
    );

    // If only one participant remains, no more pairings
    if (active.length <= 1) {
      return { pairings: [] };
    }

    // Generate head-to-head matches between active participants
    // In a real rumble, everyone fights everyone simultaneously
    // We simulate this with sequential 1v1 matches
    const pairings: [string, string][] = [];

    // Sort by ELO (lower ELO fights first, giving advantage to later entries)
    const sorted = [...active].sort((a, b) => a.elo - b.elo);

    // Pair adjacent fighters
    for (let i = 0; i + 1 < sorted.length; i += 2) {
      pairings.push([sorted[i].address, sorted[i + 1].address]);
    }

    // If odd number, the last one gets a "survival" round (no match)
    const byes = sorted.length % 2 !== 0 ? [sorted[sorted.length - 1].address] : [];

    return { pairings, byes };
  }

  updateStandings(
    standings: AgentStanding[],
    results: MatchResult[],
    formatState: FormatState
  ): AgentStanding[] {
    const updated = [...standings];
    const customData = formatState.customData as {
      rumbleParticipants: RumbleParticipant[];
      activeParticipants: Set<string>;
      eliminationCount: number;
      currentTime: number;
      entryInterval: number;
    };

    for (const result of results) {
      if (!result.winner || !result.loser) continue;

      const winner = updated.find((s) => s.address === result.winner);
      const loser = updated.find((s) => s.address === result.loser);

      if (!winner || !loser) continue;

      // Winner gets points for elimination
      winner.tournamentPoints += 1;

      // Loser is eliminated
      loser.eliminated = true;
      customData.activeParticipants.delete(loser.address);

      // Update rumble participant data
      const winnerRumble = customData.rumbleParticipants.find(
        (p) => p.address === winner.address
      );
      const loserRumble = customData.rumbleParticipants.find(
        (p) => p.address === loser.address
      );

      if (winnerRumble) {
        winnerRumble.eliminations++;
      }

      if (loserRumble) {
        customData.eliminationCount++;
        loserRumble.eliminationOrder = customData.eliminationCount;
        loserRumble.eliminatedBy = winner.address;
        loserRumble.survivalTime = customData.currentTime - loserRumble.entryTime;
      }
    }

    // Check for new entries based on time
    customData.currentTime += customData.entryInterval;
    for (const rumbleP of customData.rumbleParticipants) {
      if (
        rumbleP.entryTime <= customData.currentTime &&
        rumbleP.eliminationOrder === null &&
        !customData.activeParticipants.has(rumbleP.address)
      ) {
        customData.activeParticipants.add(rumbleP.address);
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
      rumbleParticipants: RumbleParticipant[];
      activeParticipants: Set<string>;
    };

    // Check if all participants have entered
    const allEntered = customData.rumbleParticipants.every(
      (p) => customData.activeParticipants.has(p.address) || p.eliminationOrder !== null
    );

    // Complete when only one remains and all have entered
    const nonEliminated = standings.filter((s) => !s.eliminated);
    return allEntered && nonEliminated.length === 1;
  }

  getFinalRankings(
    standings: AgentStanding[],
    rounds: RoundData[],
    formatState: FormatState
  ): AgentStanding[] {
    const customData = formatState.customData as {
      rumbleParticipants: RumbleParticipant[];
    };

    // Create ranking based on elimination order (later = better)
    const sorted = [...standings].sort((a, b) => {
      const aRumble = customData.rumbleParticipants.find((p) => p.address === a.address);
      const bRumble = customData.rumbleParticipants.find((p) => p.address === b.address);

      // Winner (not eliminated) first
      if (a.eliminated !== b.eliminated) {
        return a.eliminated ? 1 : -1;
      }

      // By elimination order (higher = later = better)
      const aOrder = aRumble?.eliminationOrder ?? Infinity;
      const bOrder = bRumble?.eliminationOrder ?? Infinity;
      if (aOrder !== bOrder) {
        return bOrder - aOrder;
      }

      // By survival time
      const aSurvival = aRumble?.survivalTime ?? 0;
      const bSurvival = bRumble?.survivalTime ?? 0;
      if (aSurvival !== bSurvival) {
        return bSurvival - aSurvival;
      }

      // By eliminations
      const aElims = aRumble?.eliminations ?? 0;
      const bElims = bRumble?.eliminations ?? 0;
      return bElims - aElims;
    });

    return sorted;
  }

  calculateTotalRounds(participantCount: number, config?: FormatConfig): number {
    // Each elimination is roughly one "round" of matches
    // Plus entry rounds
    return participantCount - 1; // N-1 eliminations needed
  }
}
