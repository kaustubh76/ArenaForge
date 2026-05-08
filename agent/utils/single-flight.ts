// Single-flight wrapper: a function that runs at most once at a time.
//
// If a call lands while a previous invocation is still in flight, it is
// skipped (NOT queued). Skip count, last duration, and slow-tick detection
// are exposed for observability.
//
// Used by the heartbeat in agent/index.ts and the autonomous scheduler so a
// stalled tick doesn't pile up subsequent ticks.

import { getLogger } from "./logger";

export interface SingleFlightOptions {
  /** Tag for logs (e.g. "Heartbeat" or "Scheduler"). */
  tag: string;
  /** If a tick takes longer than this, log error. Optional. */
  slowMs?: number;
}

export interface SingleFlightResult {
  /** False if the call was skipped because a prior call was still running. */
  ran: boolean;
  /** Duration in ms when ran=true; 0 when skipped. */
  durationMs: number;
}

export function makeSingleFlight(options: SingleFlightOptions) {
  const log = getLogger(options.tag);
  let inFlight = false;
  let totalCalls = 0;
  let totalSkipped = 0;

  return {
    /** Run `fn` if not already running; return whether it ran + how long. */
    async run(fn: () => Promise<void>): Promise<SingleFlightResult> {
      totalCalls++;
      if (inFlight) {
        totalSkipped++;
        log.warn("Tick skipped: previous run still in flight", {
          totalCalls,
          totalSkipped,
        });
        return { ran: false, durationMs: 0 };
      }
      inFlight = true;
      const startedAt = Date.now();
      try {
        await fn();
        const durationMs = Date.now() - startedAt;
        if (options.slowMs && durationMs > options.slowMs) {
          log.error("Tick exceeded slow threshold", {
            durationMs,
            slowMs: options.slowMs,
          });
        }
        return { ran: true, durationMs };
      } finally {
        inFlight = false;
      }
    },

    /** Diagnostic counters. */
    stats(): { totalCalls: number; totalSkipped: number; inFlight: boolean } {
      return { totalCalls, totalSkipped, inFlight };
    },
  };
}
