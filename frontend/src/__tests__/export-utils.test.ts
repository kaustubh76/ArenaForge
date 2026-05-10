import { describe, it, expect } from "vitest";
import {
  csvEscape,
  exportAgentsToCSV,
  exportAgentsToJSON,
  exportMatchesToCSV,
  exportMatchesToJSON,
  exportTournamentsToCSV,
  exportTournamentsToJSON,
} from "@/lib/export-utils";
import type {
  AgentProfileExtended,
  Match,
  Tournament,
} from "@/types/arena";
import {
  GameType,
  TournamentFormat,
  TournamentStatus,
  MatchStatus,
} from "@/types/arena";

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

function agent(overrides: Partial<AgentProfileExtended> = {}): AgentProfileExtended {
  return {
    agentAddress: "0x" + "ab".repeat(20),
    moltbookHandle: "alpha",
    elo: 1500,
    matchesPlayed: 24,
    wins: 14,
    losses: 10,
    registered: true,
    eloHistory: [1200, 1300, 1500],
    recentMatches: [],
    winRate: 58.33,
    streak: 3,
    ...overrides,
  };
}

function tournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 1,
    name: "Genesis Cup",
    gameType: GameType.StrategyArena,
    format: TournamentFormat.SwissSystem,
    status: TournamentStatus.Active,
    entryStake: "1000000000000000000",
    maxParticipants: 8,
    currentParticipants: 4,
    prizePool: "4000000000000000000",
    startTime: 1700000000,
    roundCount: 3,
    currentRound: 2,
    parametersHash: "0x" + "0".repeat(64),
    ...overrides,
  };
}

function match(overrides: Partial<Match> = {}): Match {
  return {
    id: 100,
    tournamentId: 1,
    round: 1,
    player1: "0x" + "11".repeat(20),
    player2: "0x" + "22".repeat(20),
    winner: "0x" + "11".repeat(20),
    resultHash: "0x" + "0".repeat(64),
    timestamp: 1700000123,
    status: MatchStatus.Completed,
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// csvEscape
// -----------------------------------------------------------------------------

describe("csvEscape", () => {
  it("returns the value unchanged when no special chars", () => {
    expect(csvEscape("hello")).toBe("hello");
    expect(csvEscape(42)).toBe("42");
  });

  it("returns empty string for null and undefined", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });

  it("wraps a value containing a comma in double quotes", () => {
    expect(csvEscape("Hello, world")).toBe('"Hello, world"');
  });

  it("wraps a value containing a newline in double quotes", () => {
    expect(csvEscape("a\nb")).toBe('"a\nb"');
    expect(csvEscape("a\r\nb")).toBe('"a\r\nb"');
  });

  it('doubles embedded double quotes per RFC 4180', () => {
    expect(csvEscape('She said "hi"')).toBe('"She said ""hi"""');
  });

  it("handles a value that contains both a comma and a quote", () => {
    expect(csvEscape('a,"b')).toBe('"a,""b"');
  });
});

// -----------------------------------------------------------------------------
// Agents
// -----------------------------------------------------------------------------

describe("exportAgentsToCSV", () => {
  it("emits the header row and one row per agent", () => {
    const csv = exportAgentsToCSV([agent({ moltbookHandle: "alpha" }), agent({ moltbookHandle: "bravo" })]);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[0]).toBe("Handle,Address,ELO,Matches,Wins,Losses,Win Rate,Streak");
    expect(lines[1]).toContain("alpha");
    expect(lines[2]).toContain("bravo");
  });

  it("escapes a handle containing a comma (regression)", () => {
    // Pre-fix: "Smith, Jr." would split into two columns and shift every
    // following field. Post-fix: the field is quoted so column count stays 8.
    const csv = exportAgentsToCSV([agent({ moltbookHandle: "Smith, Jr." })]);
    const dataRow = csv.split("\n")[1];
    // 8 columns means 7 commas — but commas inside quotes don't count.
    // Quick way to verify correctness: parse and check the first field.
    expect(dataRow.startsWith('"Smith, Jr."')).toBe(true);
  });

  it("escapes a handle containing a double quote (regression)", () => {
    const csv = exportAgentsToCSV([agent({ moltbookHandle: 'evil"name' })]);
    const dataRow = csv.split("\n")[1];
    // Embedded `"` becomes `""` and the whole field is quoted.
    expect(dataRow.startsWith('"evil""name"')).toBe(true);
  });

  it("returns just the header line for an empty agent list", () => {
    expect(exportAgentsToCSV([])).toBe("Handle,Address,ELO,Matches,Wins,Losses,Win Rate,Streak");
  });

  it("formats win rate with 2 decimals + percent suffix", () => {
    const csv = exportAgentsToCSV([agent({ winRate: 73.456789 })]);
    expect(csv).toContain("73.46%");
  });
});

