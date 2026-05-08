// Zod schemas for JSON blobs stored in SQLite. Replaces blind
// `as unknown as ...` casts when reading rows back from disk.

import { z } from "zod";
import { getLogger } from "../utils/logger";

const log = getLogger("PersistSchema");

export const MutationSchema = z.object({
  type: z.string(),
  factor: z.number().optional(),
  increment: z.number().optional(),
  strategy: z.string().optional(),
  reason: z.string(),
});

export const MutationArraySchema = z.array(MutationSchema);

export const EvolutionMetricsSchema = z.object({
  averageStakeBehavior: z.enum(["conservative", "moderate", "aggressive"]),
  dominantStrategy: z.string(),
  // Map<string, number> serializes as either an array of [k,v] tuples or as
  // a plain object depending on the writer; accept both and normalize.
  strategyDistribution: z.union([
    z.array(z.tuple([z.string(), z.number()])),
    z.record(z.string(), z.number()),
  ]),
  averageMatchDuration: z.number(),
  drawRate: z.number(),
});

/**
 * Parse a persisted evolution record. On schema failure logs and returns null
 * so the caller can skip the row instead of corrupting the in-memory history.
 */
export function parsePersistedMutations(raw: unknown, ctx: { tournamentId: number; round: number }) {
  const result = MutationArraySchema.safeParse(raw);
  if (result.success) return result.data;
  log.warn("Persisted mutations failed schema validation", {
    ...ctx,
    issues: result.error.issues,
  });
  return null;
}

export function parsePersistedMetrics(raw: unknown, ctx: { tournamentId: number; round: number }) {
  const result = EvolutionMetricsSchema.safeParse(raw);
  if (result.success) return result.data;
  log.warn("Persisted metrics failed schema validation", {
    ...ctx,
    issues: result.error.issues,
  });
  return null;
}
