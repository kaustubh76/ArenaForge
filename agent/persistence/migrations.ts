// Schema migration registry for the SQLite match store.
//
// Each migration is identified by a monotonically increasing `version`. The
// runner in match-store.ts tracks applied versions in `schema_version` and
// skips any migration whose version <= max(applied). Adding a column or
// table is just appending a new entry here — never edit a published
// migration in place; write a new one.

import type Database from "better-sqlite3";
import { getLogger } from "../utils/logger";

const log = getLogger("Migrations");

export interface Migration {
  version: number;
  description: string;
  up: (db: Database.Database) => void;
}

/**
 * Migration #1 — Baseline. Encodes the existing schema verbatim from the
 * pre-migration `init()` block. Both fresh DBs and the pre-existing
 * `arena-data.sqlite` (which already has these tables) will land at v1: the
 * `IF NOT EXISTS` clauses make this idempotent.
 */
const baseline: Migration = {
  version: 1,
  description: "baseline schema (matches, tournaments, series, brackets, pentathlon, round_robin, bios, avatars, bets, evolution)",
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS matches (
        match_id INTEGER PRIMARY KEY,
        tournament_id INTEGER NOT NULL,
        round INTEGER NOT NULL,
        player1 TEXT NOT NULL,
        player2 TEXT NOT NULL,
        winner TEXT,
        is_draw INTEGER DEFAULT 0,
        is_upset INTEGER DEFAULT 0,
        game_type INTEGER NOT NULL,
        stats_json TEXT,
        duration INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE TABLE IF NOT EXISTS tournament_state (
        tournament_id INTEGER PRIMARY KEY,
        config_json TEXT NOT NULL,
        participants_json TEXT NOT NULL,
        rounds_json TEXT NOT NULL,
        current_round INTEGER DEFAULT 0,
        status TEXT NOT NULL,
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches(tournament_id);
      CREATE INDEX IF NOT EXISTS idx_matches_round ON matches(tournament_id, round);

      CREATE TABLE IF NOT EXISTS series (
        series_id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER NOT NULL,
        player1 TEXT NOT NULL,
        player2 TEXT NOT NULL,
        wins_required INTEGER NOT NULL,
        player1_wins INTEGER DEFAULT 0,
        player2_wins INTEGER DEFAULT 0,
        completed INTEGER DEFAULT 0,
        winner TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_series_tournament ON series(tournament_id);
      CREATE INDEX IF NOT EXISTS idx_series_players ON series(player1, player2);

      CREATE TABLE IF NOT EXISTS brackets (
        bracket_id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER NOT NULL UNIQUE,
        winners_bracket_json TEXT NOT NULL,
        losers_bracket_json TEXT,
        current_phase TEXT DEFAULT 'winners',
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_brackets_tournament ON brackets(tournament_id);

      CREATE TABLE IF NOT EXISTS pentathlon_scores (
        tournament_id INTEGER NOT NULL,
        agent_address TEXT NOT NULL,
        game_type INTEGER NOT NULL,
        event_rank INTEGER NOT NULL,
        points_earned INTEGER NOT NULL,
        PRIMARY KEY (tournament_id, agent_address, game_type)
      );

      CREATE INDEX IF NOT EXISTS idx_pentathlon_tournament ON pentathlon_scores(tournament_id);

      CREATE TABLE IF NOT EXISTS round_robin_standings (
        tournament_id INTEGER NOT NULL,
        agent_address TEXT NOT NULL,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        draws INTEGER DEFAULT 0,
        points INTEGER DEFAULT 0,
        games_played INTEGER DEFAULT 0,
        PRIMARY KEY (tournament_id, agent_address)
      );

      CREATE INDEX IF NOT EXISTS idx_rr_tournament ON round_robin_standings(tournament_id);

      CREATE TABLE IF NOT EXISTS agent_bios (
        address TEXT PRIMARY KEY,
        bio TEXT NOT NULL DEFAULT '',
        updated_at INTEGER DEFAULT (strftime('%s','now'))
      );

      CREATE TABLE IF NOT EXISTS agent_avatars (
        address TEXT PRIMARY KEY,
        avatar_url TEXT NOT NULL,
        updated_at INTEGER DEFAULT (strftime('%s','now'))
      );

      CREATE TABLE IF NOT EXISTS bets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id INTEGER NOT NULL,
        bettor TEXT NOT NULL,
        predicted_winner TEXT NOT NULL,
        amount TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        payout TEXT DEFAULT '0',
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_bets_bettor ON bets(LOWER(bettor));
      CREATE INDEX IF NOT EXISTS idx_bets_match ON bets(match_id);

      CREATE TABLE IF NOT EXISTS evolution_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER NOT NULL,
        round INTEGER NOT NULL,
        previous_params_hash TEXT NOT NULL,
        new_params_hash TEXT NOT NULL,
        mutations_json TEXT NOT NULL,
        metrics_json TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        UNIQUE(tournament_id, round)
      );

      CREATE INDEX IF NOT EXISTS idx_evolution_tournament ON evolution_records(tournament_id);
    `);
  },
};

/** All migrations in version order. Append new entries; never reorder. */
export const MIGRATIONS: Migration[] = [baseline];

/**
 * Apply every migration whose version is greater than the current schema
 * version. Each migration runs in its own transaction along with the
 * version-row insert, so a partial failure leaves the DB at the previous
 * version (no half-applied schemas).
 */
export function runMigrations(db: Database.Database): { ranFrom: number; ranTo: number } {
  // Bootstrap the version table.
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);

  const row = db.prepare("SELECT MAX(version) as v FROM schema_version").get() as { v: number | null };
  const current = row.v ?? 0;

  let last = current;
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    const apply = db.transaction(() => {
      m.up(db);
      db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(m.version);
    });
    apply();
    log.info("Applied migration", { version: m.version, description: m.description });
    last = m.version;
  }

  return { ranFrom: current, ranTo: last };
}
