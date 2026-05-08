import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getAuthContext, assertAdmin } from "../api/auth";
import { __setLogLevelForTests } from "../utils/logger";

const originalToken = process.env.ARENA_ADMIN_TOKEN;

beforeEach(() => {
  __setLogLevelForTests("silent");
});

afterEach(() => {
  if (originalToken === undefined) delete process.env.ARENA_ADMIN_TOKEN;
  else process.env.ARENA_ADMIN_TOKEN = originalToken;
});

describe("getAuthContext", () => {
  it("returns admin=false when ARENA_ADMIN_TOKEN is unset", () => {
    delete process.env.ARENA_ADMIN_TOKEN;
    expect(getAuthContext({ headers: { authorization: "Bearer anything" } })).toEqual({ admin: false });
  });

  it("returns admin=false when ARENA_ADMIN_TOKEN is empty", () => {
    process.env.ARENA_ADMIN_TOKEN = "";
    expect(getAuthContext({ headers: { authorization: "Bearer x" } })).toEqual({ admin: false });
  });

  it("returns admin=true on exact bearer match", () => {
    process.env.ARENA_ADMIN_TOKEN = "secret-12345";
    expect(getAuthContext({ headers: { authorization: "Bearer secret-12345" } })).toEqual({ admin: true });
  });

  it("returns admin=false on token mismatch", () => {
    process.env.ARENA_ADMIN_TOKEN = "secret-12345";
    expect(getAuthContext({ headers: { authorization: "Bearer wrong" } })).toEqual({ admin: false });
  });

  it("returns admin=false when authorization header is missing", () => {
    process.env.ARENA_ADMIN_TOKEN = "secret-12345";
    expect(getAuthContext({ headers: {} })).toEqual({ admin: false });
  });

  it("returns admin=false when scheme is not Bearer", () => {
    process.env.ARENA_ADMIN_TOKEN = "secret-12345";
    expect(getAuthContext({ headers: { authorization: "Basic c2VjcmV0LTEyMzQ1" } })).toEqual({ admin: false });
  });

  it("returns admin=false on length mismatch (early reject)", () => {
    process.env.ARENA_ADMIN_TOKEN = "secret-12345";
    expect(getAuthContext({ headers: { authorization: "Bearer s" } })).toEqual({ admin: false });
  });

  it("tolerates undefined req gracefully", () => {
    process.env.ARENA_ADMIN_TOKEN = "secret-12345";
    expect(getAuthContext(undefined)).toEqual({ admin: false });
  });
});

describe("assertAdmin", () => {
  it("throws when ctx.auth.admin is false", () => {
    expect(() => assertAdmin({ auth: { admin: false } }, "createTournament")).toThrow(/Unauthorized/);
  });

  it("throws when ctx.auth is undefined", () => {
    expect(() => assertAdmin({}, "createTournament")).toThrow(/Unauthorized/);
  });

  it("does not throw when admin", () => {
    expect(() => assertAdmin({ auth: { admin: true } }, "createTournament")).not.toThrow();
  });

  it("includes the action name in the error message", () => {
    try {
      assertAdmin({}, "pauseTournament");
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Error).message).toContain("pauseTournament");
    }
  });
});
