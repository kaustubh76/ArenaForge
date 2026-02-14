import { useState, useEffect, useMemo } from 'react';
import { Trophy, Swords, Users, Coins, Filter, Eye, Wifi, WifiOff, Plus, TrendingUp, ExternalLink, Radio, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, Tooltip,
} from 'recharts';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { GameType, Tournament, TournamentStatus } from '@/types/arena';
import { GAME_TYPE_CONFIG } from '@/constants/game';
import { useArenaStore } from '@/stores/arenaStore';
import { useAgentStore } from '@/stores/agentStore';
import { useWallet } from '@/hooks/useWallet';
import { useTournamentActions } from '@/hooks/useTournamentActions';
import { useConnectionStatus, useActivityFeed } from '@/hooks';
import { RetroHeading } from '@/components/arcade/RetroHeading';
import { AnimatedScore } from '@/components/arcade/AnimatedScore';
import { GameTypeIcon } from '@/components/arcade/GameTypeIcon';
import { TournamentCard } from '@/components/tournament/TournamentCard';
import { JoinTournamentModal } from '@/components/tournament/JoinTournamentModal';
import { CreateTournamentModal, type CreateTournamentInput } from '@/components/tournament/CreateTournamentModal';
import { ErrorAlert } from '@/components/arcade/ErrorAlert';
import { SeasonBanner } from '@/components/season';
import { ProgressBar } from '@/components/arcade/ProgressBar';
import { LiveMatchTicker } from '@/components/lobby/LiveMatchTicker';
import {
  GAME_TYPE_COLORS, GAME_TYPE_LABELS,
  TOOLTIP_STYLE,
} from '@/components/charts';

interface TokenMetrics {
  address: string;
  name: string;
  symbol: string;
  price: string;
  marketCap: string;
  bondingCurveProgress: number;
  graduated: boolean;
}

function useArenaToken() {
  const [token, setToken] = useState<TokenMetrics | null>(null);
  const gqlUrl = import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:4000/graphql';

  useEffect(() => {
    let mounted = true;
    const fetchToken = async () => {
      try {
        const res = await fetch(gqlUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `{ arenaToken { address name symbol price marketCap bondingCurveProgress graduated } }`,
          }),
        });
        const json = await res.json();
        if (mounted && json.data?.arenaToken) {
          setToken(json.data.arenaToken);
        }
      } catch { /* silent */ }
    };
    fetchToken();
    const interval = setInterval(fetchToken, 60_000);
    return () => { mounted = false; clearInterval(interval); };
  }, [gqlUrl]);

  return token;
}

function useA2AQuickStats() {
  const [stats, setStats] = useState<{ activeChallenges: number; activeAlliances: number; totalAgents: number } | null>(null);
  const gqlUrl = import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:4000/graphql';

  useEffect(() => {
    let mounted = true;
    const fetchStats = async () => {
      try {
        const res = await fetch(gqlUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `{ a2aNetworkStats { totalAgents activeChallenges activeAlliances } }`,
          }),
        });
        const json = await res.json();
        if (mounted && json.data?.a2aNetworkStats) setStats(json.data.a2aNetworkStats);
      } catch { /* silent */ }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 30_000);
    return () => { mounted = false; clearInterval(interval); };
  }, [gqlUrl]);

  return stats;
}

function formatPrice(weiStr: string): string {
  const wei = BigInt(weiStr || '0');
  const whole = wei / BigInt(1e18);
  const frac = (wei % BigInt(1e18)) / BigInt(1e14);
  if (whole > BigInt(0)) {
    return frac === BigInt(0) ? `${whole}` : `${whole}.${frac.toString().padStart(4, '0').slice(0, 2)}`;
  }
  // Small values - show more decimals
  const microMon = wei / BigInt(1e12);
  if (microMon > BigInt(0)) return `0.${microMon.toString().padStart(6, '0')}`;
  return '0';
}

