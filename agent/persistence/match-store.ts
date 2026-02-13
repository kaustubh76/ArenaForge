import Database from "better-sqlite3";
import type {
  TournamentState,
  MatchResult,
  AgentStanding,
  RoundData,
  Bracket,
  GameType,
} from "../game-engine/game-mode.interface";

const DB_PATH = process.env.ARENA_DB_PATH || "./arena-data.sqlite";

interface MatchRow {
  match_id: number;
  tournament_id: number;
  round: number;
  player1: string;
  player2: string;
  winner: string | null;
  is_draw: number;
  is_upset: number;
  game_type: number;
  stats_json: string;
  duration: number;
  created_at: number;
}

interface TournamentStateRow {
  tournament_id: number;
  config_json: string;
  participants_json: string;
  rounds_json: string;
  current_round: number;
  status: string;
  updated_at: number;
}

interface SeriesRow {
  series_id: number;
  tournament_id: number;
  player1: string;
  player2: string;
  wins_required: number;
  player1_wins: number;
  player2_wins: number;
  completed: number;
  winner: string | null;
  created_at: number;
}

interface BracketRow {
  bracket_id: number;
  tournament_id: number;
  winners_bracket_json: string;
  losers_bracket_json: string | null;
  current_phase: string;
  updated_at: number;
}

interface PentathlonScoreRow {
  tournament_id: number;
  agent_address: string;
  game_type: number;
  event_rank: number;
  points_earned: number;
}

interface RoundRobinStandingRow {
  tournament_id: number;
  agent_address: string;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  games_played: number;
}

export interface SeriesData {
  seriesId: number;
  tournamentId: number;
  player1: string;
  player2: string;
  winsRequired: number;
  player1Wins: number;
  player2Wins: number;
  completed: boolean;
  winner: string | null;
}

export interface PentathlonScore {
  tournamentId: number;
  agentAddress: string;
  gameType: GameType;
  eventRank: number;
  pointsEarned: number;
}

export interface RoundRobinStanding {
  tournamentId: number;
  agentAddress: string;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  gamesPlayed: number;
}

export class MatchStore {
  private db: Database.Database;
  private initialized = false;

  constructor(dbPath: string = DB_PATH) {
    this.db = new Database(dbPath);
    this.init();
  }

  private init(): void {
    if (this.initialized) return;

    // Enable WAL mode for better concurrent access
    this.db.pragma("journal_mode = WAL");

    // Create tables
    this.db.exec(`
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

      -- Series tracking for Best-of-N format
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

      -- Bracket tracking for Double Elimination format
      CREATE TABLE IF NOT EXISTS brackets (
        bracket_id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER NOT NULL UNIQUE,
        winners_bracket_json TEXT NOT NULL,
        losers_bracket_json TEXT,
        current_phase TEXT DEFAULT 'winners',
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_brackets_tournament ON brackets(tournament_id);

      -- Pentathlon event scores
      CREATE TABLE IF NOT EXISTS pentathlon_scores (
        tournament_id INTEGER NOT NULL,
        agent_address TEXT NOT NULL,
        game_type INTEGER NOT NULL,
        event_rank INTEGER NOT NULL,
        points_earned INTEGER NOT NULL,
        PRIMARY KEY (tournament_id, agent_address, game_type)
      );

      CREATE INDEX IF NOT EXISTS idx_pentathlon_tournament ON pentathlon_scores(tournament_id);

      -- Round Robin standings
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

      -- Agent bios
      CREATE TABLE IF NOT EXISTS agent_bios (
        address TEXT PRIMARY KEY,
        bio TEXT NOT NULL DEFAULT '',
        updated_at INTEGER DEFAULT (strftime('%s','now'))
      );

      -- Agent avatars
      CREATE TABLE IF NOT EXISTS agent_avatars (
        address TEXT PRIMARY KEY,
        avatar_url TEXT NOT NULL,
        updated_at INTEGER DEFAULT (strftime('%s','now'))
      );
    `);

    this.initialized = true;
    console.log("[MatchStore] Database initialized at", DB_PATH);
  }

