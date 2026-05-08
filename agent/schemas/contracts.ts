// Zod schemas for contract read return shapes. Replaces ad-hoc
// `as Record<string, unknown>` casts in the dataloader and resolver layers.
//
// viem returns bigint for uint256 and string for address. Some integer fields
// also legitimately come back as Number. Schemas accept both and the mapping
// helpers normalize to the JS primitives downstream code uses.

import { z } from "zod";

const Address = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

// Accept bigint or non-negative number; contract reads via viem return bigint
// for uint256 but cached/proxied values may be Number after JSON round-trip.
const Uint = z.union([z.bigint(), z.number().nonnegative()]);

// `getAgent` return shape (per ArenaCoreAbi tuple at agent/monad/contract-client.ts:25).
// All fields optional + permissive: a missing/zero value is normal for
// unregistered agents. Schemas reject only structurally-broken responses
// (e.g., elo as a string or array).
export const AgentReadSchema = z
  .object({
    agentAddress: Address.optional(),
    moltbookHandle: z.string().optional(),
    avatarURI: z.string().optional(),
    elo: Uint.optional(),
    matchesPlayed: Uint.optional(),
    wins: Uint.optional(),
    losses: Uint.optional(),
    currentStreak: z.union([z.bigint(), z.number()]).optional(),
    longestWinStreak: Uint.optional(),
    registered: z.boolean().optional(),
  })
  .passthrough(); // tolerate extra fields the contract may add

export type AgentRead = z.infer<typeof AgentReadSchema>;

/**
 * Normalize an `AgentReadSchema` output into the flat numeric shape
 * downstream code expects. Performs the historical ELO/matchesPlayed
 * heuristic swap (if the contract returns them swapped due to an old ABI
 * layout) — but keeps the swap explicit and easy to remove once the
 * contracts settle.
 */
export function normalizeAgentRead(parsed: AgentRead): {
  handle: string;
  elo: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
} {
  const handle = String(parsed.moltbookHandle ?? "");
  let elo = Number(parsed.elo ?? 1200);
  let matchesPlayed = Number(parsed.matchesPlayed ?? 0);

  // ABI/struct-mismatch fallback: if the contract returns the two swapped,
  // detect by magnitude (an ELO is realistically 100-3000; matchesPlayed for
  // an active agent rarely exceeds a few hundred).
  if (matchesPlayed >= 1000 && elo < 1000 && matchesPlayed > elo) {
    [elo, matchesPlayed] = [matchesPlayed, elo];
  }

  return {
    handle,
    elo: elo || 1200,
    matchesPlayed,
    wins: Number(parsed.wins ?? 0),
    losses: Number(parsed.losses ?? 0),
  };
}
