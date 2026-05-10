import { AgentProfileExtended, Match, Tournament } from '@/types/arena';

/**
 * RFC 4180 CSV field escape.
 *
 * If a value contains a comma, double-quote, or newline, it must be wrapped
 * in double quotes; embedded quotes are doubled (`"` -> `""`).
 *
 * Without this, exporting any agent / tournament whose name contains `,` or
 * `"` produced a broken CSV — silent data corruption when an operator
 * downloaded their data.
 */
export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Render a row of fields with proper escaping. */
function csvRow(fields: unknown[]): string {
  return fields.map(csvEscape).join(',');
}

/**
 * Export agent data to CSV format
 */
export function exportAgentsToCSV(agents: AgentProfileExtended[]): string {
  const headers = ['Handle', 'Address', 'ELO', 'Matches', 'Wins', 'Losses', 'Win Rate', 'Streak'];
  const rows = agents.map(a => csvRow([
    a.moltbookHandle,
    a.agentAddress,
    a.elo,
    a.matchesPlayed,
    a.wins,
    a.losses,
    a.winRate.toFixed(2) + '%',
    a.streak,
  ]));

  return [csvRow(headers), ...rows].join('\n');
}

/**
 * Export agent data to JSON format
 */
export function exportAgentsToJSON(agents: AgentProfileExtended[]): string {
  const data = agents.map(a => ({
    handle: a.moltbookHandle,
    address: a.agentAddress,
    elo: a.elo,
    matchesPlayed: a.matchesPlayed,
    wins: a.wins,
    losses: a.losses,
    winRate: a.winRate,
    streak: a.streak,
    eloHistory: a.eloHistory,
  }));

  return JSON.stringify(data, null, 2);
}

/**
 * Export match history to CSV format
 */
export function exportMatchesToCSV(matches: Match[]): string {
  const headers = ['Match ID', 'Tournament ID', 'Round', 'Player 1', 'Player 2', 'Winner', 'Status', 'Timestamp'];
  const rows = matches.map(m => csvRow([
    m.id,
    m.tournamentId,
    m.round,
    m.player1,
    m.player2,
    m.winner ?? 'N/A',
    ['Scheduled', 'InProgress', 'Completed', 'Disputed'][m.status],
    new Date(m.timestamp * 1000).toISOString(),
  ]));

  return [csvRow(headers), ...rows].join('\n');
}

/**
 * Export match history to JSON format
 */
export function exportMatchesToJSON(matches: Match[]): string {
  const data = matches.map(m => ({
    id: m.id,
    tournamentId: m.tournamentId,
    round: m.round,
    player1: m.player1,
    player2: m.player2,
    winner: m.winner,
    status: ['Scheduled', 'InProgress', 'Completed', 'Disputed'][m.status],
    timestamp: new Date(m.timestamp * 1000).toISOString(),
  }));

  return JSON.stringify(data, null, 2);
}

/**
 * Export tournaments to CSV format
 */
export function exportTournamentsToCSV(tournaments: Tournament[]): string {
  const headers = ['ID', 'Name', 'Game Type', 'Status', 'Entry Stake', 'Prize Pool', 'Participants', 'Rounds', 'Start Time'];
  const gameTypes = ['Oracle Duel', 'Strategy Arena', 'Auction Wars', 'Quiz Bowl'];
  const statuses = ['Open', 'Active', 'Completed', 'Cancelled'];

  const rows = tournaments.map(t => csvRow([
    t.id,
    t.name,
    gameTypes[t.gameType],
    statuses[t.status],
    t.entryStake,
    t.prizePool,
    `${t.currentParticipants}/${t.maxParticipants}`,
    `${t.currentRound}/${t.roundCount}`,
    new Date(t.startTime * 1000).toISOString(),
  ]));

  return [csvRow(headers), ...rows].join('\n');
}

/**
 * Export tournaments to JSON format
 */
export function exportTournamentsToJSON(tournaments: Tournament[]): string {
  const gameTypes = ['Oracle Duel', 'Strategy Arena', 'Auction Wars', 'Quiz Bowl'];
  const statuses = ['Open', 'Active', 'Completed', 'Cancelled'];

  const data = tournaments.map(t => ({
    id: t.id,
    name: t.name,
    gameType: gameTypes[t.gameType],
    status: statuses[t.status],
    entryStake: t.entryStake,
    prizePool: t.prizePool,
    participants: {
      current: t.currentParticipants,
      max: t.maxParticipants,
    },
    rounds: {
      current: t.currentRound,
      total: t.roundCount,
    },
    startTime: new Date(t.startTime * 1000).toISOString(),
  }));

  return JSON.stringify(data, null, 2);
}

/**
 * Download data as a file
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export agents and download
 */
export function downloadAgents(agents: AgentProfileExtended[], format: 'csv' | 'json'): void {
  const timestamp = new Date().toISOString().slice(0, 10);
  if (format === 'csv') {
    downloadFile(exportAgentsToCSV(agents), `arenaforge-agents-${timestamp}.csv`, 'text/csv');
  } else {
    downloadFile(exportAgentsToJSON(agents), `arenaforge-agents-${timestamp}.json`, 'application/json');
  }
}

/**
 * Export matches and download
 */
export function downloadMatches(matches: Match[], format: 'csv' | 'json'): void {
  const timestamp = new Date().toISOString().slice(0, 10);
  if (format === 'csv') {
    downloadFile(exportMatchesToCSV(matches), `arenaforge-matches-${timestamp}.csv`, 'text/csv');
  } else {
    downloadFile(exportMatchesToJSON(matches), `arenaforge-matches-${timestamp}.json`, 'application/json');
  }
}

/**
 * Export tournaments and download
 */
export function downloadTournaments(tournaments: Tournament[], format: 'csv' | 'json'): void {
  const timestamp = new Date().toISOString().slice(0, 10);
  if (format === 'csv') {
    downloadFile(exportTournamentsToCSV(tournaments), `arenaforge-tournaments-${timestamp}.csv`, 'text/csv');
  } else {
    downloadFile(exportTournamentsToJSON(tournaments), `arenaforge-tournaments-${timestamp}.json`, 'application/json');
  }
}