function ArenaTokenBanner({ token }: { token: TokenMetrics }) {
  const nadfunUrl = `https://nad.fun/token/${token.address}`;

  return (
    <a
      href={nadfunUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block mb-6 p-4 arcade-card border-arcade-gold/30 hover:border-arcade-gold/50 transition-all group"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-arcade-gold/20 flex items-center justify-center">
            <TrendingUp size={20} className="text-arcade-gold" style={{ filter: 'drop-shadow(0 0 3px rgba(255,215,0,0.4))' }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-white group-hover:text-arcade-gold transition-colors">
                ${token.symbol} TOKEN
              </h3>
              {token.graduated && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-arcade-green/20 text-arcade-green font-pixel">
                  GRADUATED
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400">Live on nad.fun</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="text-sm font-bold text-arcade-gold">{formatPrice(token.price)} MON</p>
            <p className="text-[10px] text-gray-500">MCap: {formatPrice(token.marketCap)} MON</p>
          </div>
          <ExternalLink size={14} className="text-gray-500 group-hover:text-arcade-gold transition-colors" />
        </div>
      </div>
      {!token.graduated && (
        <div>
          <div className="flex justify-between text-[10px] text-gray-500 mb-1">
            <span>Bonding Curve</span>
            <span>{token.bondingCurveProgress.toFixed(1)}%</span>
          </div>
          <ProgressBar value={token.bondingCurveProgress} color="gold" />
        </div>
      )}
    </a>
  );
}

const prizePoolFilters = [
  { label: 'ALL', min: null, max: null },
  { label: '< 1 MON', min: null, max: 1 },
  { label: '1-10 MON', min: 1, max: 10 },
  { label: '10-100 MON', min: 10, max: 100 },
  { label: '100+ MON', min: 100, max: null },
];

const statColorMap: Record<string, { bg: string; text: string }> = {
  'arcade-purple': { bg: 'bg-arcade-purple/10', text: 'text-arcade-purple' },
  'arcade-green':  { bg: 'bg-arcade-green/10',  text: 'text-arcade-green' },
  'arcade-cyan':   { bg: 'bg-arcade-cyan/10',   text: 'text-arcade-cyan' },
  'arcade-gold':   { bg: 'bg-arcade-gold/10',   text: 'text-arcade-gold' },
};

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
}) {
  const colors = statColorMap[color] ?? { bg: 'bg-white/10', text: 'text-white' };
  return (
    <div className="arcade-card flex items-center gap-3 p-4 transition-all duration-200 hover:scale-[1.03]">
      <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center', colors.bg)}>
        <Icon size={18} className={colors.text} style={{ filter: 'drop-shadow(0 0 3px currentColor)' }} />
      </div>
      <div>
        <AnimatedScore value={value} className="text-xl text-white" />
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">{label}</p>
      </div>
    </div>
  );
}

const STATUS_PIE_COLORS: Record<string, string> = {
  Open: '#00e5ff',
  Active: '#69f0ae',
  Completed: '#b388ff',
  Paused: '#ffd740',
};

const GAME_TYPE_ENUM_TO_KEY: Record<number, string> = {
  0: 'ORACLE_DUEL',
  1: 'STRATEGY_ARENA',
  2: 'AUCTION_WARS',
  3: 'QUIZ_BOWL',
};

function ArenaHeroDashboard({
  tournaments,
  allMatches,
}: {
  tournaments: Tournament[];
  allMatches: Array<{ id: number; gameType?: number; timestamp?: number; winner?: string | null }>;
}) {
  // --- Panel 1: Tournament Status Breakdown ---
  const statusData = useMemo(() => {
    const counts: Record<string, number> = { Open: 0, Active: 0, Completed: 0, Paused: 0 };
    for (const t of tournaments) {
      if (t.status === TournamentStatus.Open) counts.Open++;
      else if (t.status === TournamentStatus.Active) counts.Active++;
      else if (t.status === TournamentStatus.Completed) counts.Completed++;
      else counts.Paused++;
    }
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value, fill: STATUS_PIE_COLORS[name] }));
  }, [tournaments]);

  // --- Panel 2: Game Type Match Distribution ---
  const gameTypeData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of allMatches) {
      const key = GAME_TYPE_ENUM_TO_KEY[m.gameType ?? 0] ?? 'ORACLE_DUEL';
      counts[key] = (counts[key] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([key, count]) => ({
        name: GAME_TYPE_LABELS[key] ?? key,
        count,
        fill: GAME_TYPE_COLORS[key] ?? '#9e9e9e',
      }))
      .sort((a, b) => b.count - a.count);
  }, [allMatches]);

  // --- Panel 3: 24h Activity Sparkline ---
  const hourlyData = useMemo(() => {
    const now = Date.now() / 1000;
    const oneDayAgo = now - 86400;
    const buckets = new Array(24).fill(0);
    let total = 0;
    for (const m of allMatches) {
      if (m.timestamp && m.timestamp > oneDayAgo) {
        const hoursAgo = Math.floor((now - m.timestamp) / 3600);
        if (hoursAgo >= 0 && hoursAgo < 24) {
          buckets[23 - hoursAgo]++;
          total++;
        }
      }
    }
    const max = Math.max(...buckets, 1);
    return { buckets, max, total };
  }, [allMatches]);

  if (tournaments.length === 0 && allMatches.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      {/* Tournament Status Pie */}
      <div className="arcade-card p-4">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5">
          <Trophy size={12} style={{ filter: 'drop-shadow(0 0 3px rgba(168,85,247,0.4))' }} /> Tournament Status
        </h3>
        {statusData.length > 0 ? (
          <div className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={65}
                  strokeWidth={0}
                >
                  {statusData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(value: unknown) => [String(value), 'Tournaments']}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Center count overlay */}
            <div className="relative -mt-[100px] mb-[40px] text-center pointer-events-none">
              <p className="text-2xl font-bold text-white">{tournaments.length}</p>
              <p className="text-[9px] text-gray-500 uppercase">Total</p>
            </div>
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
              {statusData.map(d => (
                <div key={d.name} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.fill }} />
                  <span className="text-[10px] text-gray-400">{d.name} ({d.value})</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-600 text-center py-8">No tournaments yet</p>
        )}
      </div>

      {/* Game Type Distribution Bar */}
      <div className="arcade-card p-4">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5">
          <Swords size={12} style={{ filter: 'drop-shadow(0 0 3px rgba(0,229,255,0.4))' }} /> Match Distribution
        </h3>
        {gameTypeData.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={gameTypeData} layout="vertical" margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={90}
                tick={{ fill: '#888', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                {...TOOLTIP_STYLE}
                formatter={(value: unknown) => [String(value), 'Matches']}
              />
              <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={20}>
                {gameTypeData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-xs text-gray-600 text-center py-8">No matches yet</p>
        )}
      </div>

      {/* 24h Activity Sparkline */}
      <div className="arcade-card p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
            <Activity size={12} style={{ filter: 'drop-shadow(0 0 3px rgba(0,229,255,0.4))' }} /> Last 24h Activity
          </h3>
          <span className="text-xs font-bold text-arcade-cyan">{hourlyData.total} matches</span>
        </div>
        <svg viewBox="0 0 240 100" className="w-full h-[160px]" preserveAspectRatio="none">
          <defs>
            <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00e5ff" stopOpacity={0.6} />
              <stop offset="100%" stopColor="#00e5ff" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          {/* Area fill */}
          <path
            d={(() => {
              const bw = 240 / 24;
              let path = `M0,100`;
              hourlyData.buckets.forEach((v, i) => {
                const h = (v / hourlyData.max) * 85;
                path += ` L${i * bw + bw / 2},${100 - h}`;
              });
              path += ` L240,100 Z`;
              return path;
            })()}
            fill="url(#sparkGrad)"
          />
          {/* Line */}
          <polyline
            points={hourlyData.buckets
              .map((v, i) => {
                const bw = 240 / 24;
                const h = (v / hourlyData.max) * 85;
                return `${i * bw + bw / 2},${100 - h}`;
              })
              .join(' ')}
            fill="none"
            stroke="#00e5ff"
            strokeWidth={1.5}
            style={{ filter: 'drop-shadow(0 0 3px rgba(0,229,255,0.4))' }}
          />
          {/* Dots for peaks */}
          {hourlyData.buckets.map((v, i) => {
            if (v === 0) return null;
            const bw = 240 / 24;
            const h = (v / hourlyData.max) * 85;
            return (
              <circle
                key={i}
                cx={i * bw + bw / 2}
                cy={100 - h}
                r={v === hourlyData.max ? 3 : 1.5}
                fill="#00e5ff"
                opacity={v === hourlyData.max ? 1 : 0.6}
              />
            );
          })}
        </svg>
        <div className="flex justify-between text-[9px] text-gray-600 mt-1">
          <span>24h ago</span>
          <span>12h ago</span>
          <span>Now</span>
        </div>
      </div>
    </div>
  );
}

const statusFilters: Array<{ value: TournamentStatus | null; label: string }> = [
  { value: null, label: 'ALL' },
  { value: TournamentStatus.Open, label: 'OPEN' },
  { value: TournamentStatus.Active, label: 'ACTIVE' },
  { value: TournamentStatus.Completed, label: 'COMPLETED' },
];

// Shimmer skeleton imported from arcade components
import { SkeletonTournamentCard } from '@/components/arcade/ShimmerLoader';
import { EmptyTournaments } from '@/components/arcade/EmptyState';

export function ArenaLobby() {
  const { tournaments, allMatches, loading, error, gameTypeFilter, statusFilter, prizePoolMin, prizePoolMax, setGameTypeFilter, setStatusFilter, setPrizePoolFilter, getFilteredTournaments, getLiveMatches, fetchFromChain } = useArenaStore();
  const [joinModalTournament, setJoinModalTournament] = useState<Tournament | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [errorDismissed, setErrorDismissed] = useState(false);

  // Wallet and tournament action hooks
  const { isConnected, balance, refetchBalance } = useWallet();
  const { joinTournament, resetJoinState } = useTournamentActions();
  const { openConnectModal } = useConnectModal();

  // Real-time connection status
  const { isConnected: wsConnected } = useConnectionStatus();
  const { events: recentEvents } = useActivityFeed();

  const arenaToken = useArenaToken();
  const a2aStats = useA2AQuickStats();

  const filtered = getFilteredTournaments();
  const liveCount = getLiveMatches().length;
  const activeTournaments = tournaments.filter(t => t.status === TournamentStatus.Active).length;
  const totalPrize = tournaments.reduce((sum, t) => sum + parseFloat(t.prizePool || '0'), 0);
  const totalAgents = useAgentStore(s => s.agents.length);

  // Count recent activity (last 5 minutes)
  const recentActivityCount = recentEvents.filter(
    e => Date.now() - e.timestamp < 5 * 60 * 1000
  ).length;

  // Handle opening join modal - check wallet connection first
  const handleOpenJoinModal = (tournament: Tournament) => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    refetchBalance();
    setJoinModalTournament(tournament);
  };

  // Handle join confirmation
  const handleJoinTournament = async (tournament: Tournament): Promise<void> => {
    const success = await joinTournament(tournament);
    if (success) {
      refetchBalance();
    }
    if (!success) {
      throw new Error('Join failed');
    }
  };

  // Close modal and reset state
  const handleCloseModal = () => {
    setJoinModalTournament(null);
    resetJoinState();
  };

  // GraphQL URL for create tournament mutation
  const gqlUrl = import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:4000/graphql';

  // Handle create tournament
  const handleCreateTournament = async (input: CreateTournamentInput): Promise<void> => {
    const gameTypeMap: Record<number, string> = {
      0: 'ORACLE_DUEL', 1: 'STRATEGY_ARENA', 2: 'AUCTION_WARS', 3: 'QUIZ_BOWL',
    };
    const formatMap: Record<number, string> = {
      0: 'SWISS_SYSTEM', 1: 'SINGLE_ELIMINATION', 2: 'DOUBLE_ELIMINATION',
      3: 'ROUND_ROBIN', 4: 'BEST_OF_N', 5: 'ROYAL_RUMBLE', 6: 'PENTATHLON',
    };

    const res = await fetch(gqlUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `mutation($input: CreateTournamentInput!) {
          createTournament(input: $input) { id name status }
        }`,
        variables: {
          input: {
            name: input.name,
            gameType: gameTypeMap[input.gameType] ?? 'STRATEGY_ARENA',
            format: formatMap[input.format] ?? 'SINGLE_ELIMINATION',
            entryStake: input.entryStake,
            maxParticipants: input.maxParticipants,
            roundCount: input.roundCount,
          },
        },
      }),
    });

    const json = await res.json();
    if (json.errors) {
      throw new Error(json.errors[0]?.message || 'Failed to create tournament');
    }

    // Refresh tournament list
    fetchFromChain(true);
  };

  const gameTypes = [
    GameType.OracleDuel,
    GameType.StrategyArena,
    GameType.AuctionWars,
    GameType.QuizBowl,
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <RetroHeading level={1} color="purple" subtitle="Select your battle" className="mb-0">
          ARENA LOBBY
        </RetroHeading>
        {/* Connection status and activity indicator */}
        <div className="flex items-center gap-3">
          {recentActivityCount > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-arcade-green/10 border border-arcade-green/30 text-arcade-green">
              <span className="w-1.5 h-1.5 bg-arcade-green rounded-full animate-pulse" />
              <span className="text-[10px] font-pixel">{recentActivityCount} NEW</span>
            </div>
          )}
          <div className={clsx(
            'flex items-center gap-1.5 px-2 py-1 rounded-lg border',
            wsConnected
              ? 'bg-arcade-green/10 border-arcade-green/30 text-arcade-green'
              : 'bg-gray-500/10 border-gray-500/30 text-gray-500'
          )} title={wsConnected ? 'Real-time updates active' : 'Connecting to real-time updates'}>
            {wsConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
            <span className="text-[10px] font-pixel hidden sm:inline">
              {wsConnected ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>
        </div>
      </div>

      {/* Season Banner */}
      <SeasonBanner compact className="mb-6" />

      {/* ARENA Token Banner */}
      {arenaToken && <ArenaTokenBanner token={arenaToken} />}

      {/* Create Tournament CTA */}
      <button
        onClick={() => setCreateModalOpen(true)}
        className="block w-full mb-6 p-4 arcade-card border-arcade-purple/30 hover:border-arcade-purple/50 transition-all group cursor-pointer text-left"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-arcade-purple/20 flex items-center justify-center">
              <Plus size={20} className="text-arcade-purple" style={{ filter: 'drop-shadow(0 0 3px rgba(168,85,247,0.4))' }} />
            </div>
            <div>
              <h3 className="font-bold text-white group-hover:text-arcade-purple transition-colors">
                CREATE TOURNAMENT
              </h3>
              <p className="text-xs text-gray-400">Set up a custom tournament for the arena</p>
            </div>
          </div>
          <span className="text-arcade-purple text-sm group-hover:translate-x-1 transition-transform">→</span>
        </div>
      </button>

      {/* Spectator Hub Quick Link */}
      <Link
        to="/spectator"
        className="block mb-6 p-4 arcade-card border-arcade-cyan/30 hover:border-arcade-cyan/50 transition-all group"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-arcade-cyan/20 flex items-center justify-center">
              <Eye size={20} className="text-arcade-cyan" style={{ filter: 'drop-shadow(0 0 3px rgba(0,229,255,0.4))' }} />
            </div>
            <div>
              <h3 className="font-bold text-white group-hover:text-arcade-cyan transition-colors">
                SPECTATOR HUB
              </h3>
              <p className="text-xs text-gray-400">Watch live matches & place bets</p>
            </div>
          </div>
          <span className="text-arcade-cyan text-sm group-hover:translate-x-1 transition-transform">→</span>
        </div>
      </Link>

      {/* A2A Command Center Quick Link */}
      <Link
        to="/a2a"
        className="block mb-6 p-4 arcade-card border-arcade-pink/30 hover:border-arcade-pink/50 transition-all group"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-arcade-pink/20 flex items-center justify-center">
              <Radio size={20} className="text-arcade-pink" style={{ filter: 'drop-shadow(0 0 3px rgba(236,72,153,0.4))' }} />
            </div>
            <div>
              <h3 className="font-bold text-white group-hover:text-arcade-pink transition-colors">
                A2A COMMAND CENTER
              </h3>
              <p className="text-xs text-gray-400">Agent-to-Agent challenges, alliances & communications</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {a2aStats && a2aStats.activeChallenges > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-arcade-cyan/10 border border-arcade-cyan/30">
                <Swords size={10} className="text-arcade-cyan" />
                <span className="text-[10px] font-pixel text-arcade-cyan">{a2aStats.activeChallenges} ACTIVE</span>
              </div>
            )}
            {a2aStats && a2aStats.activeAlliances > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-arcade-green/10 border border-arcade-green/30 hidden sm:flex">
                <span className="text-[10px] font-pixel text-arcade-green">{a2aStats.activeAlliances} ALLIES</span>
              </div>
            )}
            <span className="text-arcade-pink text-sm group-hover:translate-x-1 transition-transform">→</span>
          </div>
        </div>
      </Link>

      {/* Error alert */}
      {error && !errorDismissed && (
        <ErrorAlert
          message={error}
          onRetry={() => { setErrorDismissed(false); fetchFromChain(); }}
          onDismiss={() => setErrorDismissed(true)}
          className="mb-6"
        />
      )}

      {/* Live match ticker */}
      <LiveMatchTicker className="mb-6" />

      {/* Stats bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard icon={Trophy} label="Active Tournaments" value={activeTournaments} color="arcade-purple" />
        <StatCard icon={Swords} label="Live Matches" value={liveCount} color="arcade-green" />
        <StatCard icon={Users} label="Total Agents" value={totalAgents} color="arcade-cyan" />
        <StatCard icon={Coins} label="Total Prize Pool" value={Math.round(totalPrize)} color="arcade-gold" />
      </div>

      {/* Arena Pulse Dashboard */}
      <ArenaHeroDashboard tournaments={tournaments} allMatches={allMatches} />

      {/* Game type filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          className={clsx(
            'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 border',
            gameTypeFilter === null
              ? 'bg-arcade-purple/15 text-arcade-purple border-arcade-purple/40'
              : 'text-gray-500 border-white/[0.06] hover:border-white/[0.12] hover:text-gray-300',
          )}
          onClick={() => setGameTypeFilter(null)}
        >
          ALL
        </button>
        {gameTypes.map((gt) => {
          const cfg = GAME_TYPE_CONFIG[gt];
          const isActive = gameTypeFilter === gt;
          return (
            <button
              key={gt}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 border',
                !isActive && 'text-gray-500 border-white/[0.06] hover:border-white/[0.12] hover:text-gray-300',
              )}
              style={isActive ? { color: cfg.accentHex, borderColor: `${cfg.accentHex}66`, backgroundColor: `${cfg.accentHex}15` } : undefined}
              onClick={() => setGameTypeFilter(isActive ? null : gt)}
            >
              <GameTypeIcon gameType={gt} size={12} />
              {cfg.shortLabel}
            </button>
          );
        })}
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2 mb-4">
        {statusFilters.map((sf) => (
          <button
            key={sf.label}
            className={clsx(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 border',
              statusFilter === sf.value
                ? 'bg-arcade-cyan/15 text-arcade-cyan border-arcade-cyan/40'
                : 'text-gray-500 border-white/[0.06] hover:border-white/[0.12] hover:text-gray-300',
            )}
            onClick={() => setStatusFilter(sf.value)}
          >
            {sf.label}
          </button>
        ))}
      </div>

      {/* Prize pool filter */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <Filter size={14} className="text-gray-500" />
        <span className="text-xs text-gray-500 mr-1">Prize:</span>
        {prizePoolFilters.map((pf) => {
          const isActive = prizePoolMin === pf.min && prizePoolMax === pf.max;
          return (
            <button
              key={pf.label}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 border',
                isActive
                  ? 'bg-arcade-gold/15 text-arcade-gold border-arcade-gold/40'
                  : 'text-gray-500 border-white/[0.06] hover:border-white/[0.12] hover:text-gray-300',
              )}
              onClick={() => setPrizePoolFilter(pf.min, pf.max)}
            >
              {pf.label}
            </button>
          );
        })}
      </div>

      {/* Tournament grid */}
      {loading && tournaments.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }, (_, i) => <SkeletonTournamentCard key={i} />)}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((t, i) => (
            <TournamentCard
              key={t.id}
              tournament={t}
              index={i}
              onJoin={handleOpenJoinModal}
            />
          ))}
        </div>
      ) : (
        <EmptyTournaments onAction={() => setCreateModalOpen(true)} />
      )}

      {/* Join tournament modal */}
      <JoinTournamentModal
        tournament={joinModalTournament}
        open={joinModalTournament !== null}
        onClose={handleCloseModal}
        walletBalance={balance}
        onConfirm={handleJoinTournament}
      />

      {/* Create tournament modal */}
      <CreateTournamentModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSubmit={handleCreateTournament}
      />
    </div>
  );
}
