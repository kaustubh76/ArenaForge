import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  BarChart3, TrendingUp, Users, Gamepad2, Search,
  Clock, Trophy, Target, Activity, Zap, Flame, Grid3X3, Radio, HeartHandshake, Swords,
} from 'lucide-react';
import { useArenaStore } from '@/stores/arenaStore';
import { useAgentStore } from '@/stores/agentStore';
import { RetroHeading } from '@/components/arcade/RetroHeading';
import { AnimatedScore } from '@/components/arcade/AnimatedScore';
import {
  CHART_COLORS, GAME_TYPE_COLORS, GAME_TYPE_LABELS,
  TOOLTIP_STYLE, AXIS_STYLE, GRID_STYLE,
  formatDuration,
} from '@/components/charts';

const GRAPHQL_URL = import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:4000/graphql';

type Tab = 'overview' | 'agents' | 'gameTypes' | 'trends';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'agents', label: 'Agents', icon: Users },
  { id: 'gameTypes', label: 'Game Types', icon: Gamepad2 },
  { id: 'trends', label: 'Trends', icon: TrendingUp },
];

// ---------- Data types ----------

interface DurationByGameType {
  gameType: string;
  averageDuration: number;
  matchCount: number;
}

interface AgentGameTypeStat {
  gameType: string;
  wins: number;
  losses: number;
  draws: number;
  averageDuration: number;
  winRate: number;
}

interface StrategyPattern {
  totalGames: number;
  cooperateRate: number;
  defectRate: number;
  avgPayoff: number;
}

interface MatchDurationEntry {
  matchId: number;
  gameType: string;
  duration: number;
  timestamp: number;
}

interface EloDistBucket {
  range: string;
  count: number;
}

// ---------- GraphQL helpers ----------

async function gqlFetch<T>(query: string, variables?: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    return json?.data ?? null;
  } catch {
    return null;
  }
}

// ---------- Main component ----------

const VALID_TABS: Tab[] = ['overview', 'agents', 'gameTypes', 'trends'];

export function AnalyticsDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as Tab | null;
  const [tab, _setTab] = useState<Tab>(tabParam && VALID_TABS.includes(tabParam) ? tabParam : 'overview');
  const setTab = (t: Tab) => {
    _setTab(t);
    setSearchParams(t === 'overview' ? {} : { tab: t }, { replace: true });
  };
  const { allMatches } = useArenaStore();
  const { agents } = useAgentStore();

  // Analytics data
  const [durationData, setDurationData] = useState<DurationByGameType[]>([]);
  const [matchDurations, setMatchDurations] = useState<MatchDurationEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Agent-specific
  const [selectedAgent, setSelectedAgent] = useState('');
  const [agentSearch, setAgentSearch] = useState('');
  const [agentStats, setAgentStats] = useState<AgentGameTypeStat[]>([]);
  const [strategyPattern, setStrategyPattern] = useState<StrategyPattern | null>(null);

  // A2A data for overview
  const [a2aStats, setA2aStats] = useState<{ totalAgents: number; totalMessages: number; activeChallenges: number; activeAlliances: number } | null>(null);
  const [a2aChallenges, setA2aChallenges] = useState<Array<{ id: number; challenger: string; challenged: string; status: string }>>([]);
  const [a2aRelationships, setA2aRelationships] = useState<Array<{ agent1: string; agent2: string; matchCount: number; isRival: boolean; isAlly: boolean }>>([]);

  // Fetch overview data
  useEffect(() => {
    async function load() {
      setLoading(true);
      const [dur, md] = await Promise.all([
        gqlFetch<{ durationByGameType: DurationByGameType[] }>(
          `{ durationByGameType { gameType averageDuration matchCount } }`
        ),
        gqlFetch<{ matchDurations: MatchDurationEntry[] }>(
          `{ matchDurations(limit: 100) { matchId gameType duration timestamp } }`
        ),
      ]);
      setDurationData(dur?.durationByGameType ?? []);
      setMatchDurations(md?.matchDurations ?? []);
      setLoading(false);
    }
    load();
  }, []);

  // Fetch A2A data (non-blocking, parallel)
  useEffect(() => {
    async function loadA2A() {
      const [stats, challs, rels] = await Promise.all([
        gqlFetch<{ a2aNetworkStats: typeof a2aStats }>(`{ a2aNetworkStats { totalAgents totalMessages activeChallenges activeAlliances } }`),
        gqlFetch<{ a2aChallenges: typeof a2aChallenges }>(`{ a2aChallenges { id challenger challenged status } }`),
        gqlFetch<{ allRelationships: typeof a2aRelationships }>(`{ allRelationships { agent1 agent2 matchCount isRival isAlly } }`),
      ]);
      setA2aStats(stats?.a2aNetworkStats ?? null);
      setA2aChallenges(challs?.a2aChallenges ?? []);
      setA2aRelationships(rels?.allRelationships ?? []);
    }
    loadA2A();
  }, []);

  // Fetch agent-specific data
  const fetchAgentData = useCallback(async (address: string) => {
    if (!address) return;
    const [stats, pattern] = await Promise.all([
      gqlFetch<{ agentGameTypeStats: AgentGameTypeStat[] }>(
        `query($a: String!) { agentGameTypeStats(address: $a) { gameType wins losses draws averageDuration winRate } }`,
        { a: address }
      ),
      gqlFetch<{ agentStrategyPattern: StrategyPattern | null }>(
        `query($a: String!) { agentStrategyPattern(address: $a) { totalGames cooperateRate defectRate avgPayoff } }`,
        { a: address }
      ),
    ]);
    setAgentStats(stats?.agentGameTypeStats ?? []);
    setStrategyPattern(pattern?.agentStrategyPattern ?? null);
  }, []);

  useEffect(() => {
    if (selectedAgent) fetchAgentData(selectedAgent);
  }, [selectedAgent, fetchAgentData]);

  // Computed stats
  const totalMatches = allMatches.length;
  const totalAgents = agents.length;
  const avgDuration = durationData.length > 0
    ? Math.round(durationData.reduce((s, d) => s + d.averageDuration * d.matchCount, 0) / Math.max(durationData.reduce((s, d) => s + d.matchCount, 0), 1))
    : 0;

  // Filtered agents for search
  const filteredAgents = agents.filter(a =>
    !agentSearch || a.moltbookHandle.toLowerCase().includes(agentSearch.toLowerCase()) ||
    a.agentAddress.toLowerCase().includes(agentSearch.toLowerCase())
  );

  return (
    <div>
      <RetroHeading level={1} color="purple" subtitle="Performance metrics & insights">
        ARENA ANALYTICS
      </RetroHeading>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 p-1 bg-surface-1 rounded-xl">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all',
              tab === t.id
                ? 'bg-arcade-purple/20 text-arcade-purple border border-arcade-purple/30'
                : 'text-gray-500 hover:text-gray-300 border border-transparent'
            )}
            style={tab === t.id ? { boxShadow: '0 0 10px rgba(168,85,247,0.15)' } : undefined}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4">
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="arcade-card p-6 h-24" />)}
          </div>
          <div className="arcade-card p-6 h-64" />
        </div>
      ) : (
        <>
          {tab === 'overview' && (
            <OverviewTab
              totalMatches={totalMatches}
              totalAgents={totalAgents}
              avgDuration={avgDuration}
              durationData={durationData}
              allMatches={allMatches}
              agents={agents}
              a2aStats={a2aStats}
              a2aChallenges={a2aChallenges}
              a2aRelationships={a2aRelationships}
            />
          )}
          {tab === 'agents' && (
            <AgentsTab
              agents={filteredAgents}
              agentSearch={agentSearch}
              setAgentSearch={setAgentSearch}
              selectedAgent={selectedAgent}
              setSelectedAgent={setSelectedAgent}
              agentStats={agentStats}
              strategyPattern={strategyPattern}
            />
          )}
          {tab === 'gameTypes' && (
            <GameTypesTab durationData={durationData} />
          )}
          {tab === 'trends' && (
            <TrendsTab matchDurations={matchDurations} allMatches={allMatches} agents={agents} />
          )}
        </>
      )}
    </div>
  );
}

