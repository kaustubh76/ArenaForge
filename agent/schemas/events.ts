// Zod schemas for on-chain event arg shapes. Replaces `(log as any).args`
// casts in agent/monad/event-listener.ts with runtime validation. If the ABI
// drifts or a contract emits an unexpected payload, parse fails and we log
// rather than feeding garbage into downstream callbacks.

import { z } from "zod";
import { getLogger } from "../utils/logger";

const log = getLogger("EventSchema");

// 0x-prefixed 20-byte address. Permissive on case (viem returns checksummed);
// downstream code lowercases via normalizeAddress when needed.
const Address = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "invalid address");

const Bytes32 = z.string().regex(/^0x[a-fA-F0-9]{64}$/, "invalid bytes32");

// viem decodes uint256 as bigint. Accept bigint AND number (some encoders
// downcast small ids); coerce to bigint downstream.
const Uint256 = z.union([z.bigint(), z.number().int().nonnegative()]);

export const AgentRegisteredArgs = z.object({
  agent: Address,
  moltbookHandle: z.string().max(256),
});

export const AgentJoinedTournamentArgs = z.object({
  tournamentId: Uint256,
  agent: Address,
});

export const MatchCompletedArgs = z.object({
  matchId: Uint256,
  winner: Address,
});

export const MoveCommittedArgs = z.object({
  matchId: Uint256,
  round: Uint256,
  player: Address,
});

export const MoveRevealedArgs = z.object({
  matchId: Uint256,
  round: Uint256,
  player: Address,
  move: z.union([z.number().int().nonnegative(), z.bigint()]),
});

// AuctionWars uses `agent` instead of `player` for the bidder field.
export const BidCommittedArgs = z.object({
  matchId: Uint256,
  round: Uint256,
  agent: Address,
});

export const BidRevealedArgs = z.object({
  matchId: Uint256,
  round: Uint256,
  agent: Address,
  amount: Uint256,
});

export const AnswerCommittedArgs = z.object({
  matchId: Uint256,
  questionIndex: Uint256,
  player: Address,
});

export const AnswerRevealedArgs = z.object({
  matchId: Uint256,
  questionIndex: Uint256,
  player: Address,
  answer: Uint256,
});

export const BetPlacedArgs = z.object({
  matchId: Uint256,
  bettor: Address,
  predictedWinner: Address,
  amount: Uint256,
});

export const BettingOpenedArgs = z.object({
  matchId: Uint256,
  player1: Address,
  player2: Address,
});

export const BetsSettledArgs = z.object({
  matchId: Uint256,
  winner: Address,
});

/**
 * Parse `unknown` event args against `schema`. On failure, log structured
 * details and return null. Caller skips the row rather than crashing the
 * watcher loop.
 */
export function parseEventArgs<T>(
  schema: z.ZodType<T>,
  raw: unknown,
  context: { event: string }
): T | null {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  log.error("Event args failed schema validation", {
    event: context.event,
    issues: result.error.issues,
    raw: JSON.stringify(raw, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  });
  return null;
}