  /**
   * Save a match result to the database.
   */
  saveMatchResult(result: MatchResult): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO matches
      (match_id, tournament_id, round, player1, player2, winner, is_draw, is_upset, game_type, stats_json, duration)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      result.matchId,
      result.tournamentId,
      result.round,
      result.loser ? (result.winner === result.loser ? "" : result.loser) : "",
      result.winner || "",
      result.winner,
      result.isDraw ? 1 : 0,
      result.isUpset ? 1 : 0,
      result.gameType,
      JSON.stringify(result.stats || {}),
      result.duration
    );
  }

  /**
   * Get all matches for a tournament.
   */
  getMatchesByTournament(tournamentId: number): MatchResult[] {
    const stmt = this.db.prepare(`
      SELECT * FROM matches WHERE tournament_id = ? ORDER BY round ASC, match_id ASC
    `);

    const rows = stmt.all(tournamentId) as MatchRow[];
    return rows.map(this.rowToMatchResult);
  }

  /**
   * Get matches for a specific round.
   */
  getMatchesByRound(tournamentId: number, round: number): MatchResult[] {
    const stmt = this.db.prepare(`
      SELECT * FROM matches WHERE tournament_id = ? AND round = ? ORDER BY match_id ASC
    `);

    const rows = stmt.all(tournamentId, round) as MatchRow[];
    return rows.map(this.rowToMatchResult);
  }

  /**
   * Get a specific match by ID.
   */
  getMatch(matchId: number): MatchResult | null {
    const stmt = this.db.prepare(`SELECT * FROM matches WHERE match_id = ?`);
    const row = stmt.get(matchId) as MatchRow | undefined;
    return row ? this.rowToMatchResult(row) : null;
  }

  /**
   * Save tournament state snapshot.
   */
  saveTournamentState(tournamentId: number, state: TournamentState): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO tournament_state
      (tournament_id, config_json, participants_json, rounds_json, current_round, status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
    `);

    stmt.run(
      tournamentId,
      JSON.stringify(state.config),
      JSON.stringify(state.participants),
      JSON.stringify(state.rounds),
      state.currentRound,
      state.status
    );
  }

  /**
   * Load tournament state from database.
   */
  loadTournamentState(tournamentId: number): TournamentState | null {
    const stmt = this.db.prepare(`
      SELECT * FROM tournament_state WHERE tournament_id = ?
    `);

    const row = stmt.get(tournamentId) as TournamentStateRow | undefined;
    if (!row) return null;

    return {
      config: JSON.parse(row.config_json),
      participants: JSON.parse(row.participants_json) as AgentStanding[],
      rounds: JSON.parse(row.rounds_json) as RoundData[],
      currentRound: row.current_round,
      status: row.status as "open" | "active" | "completing" | "completed",
    };
  }

  /**
   * Get all active/open tournament IDs from database.
   */
  getActiveTournamentIds(): number[] {
    const stmt = this.db.prepare(`
      SELECT tournament_id FROM tournament_state
      WHERE status IN ('open', 'active', 'completing')
    `);

    const rows = stmt.all() as Array<{ tournament_id: number }>;
    return rows.map((r) => r.tournament_id);
  }

  /**
   * Delete tournament state (after completion).
   */
  deleteTournamentState(tournamentId: number): void {
    const stmt = this.db.prepare(`DELETE FROM tournament_state WHERE tournament_id = ?`);
    stmt.run(tournamentId);
  }

  /**
   * Get recent matches across all tournaments.
   */
  getRecentMatches(limit: number = 50): MatchResult[] {
    const stmt = this.db.prepare(`
      SELECT * FROM matches ORDER BY created_at DESC LIMIT ?
    `);

    const rows = stmt.all(limit) as MatchRow[];
    return rows.map(this.rowToMatchResult);
  }

  /**
   * Get all matches between two specific agents.
   */
  getMatchesBetweenAgents(agent1: string, agent2: string): MatchResult[] {
    const a1 = agent1.toLowerCase();
    const a2 = agent2.toLowerCase();
    const stmt = this.db.prepare(`
      SELECT * FROM matches
      WHERE (LOWER(player1) = ? AND LOWER(player2) = ?)
         OR (LOWER(player1) = ? AND LOWER(player2) = ?)
      ORDER BY created_at DESC
    `);
    const rows = stmt.all(a1, a2, a2, a1) as MatchRow[];
    return rows.map(this.rowToMatchResult);
  }

  /**
   * Get all matches involving a specific agent.
   */
  getMatchesByAgent(agent: string): MatchResult[] {
    const a = agent.toLowerCase();
    const stmt = this.db.prepare(`
      SELECT * FROM matches
      WHERE LOWER(player1) = ? OR LOWER(player2) = ? OR LOWER(winner) = ?
      ORDER BY created_at DESC
    `);
    const rows = stmt.all(a, a, a) as MatchRow[];
    return rows.map(this.rowToMatchResult);
  }

  // ============================================
  // Series Methods (Best-of-N)
  // ============================================

  /**
   * Create a new series for Best-of-N format.
   */
  createSeries(
    tournamentId: number,
    player1: string,
    player2: string,
    winsRequired: number
  ): number {
    const stmt = this.db.prepare(`
      INSERT INTO series (tournament_id, player1, player2, wins_required)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(tournamentId, player1, player2, winsRequired);
    return Number(result.lastInsertRowid);
  }

  /**
   * Update series with a game result.
   */
  updateSeriesResult(seriesId: number, winner: string): SeriesData | null {
    const series = this.getSeries(seriesId);
    if (!series || series.completed) return null;

    const isPlayer1Win = winner === series.player1;
    const newPlayer1Wins = series.player1Wins + (isPlayer1Win ? 1 : 0);
    const newPlayer2Wins = series.player2Wins + (isPlayer1Win ? 0 : 1);
    const completed = newPlayer1Wins >= series.winsRequired || newPlayer2Wins >= series.winsRequired;
    const seriesWinner = completed
      ? (newPlayer1Wins >= series.winsRequired ? series.player1 : series.player2)
      : null;

    const stmt = this.db.prepare(`
      UPDATE series
      SET player1_wins = ?, player2_wins = ?, completed = ?, winner = ?
      WHERE series_id = ?
    `);
    stmt.run(newPlayer1Wins, newPlayer2Wins, completed ? 1 : 0, seriesWinner, seriesId);

    return this.getSeries(seriesId);
  }

  /**
   * Get a series by ID.
   */
  getSeries(seriesId: number): SeriesData | null {
    const stmt = this.db.prepare(`SELECT * FROM series WHERE series_id = ?`);
    const row = stmt.get(seriesId) as SeriesRow | undefined;
    return row ? this.rowToSeriesData(row) : null;
  }

  /**
   * Get all series for a tournament.
   */
  getSeriesByTournament(tournamentId: number): SeriesData[] {
    const stmt = this.db.prepare(`
      SELECT * FROM series WHERE tournament_id = ? ORDER BY series_id ASC
    `);
    const rows = stmt.all(tournamentId) as SeriesRow[];
    return rows.map(this.rowToSeriesData);
  }

  /**
   * Get active (incomplete) series for a tournament.
   */
  getActiveSeriesByTournament(tournamentId: number): SeriesData[] {
    const stmt = this.db.prepare(`
      SELECT * FROM series WHERE tournament_id = ? AND completed = 0 ORDER BY series_id ASC
    `);
    const rows = stmt.all(tournamentId) as SeriesRow[];
    return rows.map(this.rowToSeriesData);
  }

  /**
   * Delete all series for a tournament.
   */
  deleteSeriesByTournament(tournamentId: number): void {
    const stmt = this.db.prepare(`DELETE FROM series WHERE tournament_id = ?`);
    stmt.run(tournamentId);
  }

  private rowToSeriesData(row: SeriesRow): SeriesData {
    return {
      seriesId: row.series_id,
      tournamentId: row.tournament_id,
      player1: row.player1,
      player2: row.player2,
      winsRequired: row.wins_required,
      player1Wins: row.player1_wins,
      player2Wins: row.player2_wins,
      completed: row.completed === 1,
      winner: row.winner,
    };
  }

  // ============================================
  // Bracket Methods (Double Elimination)
  // ============================================

  /**
   * Save or update bracket state.
   */
  saveBracket(tournamentId: number, bracket: Bracket): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO brackets
      (tournament_id, winners_bracket_json, losers_bracket_json, current_phase, updated_at)
      VALUES (?, ?, ?, ?, strftime('%s', 'now'))
    `);
    stmt.run(
      tournamentId,
      JSON.stringify(bracket.rounds),
      bracket.losersRounds ? JSON.stringify(bracket.losersRounds) : null,
      bracket.currentPhase ?? "winners"
    );
  }

  /**
   * Get bracket for a tournament.
   */
  getBracket(tournamentId: number): Bracket | null {
    const stmt = this.db.prepare(`SELECT * FROM brackets WHERE tournament_id = ?`);
    const row = stmt.get(tournamentId) as BracketRow | undefined;
    if (!row) return null;

    return {
      type: "double",
      rounds: JSON.parse(row.winners_bracket_json),
      losersRounds: row.losers_bracket_json ? JSON.parse(row.losers_bracket_json) : undefined,
      currentPhase: row.current_phase as "winners" | "losers" | "grand_final" | "reset",
    };
  }

  /**
   * Delete bracket for a tournament.
   */
  deleteBracket(tournamentId: number): void {
    const stmt = this.db.prepare(`DELETE FROM brackets WHERE tournament_id = ?`);
    stmt.run(tournamentId);
  }

  // ============================================
  // Pentathlon Methods
  // ============================================

  /**
   * Save a pentathlon event score.
   */
  savePentathlonScore(score: PentathlonScore): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO pentathlon_scores
      (tournament_id, agent_address, game_type, event_rank, points_earned)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      score.tournamentId,
      score.agentAddress,
      score.gameType,
      score.eventRank,
      score.pointsEarned
    );
  }

  /**
   * Get all pentathlon scores for a tournament.
   */
  getPentathlonScores(tournamentId: number): PentathlonScore[] {
    const stmt = this.db.prepare(`
      SELECT * FROM pentathlon_scores WHERE tournament_id = ? ORDER BY agent_address, game_type
    `);
    const rows = stmt.all(tournamentId) as PentathlonScoreRow[];
    return rows.map((row) => ({
      tournamentId: row.tournament_id,
      agentAddress: row.agent_address,
      gameType: row.game_type as GameType,
      eventRank: row.event_rank,
      pointsEarned: row.points_earned,
    }));
  }

  /**
   * Get aggregated pentathlon standings (total points by agent).
   */
  getPentathlonStandings(tournamentId: number): Array<{ agentAddress: string; totalPoints: number }> {
    const stmt = this.db.prepare(`
      SELECT agent_address, SUM(points_earned) as total_points
      FROM pentathlon_scores
      WHERE tournament_id = ?
      GROUP BY agent_address
      ORDER BY total_points DESC
    `);
    const rows = stmt.all(tournamentId) as Array<{ agent_address: string; total_points: number }>;
    return rows.map((row) => ({
      agentAddress: row.agent_address,
      totalPoints: row.total_points,
    }));
  }

  /**
   * Delete all pentathlon scores for a tournament.
   */
  deletePentathlonScores(tournamentId: number): void {
    const stmt = this.db.prepare(`DELETE FROM pentathlon_scores WHERE tournament_id = ?`);
    stmt.run(tournamentId);
  }

  // ============================================
  // Round Robin Methods
  // ============================================

  /**
   * Initialize round robin standings for all participants.
   */
  initRoundRobinStandings(tournamentId: number, participants: string[]): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO round_robin_standings
      (tournament_id, agent_address, wins, losses, draws, points, games_played)
      VALUES (?, ?, 0, 0, 0, 0, 0)
    `);

    const insertMany = this.db.transaction((addresses: string[]) => {
      for (const address of addresses) {
        stmt.run(tournamentId, address);
      }
    });
    insertMany(participants);
  }

  /**
   * Update round robin standing after a match.
   */
  updateRoundRobinResult(
    tournamentId: number,
    player1: string,
    player2: string,
    winner: string | null,
    isDraw: boolean
  ): void {
    const updateStmt = this.db.prepare(`
      UPDATE round_robin_standings
      SET wins = wins + ?, losses = losses + ?, draws = draws + ?,
          points = points + ?, games_played = games_played + 1
      WHERE tournament_id = ? AND agent_address = ?
    `);

    if (isDraw) {
      // Draw: both get 1 point
      updateStmt.run(0, 0, 1, 1, tournamentId, player1);
      updateStmt.run(0, 0, 1, 1, tournamentId, player2);
    } else if (winner) {
      const loser = winner === player1 ? player2 : player1;
      // Winner: 3 points, Loser: 0 points
      updateStmt.run(1, 0, 0, 3, tournamentId, winner);
      updateStmt.run(0, 1, 0, 0, tournamentId, loser);
    }
  }

  /**
   * Get round robin standings for a tournament.
   */
  getRoundRobinStandings(tournamentId: number): RoundRobinStanding[] {
    const stmt = this.db.prepare(`
      SELECT * FROM round_robin_standings
      WHERE tournament_id = ?
      ORDER BY points DESC, wins DESC, (wins - losses) DESC
    `);
    const rows = stmt.all(tournamentId) as RoundRobinStandingRow[];
    return rows.map((row) => ({
      tournamentId: row.tournament_id,
      agentAddress: row.agent_address,
      wins: row.wins,
      losses: row.losses,
      draws: row.draws,
      points: row.points,
      gamesPlayed: row.games_played,
    }));
  }

  /**
   * Delete round robin standings for a tournament.
   */
  deleteRoundRobinStandings(tournamentId: number): void {
    const stmt = this.db.prepare(`DELETE FROM round_robin_standings WHERE tournament_id = ?`);
    stmt.run(tournamentId);
  }

  // ============================================
  // Cleanup Methods
  // ============================================

  /**
   * Clean up all format-specific data for a tournament.
   */
  cleanupTournamentFormatData(tournamentId: number): void {
    this.deleteSeriesByTournament(tournamentId);
    this.deleteBracket(tournamentId);
    this.deletePentathlonScores(tournamentId);
    this.deleteRoundRobinStandings(tournamentId);
  }

  // ============================================
  // Analytics Methods
  // ============================================

  /**
   * Get average match duration grouped by game type.
   */
  getAverageDurationByGameType(): Array<{ gameType: number; avgDuration: number; matchCount: number }> {
    const stmt = this.db.prepare(`
      SELECT game_type, AVG(duration) as avg_duration, COUNT(*) as match_count
      FROM matches
      WHERE duration > 0
      GROUP BY game_type
      ORDER BY game_type
    `);
    const rows = stmt.all() as Array<{ game_type: number; avg_duration: number; match_count: number }>;
    return rows.map(r => ({
      gameType: r.game_type,
      avgDuration: Math.round(r.avg_duration),
      matchCount: r.match_count,
    }));
  }

  /**
   * Get per-game-type stats for a specific agent.
   */
  getAgentGameTypeStats(agent: string): Array<{
    gameType: number;
    wins: number;
    losses: number;
    draws: number;
    avgDuration: number;
    winRate: number;
  }> {
    const a = agent.toLowerCase();
    const stmt = this.db.prepare(`
      SELECT game_type,
        SUM(CASE WHEN LOWER(winner) = ? THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN is_draw = 0 AND (LOWER(winner) != ? OR winner IS NULL) AND (LOWER(player1) = ? OR LOWER(player2) = ?) THEN 1 ELSE 0 END) as losses,
        SUM(CASE WHEN is_draw = 1 THEN 1 ELSE 0 END) as draws,
        AVG(duration) as avg_duration,
        COUNT(*) as total
      FROM matches
      WHERE LOWER(player1) = ? OR LOWER(player2) = ?
      GROUP BY game_type
      ORDER BY game_type
    `);
    const rows = stmt.all(a, a, a, a, a, a) as Array<{
      game_type: number;
      wins: number;
      losses: number;
      draws: number;
      avg_duration: number;
      total: number;
    }>;
    return rows.map(r => ({
      gameType: r.game_type,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
      avgDuration: Math.round(r.avg_duration || 0),
      winRate: r.total > 0 ? r.wins / r.total : 0,
    }));
  }

  /**
   * Get leaderboard ranked by performance in a specific game type.
   */
  getGameTypeLeaderboard(gameType: number, limit = 50): Array<{
    address: string;
    wins: number;
    losses: number;
    draws: number;
    total: number;
    winRate: number;
    avgDuration: number;
  }> {
    const stmt = this.db.prepare(`
      SELECT address,
        SUM(wins) as wins,
        SUM(losses) as losses,
        SUM(draws) as draws,
        SUM(wins + losses + draws) as total,
        AVG(avg_dur) as avg_duration
      FROM (
        SELECT LOWER(player1) as address,
          SUM(CASE WHEN LOWER(winner) = LOWER(player1) THEN 1 ELSE 0 END) as wins,
          SUM(CASE WHEN is_draw = 0 AND (LOWER(winner) != LOWER(player1) OR winner IS NULL) THEN 1 ELSE 0 END) as losses,
          SUM(CASE WHEN is_draw = 1 THEN 1 ELSE 0 END) as draws,
          AVG(duration) as avg_dur
        FROM matches WHERE game_type = ?
        GROUP BY LOWER(player1)
        UNION ALL
        SELECT LOWER(player2) as address,
          SUM(CASE WHEN LOWER(winner) = LOWER(player2) THEN 1 ELSE 0 END) as wins,
          SUM(CASE WHEN is_draw = 0 AND (LOWER(winner) != LOWER(player2) OR winner IS NULL) THEN 1 ELSE 0 END) as losses,
          SUM(CASE WHEN is_draw = 1 THEN 1 ELSE 0 END) as draws,
          AVG(duration) as avg_dur
        FROM matches WHERE game_type = ?
        GROUP BY LOWER(player2)
      ) sub
      GROUP BY address
      ORDER BY wins DESC
      LIMIT ?
    `);
    const rows = stmt.all(gameType, gameType, limit) as Array<{
      address: string;
      wins: number;
      losses: number;
      draws: number;
      total: number;
      avg_duration: number;
    }>;
    return rows.map(r => ({
      address: r.address,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
      total: r.total,
      winRate: r.total > 0 ? r.wins / r.total : 0,
      avgDuration: Math.round(r.avg_duration || 0),
    }));
  }

  /**
   * Get Strategy Arena cooperation/defection patterns for an agent.
   * Parses stats_json for game_type=1 matches.
   */
  getStrategyPatterns(agent: string): {
    totalGames: number;
    cooperateRate: number;
    defectRate: number;
    avgPayoff: number;
  } | null {
    const a = agent.toLowerCase();
    const stmt = this.db.prepare(`
      SELECT stats_json, player1, player2
      FROM matches
      WHERE game_type = 1 AND (LOWER(player1) = ? OR LOWER(player2) = ?)
    `);
    const rows = stmt.all(a, a) as Array<{ stats_json: string; player1: string; player2: string }>;

    if (rows.length === 0) return null;

    let totalMoves = 0;
    let cooperateCount = 0;
    let defectCount = 0;
    let totalPayoff = 0;

    for (const row of rows) {
      try {
        const stats = JSON.parse(row.stats_json || "{}");
        if (!Array.isArray(stats.rounds)) continue;

        const isPlayer1 = row.player1.toLowerCase() === a;
        for (const round of stats.rounds) {
          const move = isPlayer1 ? round.player1Move : round.player2Move;
          const payoff = isPlayer1 ? round.player1Payoff : round.player2Payoff;
          if (move === "Cooperate") cooperateCount++;
          else if (move === "Defect") defectCount++;
          totalPayoff += Number(payoff || 0);
          totalMoves++;
        }
      } catch {
        // Skip unparseable
      }
    }

    if (totalMoves === 0) return null;

    return {
      totalGames: rows.length,
      cooperateRate: cooperateCount / totalMoves,
      defectRate: defectCount / totalMoves,
      avgPayoff: totalPayoff / totalMoves,
    };
  }

  /**
   * Get all match durations for trend analysis.
   */
  getAllMatchDurations(): Array<{ matchId: number; gameType: number; duration: number; timestamp: number }> {
    const stmt = this.db.prepare(`
      SELECT match_id, game_type, duration, created_at
      FROM matches
      WHERE duration > 0
      ORDER BY created_at ASC
    `);
    const rows = stmt.all() as Array<{ match_id: number; game_type: number; duration: number; created_at: number }>;
    return rows.map(r => ({
      matchId: r.match_id,
      gameType: r.game_type,
      duration: r.duration,
      timestamp: r.created_at,
    }));
  }

  // ============================================
  // Agent Bios
  // ============================================

  getAgentBio(address: string): string | null {
    const stmt = this.db.prepare(`SELECT bio FROM agent_bios WHERE LOWER(address) = ?`);
    const row = stmt.get(address.toLowerCase()) as { bio: string } | undefined;
    return row?.bio ?? null;
  }

  setAgentBio(address: string, bio: string): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO agent_bios (address, bio, updated_at)
      VALUES (?, ?, strftime('%s','now'))
    `);
    stmt.run(address.toLowerCase(), bio);
  }

  // ============================================
  // Agent Avatars
  // ============================================

  getAgentAvatar(address: string): string | null {
    const stmt = this.db.prepare(`SELECT avatar_url FROM agent_avatars WHERE LOWER(address) = ?`);
    const row = stmt.get(address.toLowerCase()) as { avatar_url: string } | undefined;
    return row?.avatar_url ?? null;
  }

  setAgentAvatar(address: string, avatarUrl: string): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO agent_avatars (address, avatar_url, updated_at)
      VALUES (?, ?, strftime('%s','now'))
    `);
    stmt.run(address.toLowerCase(), avatarUrl);
  }

  /**
   * Close database connection.
   */
  close(): void {
    this.db.close();
    console.log("[MatchStore] Database closed");
  }

  private rowToMatchResult(row: MatchRow): MatchResult {
    return {
      matchId: row.match_id,
      tournamentId: row.tournament_id,
      round: row.round,
      winner: row.winner || null,
      loser: row.player1 === row.winner ? row.player2 : row.player1,
      isDraw: row.is_draw === 1,
      isUpset: row.is_upset === 1,
      gameType: row.game_type,
      tournamentStage: `round_${row.round}`,
      player1Actions: [],
      player2Actions: [],
      stats: JSON.parse(row.stats_json || "{}"),
      duration: row.duration,
    };
  }
}

// Singleton instance
let store: MatchStore | null = null;

export function getMatchStore(): MatchStore {
  if (!store) {
    store = new MatchStore();
  }
  return store;
}

export function closeMatchStore(): void {
  if (store) {
    store.close();
    store = null;
  }
}