// ---------- Overview Tab ----------

function OverviewTab({
  totalMatches, totalAgents, avgDuration, durationData, allMatches, agents,
  a2aStats, a2aChallenges, a2aRelationships,
}: {
  totalMatches: number;
  totalAgents: number;
  avgDuration: number;
  durationData: DurationByGameType[];
  allMatches: Array<{ id: number; gameType?: number; timestamp?: number; winner?: string | null }>;
  agents: Array<{ agentAddress: string; moltbookHandle: string; elo: number; wins: number; losses: number; matchesPlayed: number; eloHistory?: number[] }>;
  a2aStats: { totalAgents: number; totalMessages: number; activeChallenges: number; activeAlliances: number } | null;
  a2aChallenges: Array<{ id: number; challenger: string; challenged: string; status: string }>;
  a2aRelationships: Array<{ agent1: string; agent2: string; matchCount: number; isRival: boolean; isAlly: boolean }>;
}) {
  const liveCount = allMatches.filter(m => !m.winner && m.timestamp).length;

  const barData = durationData.map(d => ({
    name: GAME_TYPE_LABELS[d.gameType] ?? d.gameType,
    duration: d.averageDuration,
    matches: d.matchCount,
    fill: GAME_TYPE_COLORS[d.gameType] ?? CHART_COLORS.gray,
  }));

  // Arena Records — computed from agents + matches
  const records = useMemo(() => {
    if (agents.length === 0) return null;

    const topElo = [...agents].sort((a, b) => b.elo - a.elo)[0];
    const mostWins = [...agents].sort((a, b) => b.wins - a.wins)[0];
    const mostMatches = [...agents].sort((a, b) => b.matchesPlayed - a.matchesPlayed)[0];
    const bestWinRate = agents
      .filter(a => a.matchesPlayed >= 5)
      .sort((a, b) => {
        const wrA = a.matchesPlayed > 0 ? a.wins / a.matchesPlayed : 0;
        const wrB = b.matchesPlayed > 0 ? b.wins / b.matchesPlayed : 0;
        return wrB - wrA;
      })[0] ?? null;

    // Win streak detection from matches
    const winCounts: Record<string, number> = {};
    for (const m of allMatches) {
      if (m.winner) winCounts[m.winner] = (winCounts[m.winner] || 0) + 1;
    }

    // Busiest hour (from all timestamps)
    const hourCounts = new Array(24).fill(0);
    for (const m of allMatches) {
      if (m.timestamp) {
        const h = new Date(m.timestamp > 1e12 ? m.timestamp : m.timestamp * 1000).getHours();
        hourCounts[h]++;
      }
    }
    const busiestHour = hourCounts.indexOf(Math.max(...hourCounts));

    return {
      topElo,
      mostWins,
      mostMatches,
      bestWinRate,
      busiestHour,
      totalDecisive: allMatches.filter(m => m.winner).length,
      totalDraws: allMatches.filter(m => !m.winner && m.timestamp).length - liveCount,
    };
  }, [agents, allMatches, liveCount]);

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MiniStat icon={Gamepad2} label="Total Matches" value={totalMatches} color="text-arcade-cyan" />
        <MiniStat icon={Users} label="Registered Agents" value={totalAgents} color="text-arcade-purple" />
        <MiniStat icon={Clock} label="Avg Duration" value={formatDuration(avgDuration)} color="text-arcade-gold" />
        <MiniStat icon={Activity} label="Live Now" value={liveCount} color="text-arcade-green" />
      </div>

      {/* Arena Records */}
      {records && (
        <div className="arcade-card p-5">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
            <Flame size={14} className="text-arcade-gold" style={{ filter: 'drop-shadow(0 0 4px rgba(255,215,0,0.4))' }} />
            Arena Records
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Highest ELO */}
            <div className="bg-surface-1 rounded-lg p-3 border border-arcade-gold/10 transition-all duration-200 hover:scale-[1.02]" style={{ boxShadow: '0 0 8px rgba(255,215,0,0.06)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Trophy size={12} className="text-arcade-gold" style={{ filter: 'drop-shadow(0 0 3px rgba(255,215,0,0.4))' }} />
                <span className="text-[9px] text-gray-500 uppercase">Highest ELO</span>
              </div>
              <p className="text-lg font-mono font-bold text-arcade-gold" style={{ textShadow: '0 0 8px rgba(255,215,0,0.2)' }}>{records.topElo.elo}</p>
              <p className="text-[10px] text-gray-400 truncate mt-0.5">
                {records.topElo.moltbookHandle || `${records.topElo.agentAddress.slice(0, 8)}...`}
              </p>
            </div>
            {/* Most Wins */}
            <div className="bg-surface-1 rounded-lg p-3 border border-arcade-green/10 transition-all duration-200 hover:scale-[1.02]" style={{ boxShadow: '0 0 8px rgba(105,240,174,0.06)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Target size={12} className="text-arcade-green" style={{ filter: 'drop-shadow(0 0 3px rgba(105,240,174,0.4))' }} />
                <span className="text-[9px] text-gray-500 uppercase">Most Wins</span>
              </div>
              <p className="text-lg font-mono font-bold text-arcade-green" style={{ textShadow: '0 0 8px rgba(105,240,174,0.2)' }}>{records.mostWins.wins}</p>
              <p className="text-[10px] text-gray-400 truncate mt-0.5">
                {records.mostWins.moltbookHandle || `${records.mostWins.agentAddress.slice(0, 8)}...`}
              </p>
            </div>
            {/* Best Win Rate */}
            {records.bestWinRate && (
              <div className="bg-surface-1 rounded-lg p-3 border border-arcade-cyan/10 transition-all duration-200 hover:scale-[1.02]" style={{ boxShadow: '0 0 8px rgba(0,229,255,0.06)' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Zap size={12} className="text-arcade-cyan" style={{ filter: 'drop-shadow(0 0 3px rgba(0,229,255,0.4))' }} />
                  <span className="text-[9px] text-gray-500 uppercase">Best Win Rate</span>
                </div>
                <p className="text-lg font-mono font-bold text-arcade-cyan" style={{ textShadow: '0 0 8px rgba(0,229,255,0.2)' }}>
                  {(records.bestWinRate.matchesPlayed > 0
                    ? (records.bestWinRate.wins / records.bestWinRate.matchesPlayed) * 100
                    : 0
                  ).toFixed(1)}%
                </p>
                <p className="text-[10px] text-gray-400 truncate mt-0.5">
                  {records.bestWinRate.moltbookHandle || `${records.bestWinRate.agentAddress.slice(0, 8)}...`}
                  <span className="text-gray-600 ml-1">({records.bestWinRate.matchesPlayed} games)</span>
                </p>
              </div>
            )}
            {/* Most Active */}
            <div className="bg-surface-1 rounded-lg p-3 border border-arcade-purple/10 transition-all duration-200 hover:scale-[1.02]" style={{ boxShadow: '0 0 8px rgba(168,85,247,0.06)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Activity size={12} className="text-arcade-purple" style={{ filter: 'drop-shadow(0 0 3px rgba(168,85,247,0.4))' }} />
                <span className="text-[9px] text-gray-500 uppercase">Most Active</span>
              </div>
              <p className="text-lg font-mono font-bold text-arcade-purple" style={{ textShadow: '0 0 8px rgba(168,85,247,0.2)' }}>{records.mostMatches.matchesPlayed}</p>
              <p className="text-[10px] text-gray-400 truncate mt-0.5">
                {records.mostMatches.moltbookHandle || `${records.mostMatches.agentAddress.slice(0, 8)}...`}
              </p>
            </div>
          </div>

          {/* Secondary stats row */}
          <div className="grid grid-cols-3 gap-3 mt-3">
            <div className="bg-surface-0 rounded-lg p-2.5 text-center">
              <p className="text-sm font-mono font-bold text-white">{records.totalDecisive}</p>
              <p className="text-[9px] text-gray-500">Decisive Matches</p>
            </div>
            <div className="bg-surface-0 rounded-lg p-2.5 text-center">
              <p className="text-sm font-mono font-bold text-gray-400">{records.totalDraws}</p>
              <p className="text-[9px] text-gray-500">Draws</p>
            </div>
            <div className="bg-surface-0 rounded-lg p-2.5 text-center">
              <p className="text-sm font-mono font-bold text-arcade-cyan">
                {records.busiestHour.toString().padStart(2, '0')}:00
              </p>
              <p className="text-[9px] text-gray-500">Peak Hour</p>
            </div>
          </div>
        </div>
      )}

      {/* A2A Network Summary */}
      {a2aStats && (
        <div className="arcade-card p-5">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
            <Radio size={14} className="text-arcade-pink" />
            A2A Network
            <Link to="/a2a" className="ml-auto text-[10px] text-arcade-purple hover:text-arcade-cyan transition-colors">
              Open Command Center →
            </Link>
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-surface-1 rounded-lg p-3 border border-arcade-pink/10 transition-all duration-200 hover:scale-[1.02]">
              <div className="flex items-center gap-1.5 mb-1">
                <Swords size={12} className="text-arcade-pink" style={{ filter: 'drop-shadow(0 0 3px rgba(236,72,153,0.4))' }} />
                <span className="text-[9px] text-gray-500 uppercase">Total Challenges</span>
              </div>
              <p className="text-lg font-mono font-bold text-arcade-pink">{a2aChallenges.length}</p>
            </div>
            <div className="bg-surface-1 rounded-lg p-3 border border-arcade-cyan/10 transition-all duration-200 hover:scale-[1.02]">
              <div className="flex items-center gap-1.5 mb-1">
                <Zap size={12} className="text-arcade-cyan" style={{ filter: 'drop-shadow(0 0 3px rgba(0,229,255,0.4))' }} />
                <span className="text-[9px] text-gray-500 uppercase">Accept Rate</span>
              </div>
              <p className="text-lg font-mono font-bold text-arcade-cyan">
                {(() => {
                  const resolved = a2aChallenges.filter(c => c.status === 'accepted' || c.status === 'declined');
                  const accepted = a2aChallenges.filter(c => c.status === 'accepted');
                  return resolved.length > 0 ? `${Math.round((accepted.length / resolved.length) * 100)}%` : 'N/A';
                })()}
              </p>
            </div>
            <div className="bg-surface-1 rounded-lg p-3 border border-arcade-green/10 transition-all duration-200 hover:scale-[1.02]">
              <div className="flex items-center gap-1.5 mb-1">
                <HeartHandshake size={12} className="text-arcade-green" style={{ filter: 'drop-shadow(0 0 3px rgba(105,240,174,0.4))' }} />
                <span className="text-[9px] text-gray-500 uppercase">Alliances</span>
              </div>
              <p className="text-lg font-mono font-bold text-arcade-green">{a2aStats.activeAlliances}</p>
            </div>
            <div className="bg-surface-1 rounded-lg p-3 border border-arcade-gold/10 transition-all duration-200 hover:scale-[1.02]">
              <div className="flex items-center gap-1.5 mb-1">
                <Flame size={12} className="text-arcade-gold" style={{ filter: 'drop-shadow(0 0 3px rgba(255,215,0,0.4))' }} />
                <span className="text-[9px] text-gray-500 uppercase">Top Rivalry</span>
              </div>
              {(() => {
                const rivalries = a2aRelationships.filter(r => r.isRival).sort((a, b) => b.matchCount - a.matchCount);
                const top = rivalries[0];
                if (!top) return <p className="text-sm text-gray-500">None yet</p>;
                return (
                  <Link to={`/h2h/${top.agent1}/${top.agent2}`} className="hover:text-white transition-colors">
                    <p className="text-sm font-mono font-bold text-arcade-gold">{top.matchCount} matches</p>
                    <p className="text-[9px] text-gray-500 truncate">
                      {top.agent1.slice(0, 6)}… vs {top.agent2.slice(0, 6)}…
                    </p>
                  </Link>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Duration by game type bar chart */}
      <div className="arcade-card p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
          <BarChart3 size={14} style={{ filter: 'drop-shadow(0 0 3px rgba(168,85,247,0.4))' }} />
          Average Match Duration by Game Type
        </h3>
        {barData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={barData}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="name" {...AXIS_STYLE} />
              <YAxis {...AXIS_STYLE} tickFormatter={(v) => formatDuration(v)} />
              <Tooltip
                {...TOOLTIP_STYLE}
                formatter={(value: number | string | undefined) => [formatDuration(Number(value ?? 0)), 'Avg Duration']}
              />
              <Bar dataKey="duration" radius={[6, 6, 0, 0]}>
                {barData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart message="No match data yet" />
        )}
      </div>

      {/* Match count by game type */}
      <div className="arcade-card p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
          <Trophy size={14} style={{ filter: 'drop-shadow(0 0 3px rgba(255,215,0,0.4))' }} />
          Matches by Game Type
        </h3>
        {barData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={barData}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="name" {...AXIS_STYLE} />
              <YAxis {...AXIS_STYLE} />
              <Tooltip {...TOOLTIP_STYLE} />
              <Bar dataKey="matches" radius={[6, 6, 0, 0]} name="Matches Played">
                {barData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart message="No match data yet" />
        )}
      </div>
    </div>
  );
}

// ---------- Agents Tab ----------

function AgentsTab({
  agents, agentSearch, setAgentSearch, selectedAgent, setSelectedAgent,
  agentStats, strategyPattern,
}: {
  agents: Array<{ agentAddress: string; moltbookHandle: string; elo: number; wins: number; losses: number; eloHistory?: number[] }>;
  agentSearch: string;
  setAgentSearch: (s: string) => void;
  selectedAgent: string;
  setSelectedAgent: (s: string) => void;
  agentStats: AgentGameTypeStat[];
  strategyPattern: StrategyPattern | null;
}) {
  // Radar chart data from agent game type stats
  const radarData = agentStats.map(s => ({
    subject: GAME_TYPE_LABELS[s.gameType] ?? s.gameType,
    winRate: Math.round(s.winRate * 100),
    matches: s.wins + s.losses + s.draws,
  }));

  // ELO history for selected agent
  const agent = agents.find(a => a.agentAddress === selectedAgent);
  const eloHistory = (agent?.eloHistory ?? [1200, agent?.elo ?? 1200]).map((elo, i) => ({
    round: i + 1,
    elo,
  }));

  // Strategy pattern pie data
  const stratPieData = strategyPattern ? [
    { name: 'Cooperate', value: Math.round(strategyPattern.cooperateRate * 100), fill: CHART_COLORS.green },
    { name: 'Defect', value: Math.round(strategyPattern.defectRate * 100), fill: CHART_COLORS.red },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Agent selector */}
      <div className="arcade-card p-4">
        <div className="flex items-center gap-3 mb-3">
          <Search size={14} className="text-gray-500" />
          <input
            type="text"
            value={agentSearch}
            onChange={(e) => setAgentSearch(e.target.value)}
            placeholder="Search agents..."
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
          {agents.slice(0, 20).map(a => (
            <button
              key={a.agentAddress}
              onClick={() => setSelectedAgent(a.agentAddress)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border',
                selectedAgent === a.agentAddress
                  ? 'bg-arcade-purple/15 text-arcade-purple border-arcade-purple/40'
                  : 'text-gray-500 border-white/[0.06] hover:text-gray-300'
              )}
            >
              {a.moltbookHandle}
            </button>
          ))}
        </div>
      </div>

      {!selectedAgent ? (
        <div className="arcade-card p-12 text-center">
          <Users size={32} className="mx-auto text-gray-600 mb-3" />
          <p className="text-gray-400">Select an agent to view analytics</p>
        </div>
      ) : (
        <>
          {/* Game Type Performance Radar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="arcade-card p-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
                <Target size={14} />
                Win Rate by Game Type
              </h3>
              {radarData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#333" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#999', fontSize: 11 }} />
                    <PolarRadiusAxis tick={{ fill: '#666', fontSize: 10 }} domain={[0, 100]} />
                    <Radar
                      name="Win Rate %"
                      dataKey="winRate"
                      stroke={CHART_COLORS.cyan}
                      fill={CHART_COLORS.cyan}
                      fillOpacity={0.3}
                    />
                    <Tooltip {...TOOLTIP_STYLE} formatter={(v: number | string | undefined) => [`${v ?? 0}%`, 'Win Rate']} />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="No game type data" />
              )}
            </div>

            {/* ELO History Line Chart */}
            <div className="arcade-card p-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
                <TrendingUp size={14} />
                ELO History
              </h3>
              {eloHistory.length > 1 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={eloHistory}>
                    <CartesianGrid {...GRID_STYLE} />
                    <XAxis dataKey="round" {...AXIS_STYLE} label={{ value: 'Match', position: 'insideBottom', offset: -5, fill: '#666', fontSize: 11 }} />
                    <YAxis {...AXIS_STYLE} domain={['auto', 'auto']} />
                    <Tooltip {...TOOLTIP_STYLE} />
                    <Line
                      type="monotone"
                      dataKey="elo"
                      stroke={CHART_COLORS.gold}
                      strokeWidth={2}
                      dot={{ fill: CHART_COLORS.gold, r: 3 }}
                      name="ELO"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="Not enough ELO history" />
              )}
            </div>
          </div>

          {/* Strategy Pattern */}
          {strategyPattern && (
            <div className="arcade-card p-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
                <Activity size={14} />
                Strategy Arena Pattern ({strategyPattern.totalGames} games)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-center">
                <div className="flex justify-center">
                  <ResponsiveContainer width={180} height={180}>
                    <PieChart>
                      <Pie
                        data={stratPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {stratPieData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip {...TOOLTIP_STYLE} formatter={(v: number | string | undefined) => [`${v ?? 0}%`]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-arcade-green" />
                    <span className="text-sm text-gray-300">Cooperate: {Math.round(strategyPattern.cooperateRate * 100)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-arcade-red" />
                    <span className="text-sm text-gray-300">Defect: {Math.round(strategyPattern.defectRate * 100)}%</span>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold font-mono text-arcade-gold">
                    {strategyPattern.avgPayoff.toFixed(1)}
                  </div>
                  <div className="text-[10px] text-gray-500 uppercase">Avg Payoff per Round</div>
                </div>
              </div>
            </div>
          )}

          {/* Game Type Breakdown Table */}
          {agentStats.length > 0 && (
            <div className="arcade-card p-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4">
                Performance Breakdown
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 text-[10px] uppercase tracking-wider">
                      <th className="text-left py-2 px-3">Game Type</th>
                      <th className="text-center py-2 px-3">W</th>
                      <th className="text-center py-2 px-3">L</th>
                      <th className="text-center py-2 px-3">D</th>
                      <th className="text-center py-2 px-3">Win Rate</th>
                      <th className="text-center py-2 px-3">Avg Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentStats.map(s => (
                      <tr key={s.gameType} className="border-t border-white/5 hover:bg-surface-1 transition-colors">
                        <td className="py-2.5 px-3">
                          <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: GAME_TYPE_COLORS[s.gameType] }} />
                          {GAME_TYPE_LABELS[s.gameType] ?? s.gameType}
                        </td>
                        <td className="text-center py-2.5 px-3 text-arcade-green font-mono">{s.wins}</td>
                        <td className="text-center py-2.5 px-3 text-arcade-red font-mono">{s.losses}</td>
                        <td className="text-center py-2.5 px-3 text-gray-400 font-mono">{s.draws}</td>
                        <td className="text-center py-2.5 px-3 font-mono">{Math.round(s.winRate * 100)}%</td>
                        <td className="text-center py-2.5 px-3 text-gray-400">{formatDuration(s.averageDuration)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------- Game Types Tab ----------

function GameTypesTab({ durationData }: { durationData: DurationByGameType[] }) {
  const pieData = durationData.map(d => ({
    name: GAME_TYPE_LABELS[d.gameType] ?? d.gameType,
    value: d.matchCount,
    fill: GAME_TYPE_COLORS[d.gameType] ?? CHART_COLORS.gray,
  }));

  const totalMatches = durationData.reduce((s, d) => s + d.matchCount, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Match distribution pie */}
        <div className="arcade-card p-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
            <Gamepad2 size={14} />
            Match Distribution
          </h3>
          {pieData.length > 0 ? (
            <div className="flex items-center justify-center gap-8">
              <ResponsiveContainer width={220} height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip {...TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {pieData.map(d => (
                  <div key={d.name} className="flex items-center gap-2 text-sm">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: d.fill }} />
                    <span className="text-gray-300">{d.name}</span>
                    <span className="text-gray-500 font-mono">{d.value}</span>
                  </div>
                ))}
                <div className="border-t border-white/10 pt-2 mt-2">
                  <span className="text-xs text-gray-500">Total: {totalMatches} matches</span>
                </div>
              </div>
            </div>
          ) : (
            <EmptyChart message="No match data yet" />
          )}
        </div>

        {/* Duration comparison */}
        <div className="arcade-card p-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
            <Clock size={14} />
            Duration Comparison
          </h3>
          {durationData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={durationData.map(d => ({
                  name: GAME_TYPE_LABELS[d.gameType] ?? d.gameType,
                  duration: d.averageDuration,
                  fill: GAME_TYPE_COLORS[d.gameType] ?? CHART_COLORS.gray,
                }))}
                layout="vertical"
              >
                <CartesianGrid {...GRID_STYLE} horizontal={false} />
                <XAxis type="number" {...AXIS_STYLE} tickFormatter={formatDuration} />
                <YAxis type="category" dataKey="name" {...AXIS_STYLE} width={100} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v: number | string | undefined) => [formatDuration(Number(v ?? 0)), 'Avg Duration']} />
                <Bar dataKey="duration" radius={[0, 6, 6, 0]}>
                  {durationData.map((d, i) => (
                    <Cell key={i} fill={GAME_TYPE_COLORS[d.gameType] ?? CHART_COLORS.gray} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No duration data" />
          )}
        </div>
      </div>

      {/* Game type detail cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {durationData.map(d => (
          <div key={d.gameType} className="arcade-card p-4 text-center transition-all duration-200 hover:scale-[1.03]">
            <div
              className="w-3 h-3 rounded-full mx-auto mb-2"
              style={{ backgroundColor: GAME_TYPE_COLORS[d.gameType], boxShadow: `0 0 6px ${GAME_TYPE_COLORS[d.gameType]}66` }}
            />
            <div className="text-xs text-gray-400 mb-1">{GAME_TYPE_LABELS[d.gameType] ?? d.gameType}</div>
            <div className="text-2xl font-bold font-mono text-white">{d.matchCount}</div>
            <div className="text-[10px] text-gray-500">matches</div>
            <div className="text-xs text-gray-400 mt-2">{formatDuration(d.averageDuration)} avg</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Trends Tab ----------

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function TrendsTab({
  matchDurations,
  allMatches,
  agents,
}: {
  matchDurations: MatchDurationEntry[];
  allMatches: Array<{ id: number; gameType?: number; timestamp?: number; winner?: string | null }>;
  agents: Array<{ agentAddress: string; elo: number }>;
}) {
  // === Existing: Group matches by day ===
  const matchesByDay: Record<string, number> = {};
  for (const m of allMatches) {
    if (!m.timestamp) continue;
    const day = new Date(m.timestamp * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    matchesByDay[day] = (matchesByDay[day] || 0) + 1;
  }
  const dailyData = Object.entries(matchesByDay).map(([day, count]) => ({ day, count }));

  // === Existing: Duration trend ===
  const durationTrend = matchDurations.map(d => ({
    match: `#${d.matchId}`,
    duration: d.duration,
    gameType: GAME_TYPE_LABELS[d.gameType] ?? d.gameType,
  }));

  // === NEW: ELO Distribution Histogram ===
  const eloBuckets = useMemo<EloDistBucket[]>(() => {
    if (agents.length === 0) return [];
    const buckets: Record<string, number> = {};
    for (const a of agents) {
      const lo = Math.floor(a.elo / 100) * 100;
      const label = `${lo}-${lo + 99}`;
      buckets[label] = (buckets[label] || 0) + 1;
    }
    return Object.entries(buckets)
      .map(([range, count]) => ({ range, count }))
      .sort((a, b) => parseInt(a.range) - parseInt(b.range));
  }, [agents]);

  // === NEW: Activity Heatmap ===
  const heatmap = useMemo<{ grid: number[][]; max: number }>(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    let max = 0;
    for (const m of allMatches) {
      if (!m.timestamp) continue;
      const d = new Date(m.timestamp * 1000);
      const day = d.getDay();
      const hour = d.getHours();
      grid[day][hour]++;
      if (grid[day][hour] > max) max = grid[day][hour];
    }
    return { grid, max };
  }, [allMatches]);

  // === NEW: Game Type Popularity Over Time ===
  const popularityData = useMemo(() => {
    const gameTypeNumToKey: Record<number, string> = { 0: 'OracleDuel', 1: 'StrategyArena', 2: 'AuctionWars', 3: 'QuizBowl' };
    const weekBuckets: Record<string, Record<string, number>> = {};

    for (const m of allMatches) {
      if (!m.timestamp || m.gameType == null) continue;
      const d = new Date(m.timestamp * 1000);
      // Week label
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const label = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      if (!weekBuckets[label]) weekBuckets[label] = {};
      const gt = gameTypeNumToKey[m.gameType] ?? `Type${m.gameType}`;
      weekBuckets[label][gt] = (weekBuckets[label][gt] || 0) + 1;
    }

    return Object.entries(weekBuckets).map(([week, games]) => ({
      week,
      ...games,
    }));
  }, [allMatches]);

  const gameTypeAreaKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const d of popularityData) {
      for (const k of Object.keys(d)) {
        if (k !== 'week') keys.add(k);
      }
    }
    return Array.from(keys);
  }, [popularityData]);

  const gameTypeColorMap: Record<string, string> = {
    OracleDuel: CHART_COLORS.gold,
    StrategyArena: CHART_COLORS.purple,
    AuctionWars: CHART_COLORS.cyan,
    QuizBowl: CHART_COLORS.green,
  };

  return (
    <div className="space-y-6">
      {/* 1: Matches per day (existing) */}
      <div className="arcade-card p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
          <TrendingUp size={14} style={{ filter: 'drop-shadow(0 0 3px rgba(168,85,247,0.4))' }} />
          Matches Over Time
        </h3>
        {dailyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={dailyData}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="day" {...AXIS_STYLE} />
              <YAxis {...AXIS_STYLE} allowDecimals={false} />
              <Tooltip {...TOOLTIP_STYLE} />
              <Area
                type="monotone"
                dataKey="count"
                stroke={CHART_COLORS.purple}
                fill={CHART_COLORS.purple}
                fillOpacity={0.2}
                name="Matches"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart message="No timeline data available" />
        )}
      </div>

      {/* 2: Duration trend (existing) */}
      <div className="arcade-card p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
          <Clock size={14} style={{ filter: 'drop-shadow(0 0 3px rgba(0,229,255,0.4))' }} />
          Match Duration Trend
        </h3>
        {durationTrend.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={durationTrend}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="match" {...AXIS_STYLE} />
              <YAxis {...AXIS_STYLE} tickFormatter={formatDuration} />
              <Tooltip
                {...TOOLTIP_STYLE}
                formatter={(v: number | string | undefined) => [
                  formatDuration(Number(v ?? 0)),
                  'Duration',
                ]}
              />
              <Line
                type="monotone"
                dataKey="duration"
                stroke={CHART_COLORS.cyan}
                strokeWidth={2}
                dot={{ fill: CHART_COLORS.cyan, r: 3 }}
                name="Duration"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart message="No duration data" />
        )}
      </div>

      {/* 3: ELO Distribution Histogram (NEW) */}
      <div className="arcade-card p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
          <Zap size={14} style={{ filter: 'drop-shadow(0 0 3px rgba(0,229,255,0.4))' }} />
          ELO Distribution
        </h3>
        {eloBuckets.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={eloBuckets}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="range" {...AXIS_STYLE} angle={-30} textAnchor="end" height={50} />
              <YAxis {...AXIS_STYLE} allowDecimals={false} />
              <Tooltip {...TOOLTIP_STYLE} />
              <Bar dataKey="count" name="Agents" radius={[4, 4, 0, 0]} fill={CHART_COLORS.cyan} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart message="No agent data" />
        )}
      </div>

      {/* 4: Activity Heatmap (NEW) */}
      <div className="arcade-card p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
          <Grid3X3 size={14} style={{ filter: 'drop-shadow(0 0 3px rgba(0,229,255,0.4))' }} />
          Activity Heatmap
        </h3>
        {heatmap.max > 0 ? (
          <div className="overflow-x-auto">
            {/* Hour labels */}
            <div className="flex ml-10 mb-1">
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="flex-1 text-center text-[9px] text-gray-600 font-mono">
                  {h % 6 === 0 ? `${h}h` : ''}
                </div>
              ))}
            </div>
            {/* Grid rows */}
            {heatmap.grid.map((row, dayIdx) => (
              <div key={dayIdx} className="flex items-center gap-0">
                <div className="w-10 text-right pr-2 text-[10px] text-gray-500 font-mono shrink-0">
                  {DAY_LABELS[dayIdx]}
                </div>
                {row.map((count, hourIdx) => {
                  const opacity = heatmap.max > 0 ? Math.max(0.05, count / heatmap.max) : 0;
                  return (
                    <div
                      key={hourIdx}
                      className="flex-1 aspect-square rounded-[2px] m-[1px] transition-all duration-150 hover:scale-150 cursor-default"
                      style={{
                        backgroundColor: count > 0 ? `rgba(0, 229, 255, ${opacity})` : 'rgba(255,255,255,0.03)',
                        boxShadow: opacity > 0.5 ? `0 0 4px rgba(0, 229, 255, ${opacity * 0.3})` : 'none',
                      }}
                      title={`${DAY_LABELS[dayIdx]} ${hourIdx}:00 — ${count} match${count !== 1 ? 'es' : ''}`}
                    />
                  );
                })}
              </div>
            ))}
            {/* Legend */}
            <div className="flex items-center justify-end gap-2 mt-2">
              <span className="text-[9px] text-gray-600">Less</span>
              {[0.1, 0.3, 0.5, 0.7, 1].map((o) => (
                <div
                  key={o}
                  className="w-3 h-3 rounded-[2px]"
                  style={{ backgroundColor: `rgba(0, 229, 255, ${o})` }}
                />
              ))}
              <span className="text-[9px] text-gray-600">More</span>
            </div>
          </div>
        ) : (
          <EmptyChart message="No activity data" />
        )}
      </div>

      {/* 5: Game Type Popularity Over Time (NEW) */}
      <div className="arcade-card p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
          <Flame size={14} style={{ filter: 'drop-shadow(0 0 3px rgba(255,215,0,0.4))' }} />
          Game Type Popularity
        </h3>
        {popularityData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={popularityData}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="week" {...AXIS_STYLE} />
              <YAxis {...AXIS_STYLE} allowDecimals={false} />
              <Tooltip {...TOOLTIP_STYLE} />
              <Legend
                wrapperStyle={{ fontSize: 11, color: '#999' }}
              />
              {gameTypeAreaKeys.map((key) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stackId="1"
                  stroke={gameTypeColorMap[key] ?? CHART_COLORS.gray}
                  fill={gameTypeColorMap[key] ?? CHART_COLORS.gray}
                  fillOpacity={0.4}
                  name={key.replace(/([A-Z])/g, ' $1').trim()}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart message="No game type data over time" />
        )}
      </div>
    </div>
  );
}

// ---------- Shared sub-components ----------

function MiniStat({ icon: Icon, label, value, color }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
}) {
  // Extract color for glow (map tailwind class to rgba)
  const glowMap: Record<string, string> = {
    'text-arcade-cyan': 'rgba(0,229,255,0.3)',
    'text-arcade-purple': 'rgba(168,85,247,0.3)',
    'text-arcade-gold': 'rgba(255,215,0,0.3)',
    'text-arcade-green': 'rgba(105,240,174,0.3)',
  };
  const iconGlow = glowMap[color] ?? 'none';

  return (
    <div className="arcade-card p-4 text-center transition-all duration-200 hover:scale-[1.02]">
      <Icon size={18} className={clsx('mx-auto mb-2', color)} style={{ filter: `drop-shadow(0 0 4px ${iconGlow})` }} />
      <div className="text-xl font-bold text-white font-mono">
        {typeof value === 'number' ? <AnimatedScore value={value} /> : value}
      </div>
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
      <div className="text-center">
        <BarChart3 size={24} className="mx-auto mb-2 opacity-50" />
        <p>{message}</p>
      </div>
    </div>
  );
}
