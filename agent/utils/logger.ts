// Structured, leveled logger. Zero deps — keeps the bundle thin and avoids
// pulling pino/winston into a project that already runs Node natively.
//
// Replaces ad-hoc `console.log("[ArenaManager] ...")` calls with a tagged,
// level-gated, JSON-or-pretty output that observability tools can ingest.

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

function resolveLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "").toLowerCase();
  if (raw in LEVEL_RANK) return raw as LogLevel;
  return process.env.NODE_ENV === "test" ? "silent" : "info";
}

function resolveFormat(): "pretty" | "json" {
  const raw = (process.env.LOG_FORMAT ?? "").toLowerCase();
  if (raw === "json") return "json";
  if (raw === "pretty") return "pretty";
  // Default: pretty for TTYs, JSON for piped/prod (stdout is not a TTY in
  // containerized deploys).
  return process.stdout.isTTY ? "pretty" : "json";
}

let currentLevel: LogLevel = resolveLevel();
let currentFormat: "pretty" | "json" = resolveFormat();

export interface Logger {
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
  /** Returns a new logger with `tag` appended (e.g. parent="ArenaManager", child="evolution"). */
  child(tag: string): Logger;
  readonly tag: string;
}

function normalizeError(value: unknown): Record<string, unknown> {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  return { value };
}

function normalizeContext(ctx?: Record<string, unknown>): Record<string, unknown> {
  if (!ctx) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) {
    out[k] = k === "error" || k === "err" || v instanceof Error ? normalizeError(v) : v;
  }
  return out;
}

function emit(level: Exclude<LogLevel, "silent">, tag: string, msg: string, ctx?: Record<string, unknown>): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[currentLevel]) return;

  const record = {
    ts: new Date().toISOString(),
    level,
    tag,
    msg,
    ...normalizeContext(ctx),
  };

  // error/warn → stderr, info/debug → stdout. Matches observability conventions.
  const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;

  if (currentFormat === "json") {
    stream.write(JSON.stringify(record) + "\n");
  } else {
    const ctxStr = ctx && Object.keys(ctx).length > 0 ? " " + JSON.stringify(normalizeContext(ctx)) : "";
    stream.write(`${record.ts} ${level.toUpperCase().padEnd(5)} [${tag}] ${msg}${ctxStr}\n`);
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

export const rootLogger: Logger = makeLogger("arenaforge");

/** Create a tagged logger for a specific module. */
export function getLogger(tag: string): Logger {
  return makeLogger(tag);
}

// Test-only escape hatches. Production code never calls these.
export function __setLogLevelForTests(level: LogLevel): void {
  currentLevel = level;
}
export function __getLogLevelForTests(): LogLevel {
  return currentLevel;
}
export function __setLogFormatForTests(format: "pretty" | "json"): void {
  currentFormat = format;
}
