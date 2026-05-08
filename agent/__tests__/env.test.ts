import { describe, it, expect, afterEach } from "vitest";
import { requireEnv, requireAddress, optionalAddress, envFlag } from "../utils/env";

const KEY = "__TEST_ENV_VAR__";
const original = process.env[KEY];

afterEach(() => {
  if (original === undefined) delete process.env[KEY];
  else process.env[KEY] = original;
});

describe("requireEnv", () => {
  it("returns the trimmed value when set", () => {
    process.env[KEY] = "  hello  ";
    expect(requireEnv(KEY)).toBe("hello");
  });

  it("throws when unset", () => {
    delete process.env[KEY];
    expect(() => requireEnv(KEY)).toThrow(/Missing required environment variable/);
  });

  it("throws when empty string", () => {
    process.env[KEY] = "";
    expect(() => requireEnv(KEY)).toThrow(/Missing required environment variable/);
  });

  it("throws when whitespace-only", () => {
    process.env[KEY] = "   ";
    expect(() => requireEnv(KEY)).toThrow(/Missing required environment variable/);
  });
});

describe("requireAddress", () => {
  it("returns a valid 0x address", () => {
    process.env[KEY] = "0x" + "ab".repeat(20);
    expect(requireAddress(KEY)).toBe("0x" + "ab".repeat(20));
  });

  it("trims surrounding whitespace before validating", () => {
    process.env[KEY] = "  0x" + "01".repeat(20) + "  ";
    expect(requireAddress(KEY)).toBe("0x" + "01".repeat(20));
  });

  it("throws when unset", () => {
    delete process.env[KEY];
    expect(() => requireAddress(KEY)).toThrow(/Missing required environment variable/);
  });

  it("throws when too short", () => {
    process.env[KEY] = "0xabc";
    expect(() => requireAddress(KEY)).toThrow(/not a valid 0x address/);
  });

  it("throws when missing 0x prefix", () => {
    process.env[KEY] = "ab".repeat(20);
    expect(() => requireAddress(KEY)).toThrow(/not a valid 0x address/);
  });

  it("throws when contains non-hex characters", () => {
    process.env[KEY] = "0x" + "ZZ".repeat(20);
    expect(() => requireAddress(KEY)).toThrow(/not a valid 0x address/);
  });
});

describe("optionalAddress", () => {
  it("returns null when unset", () => {
    delete process.env[KEY];
    expect(optionalAddress(KEY)).toBeNull();
  });

  it("returns null when whitespace-only", () => {
    process.env[KEY] = "   ";
    expect(optionalAddress(KEY)).toBeNull();
  });

  it("returns the address when valid", () => {
    process.env[KEY] = "0x" + "0a".repeat(20);
    expect(optionalAddress(KEY)).toBe("0x" + "0a".repeat(20));
  });

  it("throws on a malformed value (typo, not unset)", () => {
    process.env[KEY] = "0xnotreallyanaddress";
    expect(() => optionalAddress(KEY)).toThrow(/set but malformed/);
  });
});

describe("envFlag", () => {
  it("returns false by default when unset", () => {
    delete process.env[KEY];
    expect(envFlag(KEY)).toBe(false);
  });

  it("respects supplied default when unset", () => {
    delete process.env[KEY];
    expect(envFlag(KEY, true)).toBe(true);
  });

  it("returns true for 'true', '1', 'yes' (case-insensitive)", () => {
    process.env[KEY] = "true";
    expect(envFlag(KEY)).toBe(true);
    process.env[KEY] = "TRUE";
    expect(envFlag(KEY)).toBe(true);
    process.env[KEY] = "1";
    expect(envFlag(KEY)).toBe(true);
    process.env[KEY] = "yes";
    expect(envFlag(KEY)).toBe(true);
  });

  it("returns false for any other value", () => {
    process.env[KEY] = "false";
    expect(envFlag(KEY)).toBe(false);
    process.env[KEY] = "0";
    expect(envFlag(KEY)).toBe(false);
    process.env[KEY] = "no";
    expect(envFlag(KEY)).toBe(false);
    process.env[KEY] = "yolo";
    expect(envFlag(KEY)).toBe(false);
  });
});