describe("exportAgentsToJSON", () => {
  it("returns valid JSON parseable back to an array of agent records", () => {
    const json = exportAgentsToJSON([agent({ moltbookHandle: "alpha" })]);
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].handle).toBe("alpha");
    expect(parsed[0].elo).toBe(1500);
  });

  it("preserves ELO history array", () => {
    const json = exportAgentsToJSON([agent({ eloHistory: [1100, 1200, 1300] })]);
    const parsed = JSON.parse(json);
    expect(parsed[0].eloHistory).toEqual([1100, 1200, 1300]);
  });
});

// -----------------------------------------------------------------------------
// Matches
// -----------------------------------------------------------------------------

describe("exportMatchesToCSV", () => {
  it("uses 'N/A' for null winner", () => {
    const csv = exportMatchesToCSV([match({ winner: null })]);
    expect(csv).toContain("N/A");
  });

  it("converts MatchStatus enum to readable name", () => {
    const csv = exportMatchesToCSV([match({ status: MatchStatus.Disputed })]);
    expect(csv).toContain("Disputed");
  });

  it("formats timestamp as ISO 8601 (multiplies by 1000 for ms)", () => {
    const csv = exportMatchesToCSV([match({ timestamp: 1700000123 })]);
    // 1700000123 sec → 2023-11-14T22:15:23.000Z
    expect(csv).toContain("2023-11-14T22:15:23");
  });
});

describe("exportMatchesToJSON", () => {
  it("returns parseable JSON with status names instead of numeric enums", () => {
    const json = exportMatchesToJSON([match({ status: MatchStatus.InProgress })]);
    const parsed = JSON.parse(json);
    expect(parsed[0].status).toBe("InProgress");
  });
});

// -----------------------------------------------------------------------------
// Tournaments
// -----------------------------------------------------------------------------

describe("exportTournamentsToCSV", () => {
  it("escapes a tournament name containing a comma (regression)", () => {
    // The pre-fix code wrapped name in `"${name}"` but did NOT double
    // embedded quotes — and other fields were never quoted at all.
    const csv = exportTournamentsToCSV([tournament({ name: "Spring, 2024 Cup" })]);
    const lines = csv.split("\n");
    // Expect the data row to start with the quoted ID then the quoted name.
    // Header has 9 columns; data row should also have 9 columns when parsed.
    expect(lines[1]).toContain('"Spring, 2024 Cup"');
  });

  it("escapes a tournament name containing a double quote (regression)", () => {
    const csv = exportTournamentsToCSV([tournament({ name: 'a"b' })]);
    expect(csv).toContain('"a""b"');
  });

  it("renders gameType / status as readable strings", () => {
    const csv = exportTournamentsToCSV([
      tournament({ gameType: GameType.QuizBowl, status: TournamentStatus.Completed }),
    ]);
    expect(csv).toContain("Quiz Bowl");
    expect(csv).toContain("Completed");
  });

  it("returns header row only for empty input", () => {
    const csv = exportTournamentsToCSV([]);
    expect(csv.split("\n")).toHaveLength(1);
  });
});

describe("exportTournamentsToJSON", () => {
  it("nests participants and rounds as objects (current/max, current/total)", () => {
    const json = exportTournamentsToJSON([
      tournament({ currentParticipants: 4, maxParticipants: 8, currentRound: 2, roundCount: 3 }),
    ]);
    const parsed = JSON.parse(json);
    expect(parsed[0].participants).toEqual({ current: 4, max: 8 });
    expect(parsed[0].rounds).toEqual({ current: 2, total: 3 });
  });

  it("preserves names with embedded quotes (JSON-safe)", () => {
    const json = exportTournamentsToJSON([tournament({ name: 'a"b' })]);
    const parsed = JSON.parse(json);
    expect(parsed[0].name).toBe('a"b');
  });
});
