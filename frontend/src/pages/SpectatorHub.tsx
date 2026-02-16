import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import {
  Eye, Trophy, TrendingUp, Users, Wifi, WifiOff, BarChart3,
  Target, Flame, Snowflake, Swords, Clock,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
} from 'recharts';
import { useArenaStore } from '@/stores/arenaStore';
import { useBettingStore } from '@/stores/bettingStore';
import { MatchStatus } from '@/types/arena';
import { useMatchesLive, useConnectionStatus } from '@/hooks';
import { RetroHeading } from '@/components/arcade/RetroHeading';
import { BettingPanel, BetHistory } from '@/components/betting';
import { AnimatedScore } from '@/components/arcade/AnimatedScore';
import { truncateAddress } from '@/constants/ui';
import { CHART_COLORS, TOOLTIP_STYLE } from '@/components/charts';
import { fetchGraphQL } from '@/lib/api';
import { GlowBadge } from '@/components/arcade/GlowBadge';

// --- Betting Analytics Components ---

function BettingOutcomePie({ userBets }: { userBets: Array<{ status: number }> }) {
  const data = useMemo(() => {
    const counts = { Won: 0, Lost: 0, Pending: 0 };
    for (const b of userBets) {
      if (b.status === 1) counts.Won++;
      else if (b.status === 2) counts.Lost++;
      else counts.Pending++;
    }
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({
        name,
        value,
        fill: name === 'Won' ? CHART_COLORS.green : name === 'Lost' ? CHART_COLORS.pink : CHART_COLORS.purple,
      }));
  }, [userBets]);

  if (userBets.length === 0) return null;

  return (
    <div className="arcade-card p-4">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5">
        <Target size={12} /> Bet Outcomes
      </h3>
      <div className="flex items-center gap-4">
        <ResponsiveContainer width={120} height={120}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              cx="50%"
              cy="50%"
              innerRadius={30}
              outerRadius={50}
              strokeWidth={0}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip
              {...TOOLTIP_STYLE}
              formatter={(value: unknown) => [String(value), 'Bets']}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="space-y-1.5">
          {data.map(d => (
            <div key={d.name} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.fill }} />
              <span className="text-xs text-gray-300">{d.name}</span>
              <span className="text-xs font-mono font-bold text-white">{d.value}</span>
            </div>
          ))}
          <div className="border-t border-white/[0.06] pt-1">
            <span className="text-[10px] text-gray-500">Total: {userBets.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function BettorWinRateChart({ topBettors }: {
  topBettors: Array<{ address: string; winRate: number; totalBets: number; netProfit: string }>;
}) {
  if (topBettors.length === 0) return null;

  const maxBets = Math.max(...topBettors.map(b => b.totalBets), 1);

  return (
    <div className="arcade-card p-4">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-1.5">
        <BarChart3 size={12} /> Bettor Performance
      </h3>
      <div className="space-y-2">
        {topBettors.slice(0, 5).map((b, i) => {
          const wr = b.winRate;
          const profit = parseFloat(b.netProfit);
          return (
            <Link
              key={b.address}
              to={`/bettor/${b.address}`}
              className="flex items-center gap-2 group"
            >
              <span className={clsx(
                'w-4 text-[10px] font-pixel text-center',
                i === 0 ? 'text-arcade-gold' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-gray-600',
              )}>
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-gray-400 group-hover:text-arcade-cyan transition-colors truncate">
                    {b.address.slice(0, 6)}...{b.address.slice(-4)}
                  </span>
                  {profit > 0 && <Flame size={10} className="text-arcade-green flex-shrink-0" />}
                  {profit < 0 && <Snowflake size={10} className="text-arcade-cyan/50 flex-shrink-0" />}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {/* Win rate bar */}
                  <div className="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${Math.max(wr, 3)}%`,
                        backgroundColor: wr >= 60 ? CHART_COLORS.green : wr >= 45 ? CHART_COLORS.purple : CHART_COLORS.pink,
                        opacity: 0.7,
                      }}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-gray-500 w-8 text-right">{wr.toFixed(0)}%</span>
                </div>
              </div>
              {/* Volume dots */}
              <div className="flex gap-0.5">
                {Array.from({ length: Math.min(Math.ceil((b.totalBets / maxBets) * 5), 5) }).map((_, j) => (
                  <span key={j} className="w-1.5 h-1.5 rounded-full bg-arcade-purple/50" />
                ))}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function YourStatsRadar({ profile }: {
  profile: { totalBets: number; wins: number; losses: number; winRate: number; currentStreak: number; longestWinStreak: number };
}) {
  const dims = useMemo(() => {
    const maxBets = Math.max(profile.totalBets, 20);
    return [
      { stat: 'Win Rate', value: profile.winRate },
      { stat: 'Volume', value: Math.min((profile.totalBets / maxBets) * 100, 100) },
      { stat: 'Streak', value: Math.min(Math.abs(profile.currentStreak) * 20, 100) },
      { stat: 'Best Run', value: Math.min(profile.longestWinStreak * 15, 100) },
      { stat: 'Wins', value: maxBets > 0 ? Math.min((profile.wins / maxBets) * 100, 100) : 0 },
    ];
  }, [profile]);

  const r = 55;
  const cx = 70;
  const cy = 65;
  const angleStep = (2 * Math.PI) / dims.length;

  const points = dims.map((d, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const dist = (d.value / 100) * r;
    return { x: cx + dist * Math.cos(angle), y: cy + dist * Math.sin(angle) };
  });
  const gridLevels = [0.25, 0.5, 0.75, 1];

  return (
    <div className="arcade-card p-4">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5">
        <TrendingUp size={12} /> Your Betting Profile
      </h3>
      <svg viewBox="0 0 140 140" className="w-full max-w-[180px] mx-auto">
        {/* Grid */}
        {gridLevels.map(level => (
          <polygon
            key={level}
            points={dims.map((_, i) => {
              const angle = i * angleStep - Math.PI / 2;
              const dist = level * r;
              return `${cx + dist * Math.cos(angle)},${cy + dist * Math.sin(angle)}`;
            }).join(' ')}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={0.5}
          />
        ))}
        {/* Axes */}
        {dims.map((_, i) => {
          const angle = i * angleStep - Math.PI / 2;
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={cx + r * Math.cos(angle)}
              y2={cy + r * Math.sin(angle)}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={0.5}
            />
          );
        })}
        {/* Data polygon */}
        <polygon
          points={points.map(p => `${p.x},${p.y}`).join(' ')}
          fill="rgba(168, 85, 247, 0.2)"
          stroke="#a855f7"
          strokeWidth={1.5}
        />
        {/* Dots + labels */}
        {dims.map((d, i) => {
          const angle = i * angleStep - Math.PI / 2;
          const labelDist = r + 14;
          const lx = cx + labelDist * Math.cos(angle);
          const ly = cy + labelDist * Math.sin(angle);
          return (
            <g key={i}>
              <circle cx={points[i].x} cy={points[i].y} r={2.5} fill="#a855f7" />
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#888"
                fontSize="6"
              >
                {d.stat}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// --- GraphQL hooks for arena data (supplements on-chain reads) ---

interface RecentMatchGQL {
  id: number;
  tournamentId: number;
  player1: string;
  player2: string;
  winner: string | null;
  gameType: string;
  status: string;
}

interface ArenaStatsGQL {
  totalMatches: number;
  totalAgents: number;
  gameTypes: Array<{ gameType: string; matchCount: number }>;
}

function useRecentMatchesGQL() {
  const [matches, setMatches] = useState<RecentMatchGQL[]>([]);
  useEffect(() => {
    let mounted = true;
    const fetch_ = async () => {
      try {
        const { data } = await fetchGraphQL<{ recentMatches: RecentMatchGQL[] }>(
          `{ recentMatches(limit: 10) { id tournamentId player1 player2 winner gameType status } }`,
        );
        if (mounted && data?.recentMatches) setMatches(data.recentMatches);
      } catch { /* silent */ }
    };
    fetch_();
    const interval = setInterval(fetch_, 20_000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);
  return matches;
}

function useArenaStatsGQL() {
  const [stats, setStats] = useState<ArenaStatsGQL | null>(null);
  useEffect(() => {
    let mounted = true;
    const fetch_ = async () => {
      try {
        const { data } = await fetchGraphQL<{
          durationByGameType: Array<{ gameType: string; matchCount: number; averageDuration: number }>;
          agents: Array<{ address: string }>;
        }>(
          `{ durationByGameType { gameType matchCount averageDuration } agents(limit: 100) { address } }`,
        );
        if (mounted && data) {
          const gt = data.durationByGameType || [];
          setStats({
            totalMatches: gt.reduce((s, g) => s + g.matchCount, 0),
            totalAgents: data.agents?.length ?? 0,
            gameTypes: gt,
          });
        }
      } catch { /* silent */ }
    };
    fetch_();
    return () => { mounted = false; };
  }, []);
  return stats;
}

function TopAgentsMini() {
  const [agents, setAgents] = useState<Array<{ address: string; moltbookHandle: string; elo: number; matchesPlayed: number; wins: number }>>([]);
  useEffect(() => {
    let mounted = true;
    fetchGraphQL<{ leaderboard: typeof agents }>(
      `{ leaderboard(limit: 10) { address moltbookHandle elo matchesPlayed wins } }`,
    ).then(({ data }) => {
      if (mounted && data?.leaderboard) setAgents(data.leaderboard);
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  if (agents.length === 0) {
    return (
      <div className="p-6 text-center">
        <Users size={24} className="mx-auto text-gray-600 mb-2" />
        <p className="text-sm text-gray-400">No agents yet</p>
      </div>
    );
  }

  return (
    <div>
      <div className="px-3 py-2 border-b border-white/[0.06]">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Top Agents by ELO</span>
      </div>
      {agents.map((a, i) => (
        <Link
          key={a.address}
          to={`/agent/${a.address}`}
          className={clsx(
            'p-3 flex items-center gap-3 transition-all duration-150 hover:bg-surface-1',
            i % 2 === 0 ? 'bg-surface-2' : 'bg-surface-3/50',
          )}
        >
          <span
            className={clsx(
              'w-6 text-center font-bold',
              i === 0 ? 'text-arcade-gold' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-gray-500',
            )}
            style={i === 0 ? { textShadow: '0 0 6px rgba(255,215,0,0.3)' } : undefined}
          >
            {i + 1}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-white truncate">{a.moltbookHandle}</div>
            <div className="text-[10px] text-gray-400">
              ELO {a.elo} | {a.matchesPlayed} matches | {a.wins}W
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function SpectatorHub() {
  const { allMatches, fetchFromChain } = useArenaStore();
  const { myBettorProfile, topBettors, fetchTopBettorsLeaderboard, userBets } = useBettingStore();
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);

  // GraphQL data (seeded match history + arena stats)
  const recentMatchesGQL = useRecentMatchesGQL();
  const arenaStats = useArenaStatsGQL();

  // Get live matches (in progress)
  const liveMatches = allMatches.filter(m => m.status === MatchStatus.InProgress);

  // WebSocket real-time updates for all live matches
  const liveMatchIds = useMemo(() => liveMatches.map(m => m.id), [liveMatches]);
  const liveMatchStates = useMatchesLive(liveMatchIds);
  const { isConnected: wsConnected } = useConnectionStatus();

  // Fetch data on mount
  useEffect(() => {
    fetchFromChain();
    fetchTopBettorsLeaderboard(10);
  }, [fetchFromChain, fetchTopBettorsLeaderboard]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <RetroHeading level={1} color="pink" subtitle="Watch and wager on live matches" className="mb-0">
          SPECTATOR HUB
        </RetroHeading>
        {/* Connection status indicator */}
        <div className={clsx(
          'flex items-center gap-1.5 px-2 py-1 rounded-lg border',
          wsConnected
            ? 'bg-arcade-green/10 border-arcade-green/30 text-arcade-green'
            : 'bg-gray-500/10 border-gray-500/30 text-gray-500'
        )}
          style={wsConnected ? { boxShadow: '0 0 8px rgba(105,240,174,0.15)' } : undefined}
          title={wsConnected ? 'Real-time updates active' : 'Connecting to real-time updates'}
        >
          {wsConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
          <span className="text-[10px] font-pixel">
            {wsConnected ? 'LIVE UPDATES' : 'CONNECTING'}
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="arcade-card p-3 text-center transition-all duration-200 hover:scale-[1.03]">
          <div className="flex items-center justify-center gap-2">
            <Eye size={16} className="text-arcade-cyan" style={{ filter: 'drop-shadow(0 0 3px rgba(0,229,255,0.4))' }} />
            <AnimatedScore value={liveMatches.length} className="text-lg text-white" />
          </div>
          <p className="text-[10px] text-gray-500 mt-1">LIVE MATCHES</p>
        </div>
        <div className="arcade-card p-3 text-center transition-all duration-200 hover:scale-[1.03]">
          <div className="flex items-center justify-center gap-2">
            <Swords size={16} className="text-arcade-purple" style={{ filter: 'drop-shadow(0 0 3px rgba(168,85,247,0.4))' }} />
            <AnimatedScore value={arenaStats?.totalMatches ?? 0} className="text-lg text-arcade-purple" />
          </div>
          <p className="text-[10px] text-gray-500 mt-1">TOTAL MATCHES</p>
        </div>
        <div className="arcade-card p-3 text-center transition-all duration-200 hover:scale-[1.03]">
          <div className="flex items-center justify-center gap-2">
            <Users size={16} className="text-arcade-gold" style={{ filter: 'drop-shadow(0 0 3px rgba(255,215,0,0.4))' }} />
            <AnimatedScore value={arenaStats?.totalAgents ?? 0} className="text-lg text-arcade-gold" />
          </div>
          <p className="text-[10px] text-gray-500 mt-1">ACTIVE AGENTS</p>
        </div>
        <div className="arcade-card p-3 text-center transition-all duration-200 hover:scale-[1.03]">
          <div className="flex items-center justify-center gap-2">
            <BarChart3 size={16} className="text-arcade-green" style={{ filter: 'drop-shadow(0 0 3px rgba(105,240,174,0.4))' }} />
            <AnimatedScore value={arenaStats?.gameTypes?.length ?? 0} className="text-lg text-arcade-green" />
          </div>
          <p className="text-[10px] text-gray-500 mt-1">GAME TYPES</p>
        </div>
      </div>

      {/* Game Type Breakdown */}
      {arenaStats && arenaStats.totalMatches > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {arenaStats.gameTypes.map(gt => (
            <div key={gt.gameType} className="arcade-card p-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-gray-500">{gt.gameType.replace('_', ' ')}</span>
                <span className="text-sm font-mono text-white font-bold">{gt.matchCount}</span>
              </div>
              <div className="mt-1.5 h-1 bg-surface-2 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-arcade-purple/60"
                  style={{ width: `${Math.max((gt.matchCount / arenaStats.totalMatches) * 100, 5)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Betting Analytics Row */}
      {(userBets.length > 0 || topBettors.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <BettingOutcomePie userBets={userBets} />
          <BettorWinRateChart topBettors={topBettors} />
          {myBettorProfile && <YourStatsRadar profile={myBettorProfile} />}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Live matches */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
            <Eye size={14} className="text-arcade-cyan" />
            Live Matches
          </h2>

          {liveMatches.length > 0 ? (
            <div className="space-y-3">
              {liveMatches.map(match => {
                const wsState = liveMatchStates.get(match.id);
                const hasRealtimeData = wsState !== null && wsState !== undefined;
                return (
                <div
                  key={match.id}
                  className={clsx(
                    'arcade-card p-4 cursor-pointer transition-all',
                    selectedMatchId === match.id
                      ? 'ring-2 ring-arcade-purple'
                      : 'hover:bg-surface-2',
                  )}
                  onClick={() => setSelectedMatchId(selectedMatchId === match.id ? null : match.id)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-arcade-green rounded-full animate-pulse" />
                      <span className="text-xs text-arcade-green uppercase tracking-wider font-semibold">
                        Live
                      </span>
                      {hasRealtimeData && (
                        <span className="text-[9px] text-arcade-cyan px-1.5 py-0.5 bg-arcade-cyan/10 rounded" style={{ boxShadow: '0 0 6px rgba(0,229,255,0.15)' }}>
                          STREAMING
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">
                      Match #{match.id}
                    </span>
                  </div>

                  {/* Players */}
                  <div className="grid grid-cols-3 items-center gap-4">
                    <div className="text-center">
                      <Link to={`/agent/${match.player1}`} className="font-semibold text-arcade-cyan truncate hover:underline" onClick={(e) => e.stopPropagation()}>
                        {truncateAddress(match.player1)}
                      </Link>
                    </div>
                    <div className="text-center text-gray-500 text-xl">VS</div>
                    <div className="text-center">
                      <Link to={`/agent/${match.player2}`} className="font-semibold text-arcade-pink truncate hover:underline" onClick={(e) => e.stopPropagation()}>
                        {truncateAddress(match.player2)}
                      </Link>
                    </div>
                  </div>

                  {/* View match link */}
                  <div className="mt-3 flex justify-center">
                    <Link
                      to={`/match/${match.id}`}
                      className="text-xs text-arcade-purple hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Watch Live →
                    </Link>
                  </div>

                  {/* Betting panel (expanded) */}
                  {selectedMatchId === match.id && (
                    <div className="mt-4 pt-4 border-t border-gray-700">
                      <BettingPanel
                        matchId={match.id}
                        player1={match.player1}
                        player2={match.player2}
                      />
                    </div>
                  )}
                </div>
              );})}
            </div>
          ) : null}

          {/* Recent Matches from GraphQL (seeded + completed) */}
          {recentMatchesGQL.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                <Clock size={14} className="text-arcade-purple" style={{ filter: 'drop-shadow(0 0 3px rgba(168,85,247,0.4))' }} />
                Recent Matches
              </h2>
              {recentMatchesGQL.map(match => {
                const isDraw = match.winner === null;
                return (
                  <div key={match.id} className="arcade-card p-4 hover:bg-surface-2 transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <GlowBadge color={match.status === 'COMPLETED' ? 'green' : 'purple'} label={match.status} size="sm" />
                        <span className="text-[10px] text-gray-500 uppercase tracking-wider">
                          {match.gameType.replace('_', ' ')}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">
                        Match #{match.id}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 items-center gap-4">
                      <div className="text-center">
                        <Link
                          to={`/agent/${match.player1}`}
                          className={clsx(
                            'font-semibold truncate hover:underline text-sm',
                            !isDraw && match.winner?.toLowerCase() === match.player1.toLowerCase()
                              ? 'text-arcade-green'
                              : 'text-arcade-cyan',
                          )}
                        >
                          {truncateAddress(match.player1)}
                        </Link>
                        {!isDraw && match.winner?.toLowerCase() === match.player1.toLowerCase() && (
                          <div className="text-[9px] text-arcade-green mt-0.5">WINNER</div>
                        )}
                      </div>
                      <div className="text-center text-gray-500 text-lg">
                        {isDraw ? (
                          <span className="text-xs text-gray-400">DRAW</span>
                        ) : (
                          'VS'
                        )}
                      </div>
                      <div className="text-center">
                        <Link
                          to={`/agent/${match.player2}`}
                          className={clsx(
                            'font-semibold truncate hover:underline text-sm',
                            !isDraw && match.winner?.toLowerCase() === match.player2.toLowerCase()
                              ? 'text-arcade-green'
                              : 'text-arcade-pink',
                          )}
                        >
                          {truncateAddress(match.player2)}
                        </Link>
                        {!isDraw && match.winner?.toLowerCase() === match.player2.toLowerCase() && (
                          <div className="text-[9px] text-arcade-green mt-0.5">WINNER</div>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 flex justify-center">
                      <Link
                        to={`/replay/${match.id}`}
                        className="text-xs text-arcade-purple hover:underline"
                      >
                        View Replay →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {liveMatches.length === 0 && recentMatchesGQL.length === 0 && (
            <div className="arcade-card p-8 text-center">
              <Eye size={32} className="mx-auto text-gray-600 mb-3" />
              <p className="text-gray-400">No matches yet</p>
              <p className="text-xs text-gray-500 mt-1">Check back soon for match action</p>
            </div>
          )}

          {/* Full Bet History */}
          <div className="mt-8">
            <BetHistory maxItems={10} />
          </div>
        </div>

        {/* Right column: Bettor leaderboard */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
            <Trophy size={14} className="text-arcade-gold" />
            Top Bettors
          </h2>

          <Link
            to="/spectator/leaderboard"
            className="block arcade-card p-3 border-arcade-gold/20 hover:border-arcade-gold/40 transition-all group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 size={14} className="text-arcade-gold" />
                <span className="text-xs font-bold text-gray-300 group-hover:text-arcade-gold transition-colors">
                  FULL LEADERBOARD
                </span>
              </div>
              <span className="text-arcade-gold text-sm group-hover:translate-x-1 transition-transform">→</span>
            </div>
          </Link>

          <div className="arcade-card p-0 overflow-hidden">
            {topBettors.length > 0 ? (
              topBettors.map((bettor, i) => (
                <div
                  key={bettor.address}
                  className={clsx(
                    'p-3 flex items-center gap-3 transition-all duration-150 hover:bg-surface-1',
                    i % 2 === 0 ? 'bg-surface-2' : 'bg-surface-3/50',
                  )}
                >
                  {/* Rank */}
                  <span
                    className={clsx(
                      'w-6 text-center font-bold',
                      i === 0 ? 'text-arcade-gold' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-gray-500',
                    )}
                    style={i === 0 ? { textShadow: '0 0 6px rgba(255,215,0,0.3)' } : undefined}
                  >
                    {i + 1}
                  </span>

                  {/* Bettor info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">
                      {truncateAddress(bettor.address)}
                    </div>
                    <div className="text-[10px] text-gray-400">
                      {bettor.totalBets} bets | {bettor.winRate.toFixed(0)}% WR
                    </div>
                  </div>

                  {/* Profit */}
                  <div className={clsx(
                    'font-mono text-sm',
                    parseFloat(bettor.netProfit) >= 0 ? 'text-arcade-green' : 'text-arcade-red',
                  )}>
                    {parseFloat(bettor.netProfit) >= 0 ? '+' : ''}{parseFloat(bettor.netProfit).toFixed(2)}
                  </div>
                </div>
              ))
            ) : (
              <TopAgentsMini />
            )}
          </div>

          {/* Your betting profile */}
          {myBettorProfile && (
            <div className="arcade-card p-4">
              <h3 className="text-xs uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-2">
                <TrendingUp size={12} />
                Your Stats
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Total Bets</span>
                  <span className="text-white font-mono">{myBettorProfile.totalBets}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Win Rate</span>
                  <span className="text-white font-mono">{myBettorProfile.winRate.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Current Streak</span>
                  <span className={clsx(
                    'font-mono',
                    myBettorProfile.currentStreak > 0 ? 'text-arcade-green' : myBettorProfile.currentStreak < 0 ? 'text-arcade-red' : 'text-gray-400',
                  )}>
                    {myBettorProfile.currentStreak > 0 ? `+${myBettorProfile.currentStreak} W` : myBettorProfile.currentStreak < 0 ? `${myBettorProfile.currentStreak} L` : 'Even'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Longest Win Streak</span>
                  <span className="text-arcade-gold font-mono">{myBettorProfile.longestWinStreak}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
