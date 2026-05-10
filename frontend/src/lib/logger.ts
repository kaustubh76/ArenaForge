// Browser-friendly leveled logger. Mirrors the agent's logger shape but
// writes through `console.*` methods (so DevTools formatting / source maps
// still work) instead of stdout/stderr streams.
//
// Default level:
//   - dev (`import.meta.env.DEV`): "info"
//   - prod (`import.meta.env.PROD`): "warn"
//   - tests (forced via __setLogLevelForTests): "silent"
// Override at runtime with VITE_LOG_LEVEL=debug|info|warn|error|silent.

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === "string" && value in LEVEL_RANK;
}

function resolveLevel(): LogLevel {
  const raw = (import.meta.env.VITE_LOG_LEVEL ?? "").toLowerCase();
  if (isLogLevel(raw)) return raw;
  if (import.meta.env.MODE === "test") return "silent";
  return import.meta.env.PROD ? "warn" : "info";
}

let currentLevel: LogLevel = resolveLevel();

export interface Logger {
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
  /** Returns a new logger with `tag` appended (e.g. parent="API", child="auth"). */
  child(tag: string): Logger;
  readonly tag: string;
}

function emit(
  level: Exclude<LogLevel, "silent">,
  tag: string,
  msg: string,
  ctx?: Record<string, unknown>,
): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[currentLevel]) return;
  const prefix = `[${tag}]`;
  // Use the matching console method so DevTools color-codes warnings/errors
  // and lets users filter by level in the inspector.
  const fn =
    level === "error" ? console.error
    : level === "warn" ? console.warn
    : level === "info" ? console.info
    : console.debug;
  if (ctx && Object.keys(ctx).length > 0) {
    fn(prefix, msg, ctx);
  } else {
    fn(prefix, msg);
  }
}

function makeLogger(tag: string): Logger {
  return {
    tag,
    debug: (msg, ctx) => emit("debug", tag, msg, ctx),
    info: (msg, ctx) => emit("info", tag, msg, ctx),
    warn: (msg, ctx) => emit("warn", tag, msg, ctx),
    error: (msg, ctx) => emit("error", tag, msg, ctx),
    child: (childTag) => makeLogger(`${tag}:${childTag}`),
  };
}

/** Create a tagged logger for a specific module. */
export function getLogger(tag: string): Logger {
  return makeLogger(tag);
}

/** Root logger — useful for one-off messages without a clear module tag. */
export const rootLogger: Logger = makeLogger("arenaforge");

// Test-only escape hatches. Production code should never call these.
export function __setLogLevelForTests(level: LogLevel): void {
  currentLevel = level;
}
export function __getLogLevelForTests(): LogLevel {
  return currentLevel;
}
