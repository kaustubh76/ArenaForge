// KeyedMutex — per-key async serialization.
//
// Two ticks driving ArenaManager (the 30s heartbeat in agent/index.ts and the
// autonomous scheduler) plus fire-and-forget calls like
// `startTournament(id).catch(...)` in arena-manager itself can land
// concurrently on the same tournament state. The state machine assumes
// single-threaded access to `tournaments.get(id)` mutations.
//
// This mutex serializes critical sections per key (tournamentId). Calls with
// different keys still run concurrently — global serialization would defeat
// the whole point of running multiple tournaments in parallel.

export class KeyedMutex {
  private chains = new Map<string | number, Promise<unknown>>();

  /**
   * Run `fn` once any prior call with the same `key` has settled. Calls with
   * different keys do not block each other. Returns whatever `fn` returns.
   *
   * Errors thrown by `fn` are re-thrown to the caller; the chain still
   * advances so a single failure does not poison subsequent operations on
   * the same key.
   */
  async run<T>(key: string | number, fn: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(key) ?? Promise.resolve();

    let release!: (value: unknown) => void;
    const next = new Promise((resolve) => {
      release = resolve;
    });
    this.chains.set(key, next);

    try {
      // Wait for the previous holder to release. We catch its rejection so
      // a prior failure does not propagate into our own try/finally.
      await previous.catch(() => undefined);
      return await fn();
    } finally {
      release(undefined);
      // Clean up the chain reference if no one else has queued behind us.
      // This prevents the Map from growing unbounded across many tournaments.
      if (this.chains.get(key) === next) {
        this.chains.delete(key);
      }
    }
  }

  /** Approximate count of keys with pending work. Test-only diagnostic. */
  size(): number {
    return this.chains.size;
  }
}
