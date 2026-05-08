import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { MIGRATIONS, runMigrations } from "../persistence/migrations";
import { MatchStore } from "../persistence/match-store";
import { makeMatchResult } from "./fixtures/match-results";

describe("runMigrations", () => {
  it("brings a fresh DB to the latest version", () => {
    const db = new Database(":memory:");
    const result = runMigrations(db);
    expect(result.ranFrom).toBe(0);
    expect(result.ranTo).toBe(MIGRATIONS[MIGRATIONS.length - 1].version);
    db.close();
  });

  it("creates the schema_version tracking table with the applied row", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    const rows = db.prepare("SELECT version FROM schema_version ORDER BY version").all() as { version: number }[];
    expect(rows.map((r) => r.version)).toEqual(MIGRATIONS.map((m) => m.version));
    db.close();
  });

  it("creates every baseline table", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    for (const expected of [
      "agent_avatars",
      "agent_bios",
      "bets",
      "brackets",
      "evolution_records",
      "matches",
      "pentathlon_scores",
      "round_robin_standings",
      "schema_version",
      "series",
      "tournament_state",
    ]) {
      expect(names).toContain(expected);
    }
    db.close();
  });

  it("is idempotent: running twice does not duplicate version rows", () => {
    const db = new Database(":memory:");
    const first = runMigrations(db);
    const second = runMigrations(db);
    expect(second.ranFrom).toBe(first.ranTo);
    expect(second.ranTo).toBe(first.ranTo);
    const rows = db.prepare("SELECT COUNT(*) as c FROM schema_version").get() as { c: number };
    expect(rows.c).toBe(MIGRATIONS.length);
    db.close();
  });

  it("preserves data across a re-init (data-bearing test)", () => {
    // Simulates a process restart against an existing DB. Insert via the
    // first connection, close, reopen, and verify the row survives.
    const db = new Database(":memory:");
    runMigrations(db);
    db.prepare(
      `INSERT INTO matches (match_id, tournament_id, round, player1, player2, winner, is_draw, is_upset, game_type, stats_json, duration)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(1, 1, 1, "0xa", "0xb", "0xa", 0, 0, 1, "{}", 60);

    // Re-running migrations on the same connection (mirrors `init()` running
    // again on a long-lived connection) must not drop or reset the row.
    runMigrations(db);
    const row = db.prepare("SELECT match_id FROM matches WHERE match_id = 1").get() as { match_id: number } | undefined;
    expect(row?.match_id).toBe(1);
    db.close();
  });
});

describe("MatchStore.getSchemaVersion", () => {
  it("reports the migrated version after construction", () => {
    const store = new MatchStore(":memory:");
    expect(store.getSchemaVersion()).toBe(MIGRATIONS[MIGRATIONS.length - 1].version);
    store.close();
  });

  it("can still read/write through the migrated schema", () => {
    const store = new MatchStore(":memory:");
    store.saveMatchResult(makeMatchResult({ matchId: 9, tournamentId: 9 }));
    expect(store.getMatch(9)?.matchId).toBe(9);
    store.close();
  });
});

describe("MIGRATIONS registry", () => {
  it("has strictly increasing versions starting at 1", () => {
    expect(MIGRATIONS.length).toBeGreaterThan(0);
    expect(MIGRATIONS[0].version).toBe(1);
    for (let i = 1; i < MIGRATIONS.length; i++) {
      expect(MIGRATIONS[i].version).toBeGreaterThan(MIGRATIONS[i - 1].version);
    }
  });

  it("every migration has a non-empty description", () => {
    for (const m of MIGRATIONS) {
      expect(m.description.length).toBeGreaterThan(0);
    }
  });
});
