import { describe, it, expect } from "vitest";
import { AgentReadSchema, normalizeAgentRead } from "../../schemas/contracts";

describe("AgentReadSchema", () => {
  it("accepts a fully-populated agent struct", () => {
    const r = AgentReadSchema.safeParse({
      agentAddress: "0x" + "11".repeat(20),
      moltbookHandle: "alpha",
      avatarURI: "https://example.com/a.png",
      elo: 1500n,
      matchesPlayed: 24n,
      wins: 13n,
      losses: 11n,
      currentStreak: 2n,
      longestWinStreak: 5n,
      registered: true,
    });
    expect(r.success).toBe(true);
  });

  it("accepts an empty/zero struct (unregistered agent)", () => {
    const r = AgentReadSchema.safeParse({
      moltbookHandle: "",
      elo: 0n,
      matchesPlayed: 0n,
    });
    expect(r.success).toBe(true);
  });

  it("rejects a value where elo is a string", () => {
    const r = AgentReadSchema.safeParse({ elo: "1500" });
    expect(r.success).toBe(false);
  });

  it("passes through unknown extra fields (forward-compatible)", () => {
    const r = AgentReadSchema.safeParse({
      moltbookHandle: "x",
      futureField: "ignore me",
    });
    expect(r.success).toBe(true);
  });
});

describe("normalizeAgentRead", () => {
  it("returns ELO 1200 default and zeros for missing fields", () => {
    const out = normalizeAgentRead({});
    expect(out).toEqual({ handle: "", elo: 1200, matchesPlayed: 0, wins: 0, losses: 0 });
  });

  it("converts bigints to numbers", () => {
    const out = normalizeAgentRead({ elo: 1450n, matchesPlayed: 17n, wins: 9n, losses: 8n });
    expect(out).toEqual({ handle: "", elo: 1450, matchesPlayed: 17, wins: 9, losses: 8 });
  });

  it("applies the swap heuristic when elo<1000 and matchesPlayed>=1000", () => {
    // Simulates a buggy ABI that returned the two fields swapped.
    const out = normalizeAgentRead({ elo: 5n, matchesPlayed: 1500n });
    expect(out.elo).toBe(1500);
    expect(out.matchesPlayed).toBe(5);
  });

  it("does not apply the swap when both values are in normal range", () => {
    const out = normalizeAgentRead({ elo: 1500n, matchesPlayed: 24n });
    expect(out.elo).toBe(1500);
    expect(out.matchesPlayed).toBe(24);
  });
});
