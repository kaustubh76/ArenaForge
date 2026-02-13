import { useState, useRef, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Coins, Users, Calendar, Download, ChevronDown, Wifi, WifiOff, Pause, Play, Eye, Zap, Percent, Timer, ChevronUp, Grid3X3 } from 'lucide-react';
import clsx from 'clsx';
import { TournamentFormat, TournamentStatus, MatchStatus } from '@/types/arena';
import { useAgentStore } from '@/stores/agentStore';
import { useArenaStore } from '@/stores/arenaStore';
import { FORMAT_LABELS } from '@/constants/game';
import { formatMON } from '@/constants/ui';
import { downloadMatches } from '@/lib/export-utils';
import { RetroHeading } from '@/components/arcade/RetroHeading';
import { GameTypeBadge } from '@/components/arcade/GameTypeBadge';
import { StatusIndicator } from '@/components/arcade/StatusIndicator';
import { NeonButton } from '@/components/arcade/NeonButton';
import {
  BracketView,
  SwissTable,
  DoubleElimBracket,
  RoundRobinTable,
  SeriesProgress,
  PentathlonScoreboard,
  RoyalRumbleArena,
} from '@/components/tournament';
import { BettingPanel } from '@/components/betting';
import { truncateAddress } from '@/constants/ui';
import { useTournamentLive, useConnectionStatus } from '@/hooks';
import { useBettingStore } from '@/stores/bettingStore';

