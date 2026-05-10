import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getLogger, __setLogLevelForTests } from "@/lib/logger";

let debugSpy: ReturnType<typeof vi.spyOn>;
let infoSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
  infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  debugSpy.mockRestore();
  infoSpy.mockRestore();
  warnSpy.mockRestore();
  errorSpy.mockRestore();
  __setLogLevelForTests("silent");
});

describe("logger — level gating", () => {
  it("emits debug+info+warn+error when level=debug", () => {
    __setLogLevelForTests("debug");
    const log = getLogger("Test");
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("suppresses lower levels when level=warn", () => {
    __setLogLevelForTests("warn");
    const log = getLogger("Test");
    log.debug("hidden");
    log.info("hidden");
    log.warn("seen");
    log.error("seen");
    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("suppresses everything at level=silent", () => {
    __setLogLevelForTests("silent");
    const log = getLogger("Test");
    log.error("nope");
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe("logger — output shape", () => {
  it("prefixes the tag in brackets", () => {
    __setLogLevelForTests("info");
    const log = getLogger("API");
    log.info("hello");
    expect(infoSpy).toHaveBeenCalledWith("[API]", "hello");
  });

  it("appends ctx object when provided", () => {
    __setLogLevelForTests("info");
    const log = getLogger("API");
    log.info("hello", { foo: 1 });
    expect(infoSpy).toHaveBeenCalledWith("[API]", "hello", { foo: 1 });
  });

  it("omits ctx object when empty", () => {
    __setLogLevelForTests("info");
    const log = getLogger("API");
    log.info("hello", {});
    expect(infoSpy).toHaveBeenCalledWith("[API]", "hello");
  });
});

describe("logger — child tags", () => {
  it("appends child segment with colon separator", () => {
    __setLogLevelForTests("info");
    const parent = getLogger("API");
    const child = parent.child("auth");
    child.info("hello");
    expect(infoSpy).toHaveBeenCalledWith("[API:auth]", "hello");
  });

  it("supports multiple levels of nesting", () => {
    __setLogLevelForTests("debug");
    const log = getLogger("A").child("B").child("C");
    log.debug("nested");
    expect(debugSpy).toHaveBeenCalledWith("[A:B:C]", "nested");
  });
});

describe("logger — channel routing", () => {
  it("routes error to console.error, warn to console.warn, etc.", () => {
    __setLogLevelForTests("debug");
    const log = getLogger("X");
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    // Each channel called exactly once.
    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
