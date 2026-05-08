// Lightweight admin-token auth scaffolding for the GraphQL layer.
//
// Goal of slice #8: gate destructive mutations (createTournament,
// pauseTournament, resumeTournament, etc.) so an unauthenticated caller
// cannot trivially manipulate the arena. This is intentionally simple — a
// shared bearer token, compared in constant time. Per-user wallet auth is a
// separate, larger initiative.
//
// Behavior:
//   - If env var ARENA_ADMIN_TOKEN is set:
//       a request whose `Authorization: Bearer <token>` header matches
//       that value receives `{ admin: true }`. Anything else is `admin: false`.
//   - If ARENA_ADMIN_TOKEN is unset OR empty:
//       admin is `false` for ALL requests (closed by default). The agent
//       still serves queries normally — only mutations gated by
//       `assertAdmin` fail.

import { timingSafeEqual } from "crypto";
import type { IncomingMessage } from "http";
import { getLogger } from "../utils/logger";

const log = getLogger("Auth");

export interface AuthContext {
  admin: boolean;
}

/** Build the auth context for an incoming GraphQL request. */
export function getAuthContext(req: Pick<IncomingMessage, "headers"> | undefined): AuthContext {
  const expected = (process.env.ARENA_ADMIN_TOKEN ?? "").trim();
  if (!expected) return { admin: false };

  const header = req?.headers?.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) {
    return { admin: false };
  }

  const presented = header.slice("Bearer ".length).trim();
  if (presented.length === 0) return { admin: false };

  // Constant-time compare on equal-length buffers. timingSafeEqual throws if
  // lengths differ — pad shorter input to match expected.length so the
  // attacker can't infer the secret length.
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Length mismatch already leaks length, so just return false. We still
    // run a dummy compare to avoid varying time profiles wildly.
    timingSafeEqual(b, b);
    return { admin: false };
  }

  return { admin: timingSafeEqual(a, b) };
}

/**
 * Throw a structured error if the caller is not an admin. GraphQL surfaces
 * the message back to the client; do not include sensitive info.
 */
export function assertAdmin(ctx: { auth?: AuthContext }, action: string): void {
  if (!ctx.auth?.admin) {
    log.warn("Admin gate blocked request", { action });
    throw new Error(`Unauthorized: ${action} requires admin authentication`);
  }
}
