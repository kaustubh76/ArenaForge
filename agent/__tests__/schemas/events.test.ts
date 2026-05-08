import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  AgentRegisteredArgs,
  AgentJoinedTournamentArgs,
  MatchCompletedArgs,
  MoveCommittedArgs,
  BetPlacedArgs,
  parseEventArgs,
} from "../../schemas/events";
import { __setLogLevelForTests, __setLogFormatForTests } from "../../utils/logger";

beforeEach(() => {
  __setLogLevelForTests("silent");
  __setLogFormatForTests("json");
});

describe("event arg schemas — happy path", () => {
  it("accepts a valid AgentRegistered payload", () => {
    const r = AgentRegisteredArgs.safeParse({
      agent: "0x" + "ab".repeat(20),
      moltbookHandle: "alpha",
    });
    expect(r.success).toBe(true);
  });

  it("accepts a valid AgentJoinedTournament payload (bigint tournamentId)", () => {
    const r = AgentJoinedTournamentArgs.safeParse({
      tournamentId: 7n,
      agent: "0x" + "01".repeat(20),
    });
    expect(r.success).toBe(true);
  });

  it("accepts a valid MatchCompleted payload", () => {
    const r = MatchCompletedArgs.safeParse({
      matchId: 42n,
      winner: "0x" + "0a".repeat(20),
    });
    expect(r.success).toBe(true);
  });

  it("accepts MoveCommitted with bigint round", () => {
    const r = MoveCommittedArgs.safeParse({
      matchId: 1n,
      round: 3n,
      player: "0x" + "0b".repeat(20),
    });
    expect(r.success).toBe(true);
  });

  it("accepts BetPlaced with all four fields", () => {
    const r = BetPlacedArgs.safeParse({
      matchId: 9n,
      bettor: "0x" + "0c".repeat(20),
      predictedWinner: "0x" + "0d".repeat(20),
      amount: 1_000_000_000_000_000_000n,
    });
    expect(r.success).toBe(true);
  });
});

describe("event arg schemas — rejection", () => {
  it("rejects an address with bad length", () => {
    const r = AgentRegisteredArgs.safeParse({
      agent: "0xabc",
      moltbookHandle: "alpha",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a missing required field", () => {
    const r = AgentJoinedTournamentArgs.safeParse({ tournamentId: 1n });
    expect(r.success).toBe(false);
  });

  it("rejects a string where uint256 is required", () => {
    const r = MatchCompletedArgs.safeParse({
      matchId: "huge",
      winner: "0x" + "00".repeat(20),
    });
    expect(r.success).toBe(false);
  });
});

describe("parseEventArgs", () => {
  it("returns the parsed payload on success", () => {
    const payload = { agent: "0x" + "ab".repeat(20), moltbookHandle: "alpha" };
    const out = parseEventArgs(AgentRegisteredArgs, payload, { event: "AgentRegistered" });
    expect(out).toEqual(payload);
  });

  it("returns null on failure (caller skips the row)", () => {
    const out = parseEventArgs(AgentRegisteredArgs, { agent: "bad" }, { event: "AgentRegistered" });
    expect(out).toBeNull();
  });
});
