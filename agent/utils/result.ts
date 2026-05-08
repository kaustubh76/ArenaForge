// Result<T, E>: discriminated union for operations that may fail.
//
// Used internally by hardened call sites in slice #2 (e.g. tryAsync wrappers
// around contract reads) so we can log failures and still return a typed
// "failure" branch to the caller. Public APIs in this slice keep their
// existing `T | null` / `[]` shapes to limit churn — Result is used as the
// internal carrier between `tryAsync` and the catch-site, then unwrapped at
// the boundary.

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(r: Result<T, E>): r is { ok: true; value: T } {
  return r.ok === true;
}

export function isErr<T, E>(r: Result<T, E>): r is { ok: false; error: E } {
  return r.ok === false;
}

/** Map the success value of a Result. The error branch passes through. */
export function map<T, U, E>(r: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return r.ok ? ok(fn(r.value)) : r;
}

/** Collapse a Result into a single value by handling both branches. */
export function fold<T, E, U>(
  r: Result<T, E>,
  onOk: (value: T) => U,
  onErr: (error: E) => U
): U {
  return r.ok ? onOk(r.value) : onErr(r.error);
}

/** Get the success value or a fallback. Useful at API boundaries. */
export function unwrapOr<T, E>(r: Result<T, E>, fallback: T): T {
  return r.ok ? r.value : fallback;
}

/**
 * Run an async function and capture any thrown value as an `err` branch.
 * The thrown value is coerced to an Error so callers always see a uniform
 * error shape.
 */
export async function tryAsync<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
  try {
    return ok(await fn());
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/** Synchronous twin of tryAsync. */
export function trySync<T>(fn: () => T): Result<T, Error> {
  try {
    return ok(fn());
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
