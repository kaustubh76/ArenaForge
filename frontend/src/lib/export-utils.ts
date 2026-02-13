import { AgentProfileExtended, Match, Tournament } from '@/types/arena';

/**
 * Export agent data to CSV format
 */
export function exportAgentsToCSV(agents: AgentProfileExtended[]): string {
  const headers = ['Handle', 'Address', 'ELO', 'Matches', 'Wins', 'Losses', 'Win Rate', 'Streak'];
  const rows = agents.map(a => [
    a.moltbookHandle,
    a.agentAddress,
    a.elo.toString(),
    a.matchesPlayed.toString(),
    a.wins.toString(),
    a.losses.toString(),
    a.winRate.toFixed(2) + '%',
    a.streak.toString(),
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
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
  const rows = matches.map(m => [
    m.id.toString(),
    m.tournamentId.toString(),
    m.round.toString(),
    m.player1,
    m.player2,
    m.winner || 'N/A',
    ['Scheduled', 'InProgress', 'Completed', 'Disputed'][m.status],
    new Date(m.timestamp * 1000).toISOString(),
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
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

  const rows = tournaments.map(t => [
    t.id.toString(),
    `"${t.name}"`,
    gameTypes[t.gameType],
    statuses[t.status],
    t.entryStake,
    t.prizePool,
    `${t.currentParticipants}/${t.maxParticipants}`,
    `${t.currentRound}/${t.roundCount}`,
    new Date(t.startTime * 1000).toISOString(),
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
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
