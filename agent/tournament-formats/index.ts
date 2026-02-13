// Tournament Formats Registry

import { TournamentFormat } from "../game-engine/game-mode.interface";
import type { TournamentFormatHandler } from "./format.interface";
import { RoundRobinFormat } from "./round-robin";
import { DoubleEliminationFormat } from "./double-elimination";
import { BestOfNFormat } from "./best-of-n";
import { RoyalRumbleFormat } from "./royal-rumble";
import { PentathlonFormat } from "./pentathlon";

// Export all format implementations
export { RoundRobinFormat } from "./round-robin";
export { DoubleEliminationFormat } from "./double-elimination";
export { BestOfNFormat } from "./best-of-n";
export { RoyalRumbleFormat } from "./royal-rumble";
export { PentathlonFormat } from "./pentathlon";

// Export types
export * from "./format.interface";

// Format handler registry
const formatHandlers = new Map<TournamentFormat, TournamentFormatHandler>();

// Register all format handlers
formatHandlers.set(TournamentFormat.RoundRobin, new RoundRobinFormat());
formatHandlers.set(TournamentFormat.DoubleElimination, new DoubleEliminationFormat());
formatHandlers.set(TournamentFormat.BestOfN, new BestOfNFormat());
formatHandlers.set(TournamentFormat.RoyalRumble, new RoyalRumbleFormat());
formatHandlers.set(TournamentFormat.Pentathlon, new PentathlonFormat());

/**
 * Get a format handler by format type.
 */
export function getFormatHandler(format: TournamentFormat): TournamentFormatHandler | null {
  return formatHandlers.get(format) ?? null;
}

/**
 * Check if a format is an advanced format (not Swiss or SingleElim).
 */
export function isAdvancedFormat(format: TournamentFormat): boolean {
  return format !== TournamentFormat.SwissSystem && format !== TournamentFormat.SingleElimination;
}

/**
 * Get all available format types.
 */
export function getAvailableFormats(): TournamentFormat[] {
  return [
    TournamentFormat.SwissSystem,
    TournamentFormat.SingleElimination,
    TournamentFormat.DoubleElimination,
    TournamentFormat.RoundRobin,
    TournamentFormat.BestOfN,
    TournamentFormat.RoyalRumble,
    TournamentFormat.Pentathlon,
  ];
}

/**
 * Get format display name.
 */
export function getFormatName(format: TournamentFormat): string {
  const names: Record<TournamentFormat, string> = {
    [TournamentFormat.SwissSystem]: "Swiss System",
    [TournamentFormat.SingleElimination]: "Single Elimination",
    [TournamentFormat.DoubleElimination]: "Double Elimination",
    [TournamentFormat.RoundRobin]: "Round Robin",
    [TournamentFormat.BestOfN]: "Best-of-N Series",
    [TournamentFormat.RoyalRumble]: "Royal Rumble",
    [TournamentFormat.Pentathlon]: "Pentathlon",
  };
  return names[format] ?? "Unknown Format";
}

/**
 * Get format description.
 */
export function getFormatDescription(format: TournamentFormat): string {
  const descriptions: Record<TournamentFormat, string> = {
    [TournamentFormat.SwissSystem]:
      "Players are paired based on similar scores. Everyone plays all rounds.",
    [TournamentFormat.SingleElimination]:
      "Lose once and you're out. Classic bracket-style tournament.",
    [TournamentFormat.DoubleElimination]:
      "Players must lose twice to be eliminated. Winners and losers brackets.",
    [TournamentFormat.RoundRobin]:
      "Every player plays every other player once. Most points wins.",
    [TournamentFormat.BestOfN]:
      "Win a series of games against your opponent. First to N wins advances.",
    [TournamentFormat.RoyalRumble]:
      "Free-for-all with staggered entry. Last agent standing wins.",
    [TournamentFormat.Pentathlon]:
      "Compete across all game types. Points awarded per event.",
  };
  return descriptions[format] ?? "";
}
