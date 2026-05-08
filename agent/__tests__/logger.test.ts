import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getLogger,
  __setLogLevelForTests,
  __setLogFormatForTests,
  type LogLevel,
} from "../utils/logger";

let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  // Force JSON for deterministic assertions; tests never see TTY.
  __setLogFormatForTests("json");
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  __setLogLevelForTests("silent");
});

function readWrites(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls.map((call) => String(call[0]));
}

function readJsonRecords(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown>[] {
  return readWrites(spy).map((line) => JSON.parse(line.trim()));
}

describe("logger — level gating", () => {
  it("emits info, warn, error when level=info", () => {
    __setLogLevelForTests("info");
    const log = getLogger("test");
    log.debug("hidden");
    log.info("visible");
    log.warn("visible");
    log.error("visible");

    expect(readWrites(stdoutSpy)).toHaveLength(1); // info
    expect(readWrites(stderrSpy)).toHaveLength(2); // warn + error
  });

  it("suppresses everything at level=silent", () => {
    __setLogLevelForTests("silent");
    const log = getLogger("test");
    log.error("nope");
    expect(readWrites(stdoutSpy)).toHaveLength(0);
    expect(readWrites(stderrSpy)).toHaveLength(0);
  });

  it("only error reaches stderr at level=error", () => {
    __setLogLevelForTests("error");
    const log = getLogger("test");
    log.warn("hidden");
    log.error("seen");
    expect(readWrites(stdoutSpy)).toHaveLength(0);
    expect(readWrites(stderrSpy)).toHaveLength(1);
  });
});

describe("logger — output shape", () => {
  it("JSON mode emits {ts, level, tag, msg, ...ctx}", () => {
    __setLogLevelForTests("debug");
    const log = getLogger("ContractClient");
    log.info("read ok", { method: "getMatchPool", matchId: 42 });

    const [record] = readJsonRecords(stdoutSpy);
    expect(record.level).toBe("info");
    expect(record.tag).toBe("ContractClient");
    expect(record.msg).toBe("read ok");
    expect(record.method).toBe("getMatchPool");
    expect(record.matchId).toBe(42);
    expect(typeof record.ts).toBe("string");
  });

  it("normalizes Error instances in ctx.error to {name, message, stack}", () => {
    __setLogLevelForTests("debug");
    const log = getLogger("test");
    const e = new Error("boom");
    log.error("caught", { error: e });

    const [record] = readJsonRecords(stderrSpy);
    const errCtx = record.error as Record<string, unknown>;
    expect(errCtx.name).toBe("Error");
    expect(errCtx.message).toBe("boom");
    expect(typeof errCtx.stack).toBe("string");
  });

  it("normalizes thrown non-Error values (e.g. strings)", () => {
    __setLogLevelForTests("debug");
    const log = getLogger("test");
    log.error("weird throw", { error: "just a string" });

    const [record] = readJsonRecords(stderrSpy);
    expect((record.error as Record<string, unknown>).value).toBe("just a string");
  });
});

describe("logger — child tags", () => {
  it("appends child segment with colon separator", () => {
    __setLogLevelForTests("debug");
    const parent = getLogger("ArenaManager");
    const child = parent.child("evolution");
    child.info("hi");

    const [record] = readJsonRecords(stdoutSpy);
    expect(record.tag).toBe("ArenaManager:evolution");
  });
});

describe("logger — pretty format", () => {
  it("emits a single line per call with timestamp + level + tag", () => {
    __setLogLevelForTests("info");
    __setLogFormatForTests("pretty");
    const log = getLogger("ArenaManager");
    log.info("hello", { tournamentId: 7 });

    const [line] = readWrites(stdoutSpy);
    expect(line.endsWith("\n")).toBe(true);
    expect(line).toContain("INFO");
    expect(line).toContain("[ArenaManager]");
    expect(line).toContain("hello");
    expect(line).toContain("tournamentId");
  });
});