export function TournamentBoard() {
  const { id } = useParams<{ id: string }>();
  const { getTournamentDetail, tournaments, loading, getMatchesByTournament } = useArenaStore();
  const getAgentByAddress = useAgentStore(s => s.getAgentByAddress);
  const [exportOpen, setExportOpen] = useState(false);
  const [expandedBetMatch, setExpandedBetMatch] = useState<number | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  const tournamentId = Number(id);

  // Real-time tournament updates via WebSocket
  const {
    isSubscribed,
    participantCount: liveParticipantCount,
    currentRound: liveCurrentRound,
    isCompleted: liveIsCompleted,
    winner: liveWinner,
  } = useTournamentLive(tournamentId);

  // WebSocket connection status
  const { isConnected } = useConnectionStatus();

  // Close export dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
        setExportOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const detail = getTournamentDetail(tournamentId);
  const basic = tournaments.find(t => t.id === tournamentId);

  // Live matches in this tournament for betting
  const liveMatches = useMemo(() => {
    const matches = getMatchesByTournament(tournamentId);
    return matches.filter(m => m.status === MatchStatus.InProgress);
  }, [getMatchesByTournament, tournamentId]);
  const tournament = detail ?? basic;

  // Merge live data with stored data
  const displayParticipants = liveParticipantCount ?? tournament?.currentParticipants ?? 0;
  const displayRound = liveCurrentRound ?? tournament?.currentRound ?? 0;

  const gqlUrl = import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:4000/graphql';

  const handlePause = async (id: number) => {
    try {
      await fetch(gqlUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation { pauseTournament(id: ${id}) { id status } }`,
        }),
      });
      getTournamentDetail(id);
    } catch (err) {
      console.error('Failed to pause tournament:', err);
    }
  };

  const handleResume = async (id: number) => {
    try {
      await fetch(gqlUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation { resumeTournament(id: ${id}) { id status } }`,
        }),
      });
      getTournamentDetail(id);
    } catch (err) {
      console.error('Failed to resume tournament:', err);
    }
  };

  if (!tournament) {
    if (loading) {
      return (
        <div className="animate-pulse space-y-6">
          <div className="h-4 bg-surface-2 rounded w-32" />
          <div className="h-8 bg-surface-2 rounded w-64" />
          <div className="arcade-card p-6 space-y-4">
            <div className="h-4 bg-surface-1 rounded w-1/2" />
            <div className="h-4 bg-surface-1 rounded w-3/4" />
            <div className="h-4 bg-surface-1 rounded w-2/3" />
          </div>
        </div>
      );
    }
    return (
      <div className="text-center py-16">
        <p className="font-pixel text-sm text-gray-600 mb-4">TOURNAMENT NOT FOUND</p>
        <Link to="/">
          <NeonButton variant="neon" color="purple">BACK TO LOBBY</NeonButton>
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Back button */}
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-white transition-colors mb-6">
        <ArrowLeft size={14} />
        Back to Lobby
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <GameTypeBadge gameType={tournament.gameType} />
            <StatusIndicator status={tournament.status} />
            {/* Live indicator */}
            {isSubscribed && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-arcade-green/10 border border-arcade-green/30">
                <span className="w-1.5 h-1.5 bg-arcade-green rounded-full animate-pulse" />
                <span className="text-[9px] font-pixel text-arcade-green">LIVE</span>
              </div>
            )}
            {/* Connection status indicator */}
            <div className={clsx(
              'flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px]',
              isConnected ? 'text-gray-500' : 'text-arcade-red/70'
            )}>
              {isConnected ? <Wifi size={10} /> : <WifiOff size={10} />}
            </div>
          </div>
          <RetroHeading level={2} color="white" className="mb-0">
            {tournament.name}
          </RetroHeading>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-gray-400">
              {FORMAT_LABELS[tournament.format]} &middot; Round {displayRound}/{tournament.roundCount}
            </p>
            {liveIsCompleted && liveWinner && (
              <span className="text-xs text-arcade-gold font-pixel">
                WINNER: {liveWinner.slice(0, 8)}...
              </span>
            )}
          </div>
        </div>

        {/* Tournament stats and actions */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <Coins size={14} className="text-arcade-gold" />
            <span className="font-mono font-bold text-arcade-gold">{formatMON(tournament.prizePool)}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Users size={14} />
            <span className={liveParticipantCount !== null ? 'text-arcade-green' : ''}>
              {displayParticipants}
            </span>
            /{tournament.maxParticipants}
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Calendar size={14} />
            {tournament.startTime > 0 ? new Date(tournament.startTime).toLocaleDateString() : 'TBD'}
          </div>

          {/* Export dropdown */}
          <div className="relative" ref={exportRef}>
            <button
              onClick={() => setExportOpen(!exportOpen)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                'bg-surface-3 hover:bg-surface-4 text-text-secondary hover:text-text-primary',
                'border border-white/[0.06]'
              )}
            >
              <Download size={12} />
              <span>Export</span>
              <ChevronDown size={10} className={clsx('transition-transform', exportOpen && 'rotate-180')} />
            </button>

            {exportOpen && (
              <div className="absolute right-0 mt-2 w-36 rounded-lg overflow-hidden z-50 bg-surface-2 border border-white/[0.08] shadow-xl">
                <button
                  onClick={() => {
                    const matches = getMatchesByTournament(tournamentId);
                    downloadMatches(matches, 'csv');
                    setExportOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-text-secondary hover:bg-white/[0.04] hover:text-white transition-colors"
                >
                  Export as CSV
                </button>
                <button
                  onClick={() => {
                    const matches = getMatchesByTournament(tournamentId);
                    downloadMatches(matches, 'json');
                    setExportOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-text-secondary hover:bg-white/[0.04] hover:text-white transition-colors"
                >
                  Export as JSON
                </button>
              </div>
            )}
          </div>

          {/* Admin controls */}
          {tournament.status === TournamentStatus.Active && (
            <button
              onClick={() => handlePause(tournamentId)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-arcade-red/10 border border-arcade-red/30 text-arcade-red hover:bg-arcade-red/20 transition-colors"
            >
              <Pause size={12} />
              PAUSE
            </button>
          )}
          {tournament.status === TournamentStatus.Paused && (
            <button
              onClick={() => handleResume(tournamentId)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-arcade-green/10 border border-arcade-green/30 text-arcade-green hover:bg-arcade-green/20 transition-colors"
            >
              <Play size={12} />
              RESUME
            </button>
          )}
        </div>
      </div>

      {/* Quick Stats Bar */}
      {detail && detail.matches.length > 0 && (
        <TournamentQuickStats
          standings={detail.standings}
          matches={detail.matches}
          liveMatchCount={liveMatches.length}
        />
      )}

      {/* Activity Heatmap */}
      {detail && detail.matches.length > 0 && (
        <TournamentHeatmap matches={detail.matches} />
      )}

      {/* Tournament view - renders format-specific component */}
      {detail ? (
        <div>
          {tournament.format === TournamentFormat.SingleElimination && (
            <>
              <h3 className="font-pixel text-xs text-gray-400 mb-4 tracking-wider">BRACKET</h3>
              <BracketView tournament={detail} />
            </>
          )}

          {tournament.format === TournamentFormat.DoubleElimination && detail.bracket && (
            <>
              <h3 className="font-pixel text-xs text-gray-400 mb-4 tracking-wider">DOUBLE ELIMINATION BRACKET</h3>
              <DoubleElimBracket bracket={detail.bracket} />
            </>
          )}

          {tournament.format === TournamentFormat.RoundRobin && (
            <>
              <h3 className="font-pixel text-xs text-gray-400 mb-4 tracking-wider">ROUND ROBIN</h3>
              <RoundRobinTable
                standings={detail.roundRobinStandings ?? detail.standings.map(s => ({
                  agentAddress: s.address,
                  handle: s.handle,
                  wins: s.tournamentPoints,
                  losses: 0,
                  draws: 0,
                  points: s.tournamentPoints * 3,
                  gamesPlayed: s.tournamentPoints,
                }))}
                matches={detail.matches}
                showGrid
              />
            </>
          )}

          {tournament.format === TournamentFormat.BestOfN && detail.series && detail.series.length > 0 && (
            <>
              <h3 className="font-pixel text-xs text-gray-400 mb-4 tracking-wider">SERIES MATCHES</h3>
              <div className="space-y-4">
                {detail.series.map((series) => (
                  <SeriesProgress key={series.seriesId} series={series} variant="full" />
                ))}
              </div>
            </>
          )}

          {tournament.format === TournamentFormat.RoyalRumble && (
            <>
              <h3 className="font-pixel text-xs text-gray-400 mb-4 tracking-wider">ROYAL RUMBLE ARENA</h3>
              <RoyalRumbleArena
                participants={detail.rumbleParticipants ?? detail.standings.map((s, i) => ({
                  address: s.address,
                  handle: s.handle,
                  entryOrder: i + 1,
                  isActive: !s.eliminated,
                }))}
                currentEntrant={detail.currentEntrant ?? detail.currentParticipants}
                totalEntrants={detail.maxParticipants}
                lastElimination={detail.lastElimination}
              />
            </>
          )}

          {tournament.format === TournamentFormat.Pentathlon && (
            <>
              <h3 className="font-pixel text-xs text-gray-400 mb-4 tracking-wider">PENTATHLON SCOREBOARD</h3>
              <PentathlonScoreboard
                standings={detail.pentathlonStandings ?? []}
                currentEvent={detail.currentEvent}
                completedEvents={detail.completedEvents}
              />
            </>
          )}

          {tournament.format === TournamentFormat.SwissSystem && (
            <>
              <h3 className="font-pixel text-xs text-gray-400 mb-4 tracking-wider">STANDINGS</h3>
              <SwissTable standings={detail.standings} />
            </>
          )}

          {/* Fallback for unknown formats */}
          {![
            TournamentFormat.SingleElimination,
            TournamentFormat.DoubleElimination,
            TournamentFormat.RoundRobin,
            TournamentFormat.BestOfN,
            TournamentFormat.RoyalRumble,
            TournamentFormat.Pentathlon,
            TournamentFormat.SwissSystem,
          ].includes(tournament.format) && (
            <>
              <h3 className="font-pixel text-xs text-gray-400 mb-4 tracking-wider">STANDINGS</h3>
              <SwissTable standings={detail.standings} />
            </>
          )}
        </div>
      ) : (
        <div className="arcade-card text-center py-12">
          <p className="font-pixel text-xs text-gray-600">TOURNAMENT DETAILS LOADING</p>
          <p className="text-sm text-gray-500 mt-2">Detailed bracket data not yet available</p>
        </div>
      )}

      {/* Live matches — bet now */}
      {liveMatches.length > 0 && (
        <div className="mt-8">
          <h3 className="font-pixel text-xs text-gray-400 mb-4 tracking-wider flex items-center gap-2">
            <Eye size={14} className="text-arcade-green" />
            LIVE MATCHES — BET NOW
          </h3>
          <div className="space-y-3">
            {liveMatches.map(match => {
              const p1 = getAgentByAddress(match.player1);
              const p2 = getAgentByAddress(match.player2);
              return (
                <div key={match.id} className="arcade-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-arcade-green rounded-full animate-pulse" />
                      <span className="text-xs text-arcade-green uppercase tracking-wider font-semibold">
                        Live
                      </span>
                      <span className="text-xs text-gray-500">
                        Round {match.round} &middot; Match #{match.id}
                      </span>
                    </div>
                    <Link
                      to={`/match/${match.id}`}
                      className="text-xs text-arcade-purple hover:underline"
                    >
                      Watch →
                    </Link>
                  </div>
                  <div className="grid grid-cols-3 items-center gap-4 mb-3">
                    <div className="text-center">
                      <Link to={`/agent/${match.player1}`} className="text-sm font-semibold text-arcade-cyan hover:underline">
                        {p1?.moltbookHandle ?? truncateAddress(match.player1)}
                      </Link>
                    </div>
                    <div className="text-center text-gray-500 text-lg">VS</div>
                    <div className="text-center">
                      <Link to={`/agent/${match.player2}`} className="text-sm font-semibold text-arcade-pink hover:underline">
                        {p2?.moltbookHandle ?? truncateAddress(match.player2)}
                      </Link>
                    </div>
                  </div>
                  <button
                    onClick={() => setExpandedBetMatch(expandedBetMatch === match.id ? null : match.id)}
                    className={clsx(
                      'w-full text-center text-xs font-semibold py-2 rounded-lg transition-all border',
                      expandedBetMatch === match.id
                        ? 'bg-arcade-purple/15 text-arcade-purple border-arcade-purple/40'
                        : 'text-gray-500 border-white/[0.06] hover:text-gray-300',
                    )}
                  >
                    {expandedBetMatch === match.id ? 'Hide Betting' : 'Place a Bet'}
                  </button>
                  {expandedBetMatch === match.id && (
                    <div className="mt-3 pt-3 border-t border-gray-700">
                      <BettingPanel
                        matchId={match.id}
                        player1={match.player1}
                        player2={match.player2}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* My Bets in this tournament */}
      {detail && <TournamentMyBets matchIds={detail.matches.map(m => m.id)} />}

      {/* Prize distribution */}
      <div className="mt-8">
        <h3 className="font-pixel text-xs text-gray-400 mb-4 tracking-wider">PRIZE DISTRIBUTION</h3>
        <div className="arcade-card">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="font-pixel text-[9px] neon-text-gold mb-1">1ST PLACE</p>
              <p className="font-mono text-lg font-bold text-white">60%</p>
              <p className="text-xs text-gray-500">{formatMON(String(parseFloat(tournament.prizePool) * 0.57))}</p>
            </div>
            <div className="text-center">
              <p className="font-pixel text-[9px] text-gray-400 mb-1">2ND PLACE</p>
              <p className="font-mono text-lg font-bold text-gray-300">25%</p>
              <p className="text-xs text-gray-500">{formatMON(String(parseFloat(tournament.prizePool) * 0.2375))}</p>
            </div>
            <div className="text-center">
              <p className="font-pixel text-[9px] text-elo-bronze mb-1">3RD PLACE</p>
              <p className="font-mono text-lg font-bold text-gray-400">15%</p>
              <p className="text-xs text-gray-500">{formatMON(String(parseFloat(tournament.prizePool) * 0.1425))}</p>
            </div>
          </div>
          <p className="text-center text-[10px] text-gray-600 mt-3">5% arena fee applied</p>
        </div>
      </div>
    </div>
  );
}

// ---------- Quick Stats Bar ----------

function TournamentQuickStats({
  standings,
  matches,
  liveMatchCount,
}: {
  standings: Array<{ address: string; elo: number }>;
  matches: Array<{ id: number; winner: string | null; timestamp: number; status: MatchStatus }>;
  liveMatchCount: number;
}) {
  const completedMatches = matches.filter(m => m.winner !== null);
  const totalMatches = matches.length;
  const completionPct = totalMatches > 0 ? Math.round((completedMatches.length / totalMatches) * 100) : 0;

  // Average ELO of participants
  const avgElo = standings.length > 0
    ? Math.round(standings.reduce((s, a) => s + a.elo, 0) / standings.length)
    : 0;

  // Match velocity (matches per hour)
  const timestamps = completedMatches.map(m => m.timestamp).filter(t => t > 0);
  let velocity = '—';
  if (timestamps.length >= 2) {
    const minT = Math.min(...timestamps);
    const maxT = Math.max(...timestamps);
    const hours = (maxT - minT) / 3600;
    if (hours > 0) {
      velocity = (completedMatches.length / hours).toFixed(1);
    }
  }

  // Estimated remaining time
  const remaining = totalMatches - completedMatches.length;
  let estRemaining = '—';
  if (velocity !== '—' && remaining > 0) {
    const hrs = remaining / parseFloat(velocity);
    if (hrs < 1) {
      estRemaining = `${Math.round(hrs * 60)}m`;
    } else {
      estRemaining = `${hrs.toFixed(1)}h`;
    }
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
      <div className="arcade-card p-3 text-center">
        <Zap size={14} className="text-arcade-cyan mx-auto mb-1" />
        <div className="text-lg font-bold font-mono text-white">{avgElo}</div>
        <div className="text-[9px] text-gray-500 uppercase tracking-wider">Avg ELO</div>
      </div>
      <div className="arcade-card p-3 text-center">
        <Percent size={14} className="text-arcade-purple mx-auto mb-1" />
        <div className="text-lg font-bold font-mono text-white">{completionPct}%</div>
        <div className="text-[9px] text-gray-500 uppercase tracking-wider">Completion</div>
      </div>
      <div className="arcade-card p-3 text-center">
        <Timer size={14} className="text-arcade-gold mx-auto mb-1" />
        <div className="text-lg font-bold font-mono text-white">{velocity}</div>
        <div className="text-[9px] text-gray-500 uppercase tracking-wider">Matches/hr</div>
      </div>
      <div className="arcade-card p-3 text-center">
        <Eye size={14} className="text-arcade-green mx-auto mb-1" />
        <div className="text-lg font-bold font-mono text-white flex items-center justify-center gap-1.5">
          {liveMatchCount}
          {liveMatchCount > 0 && <span className="w-2 h-2 bg-arcade-green rounded-full animate-pulse" />}
        </div>
        <div className="text-[9px] text-gray-500 uppercase tracking-wider">Live Now</div>
      </div>
      <div className="arcade-card p-3 text-center">
        <Timer size={14} className="text-arcade-pink mx-auto mb-1" />
        <div className="text-lg font-bold font-mono text-white">{estRemaining}</div>
        <div className="text-[9px] text-gray-500 uppercase tracking-wider">Est. Left</div>
      </div>
    </div>
  );
}

// ---------- My Bets Section ----------

function TournamentMyBets({ matchIds }: { matchIds: number[] }) {
  const { userBets } = useBettingStore();
  const [expanded, setExpanded] = useState(false);
  const getAgentByAddress = useAgentStore(s => s.getAgentByAddress);

  const matchIdSet = useMemo(() => new Set(matchIds), [matchIds]);
  const tournamentBets = useMemo(
    () => userBets.filter(b => matchIdSet.has(b.matchId)),
    [userBets, matchIdSet]
  );

  if (tournamentBets.length === 0) return null;

  const totalWagered = tournamentBets.reduce((s, b) => s + parseFloat(b.amount), 0);
  const totalPayout = tournamentBets.filter(b => b.status === 1).reduce((s, b) => s + parseFloat(b.payout ?? '0'), 0);

  const statusLabel = (status: number) => {
    if (status === 0) return { text: 'PENDING', cls: 'text-gray-400 bg-gray-500/10 border-gray-500/30' };
    if (status === 1) return { text: 'WON', cls: 'text-arcade-green bg-arcade-green/10 border-arcade-green/30' };
    if (status === 2) return { text: 'LOST', cls: 'text-arcade-red bg-arcade-red/10 border-arcade-red/30' };
    return { text: 'CLAIMED', cls: 'text-arcade-gold bg-arcade-gold/10 border-arcade-gold/30' };
  };

  return (
    <div className="mt-8">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between mb-4"
      >
        <h3 className="font-pixel text-xs text-gray-400 tracking-wider flex items-center gap-2">
          <Coins size={14} className="text-arcade-gold" />
          MY BETS ({tournamentBets.length})
        </h3>
        {expanded ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
      </button>

      {expanded && (
        <div className="arcade-card p-4">
          {/* Summary */}
          <div className="flex gap-4 mb-4 text-xs">
            <div>
              <span className="text-gray-500">Wagered: </span>
              <span className="font-mono text-white">{totalWagered.toFixed(4)} MON</span>
            </div>
            <div>
              <span className="text-gray-500">Won: </span>
              <span className="font-mono text-arcade-green">{totalPayout.toFixed(4)} MON</span>
            </div>
            <div>
              <span className="text-gray-500">P/L: </span>
              <span className={clsx('font-mono', totalPayout - totalWagered >= 0 ? 'text-arcade-green' : 'text-arcade-red')}>
                {(totalPayout - totalWagered) >= 0 ? '+' : ''}{(totalPayout - totalWagered).toFixed(4)}
              </span>
            </div>
          </div>

          {/* Bet list */}
          <div className="space-y-2">
            {tournamentBets.map(bet => {
              const agent = getAgentByAddress(bet.predictedWinner);
              const st = statusLabel(bet.status);
              return (
                <div key={bet.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 font-mono">#{bet.matchId}</span>
                    <span className="text-xs text-white">
                      {agent?.moltbookHandle ?? truncateAddress(bet.predictedWinner)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-gray-400">{parseFloat(bet.amount).toFixed(4)}</span>
                    <span className={clsx('text-[9px] font-pixel px-2 py-0.5 rounded border', st.cls)}>
                      {st.text}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Tournament Activity Heatmap ----------

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const BLOCK_LABELS = ['12am–6am', '6am–12pm', '12pm–6pm', '6pm–12am'];

function TournamentHeatmap({
  matches,
}: {
  matches: Array<{ id: number; timestamp: number; status: MatchStatus }>;
}) {
  const grid = useMemo(() => {
    // 7 days × 4 time blocks = 28 cells
    const cells: number[][] = Array.from({ length: 7 }, () => [0, 0, 0, 0]);

    const completedMatches = matches.filter(m => m.timestamp > 0 && m.status === MatchStatus.Completed);

    for (const m of completedMatches) {
      const d = new Date(m.timestamp * 1000);
      const day = d.getDay(); // 0=Sun
      const hour = d.getHours();
      const block = Math.floor(hour / 6); // 0-3
      cells[day][block]++;
    }

    // Find max for normalization
    let max = 0;
    for (const row of cells) {
      for (const c of row) {
        if (c > max) max = c;
      }
    }

    return { cells, max };
  }, [matches]);

  if (grid.max === 0) return null;

  return (
    <div className="arcade-card p-4 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Grid3X3 size={14} className="text-arcade-green" />
        <span className="text-xs font-bold text-gray-400 tracking-wider uppercase">
          Match Activity Heatmap
        </span>
      </div>

      {/* Time block headers */}
      <div className="grid gap-1" style={{ gridTemplateColumns: '40px repeat(4, 1fr)' }}>
        <div /> {/* Corner */}
        {BLOCK_LABELS.map(label => (
          <div key={label} className="text-[8px] text-gray-600 text-center truncate">
            {label}
          </div>
        ))}

        {/* Day rows */}
        {DAY_LABELS.map((day, dayIdx) => (
          <>
            <div key={`label-${day}`} className="text-[9px] text-gray-500 flex items-center">
              {day}
            </div>
            {grid.cells[dayIdx].map((count, blockIdx) => {
              const intensity = grid.max > 0 ? count / grid.max : 0;
              return (
                <div
                  key={`${dayIdx}-${blockIdx}`}
                  className="h-7 rounded-sm transition-all hover:ring-1 hover:ring-white/20 relative group cursor-default"
                  style={{
                    backgroundColor: count > 0
                      ? `rgba(34, 197, 94, ${0.15 + intensity * 0.65})`
                      : 'rgba(255,255,255,0.03)',
                  }}
                >
                  {/* Hover tooltip */}
                  {count > 0 && (
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-surface-1 border border-white/10 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap z-20">
                      {count} {count === 1 ? 'match' : 'matches'}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-2 mt-3">
        <span className="text-[8px] text-gray-600">Less</span>
        {[0.15, 0.35, 0.55, 0.8].map((opacity, i) => (
          <div
            key={i}
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: `rgba(34, 197, 94, ${opacity})` }}
          />
        ))}
        <span className="text-[8px] text-gray-600">More</span>
      </div>
    </div>
  );
}
